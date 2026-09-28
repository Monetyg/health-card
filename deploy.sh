#!/usr/bin/env bash
# CloudBase 一键部署脚本
# 用法: bash deploy.sh [ENV_ID]
# 读取根目录 .env.deploy 获取环境变量（若无，使用默认值与当前 CLI 登录态）
set -euo pipefail

cd "$(dirname "$0")"

# ---- 读取 .env.deploy ----
if [ -f .env.deploy ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env.deploy; set +a
fi

ENV_ID="${1:-${TCB_ENV_ID:-health-card-d2ga2cvid6561b93d}}"
STATIC_HOST="${STATIC_HOST:-health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com}"
API_URL="${API_URL:-https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api}"
API_CREATE_URL="${API_CREATE_URL:-${API_URL}/create}"

export PATH="$PATH:$USERPROFILE/AppData/Roaming/npm"

echo "==================================================="
echo " 环境ID      : $ENV_ID"
echo " 静态托管域名: $STATIC_HOST"
echo " 查验 API    : $API_URL"
echo " 签发 API    : $API_CREATE_URL"
echo "==================================================="

# 1) 写前端 .env.production（构建时注入）
echo ""
echo "[1/6] 写入 frontend/.env.production ..."
cat > frontend/.env.production <<EOF
# 由 deploy.sh 生成
VITE_TCB_ENV_ID=$ENV_ID
VITE_VERIFY_BASE_URL=https://$STATIC_HOST
# HTTP 访问服务：查验（GET）与签发（POST）两个入口
VITE_TCB_HTTP_VERIFY=$API_URL
VITE_TCB_HTTP_CREATE=$API_CREATE_URL
EOF
sed 's/^/     /' frontend/.env.production

# 2) 部署云函数
#
# ⚠️ 关键前置：cloudbaserc.json 里的 envVariables 用了 {{env.TCB_ENV_ID}} /
#    {{env.TCB_API_KEY}} 模板，而 tcb CLI 的 utils.loadEnv() 只读取
#    <cwd>/.env 与 <cwd>/.env.local（最多上溯 2 层），**从不读取 .env.deploy**。
#    模板解析不到值时会被替换成空串，导致部署后云函数环境变量为空、
#    调用时返回「数据库未配置」。
#
#    因此这里必须先由 .env.deploy 生成一份 .env（.gitignore 已忽略，不会外泄）。
echo ""
echo "[2/7] 生成 tcb CLI 可读取的 .env（供 {{env.X}} 模板解析）..."
if [ ! -f .env.deploy ]; then
  echo "  ✗ 缺少 .env.deploy，无法注入云函数环境变量"
  exit 1
fi
{
  echo "# 由 deploy.sh 从 .env.deploy 生成，供 tcb CLI 解析 {{env.X}} 模板"
  echo "# tcb CLI 仅读取 .env / .env.local，不读 .env.deploy（见 CLI utils.loadEnv）"
  grep -E '^(TCB_ENV_ID|TCB_API_KEY)=' .env.deploy
} > .env
if ! grep -q '^TCB_ENV_ID=.\+' .env || ! grep -q '^TCB_API_KEY=.\+' .env; then
  echo "  ✗ .env 生成异常：TCB_ENV_ID 或 TCB_API_KEY 为空，请检查 .env.deploy"
  exit 1
fi
echo "  ✓ .env 已生成（TCB_ENV_ID / TCB_API_KEY 已就位）"

echo ""
echo "[3/7] 部署云函数 ..."
for fn in health-cert-create health-cert-verify health-cert-cleanup; do
  echo "  -> $fn"
  tcb fn deploy "$fn" -e "$ENV_ID" --force
done

# 部署后强制核验环境变量：--force 部署若模板未解析会把变量刷成空，
# 这里做一次兜底检查，避免「部署成功但调用报数据库未配置」的隐蔽故障。
echo ""
echo "  --- 核验云函数环境变量 ---"
ENV_BAD=0
for fn in health-cert-create health-cert-verify health-cert-cleanup; do
  line="$(tcb fn detail "$fn" -e "$ENV_ID" 2>/dev/null | grep 'Environment variables' || true)"
  if echo "$line" | grep -q "TCB_ENV_ID=$ENV_ID"; then
    echo "  ✓ $fn  环境变量正常"
  else
    echo "  ✗ $fn  环境变量缺失或为空！"
    echo "        $line"
    ENV_BAD=1
  fi
done
if [ "$ENV_BAD" -ne 0 ]; then
  echo ""
  echo "  回退修复：tcb config update fn <名称> -e $ENV_ID"
  echo "  （需要 .env 存在才能解析 {{env.X}} 模板）"
  exit 1
fi

echo ""
echo "=== 云函数列表 ==="
tcb fn list -e "$ENV_ID" 2>&1 || true

# 3) 确保 HTTP 访问服务存在（前端调用通道，不可省略）
#    注：PG 体验版不支持前端 callFunction，必须依赖 HTTP 访问服务。
#    create 对已存在的路径会报错，属正常，忽略即可。
echo ""
echo "[4/7] 检查 HTTP 访问服务 ..."
tcb service create -p api -f health-cert-verify -e "$ENV_ID" 2>&1 | sed 's/^/     /' || true
tcb service create -p api/create -f health-cert-create -e "$ENV_ID" 2>&1 | sed 's/^/     /' || true
echo "  --- 当前路由 ---"
tcb service list -e "$ENV_ID" 2>&1 | sed 's/^/     /' || true

# 5) 构建前端
echo ""
echo "[5/7] 构建前端 ..."
( cd frontend && npx vite build --mode production )
echo "  -> 产物: frontend/dist"

# 6) 校验环境变量已注入
echo ""
echo "[6/7] 校验环境变量注入 ..."
if grep -q "$STATIC_HOST" frontend/dist/assets/*.js \
   && grep -q "ap-shanghai.app.tcloudbase.com/api" frontend/dist/assets/*.js \
   && grep -q "ap-shanghai.app.tcloudbase.com/api/create" frontend/dist/assets/*.js; then
  echo "  ✓ 三个地址均已正确注入（静态域名 / 查验API / 签发API）"
else
  echo "  ✗ 环境变量注入异常，请检查 src/config/publicUrl.ts 是否用 import.meta.env.VITE_XXX 静态写法"
  exit 1
fi

# 7) 部署静态托管
#    ⚠️ 必须用 MSYS_NO_PATHCONV=1 + Windows 原生绝对路径：
#    Git Bash 的 /d/xxx 形式会被 CLI 误解析成 D:\d\xxx
DIST_WIN="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)/frontend/dist"
# 兜底：若 pwd -W 不可用，手动转换 /d/foo -> D:/foo
case "$DIST_WIN" in
  /*) DIST_WIN="$(echo "$DIST_WIN" | sed -E 's|^/([a-zA-Z])/|\1:/|')" ;;
esac

echo ""
echo "[7/7] 部署静态托管 ..."
echo "  -> 本地路径: $DIST_WIN"
MSYS_NO_PATHCONV=1 tcb hosting deploy "$DIST_WIN" / -e "$ENV_ID"

echo ""
echo "  --- 核验二维码落地页路由 ---"
if node scripts/test-spa-route.js demo-check >/dev/null 2>&1; then
  echo "  ✓ /v/:id 返回 200，二维码扫码落地页可用"
else
  echo "  ✗ /v/:id 未返回 200，二维码扫码会打不开！"
  echo "    修复（需 SecretId/SecretKey）:"
  echo "      node scripts/cos-spa-fallback.js <SecretId> <SecretKey> --original-http-status-disabled"
  echo "    说明：COS 的 ErrorDocument 默认仍返回 404，必须显式设 OriginalHttpStatus=Disabled 才会返回 200"
fi

echo ""
echo "==================================================="
echo " 部署完成"
echo ""
echo " 网站地址: https://$STATIC_HOST"
echo " 查验 API: $API_URL"
echo " 签发 API: $API_CREATE_URL"
echo ""
echo " 验收测试（36 个断言）:"
echo "   node scripts/acceptance.js"
echo ""
echo " 边界验证（不校验身份证，任意输入均可签发）:"
echo "   node scripts/test-no-id-validation.js"
echo "==================================================="

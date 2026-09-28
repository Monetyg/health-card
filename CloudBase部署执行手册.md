# CloudBase 部署执行手册（最终版）

> 环境：`health-card-d2ga2cvid6561b93d`（体验版，ap-shanghai，到期 2027-03-25）
> 静态托管：`https://health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com`
> 查验 API：`https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api`

---

## 一、当前部署状态

| 环节 | 状态 | 说明 |
|---|---|---|
| 云函数 × 3 | ✅ 已部署 | `health-cert-create` / `health-cert-verify` / `health-cert-cleanup` |
| PostgreSQL 表 | ✅ 已建 | `health_certs`，20 字段 |
| 索引 × 3 | ✅ 已建 | `verify_id`(唯一) / `cert_no`(唯一) / `verify_expires_at`(普通) |
| API Key | ✅ 已创建 | `health-card-server`，role=`service_role` |
| PostgREST 数据通道 | ✅ 已验证 | 读写删全部实测通过 |
| HTTP 访问服务 | ✅ 已开通 | `/api` → `health-cert-verify`，`/api/create` → `health-cert-create` |
| CORS | ✅ 已验证 | 白名单=静态托管域名，预检 204 正常 |
| 照片公共读 | ✅ 已验证 | 匿名访问返回 200 + image/jpeg |
| 云函数环境变量 | ✅ 部署后自动核验 | 见第六节「`--force` 会刷空变量」的坑 |
| 前端构建 | ✅ 已完成 | `frontend/dist`，环境变量已正确注入 |
| 静态托管上传 | ✅ 已上线 | 3 个文件上传成功 |
| **SPA 路由回退** | ✅ **已配置且实测 200** | `ErrorDocument` + `OriginalHttpStatus=Disabled`（缺后者会返回 404！） |
| **身份证校验** | ✅ **已按要求移除** | 任意输入均可签发，仅姓名必填 |
| **验收测试** | ✅ **36/36 通过** | `node scripts/acceptance.js` |
| **端到端流程** | ✅ **全部通过** | `node scripts/test-full-user-flow.js` |

### 网站地址

```
https://health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com
```

二维码落地页格式：`https://<上述域名>/v/<verifyId>`（实测 HTTP 200）

---

## 二、SPA 路由配置说明（重要）

单页应用（Vue Router history 模式）需要**服务端把所有未命中的路径回退到 `index.html`**，
否则用户扫码打开 `/v/xxxx` 会直接 404。

CloudBase 静态托管的底层是 COS 存储桶，SPA 回退通过**存储桶静态网站的「错误文档」**实现：

```json
{
  "IndexDocument": { "Suffix": "index.html" },
  "ErrorDocument": {
    "Key": "index.html",
    "OriginalHttpStatus": "Disabled"
  }
}
```

已通过 COS 官方 SDK 写入（脚本：`scripts/cos-spa-fallback.js`）。
若日后需要重配：

```bash
node scripts/cos-spa-fallback.js <SecretId> <SecretKey>
```

> ⚠️ **注意**：`cloudbaserc.json` 里的 `hosting[].rewrites` 字段**不会被 CLI 下发**，
> `tcb deploy --only hosting` 只做文件上传、不写重定向规则。必须用上面的 COS 方式配置。

> 🔴 **`OriginalHttpStatus: "Disabled"` 不可省略（重要，曾因此误判）**
>
> 只写 `ErrorDocument` 时，COS 确实会返回 `index.html` 的**内容**，
> 但 **HTTP 状态码仍是 404**。浏览器能正常渲染，`curl` 看内容也像是对的，
> 于是很容易得出「已经修好了」的结论 —— 这是个陷阱。
>
> 实际影响：扫码进入的页面状态码 404，部分 WebView、内嵌浏览器、
> 以及对状态码做判断的链路（含社交平台对分享链接的预检）会表现异常。
>
> 本项目的定位是「**二维码要能上网查到**」，状态码必须为 200，
> 所以必须显式设置 `OriginalHttpStatus: "Disabled"`（COS 语义：
> 关掉「保留原始错误码」，改为返回 200）。
>
> **验证方式**（不要只看内容，要看状态码）：
> ```bash
> node scripts/test-spa-route.js <verifyId>
> # 期望：/v/<verifyId> -> HTTP 200
> ```
>
> 注意 CDN 有缓存，配置变更后可能需 1–2 分钟生效。
> 另：`tcb hosting detail` 读的虽是同一份桶配置，但可能因缓存显示
> `Error document: -`，**以脚本第 3 步的「回读确认」为准**。

---

## 三、权限要求（踩坑记录）

子账号需要**两类独立权限**，缺一不可：

| 用途 | 底层服务 | 所需策略 |
|---|---|---|
| 部署云函数 | SCF | `QcloudSCFFullAccess` |
| 上传静态托管 / 配置静态网站 | COS | `QcloudCOSFullAccess` |

> ❌ **常见误区**：以为 `QcloudTCBFullAccess` 就够了 —— 它只覆盖云开发**控制面 API**，
> 不含底层 COS 存储桶读写。云函数能部署成功、静态托管被 `Access Denied` 拦住，
> 这个现象就是这个原因。
>
> ✅ 一步到位的选择：`QcloudCamReadOnlyAccess` —— CloudBase 官方文档说明
> 「该权限包含底层对象存储、云函数、日志、监控、VPC 等资源的全读写权限」。

---

## 四、架构说明（与初版方案不同）

### 1. 数据库：PostgreSQL + PostgREST

体验版环境**只提供 PostgreSQL 实例**（`postgres-4t0gmmee`），没有文档型 MongoDB。
且 **PG TCP 直连在体验版/个人版不可用**（腾讯云工程师在官方社区 issue #1237/#1297 明确回复：
「就算把这四个值全部填对，TCP 直连也连不通，建议不要在这条路上继续投入」）。

**采用方案**：云函数用 `fetch` 调平台内置 PostgREST 网关。

```
https://health-card-d2ga2cvid6561b93d.api.tcloudbasegateway.com/v1/rdb/rest/health_certs
认证：apikey / Authorization 头传 API Key（role = service_role，BYPASSRLS）
```

数据访问层在 `cloudfunctions/*/db-pg.js`，对外暴露
`select / selectOne / insert / remove / count`。

### 2. 前端调用通道：统一走 HTTP 访问服务

**（重要变更，2026-09-25 修复「提交失败」后确认）**

原设计是「微信走 `callFunction`、其他浏览器走 HTTP」，但实测发现：
**本环境（PostgreSQL 体验版）不支持前端 js-sdk 的 `callFunction`**，
无论匿名登录还是 Publishable Key，一律返回 `403 EXCEED_AUTHORITY`。

| 调用方式 | 结果 |
|---|---|
| `tcb fn invoke`（CLI 管理员） | ✅ 正常 |
| HTTP 访问服务（`enableAuth=false`） | ✅ 正常 |
| 前端 js-sdk `callFunction`（匿名 / Publishable Key） | ❌ `EXCEED_AUTHORITY` |

官方社区 issue **#1403** 确认了完全相同的场景：PG 体验版的
「身份认证 → 权限控制」页面显示**「当前环境暂不支持此功能」**，
因此无法给匿名角色授予「调用云函数」的权限（`FunctionsHttpApiAllow`）。
云函数安全规则设为全放行也无济于事。

**最终方案：全端统一走 HTTP 访问服务**（`enableAuth=false`，无需登录态）：

| 用途 | 路径 | 上游云函数 |
|---|---|---|
| 查验（GET） | `/api` | `health-cert-verify` |
| 签发（POST） | `/api/create` | `health-cert-create` |

对应前端代码：`frontend/src/cloud/verify.ts`、`frontend/src/cloud/certs.ts`。
已移除对 `ensureAuth()` / 匿名登录的依赖。

> ⚠️ **域名不同源**：静态托管在 `*.tcloudbaseapp.com`，
> HTTP 访问服务在 `*.<region>.app.tcloudbase.com`，**是两个域名**。
> 所以不能用 `location.origin + '/api'`（会落到 COS 上 404），
> 必须填**完整**的地址，靠 CORS 跨域调用（已实测预检 204 通过）。

> ⚠️ **HTTP 访问服务会原样透传云函数返回体**：业务错误码在 `body.code` 中，
> HTTP 状态码仍是 200。前端的错误判断必须看 `body.code`，不能只看 `res.ok`。

### 3. 照片方案：公共读 + 永久链接

- 上传云存储 → `getTempFileURL` 换链接
- 云存储权限「所有用户可读」时该链接**永久有效**，直接落库 `photo_url`
- 已实测：匿名 `curl` 返回 `200` + `image/jpeg`

### 4. 过期清理：定时触发器（非 TTL 索引）

CloudBase 索引 API 无 `expireAfterSeconds` 字段，**不支持 Mongo TTL 索引**。
改用：
- `health-cert-cleanup` 定时触发器（每天 03:00，cron `0 0 3 * * * *`）
- 签发时惰性清理（`health-cert-create` 内调用）

---

## 五、前端环境变量

文件：`frontend/.env.production`

```bash
VITE_TCB_ENV_ID=health-card-d2ga2cvid6561b93d
VITE_VERIFY_BASE_URL=https://health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com
# HTTP 访问服务：查验（GET）与签发（POST）两个入口
VITE_TCB_HTTP_VERIFY=https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api
VITE_TCB_HTTP_CREATE=https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api/create
```

> 🐛 **已修复的坑 1**：`src/config/publicUrl.ts` 原先写成
> `(import.meta as any)?.env?.VITE_VERIFY_BASE_URL`（可选链动态访问），
> Vite **无法静态替换**，导致该变量永远读不到、始终回退 `location.origin`。
> 已改成标准的 `import.meta.env.VITE_VERIFY_BASE_URL`。

> 🐛 **已修复的坑 2**：`VITE_TCB_HTTP_CREATE` 原先不存在，签发仍在调 `callFunction`，
> 触发 `EXCEED_AUTHORITY`，被前端兜底文案吞掉成「提交失败」。
> 现已补齐该变量并改造 `certs.ts` 走 HTTP POST。

---

## 六、云函数环境变量

已通过 `cloudbaserc.json` 注入，无需手动配置：

| 变量 | 用途 |
|---|---|
| `TCB_ENV_ID` | PostgREST 网关地址拼接 |
| `TCB_API_KEY` | 数据访问认证（service_role） |
| `ALLOW_ORIGIN` | verify 的 CORS 白名单（= 静态托管域名） |

实际值来自根目录 `.env.deploy`（已加入 `.gitignore`，勿提交）。

> 🔴 **关键坑：`tcb fn deploy --force` 会把环境变量刷成空**
>
> **现象**：部署命令报成功，但调用云函数返回
> `{"code":500,"msg":"数据库未配置：请在云函数环境变量中设置 TCB_ENV_ID / TCB_API_KEY"}`。
> `tcb fn detail <name>` 显示 `TCB_API_KEY=; TCB_ENV_ID=`（**值为空**）。
>
> **根因**：`cloudbaserc.json` 里用了 `{{env.TCB_ENV_ID}}` / `{{env.TCB_API_KEY}}`
> 模板，而 CloudBase CLI 的 `utils.loadEnv()` 源码**只读取**
> `<cwd>/.env`、`<cwd>/.env.local`（最多向上找 2 层仓库根），
> **从不读取 `.env.deploy`**。模板解析不到值 → 被替换成空串 → 变量为空。
>
> 验证（CLI 源码 `dist/standalone/cli.js`）：
> ```js
> async function loadEnv(cwd) {
>   const envConfig = dotenv.config({
>     path: [cwd].flatMap((item) => [`${item}/.env.local`, `${item}/.env`]),
>   });
>   return envConfig.parsed;
> }
> ```
> 另外 `tcb fn deploy` 命令**没有 `--env` 参数**（`--env` 只属于 `tcb agent` 系列），
> 无法在命令行直接覆盖，所以唯一可靠的办法就是提供 `.env` 文件。
>
> **解决**：部署前由 `.env.deploy` 生成一份 `.env`（`.gitignore` 已忽略）：
> ```bash
> { echo "# 供 tcb CLI 解析 {{env.X}} 模板";
>   grep -E '^(TCB_ENV_ID|TCB_API_KEY)=' .env.deploy; } > .env
> ```
> `deploy.sh` 已把这一步固化为 **[2/7] 生成 .env**，
> 并在 **[3/7] 部署后自动核验**每个函数的环境变量，缺失即 `exit 1`，防止带病上线。
>
> **补救**（环境变量已被刷空时）：
> ```bash
> # 前提：.env 存在（否则模板仍解析为空）
> printf 'y\n' | tcb config update fn health-cert-create -e <环境ID>
> ```
> 选了「Override update」后，变量才会被重新写回。
>
> 💡 **推论**：这也是历史上「提交失败」可能的原因之一 ——
> 云函数返回 500「数据库未配置」，被前端兜底文案掩盖。
> **任何一次 `--force` 部署后，都必须核验环境变量。**

---

## 七、验收测试清单

运行 `node scripts/acceptance.js` 可自动完成 6 组、**36 个断言**：

| 组 | 覆盖内容 | 结果 |
|---|---|---|
| 1 | 静态托管首页 / JS 产物 / 环境变量注入 | ✅ 9/9 |
| 2 | SPA 路由回退（`/v/*`、`/cert/*`、深层路径） | ✅ 3/3 |
| 3 | 查验 API（预览码 400 / 查无此证 404 / 有效证 200 / 脱敏） | ✅ 8/8 |
| 4 | 照片匿名访问（200 + image/\*） | ✅ 2/2 |
| 5 | CORS（响应头 + OPTIONS 预检 204） | ✅ 2/2 |
| 6 | **签发 API（预检 / 不校验身份证 / 姓名必填 / 签发 / 闭环查验）** | ✅ 12/12 |

**当前状态：36/36 全部通过。**

### 专项验证脚本

| 脚本 | 用途 |
|---|---|
| `node scripts/acceptance.js` | 全链路验收（36 断言） |
| `node scripts/test-no-id-validation.js` | **不校验身份证**：6 种边界输入（`123` / 空 / 中文 / 带空格 / 乱码 / 合法 18 位）均能签发并查验 |
| `node scripts/test-full-user-flow.js` | 端到端：模拟提交 → 拼二维码 URL → 落地页 200 → 查验数据可查 → 照片可访问 |
| `node scripts/test-spa-route.js [verifyId]` | 专测 `/v/:id` **HTTP 状态码是否为 200**（二维码能否打开） |
| `node scripts/cos-spa-fallback.js <Id> <Key>` | 重配 SPA 回退，含回读确认 + 实测状态码 |

**需人工验证的 2 项**（自动化无法覆盖）：

| # | 测试项 | 操作 |
|---|---|---|
| A | 微信内扫码 | 用微信扫描证件二维码，应正常显示脱敏信息 |
| B | 4G 网络扫码 | 关闭 WiFi 用流量扫码，验证公网通道 |

---

## 八、故障排查案例：前端「提交失败」

### 症状

在录入页点击「二次确认并提交」，弹出 `提交失败`，
但页面预览（含二维码）已正常渲染 —— 即**前端渲染正常，是提交环节失败**。

### 根因链（逐层定位）

| 层 | 现象 | 结论 |
|---|---|---|
| 1 | `alert(e?.message \|\| '提交失败')` | **错误被吞掉**。js-sdk / 网关抛的是普通对象（`{code, error_description}`），没有 `message` 字段，取到 `undefined`，退化成兜底文案 |
| 2 | `tcb fn invoke` 直连成功 | 云函数本身正常，问题在**调用通道** |
| 3 | 前端走 `callFunction` | 需要登录态 |
| 4 | `ensureAuth()` 里 `if (!auth.hasLoginState() \|\| ...)` | **真 bug**：js-sdk 的 `hasLoginState()` 返回 Promise，`!Promise` 恒为 `false`，匿名登录**从未执行** |
| 5 | 环境 `AnonymousLogin: false` | 即使执行也会失败（PG 环境需在控制台开） |
| 6 | 补开匿名登录后仍失败 | 返回 `EXCEED_AUTHORITY` |
| 7 | 升级 js-sdk 到 v3 + Publishable Key | 返回 `EXCEED_AUTHORITY`（更明确） |
| 8 | 设 OPA 策略 `default allow := true`（全放通） | **仍失败** → 证明**不是策略层问题** |
| 9 | HTTP 访问服务直连 `curl` | ✅ 200 正常 |

### 真正的根因

**CloudBase PostgreSQL 体验版不支持前端 js-sdk 的 `callFunction`。**
该环境的「身份认证 → 权限控制」页面显示「当前环境暂不支持此功能」，
无法给匿名角色授予调用云函数权限（官方社区 issue #1403 相同场景）。
云函数安全规则全放行、OPA 策略全放行均无效。

**而 `create` 当时根本没有 HTTP 访问服务入口**（只给 verify 配了 `/api`），
所以签发只能走 `callFunction` → 必然失败。

### 解决方案

1. **为 create 开通 HTTP 访问服务**：
   ```bash
   tcb service create -p api/create -f health-cert-create -e health-card-d2ga2cvid6561b93d
   ```
2. **前端统一走 HTTP**，移除 `callFunction` 与匿名登录依赖（见第四节第 2 点）
3. **修复错误吞噬**：新增 `describeError()`，把非标准错误对象转成可读文案，
   并在 `callFn`/`fetch` 外层拼接鉴权线索

### 排查用的经验教训

- **`tcb fn invoke` 成功 ≠ 前端能调通**：前者是 CLI 管理员身份直连，绕过所有鉴权
- **`EXCEED_AUTHORITY` 不一定是策略问题**：先用「全放通策略」二分定位，
  若仍失败则问题在更底层（平台能力限制）
- **错误提示必须透传真实原因**：兜底文案会让排查成本呈指数上升
- **验证要用真实链路**：本地起服务、`curl` 模拟带 `Origin` 的请求，
  而不是只依赖 CLI

### 排查脚本（保留可复用）

| 脚本 | 用途 |
|---|---|
| `scripts/acceptance.js` | 线上全量验收（36 断言），含签发闭环 |
| `scripts/verify-pubkey-v3.js` | v3 + Publishable Key 端到端验证 |
| `scripts/e2e-auth-verify.js` | 匿名登录链路验证（jsdom 模拟浏览器） |
| `scripts/repro-frontend-submit.js` | 复现前端提交失败并 dump 真实错误对象 |

---

## 八·二、故障排查案例：提交仍失败 + 二维码打不开（收官）

> 用户反馈原话：「现在还是生成不了健康证，当我点击二次确认时还是失败。
> 现在我不要检测身份证是否合格了。只要我输入信息，就直接给我健康证的信息和二维码。
> **只要二维码可以上网查到就可以了**」

这一轮实际暴露了 **3 个独立问题**，任何一个都会让「提交 → 出二维码 → 扫码能查到」断掉。

### 问题 1：云函数环境变量被 `--force` 部署刷空

- **症状**：`{"code":500,"msg":"数据库未配置：请在云函数环境变量中设置 TCB_ENV_ID / TCB_API_KEY"}`
- **根因**：`{{env.TCB_ENV_ID}}` 模板解析不到值 —— CLI 只读 `.env` / `.env.local`，
  **不读 `.env.deploy`**（详见第六节）
- **修复**：部署前用 `.env.deploy` 生成 `.env`；`deploy.sh` 增加部署后自动核验

### 问题 2：身份证不再校验后，`age` 空串导致整条插入失败

- **症状**：移除身份证校验后，用 `idCard: "123"` 签发返回
  `{"code":500,"msg":"invalid input syntax for type integer: \"\""}`
- **根因**：`parseIdCard()` 解析不出生日时回退 `{ birthDate: '', age: '', gender: '' }`，
  而 PG 中 `age` 是 **`int32`**，空串无法转整数，整条 INSERT 被拒。
  （原先有身份证校验，非法值在更早一步就被 400 拦掉，所以这个 bug 一直没被触发。）
- **修复**（`cloudfunctions/health-cert-create/biz.js`）：
  ```js
  // age 在 PG 中是 int32，必须给 null 而不是空串
  const fallback = { birthDate: null, age: null, gender: null };
  ```
  前端 `CertCard.vue` 早已用 `cert.age ?? '—'` 兜底，`null` 能正常显示为「—」。

### 问题 3：二维码落地页返回 HTTP 404（最关键）

- **症状**：`/v/<verifyId>` 返回的**内容**是 `index.html`（浏览器看正常），
  但 **HTTP 状态码是 404**
- **根因**：COS 的 `ErrorDocument` 默认保留原始错误码，
  只写 `Key` 不写 `OriginalHttpStatus` 时，状态码仍是 404
- **为什么危险**：内容正确 ⇒ 极易误判为「已修好」；
  实际微信/WebView/社交平台预检等对状态码敏感的链路会异常
- **修复**：
  ```bash
  node scripts/cos-spa-fallback.js <SecretId> <SecretKey>
  # 写入 ErrorDocument.OriginalHttpStatus = "Disabled" → 回退命中返回 200
  ```
- **验证**：`node scripts/test-spa-route.js <verifyId>` → 期望 `HTTP 200`

### 收获的判定原则

- **修 SPA 回退时，看状态码，不要只看内容**
- **改数据模型约束（如去掉某字段校验）后，必须回归所有下游字段的类型兼容性**
- **云函数「部署成功」不等于「配置正确」**，部署后要核验关键配置（环境变量）

---

## 九、回退方案

海外方案文档保留在 `免费公网部署方案.md`（Vercel + Render + Neon + Cloudinary）。

> 注意：切换回海外方案后，**二维码里的域名会变，旧二维码需重新生成并重签**。

---

## 十、常用命令速查

```bash
# 登录（API 密钥方式，非交互）
tcb login --apiKeyId <SecretId> --apiKey <SecretKey>

# 部署云函数
tcb fn deploy health-cert-verify -e health-card-d2ga2cvid6561b93d --force

# 调用云函数（调试）
tcb fn invoke health-cert-verify -e <envId> --params '{"verifyId":"xxx"}'

# 上传静态托管（注意用绝对路径，避免 Git Bash 路径转换）
MSYS_NO_PATHCONV=1 tcb hosting deploy "D:/cursor-all-project/health-card/frontend/dist" / -e <envId>

# 一键部署（含构建 + 校验）
bash deploy.sh

# 配置 SPA 路由回退
node scripts/cos-spa-fallback.js <SecretId> <SecretKey>

# 全量验收测试
node scripts/acceptance.js

# 通用云 API 调用
tcb api tcb DescribeEnvs --body '{}' --json
```

> ⚠️ **Git Bash 路径转换坑**：直接写 `tcb hosting deploy frontend/dist /` 时，
> MSYS 会把 `/` 和相对路径转成 Git 安装目录，导致文件传到错误位置。
> **务必用 `MSYS_NO_PATHCONV=1` + 绝对路径**。


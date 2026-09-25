# 健康证H5 → 腾讯云 CloudBase 国内免费部署架构改造

> 彻底替换 Vercel + Render + Neon + Cloudinary 海外方案，改为 CloudBase 一体化国内免费方案。

## 1. 现状与问题

- 前端在 Vercel，国内访问慢且微信内偶发拦截。
- 后端在 Render 免费版，15 分钟休眠，首次扫码超时 30~50s。
- 数据在 Neon（海外）、图片在 Cloudinary（海外），跨境延迟高。
- 二维码内容为海外域名，任何手机异网打开都慢。

## 2. 目标架构（CloudBase 一体化）

```mermaid
flowchart TB
  phone[任意手机扫码] --> web[CloudBase Hosting<br/>Vue H5静态站]
  web --> call[wx.cloud.callFunction / HTTP]
  call --> fn1[云函数 health-cert-create<br/>办证签发]
  call --> fn2[云函数 health-cert-verify<br/>扫码查验 3天有效]
  fn1 --> db[(CloudBase MongoDB<br/>health_certs集合)]
  fn2 --> db
  fn1 --> cos[(CloudBase 云存储<br/>health-photos/)]
  verify[定时触发器<br/>每小时清理过期verifyId] --> db
```

- Hosting：替代 Vercel，国内 CDN + 免费额度，绑定微信小程序同主体。
- 云函数（Node 18）：替代 Render Express，`certs.js` 拆为 `create`，`verify.js` 拆为 `verify`，`VITE_VERIFY_BASE_URL` 改为 Hosting 域名。
- 云数据库 Mongo：替代 Neon/`db.json`，集合 `health_certs`，`verifyId` 唯一索引 + `verifyExpiresAt` TTL 索引（3天自动删除，无需 `startVerifyCleanup`）。
- 云存储 COS：替代 Cloudinary/`uploads/`。上传后必须调用 SDK `getTempFileURL` 由 fileID 换取公开 CDN HTTPS 链接再存 `photoUrl`，禁止只存 `cloud://` fileID，否则普通浏览器无法加载。见 `frontend/src/cloud/upload.ts:uploadPhotoToCOS`。

## 3. 代码改动清单

| 原文件 | 改为 | 说明 |
|---|---|---|
| `backend/src/index.js` | 删除，改为 `cloudfunctions/health-cert-create/index.js` + `health-cert-verify/index.js` | Express 改云函数入口 |
| `backend/src/routes/certs.js` | `health-cert-create`：`multer` 改 COS 直传，`genCertNo` 不变，写 Mongo，`verifyExpiresAt=now+3天` |  |
| `backend/src/routes/verify.js` | `health-cert-verify`：判 `preview-`、`410过期`，`maskName` 保留 |  |
| `backend/src/db.js` + `data/db.json` | 删除，改 `cloudbaserc.json` 数据规则 |  |
| `frontend/src/config/publicUrl.ts` | `VITE_VERIFY_BASE_URL` 改 Hosting 域名，`VITE_API_BASE_URL` 删除，改 `callFunction` |  |
| `frontend/src/pages/VerifyPage.vue` | 环境判断：`isWechat()` 为 true 走 `callFunction(health-cert-verify)`，否则 `fetch(VITE_TCB_HTTP_VERIFY?verifyId=)`，见 `frontend/src/cloud/verify.ts` |  |
| `frontend/src/cloud/cloudbase.ts` + `upload.ts` | 新增：`uploadPhotoToCOS` 上传后 `getTempFileURL` 换公开 HTTPS 存 `photoUrl` |  |
| `frontend/vite.config.ts` | `proxy /api` 删除 |  |
| 新增 `cloudbaserc.json`、`database/rule.json` | 环境、TTL 索引、存储权限 |  |

## 4. 数据模型（Mongo）

```js
{
  verifyId: String, // unique
  certNo: String,   // unique, JK+年份+随机+流水
  name: String,
  idCard: String,   // 前6+**********+后4
  idCardHash: String,
  age: Number, gender: String, birthDate: String,
  photoUrl: String, // COS 公开 CDN HTTPS（uploadPhotoToCOS 经 getTempFileURL 换取，勿存 cloud://）
  regionName: String, hospitalName: String,
  validFrom: Date, validTo: Date,
  verifyExpiresAt: Date, // TTL 3天
  createdAt: Date
}
```

`db.collection('health_certs').createIndex({verifyId:1},{unique:true})`，`createIndex({verifyExpiresAt:1},{expireAfterSeconds:0})`。

## 5. 部署步骤

1. 微信云开发/CloudBase 新建按量计费环境（免费额度内）。
2. `npm i -g @cloudbase/cli`，`tcb login`，`tcb framework deploy`。
3. Hosting 绑定自定义域名 + HTTPS，环境变量填 Hosting 域名后重 `build`，旧内网码作废重签。
4. 新增环境变量：`VITE_TCB_ENV_ID`（云环境ID）、`VITE_TCB_HTTP_VERIFY`（verify 云函数 HTTP 触发地址）。
5. 手机断 WiFi 用 4G 扫领证页码验证：微信内走云函数通道，Safari/Chrome 走 HTTPS 通道。

## 6. 回退

保留 `免费公网部署方案.md` 海外版，CloudBase 出问题切回 Vercel+Render 即可，二维码需重签。

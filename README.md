# 医院健康证 H5 生成系统

## 启动
```bash
cd backend && npm install && npm run dev   # :3000
cd ../frontend && npm install && npm run dev # :5173
```

## 流程
录入 `/` → 存档签发 `POST /api/certs` → 证面 `/cert/:id` → 扫码查验 `/v/:id`

## 规则
- 年龄由身份证 7-14 位计算，编号 `JK+年份+地区码+6位流水`
- 有效期 开始=签发前一天，结束=开始+1年-1天
- 二维码内容为查验短链 `/v/{verifyId}`，查验页脱敏+水印
- 照片 5MB 限制，本地 `uploads/YYYY-MM/` 存储

## 部署
Nginx 反代同域 + HTTPS，前端 dist + 后端 :3000，后期切 MySQL/OSS。

/**
 * 腾讯云 API 权限检查脚本
 *
 * @description 调用腾讯云 TC3-HMAC-SHA256 签名接口检查账号权限。
 * 密钥从环境变量读取，需在本地 `.env` 或 CloudBase 控制台配置：
 * - TENCENT_SECRET_ID
 * - TENCENT_SECRET_KEY
 * 切勿将真实密钥硬编码提交到 Git。
 */
const crypto = require('crypto');
const https = require('https');
/** @type {string|undefined} 腾讯云 SecretID（从环境变量读取） */
const SECRET_ID = process.env.TENCENT_SECRET_ID;
/** @type {string|undefined} 腾讯云 SecretKey（从环境变量读取） */
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;

if (!SECRET_ID || !SECRET_KEY) {
  console.error('[ERROR] 缺少环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，请在 .env 或 CloudBase 控制台配置后重试。');
  process.exit(1);
}

function callApi(host, service, action, version, region, payload) {
  return new Promise((resolve) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const ch = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const sh = 'content-type;host';
    const hp = crypto.createHash('sha256').update(payload).digest('hex');
    const cr = `POST\n/\n\n${ch}\n${sh}\n${hp}`;
    const cs = `${date}/${service}/tc3_request`;
    const hcr = crypto.createHash('sha256').update(cr).digest('hex');
    const sts = `TC3-HMAC-SHA256\n${ts}\n${cs}\n${hcr}`;
    const kD = crypto.createHmac('sha256', 'TC3' + SECRET_KEY).update(date).digest();
    const kS = crypto.createHmac('sha256', kD).update(service).digest();
    const kSi = crypto.createHmac('sha256', kS).update('tc3_request').digest();
    const sig = crypto.createHmac('sha256', kSi).update(sts).digest('hex');
    const auth = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${cs}, SignedHeaders=${sh}, Signature=${sig}`;
    const req = https.request({
      hostname: host, method: 'POST', path: '/',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': ts,
        'X-TC-Region': region
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(payload);
    req.end();
  });
}

const checks = [
  ['列出已有云函数 scf:ListFunctions', 'scf.tencentcloudapi.com', 'scf', 'ListFunctions', '2018-04-16', 'ap-shanghai', JSON.stringify({ Limit: 10 })],
  ['获取COS临时上传 scf:GetTempCosInfo', 'scf.tencentcloudapi.com', 'scf', 'GetTempCosInfo', '2018-04-16', 'ap-shanghai', JSON.stringify({})],
  ['查CAM策略 cam:ListAttachedUserPolicies', 'cam.tencentcloudapi.com', 'cam', 'ListAttachedUserPolicies', '2019-01-16', 'ap-guangzhou', JSON.stringify({ TargetUin: 100053224602 })],
  ['查COS桶列表 cos:GetService', 'cos.tencentcloudapi.com', 'cos', 'GetService', '2019-01-01', 'ap-shanghai', JSON.stringify({})],
  ['查静态托管 tcb:DescribeStaticStorages', 'tcb.tencentcloudapi.com', 'tcb', 'DescribeStaticStorages', '2018-06-08', 'ap-shanghai', '{}'],
  ['查数据库集合 tcb:DescribeTables', 'tcb.tencentcloudapi.com', 'tcb', 'DescribeTables', '2018-06-08', 'ap-shanghai', JSON.stringify({ EnvId: 'health-card-d2ga2cvid6561b93d' })]
];

(async () => {
  for (const item of checks) {
    const label = item[0];
    const r = await callApi(item[1], item[2], item[3], item[4], item[5], item[6]);
    const err = r && r.Response && r.Response.Error;
    if (err) {
      console.log('[X] ' + label);
      console.log('    ' + err.Code + ' -> ' + String(err.Message).split('\n')[0].slice(0, 130));
    } else {
      console.log('[OK] ' + label);
    }
  }
})();

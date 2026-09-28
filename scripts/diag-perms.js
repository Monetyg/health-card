/**
 * 诊断当前密钥能调用哪些云开发相关接口
 */
const crypto = require('crypto');

const SECRET_ID = process.argv[2];
const SECRET_KEY = process.argv[3];

function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hmac(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }

async function call(action, version = '2018-06-08', extra = {}) {
  const host = 'tcb.tencentcloudapi.com';
  const service = 'tcb';
  const region = 'ap-shanghai';
  const payload = JSON.stringify(extra);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST', '/', '',
    canonicalHeaders, signedHeaders,
    sha256hex(payload)
  ].join('\n');

  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), scope,
    sha256hex(canonicalRequest)
  ].join('\n');

  const kDate = hmac('TC3' + SECRET_KEY, date);
  const kService = hmac(kDate, service);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
      'Authorization': authorization,
    },
    body: payload,
  });
  const j = await res.json();
  const r = j.Response || {};
  return r.Error ? `✗ ${r.Error.Code}` : `✓ OK`;
}

(async () => {
  const cases = [
    ['tcb', 'DescribeEnvs', '2018-06-08', {}],
    ['tcb', 'DescribeHostingDomain', '2018-06-08', {}],
    ['scf', 'ListFunctions', '2018-06-08', { Limit: 1 }],
    ['scf', 'CreateFunction', '2018-06-08', { FunctionName: 'perm-test-probe', Runtime: 'Nodejs18.15', Handler: 'index.main', Code: { ZipFile: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' } }],
  ];
  for (const [svc, action, ver, extra] of cases) {
    try {
      console.log(`[${svc}] ${action.padEnd(26)} ${await call(action, ver, extra)}`);
    } catch (e) {
      console.log(`[${svc}] ${action.padEnd(26)} ✗ ${e.message}`);
    }
  }

  // CAM 查询自身权限
  console.log('\n--- CAM ---');
  for (const action of ['GetUser', 'ListAttachedUserPolicies', 'GetRoleList']) {
    try {
      const host = 'cam.tencentcloudapi.com';
      const payload = action === 'ListAttachedUserPolicies' ? JSON.stringify({ TargetUin: 100053224602 }) : '{}';
      const ts = Math.floor(Date.now() / 1000);
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      const ch = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
      const cr = ['POST', '/', '', ch, 'content-type;host', sha256hex(payload)].join('\n');
      const scope = `${date}/cam/tc3_request`;
      const sts = ['TC3-HMAC-SHA256', String(ts), scope, sha256hex(cr)].join('\n');
      const kS = crypto.createHmac('sha256', hmac(hmac('TC3' + SECRET_KEY, date), 'cam')).update('tc3_request').digest();
      const sig = crypto.createHmac('sha256', kS).update(sts).digest('hex');
      const res = await fetch(`https://${host}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8', Host: host,
          'X-TC-Action': action, 'X-TC-Version': '2019-01-16',
          'X-TC-Timestamp': String(ts), 'X-TC-Region': '',
          Authorization: `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${scope}, SignedHeaders=content-type;host, Signature=${sig}`,
        },
        body: payload,
      });
      const j = await res.json();
      const r = j.Response || {};
      if (r.Error) console.log(`cam ${action.padEnd(26)} ✗ ${r.Error.Code}`);
      else {
        const pol = r.PolicySet || [];
        console.log(`cam ${action.padEnd(26)} ✓ ${pol.map((p) => p.PolicyName || p.PolicyId).join(', ') || JSON.stringify(r).slice(0, 200)}`);
      }
    } catch (e) { console.log(`cam ${action.padEnd(26)} ✗ ${e.message}`); }
  }
})();

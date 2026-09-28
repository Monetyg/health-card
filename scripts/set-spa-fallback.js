/**
 * 配置 COS 静态网站（严格按官方签名算法）
 * 文档：https://cloud.tencent.com/document/product/436/7778
 */
const crypto = require('crypto');

const SECRET_ID = process.argv[2];
const SECRET_KEY = process.argv[3];
const BUCKET = process.argv[4] || '2283-static-health-card-d2ga2cvid6561b93d-1424804512';
const REGION = process.argv[5] || 'ap-shanghai';
const HOST = `cos.${REGION}.myqcloud.com`;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const hmacSha1 = (k, m) => crypto.createHmac('sha1', k).update(m).digest();

function buildAuth(method, pathname, signHeaders, signTime) {
  const signKey = hmacSha1(SECRET_KEY, signTime);

  const keys = Object.keys(signHeaders).sort();
  const headerList = keys.join(';');
  const httpHeaders = keys.map((k) => `${k}=${encodeURIComponent(signHeaders[k])}`).join('&');

  // HttpString = Method\nUriPathname\nHttpParameters\nHttpHeaders\n
  const httpString = `${method}\n${pathname}\n\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${signTime}\n${sha1(httpString)}\n`;
  const signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex');

  return {
    auth: `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${signTime}&q-key-time=${signTime}&q-header-list=${headerList}&q-url-param-list=&q-signature=${signature}`,
    debug: { httpString, stringToSign, headerList },
  };
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<WebsiteConfiguration>
  <IndexDocument><Suffix>index.html</Suffix></IndexDocument>
  <ErrorDocument>
    <Key>index.html</Key>
    <OriginalHttpStatus>Disabled</OriginalHttpStatus>
  </ErrorDocument>
</WebsiteConfiguration>`;

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const signTime = `${now - 60};${now + 3600}`;

  // 参与签名的头：只用 content-type 和 host（小写）
  const signHeaders = {
    host: `${BUCKET}.${HOST}`,
    'content-type': 'application/xml',
  };

  const { auth, debug } = buildAuth('put', '/', signHeaders, signTime);

  console.log('=== 签名调试 ===');
  console.log('HttpString:\n' + JSON.stringify(debug.httpString));
  console.log('StringToSign:\n' + JSON.stringify(debug.stringToSign));
  console.log('headerList:', debug.headerList);

  const url = `https://${BUCKET}.${HOST}/?website`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Host: signHeaders.host,
      'Content-Type': signHeaders['content-type'],
      Authorization: auth,
    },
    body: XML,
  });
  const text = await res.text();
  console.log('\nHTTP', res.status);
  if (res.status === 200) console.log('✅ 配置成功');
  else console.log(text.slice(0, 900));
})();

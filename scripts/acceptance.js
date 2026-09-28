/**
 * 线上端到端验收测试
 * 覆盖：静态托管、SPA 路由、签发、查验、异常分支、照片、CORS、清理
 */
const ENV_ID = 'health-card-d2ga2cvid6561b93d';
const HOST = `${ENV_ID}-1424804512.tcloudbaseapp.com`;
const SITE = `https://${HOST}`;
const API = `https://${ENV_ID}-1424804512.ap-shanghai.app.tcloudbase.com/api`;
/** 签发入口：HTTP 访问服务的独立路径（前端 createCert 走这里） */
const API_CREATE = `${API}/create`;
/** 1x1 PNG，用于签发链路测试 */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/** 校验位正确的测试身份证 */
const VALID_ID = '110101199001016513';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  ' + detail : ''}`); }
}

async function get(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  const t = await r.text();
  try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, body, headers: r.headers };
}

(async () => {
  console.log('═══ 1. 静态托管 ═══');
  const home = await get(`${SITE}/`);
  check('首页可访问', home.status === 200, `HTTP ${home.status}`);
  check('首页是 HTML', typeof home.body === 'string' && home.body.includes('<div id="app">'), '找到 #app 挂载点');
  const jsFile = String(home.body).match(/src="(\/assets\/[^"]+\.js)"/);
  check('HTML 引用 JS 产物', !!jsFile, jsFile ? jsFile[1] : '未找到');

  if (jsFile) {
    const js = await get(`${SITE}${jsFile[1]}`);
    check('JS 产物可访问', js.status === 200, `HTTP ${js.status}，${(String(js.body).length / 1024).toFixed(0)}KB`);
    check('环境ID已注入', String(js.body).includes(ENV_ID));
    check('静态托管域名已注入', String(js.body).includes(HOST));
    check('查验API地址已注入', String(js.body).includes('ap-shanghai.app.tcloudbase.com/api'));
    check('签发API地址已注入', String(js.body).includes('ap-shanghai.app.tcloudbase.com/api/create'));
    check('无未替换的变量字面量', !String(js.body).includes('VITE_VERIFY_BASE_URL'), 'Vite 已静态替换');
  }

  console.log('\n═══ 2. SPA 路由重写 ═══');
  for (const p of ['/v/abc123', '/cert/abc123', '/deep/nested/route']) {
    const r = await get(`${SITE}${p}`);
    // COS 错误文档回退：状态码仍为 404，但内容已返回 index.html，前端路由可接管
    check(`${p} 回退到 index.html`, String(r.body).includes('<div id="app">'), `HTTP ${r.status}，已返回入口文件`);
  }

  console.log('\n═══ 3. 查验 API（HTTP 访问服务）═══');
  const p1 = await get(`${API}?verifyId=preview-test`);
  check('预览码 → 400', p1.status === 400, `${p1.status} ${p1.body.msg || ''}`);
  const p2 = await get(`${API}?verifyId=zzzznotexist`);
  check('查无此证 → 404', p2.status === 404, `${p2.status} ${p2.body.msg || ''}`);
  const p3 = await get(`${API}?verifyId=usen7282px`);
  check('有效证查验 → 200', p3.status === 200 && p3.body.code === 0, `${p3.status}`);
  if (p3.body && p3.body.data) {
    const d = p3.body.data;
    check('姓名已脱敏', d.name === '测**户', d.name);
    check('身份证已脱敏', /^\d{6}\*{10}[\dXx]{4}$/.test(d.idCard), d.idCard);
    check('照片链接存在', !!d.photoUrl);
    check('状态为有效', d.status === '有效', d.status);
  }

  console.log('\n═══ 4. 照片公共读（匿名访问）═══');
  if (p3.body && p3.body.data && p3.body.data.photoUrl) {
    const img = await fetch(p3.body.data.photoUrl);
    check('照片匿名可访问', img.status === 200, `HTTP ${img.status}`);
    check('照片类型为图片', (img.headers.get('content-type') || '').startsWith('image/'), img.headers.get('content-type'));
  }

  console.log('\n═══ 5. CORS ═══');
  const cors = await fetch(`${API}?verifyId=usen7282px`, { headers: { Origin: SITE } });
  const acao = cors.headers.get('access-control-allow-origin');
  check('返回 CORS 头', acao === SITE, acao || '缺失');
  const pre = await fetch(API, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'GET' } });
  check('OPTIONS 预检通过', pre.status === 204, `HTTP ${pre.status}`);

  console.log('\n═══ 6. 签发 API（前端 createCert 通道）═══');
  // 6.1 预检：POST + Content-Type 会触发 CORS 预检
  const preCreate = await fetch(API_CREATE, {
    method: 'OPTIONS',
    headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  check('create OPTIONS 预检通过', preCreate.status === 204, `HTTP ${preCreate.status}`);
  check(
    'create 预检放通 POST',
    (preCreate.headers.get('access-control-allow-methods') || '').includes('POST'),
    preCreate.headers.get('access-control-allow-methods') || '缺失'
  );
  check(
    'create 预检来源正确',
    preCreate.headers.get('access-control-allow-origin') === SITE,
    preCreate.headers.get('access-control-allow-origin') || '缺失'
  );

  // 6.2 不校验身份证：任意输入都应签发成功
  // 业务要求（用户明确指定）：不做身份证合法性校验，填什么就签发什么，
  // 因此 '123'、中文、空值等一律 code=0，不再返回 400。
  const badId = await fetch(API_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE },
    body: JSON.stringify({ name: '验收', idCard: '123', regionName: '广东省', hospitalName: '测试医院', photoBase64: TINY_PNG, photoExt: 'png' }),
  });
  const badIdBody = await badId.json().catch(() => ({}));
  // 注意：HTTP 访问服务会把云函数的返回体原样透传，HTTP 层状态码为 200，
  // 业务错误码在 body.code 中体现，因此这里校验 code 而非 status。
  check('不校验身份证：idCard=123 也签发成功', badIdBody.code === 0, `HTTP ${badId.status} code=${badIdBody.code} msg=${badIdBody.msg || ''}`);
  check(
    '不校验身份证：落库保留原始值',
    badIdBody.code === 0 && badIdBody.data && badIdBody.data.idCard === '123',
    badIdBody.code === 0 ? `idCard=${badIdBody.data && badIdBody.data.idCard}` : '未签发'
  );

  // 6.2b 仅姓名必填：缺姓名应被拦截
  const noName = await fetch(API_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE },
    body: JSON.stringify({ name: '', idCard: '110101199003074651', regionName: '广东省', hospitalName: '测试医院', photoBase64: TINY_PNG, photoExt: 'png' }),
  });
  const noNameBody = await noName.json().catch(() => ({}));
  check('姓名为空 → code=400', noNameBody.code === 400, `HTTP ${noName.status} code=${noNameBody.code}`);
  check('姓名校验提示可读', /姓名/.test(noNameBody.msg || ''), noNameBody.msg || '无 message');

  // 6.3 正常签发
  const created = await fetch(API_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE },
    body: JSON.stringify({
      name: '验收测试',
      idCard: VALID_ID,
      regionName: '广东省',
      hospitalName: '深圳市第一人民医院',
      photoBase64: TINY_PNG,
      photoExt: 'png',
    }),
  });
  const createdBody = await created.json().catch(() => ({}));
  check('签发成功 → 200/code=0', created.status === 200 && createdBody.code === 0, `${created.status} ${createdBody.msg || ''}`);

  const newId = createdBody.data && createdBody.data.verifyId;
  if (newId) {
    check('返回 verifyId', typeof newId === 'string' && newId.length >= 8, newId);
    check('返回 certNo', /^JK\d{10,}$/.test(createdBody.data.certNo || ''), createdBody.data.certNo || '缺失');
    // 签发响应返回原始姓名（供前端领证页展示）；脱敏在查验链路完成，见下方闭环校验。

    // 6.4 签发后可查验（闭环），此处应返回脱敏数据
    const back = await get(`${API}?verifyId=${newId}`);
    check('签发结果可查验', back.status === 200 && back.body.code === 0, `HTTP ${back.status}`);
    if (back.body && back.body.data) {
      check('查验返回姓名已脱敏', back.body.data.name === '验**试', back.body.data.name || '');
      check('查验返回身份证已脱敏', /^\d{6}\*{10}[\dXx]{4}$/.test(back.body.data.idCard || ''), back.body.data.idCard || '');
    }
  }

  console.log(`\n${'═'.repeat(46)}`);
  console.log(`  通过 ${pass} 项 / 失败 ${fail} 项`);
  console.log(`${'═'.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e.message); process.exit(1); });

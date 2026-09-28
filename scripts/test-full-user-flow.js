/**
 * 端到端用户流程验证：
 *   1. 模拟前端提交（含照片 base64）→ 签发
 *   2. 用返回的 verifyId 拼接二维码落地页 URL（前端 CertCard 的实际格式）
 *   3. 验证落地页 HTTP 200（扫码能打开）
 *   4. 验证落地页 JS 产物里含查验 API 地址（前端会自己去查）
 *   5. 调查验 API 确认数据可查
 *
 * 用法：node scripts/test-full-user-flow.js
 */
const STATIC_HOST = 'health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';
const API_BASE = 'https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api';
const CREATE = `${API_BASE}/create`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const line = (s) => console.log(s);
const ok = (s) => console.log(`  ✅ ${s}`);
const bad = (s) => console.log(`  ❌ ${s}`);

(async () => {
  let fail = 0;

  line('═══ 1. 模拟用户提交（姓名 + 身份证 + 照片）═══');
  const createRes = await fetch(CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '王小明',
      idCard: '123456',
      regionName: '北京市',
      hospitalName: '北京协和医院',
      photoBase64: `data:image/png;base64,${PNG}`,
      photoExt: 'png'
    })
  });
  const created = await createRes.json().catch(() => ({}));
  if (created.code !== 0) {
    bad(`签发失败：code=${created.code} msg=${created.msg}`);
    process.exit(1);
  }
  ok(`签发成功  verifyId=${created.data.verifyId}  certNo=${created.data.certNo}`);
  ok(`身份证未校验，落库值="${created.data.idCard}"`);

  const { verifyId } = created.data;

  line('\n═══ 2. 二维码落地页（前端 CertCard 生成格式：<域名>/v/<verifyId>）═══');
  const qrUrl = `https://${STATIC_HOST}/v/${verifyId}`;
  line(`  二维码内容: ${qrUrl}`);
  const pageRes = await fetch(qrUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const pageHtml = await pageRes.text();
  if (pageRes.status === 200 && /<div id="app">/.test(pageHtml)) {
    ok(`扫码落地页 HTTP ${pageRes.status}，返回 Vue 挂载页`);
  } else {
    bad(`扫码落地页异常 HTTP ${pageRes.status}`);
    fail++;
  }

  line('\n═══ 3. 落地页前端产物是否带上查验 API 地址 ═══');
  const jsMatch = pageHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!jsMatch) {
    bad('未在 HTML 中找到 JS 产物引用');
    fail++;
  } else {
    const jsRes = await fetch(`https://${STATIC_HOST}${jsMatch[1]}`);
    const js = await jsRes.text();
    if (js.includes('app.tcloudbase.com/api')) {
      ok('JS 产物含查验 API 地址，前端可自行发起查验');
    } else {
      bad('JS 产物缺少查验 API 地址，扫码后无法查数据');
      fail++;
    }
  }

  line('\n═══ 4. 查验 API 数据可查 ═══');
  const vRes = await fetch(`${API_BASE}?verifyId=${encodeURIComponent(verifyId)}`);
  const vBody = await vRes.json().catch(() => ({}));
  if (vBody.code === 0) {
    const d = vBody.data;
    ok(`姓名=${d.name}（已脱敏） 证号=${d.certNo} 状态=${d.status}`);
    ok(`有效期=${d.validText}`);
    if (d.photoUrl) {
      const pRes = await fetch(d.photoUrl);
      pRes.ok ? ok(`照片可匿名访问 HTTP ${pRes.status}`) : bad(`照片不可访问 HTTP ${pRes.status}`);
      if (!pRes.ok) fail++;
    }
  } else {
    bad(`查验失败 code=${vBody.code} msg=${vBody.msg}`);
    fail++;
  }

  line('\n' + '═'.repeat(46));
  line(fail === 0 ? '  端到端流程全部通过 ✅  二维码可正常上网查到' : `  ${fail} 项失败`);
  line('═'.repeat(46));
  process.exit(fail === 0 ? 0 : 1);
})();

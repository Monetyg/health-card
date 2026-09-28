/**
 * 验证「不校验身份证」改造：任意输入都能签发，且签发后能立刻上网查验。
 *
 * 用法：node scripts/test-no-id-validation.js
 * 依赖：无需额外依赖（Node 18+ 内置 fetch）
 */
const CREATE = 'https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api/create';
const VERIFY = 'https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api';
// 1x1 透明 PNG，体积最小，避免消耗云存储额度
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function post(body) {
  const r = await fetch(CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const raw = await r.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* 非 JSON */ }
  return { status: r.status, json, raw };
}

async function verify(verifyId) {
  const r = await fetch(`${VERIFY}?verifyId=${encodeURIComponent(verifyId)}`);
  const raw = await r.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* 非 JSON */ }
  return { status: r.status, json, raw };
}

const cases = [
  { label: '身份证=123（纯数字短串）', idCard: '123' },
  { label: '身份证为空', idCard: '' },
  { label: '身份证=中文', idCard: '这是一个中文测试' },
  { label: '身份证=带前后空格', idCard: '  110101199003074651  ' },
  { label: '身份证=乱码符号', idCard: '!@#$%^&*()' },
  { label: '身份证=合法18位', idCard: '110101199003074651' }
];

(async () => {
  let pass = 0;
  let fail = 0;
  const created = [];

  for (const c of cases) {
    const res = await post({
      name: '张三',
      idCard: c.idCard,
      regionName: '北京市',
      hospitalName: '测试医院',
      photoBase64: 'data:image/png;base64,' + PNG
    });

    if (!res.json || res.json.code !== 0) {
      const msg = res.json ? `${res.json.code} / ${res.json.msg}` : res.raw.slice(0, 120);
      console.log(`✗ ${c.label}\n    签发失败 -> ${msg}`);
      fail++;
      continue;
    }

    const d = res.json.data;
    const v = await verify(d.verifyId);
    const ok = v.json && v.json.code === 0;

    if (ok) {
      pass++;
      created.push(d.verifyId);
      console.log(`✓ ${c.label}`);
      console.log(`    verifyId=${d.verifyId}  落库身份证="${d.idCard}"`);
      console.log(`    查验：${v.json.data.name} / ${v.json.data.certNo} / ${v.json.data.status}`);
    } else {
      fail++;
      console.log(`✗ ${c.label}\n    verifyId=${d.verifyId} 已签发，但查验失败 -> ${v.json ? v.json.code + ' ' + v.json.msg : v.raw.slice(0, 100)}`);
    }
  }

  console.log(`\n=== 签发+查验闭环：通过 ${pass} / 失败 ${fail} ===`);
  if (created.length) {
    console.log('\n可用于人工扫码验证的链接：');
    for (const id of created.slice(0, 3)) {
      console.log(`  https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api?verifyId=${id}`);
    }
  }
  process.exit(fail === 0 ? 0 : 1);
})();

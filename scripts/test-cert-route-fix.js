/**
 * 部署后验证：确认 create 返回的 id 就是 verifyId，且 /cert/:id 能打开。
 *
 * 关键回归点：
 *   前端 router.push('/cert/' + (cert.id || cert.verifyId || cert._id))
 *   若 create 返回的 id 是自增主键（如 "12"），而 verify 只按 verify_id 查，
 *   就会 404 —— 这正是「地址栏 /cert/12」打不开的根因。
 *
 * 用法：node scripts/test-cert-route-fix.js
 */
const https = require('https');
const STATIC_HOST = 'health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';
const API_BASE = 'https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api';
const CREATE = `${API_BASE}/create`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function get(pathOrUrl, isAbsolute) {
  return new Promise((resolve) => {
    const opts = isAbsolute
      ? new URL(pathOrUrl)
      : { hostname: STATIC_HOST, path: pathOrUrl, headers: { 'User-Agent': 'Mozilla/5.0' } };
    https
      .get(opts, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => resolve({ status: r.statusCode, body: d }));
      })
      .on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
  });
}

let fail = 0;
const ok = (s) => console.log(`  ✅ ${s}`);
const bad = (s) => { console.log(`  ❌ ${s}`); fail++; };

(async () => {
  console.log('═══ 1. 签发一张新证，检查返回的 id 字段 ═══');
  const res = await fetch(CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '路线验证',
      idCard: '123',
      regionName: '北京市',
      hospitalName: '测试医院',
      photoBase64: `data:image/png;base64,${PNG}`,
      photoExt: 'png'
    })
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== 0) {
    bad(`签发失败 code=${j.code} msg=${j.msg}`);
    process.exit(1);
  }
  const d = j.data;
  console.log(`     id        = ${JSON.stringify(d.id)}`);
  console.log(`     verifyId  = ${JSON.stringify(d.verifyId)}`);
  console.log(`     certNo    = ${JSON.stringify(d.certNo)}`);

  // 核心断言：id 必须等于 verifyId，且不能是纯数字自增主键
  if (d.id === d.verifyId) ok('create 返回的 id === verifyId（前端跳转将落在正确路径）');
  else bad(`create 返回的 id (${d.id}) !== verifyId (${d.verifyId}) → 前端会跳错路径`);

  if (!/^\d+$/.test(String(d.id))) ok(`id 不是纯数字（${d.id}），排除自增主键干扰`);
  else bad(`id 是纯数字（${d.id}），疑似自增主键，会导致 /cert/<id> 404`);

  console.log('\n═══ 2. 模拟前端跳转：/cert/<create返回的id> ═══');
  const route = await get(`/cert/${d.id}`);
  if (route.status === 200) ok(`/cert/${d.id} → HTTP ${route.status}（页面可打开）`);
  else bad(`/cert/${d.id} → HTTP ${route.status}（页面打不开）`);

  console.log('\n═══ 3. 该证件能否查到（verify API）═══');
  const v = await get(`${API_BASE}?verifyId=${encodeURIComponent(d.verifyId)}`, true);
  const vj = JSON.parse(v.body);
  if (vj.code === 0) {
    ok(`查验成功：${vj.data.name} / ${vj.data.certNo} / ${vj.data.status}`);
  } else {
    bad(`查验失败 code=${vj.code} msg=${vj.msg}`);
  }

  console.log('\n═══ 4. verify 的 fallback 链（兼容旧链路误传 id / cert_no）═══');
  for (const [label, key, expect] of [
    ['按 verify_id 查', d.verifyId, true],
    ['按 cert_no 查', d.certNo, true],
    ['按自增 id 查', String(d.id), true],
    ['按乱码查（应 404）', 'zzzznotexist', false]
  ]) {
    const r = await get(`${API_BASE}?verifyId=${encodeURIComponent(key)}`, true);
    const rj = JSON.parse(r.body);
    if (expect) {
      rj.code === 0 ? ok(`${label} "${key}" → code=0`) : bad(`${label} "${key}" → code=${rj.code}`);
    } else {
      rj.code === 404 ? ok(`${label} "${key}" → code=404（符合预期）`) : bad(`${label} "${key}" → code=${rj.code}（应为 404）`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(fail === 0 ? '  全部通过 ✅  /cert/<verifyId> 路由已修复' : `  ${fail} 项失败`);
  console.log('═'.repeat(50));
  process.exit(fail === 0 ? 0 : 1);
})();

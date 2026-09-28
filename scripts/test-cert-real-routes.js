/**
 * 用真实已签发的证件实测 /cert/:id 路由：
 *   1. 用 verify_id 打开（正确用法）
 *   2. 用自增 id 打开（旧链路 / 手动改地址栏）
 *   3. 用 cert_no 打开（fallback 兜底）
 *
 * 用法：node scripts/test-cert-real-routes.js
 */
const https = require('https');
const STATIC_HOST = 'health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';
const API_BASE = 'https://health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com/api';

function probe(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    https
      .get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () =>
          resolve({ status: r.statusCode, isHtml: /<div id="app">/.test(d), len: d.length })
        );
      })
      .on('error', (e) => resolve({ status: 0, isHtml: false, err: e.message }));
  });
}

// 真实数据（来自 list-recent-certs.js），含用户反馈时间点附近的记录
const cases = [
  { id: 46, verifyId: 'xpz7myd72i', certNo: 'JK20269471130045', name: '胡康艺' },
  { id: 45, verifyId: 'cvj7rgpbv8', certNo: 'JK20266639320044', name: '胡康艺' },
  { id: 44, verifyId: 'a6qsa4x4kc', certNo: 'JK20264756480043', name: '余果' },
  { id: 12, verifyId: '(见下)', certNo: '(见下)', name: '用户提到的 /cert/12' }
];

(async () => {
  let fail = 0;

  console.log('\n【A】页面路由 /cert/<key> 是否能打开（期望全部 200）\n');
  for (const c of cases.slice(0, 3)) {
    for (const [label, key] of [
      ['verify_id', c.verifyId],
      ['自增 id  ', String(c.id)],
      ['cert_no  ', c.certNo]
    ]) {
      const url = `https://${STATIC_HOST}/cert/${key}`;
      const r = await probe(url);
      const good = r.status === 200 && r.isHtml;
      if (!good) fail++;
      console.log(
        `  ${good ? '✅' : '❌'} ${c.name.padEnd(5)} ${label} → /cert/${String(key).padEnd(16)} HTTP ${r.status}`
      );
    }
    console.log('');
  }

  console.log('【B】直接查库：/cert/12 对应的记录是否存在\n');
  const r12 = await fetch(`${API_BASE}?verifyId=12`);
  const j12 = await r12.json().catch(() => ({}));
  if (j12.code === 0) {
    console.log(`  ✅ id=12 有记录 → 姓名=${j12.data.name} 证号=${j12.data.certNo} 状态=${j12.data.status}`);
    console.log(`     该证件的正确地址应为：/cert/${j12.data.verifyId}`);
  } else {
    console.log(`  ℹ️  id=12 未查到（code=${j12.code}）：${j12.msg}`);
    console.log('     说明该行已被清理（查验期 3 天过期会自动删除）或从未存在，属正常。');
  }

  console.log('\n【C】胡康艺 那张证能否查验（用户实际办的那张）\n');
  for (const c of cases.slice(0, 2)) {
    const r = await fetch(`${API_BASE}?verifyId=${c.verifyId}`);
    const j = await r.json().catch(() => ({}));
    if (j.code === 0) {
      console.log(`  ✅ ${c.name} verifyId=${c.verifyId} → ${j.data.name} / ${j.data.certNo} / ${j.data.status}`);
      console.log(`     扫码地址: https://${STATIC_HOST}/v/${c.verifyId}`);
    } else {
      console.log(`  ❌ ${c.name} verifyId=${c.verifyId} → code=${j.code} ${j.msg}`);
      fail++;
    }
  }

  console.log('\n' + '═'.repeat(52));
  console.log(fail === 0 ? '  全部正常 ✅' : `  ${fail} 项异常`);
  console.log('═'.repeat(52));
})();

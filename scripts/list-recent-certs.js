/**
 * 查看 health_certs 表最近记录，确认 id（自增主键）与 verify_id 的差异，
 * 便于核对「地址栏 /cert/12」这类旧链接。
 *
 * 用法：node scripts/list-recent-certs.js [条数]
 */
const fs = require('fs');
const path = require('path');

// 从 .env 读 API Key（不硬编码）
function loadKey() {
  const p = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return process.env.TCB_API_KEY || '';
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/^TCB_API_KEY=(.+)$/m);
  return m ? m[1].trim() : process.env.TCB_API_KEY || '';
}

const KEY = loadKey();
const BASE = 'https://health-card-d2ga2cvid6561b93d.api.tcloudbasegateway.com/v1/rdb/rest';
const LIMIT = Number(process.argv[2]) || 10;

if (!KEY) {
  console.error('未找到 TCB_API_KEY（检查 .env）');
  process.exit(1);
}

(async () => {
  const url = `${BASE}/health_certs?select=id,verify_id,cert_no,name,created_at&order=id.desc&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' }
  });
  const rows = await res.json();

  if (!Array.isArray(rows)) {
    console.error('查询失败：', JSON.stringify(rows).slice(0, 300));
    process.exit(1);
  }

  console.log(`\n最近 ${rows.length} 条记录（按 id 倒序）：\n`);
  console.log('  自增id  verify_id      cert_no          姓名        创建时间');
  console.log('  ' + '─'.repeat(78));
  for (const r of rows) {
    console.log(
      '  ' +
        String(r.id).padEnd(7) +
        String(r.verify_id || '').padEnd(14) +
        String(r.cert_no || '').padEnd(18) +
        String(r.name || '').padEnd(12) +
        String(r.created_at || '').slice(0, 19)
    );
  }

  console.log('\n说明：');
  console.log('  • 地址栏应为 /cert/<verify_id>（如上方第二列）');
  console.log('  • 若写成 /cert/<自增id>（第一列），已由 verify 的 fallback 链兜住');
  console.log('  • 用自增 id 手动打开：/cert/' + (rows[0] ? rows[0].id : '12'));
})();

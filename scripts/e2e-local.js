/**
 * 本地端到端验证：直接调用 db-pg.js（PostgREST 版）跑通完整业务流
 * 用法：TCB_API_KEY=xxx node scripts/e2e-local.js
 */
process.env.TCB_ENV_ID = process.env.TCB_ENV_ID || 'health-card-d2ga2cvid6561b93d';
const db = require('../cloudfunctions/health-cert-verify/db-pg');
const { count, remove, insert, selectOne } = db;

async function main() {
  console.log('[1] 连通性 & isConfigured:', db.isConfigured(), '| restBase:', db.restBase());

  const emptyFilter = { verify_expires_at: 'lt.1970-01-01T00:00:00.000Z' };
  console.log('[2] count() 探测:', await count('health_certs', emptyFilter));

  const now = new Date();
  const verifyId = 'e2e' + Math.random().toString(36).slice(2, 8);
  const certNo = 'JK' + now.getFullYear() + '000000' + '0001';

  console.log('[3] insert() 写入测试行:', verifyId);
  const inserted = await insert('health_certs', {
    verify_id: verifyId,
    cert_no: certNo,
    seq: 900001,
    name: '张三',
    id_card: '310101**********1234',
    id_card_hash: 'e2e-hash-' + Date.now(),
    birth_date: '1990-01-01',
    age: 35,
    gender: '男',
    photo_file_id: 'cloud://e2e/test.jpg',
    photo_url: 'https://example.com/e2e.jpg',
    region_name: '黄浦区',
    hospital_name: '黄浦区中心医院',
    category: '食品生产经营',
    valid_from: now.toISOString(),
    valid_to: new Date(now.getTime() + 365 * 864e5).toISOString(),
    valid_text: '2026.09.24 - 2027.09.23',
    verify_expires_at: new Date(now.getTime() + 3 * 864e5).toISOString(),
    status: '有效',
    created_at: now.toISOString(),
  });
  console.log('    ✓ 返回行数:', inserted.length, '| id:', inserted[0] && inserted[0].id);

  console.log('[4] selectOne() 按 verify_id 查回:');
  const got = await selectOne('health_certs', {
    select: 'verify_id,cert_no,name,id_card,gender,age,photo_url,category,region_name,hospital_name,valid_from,valid_to,valid_text,verify_expires_at,status',
    filter: { verify_id: `eq.${verifyId}` },
  });
  console.log('   ', JSON.stringify(got, null, 2));

  console.log('[5] 模拟 verify 云函数 410 判断:');
  const n = new Date();
  const expired = got && got.verify_expires_at && n > new Date(got.verify_expires_at);
  console.log('    verify_expires_at 已过期?', expired);
  const certExpired = got && got.valid_to && n > new Date(got.valid_to);
  console.log('    证件本身已过期?', certExpired, '→ status:', certExpired ? '过期' : got.status);

  console.log('[6] 清理测试行:');
  const deleted = await remove('health_certs', { verify_id: `eq.${verifyId}` });
  console.log('    ✓ 已删除行数:', deleted.length);

  console.log('\n全部通过 ✅');
}

main().catch((e) => {
  console.error('❌ 失败:', e.message);
  console.error('   status:', e.status, '| detail:', JSON.stringify(e.detail));
  process.exit(1);
});

/**
 * 实测 PostgREST 网关：用 service_role API Key 读写 health_certs
 * 用法：node scripts/test-postgrest.js <API_KEY>
 */
const ENV_ID = 'health-card-d2ga2cvid6561b93d';
const BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
const KEY = process.argv[2] || process.env.TCB_API_KEY;

if (!KEY) {
  console.error('缺少 API Key。用法：node scripts/test-postgrest.js <API_KEY>');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function req(method, path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

(async () => {
  console.log('=== 1. SELECT 探测（读权限）===');
  console.log(JSON.stringify(await req('GET', '/health_certs?select=id,verify_id&limit=1'), null, 2));

  console.log('\n=== 2. INSERT 探测（写权限）===');
  const now = new Date();
  const verifyId = 'testkey' + Math.random().toString(36).slice(2, 6);
  const row = {
    verify_id: verifyId,
    cert_no: 'JK' + now.getFullYear() + Math.floor(100000 + Math.random() * 899999) + '9999',
    name: '测试用户',
    mask_name: '测*户',
    id_card: '310101199001011234',
    id_card_hash: 'testhash' + Date.now(),
    gender: '男',
    age: 35,
    photo_url: 'https://example.com/t.jpg',
    category: '食品从业人员',
    region_name: '测试区',
    hospital_name: '测试医院',
    valid_from: now.toISOString().slice(0, 10),
    valid_to: new Date(now.getTime() + 365 * 864e5).toISOString().slice(0, 10),
    valid_text: '一年',
    verify_expires_at: new Date(now.getTime() + 3 * 864e5).toISOString(),
    status: '有效',
    seq: 999999,
  };
  const ins = await req('POST', '/health_certs', row);
  console.log(JSON.stringify(ins, null, 2));

  console.log('\n=== 3. 回查刚插入的行 ===');
  console.log(JSON.stringify(await req('GET', `/health_certs?verify_id=eq.${verifyId}&select=verify_id,name,mask_name,verify_expires_at`), null, 2));

  console.log('\n=== 4. DELETE 清理测试行 ===');
  console.log(JSON.stringify(await req('DELETE', `/health_certs?verify_id=eq.${verifyId}`), null, 2));

  console.log('\n=== 5. RPC 探测（是否支持函数调用）===');
  console.log(JSON.stringify(await req('POST', '/rpc/now'), null, 2));
})();

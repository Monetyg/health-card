/**
 * 通过 PostgREST OpenAPI (/? 返回 swagger) 读取 health_certs 真实字段
 */
const ENV_ID = 'health-card-d2ga2cvid6561b93d';
const BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
const KEY = process.argv[2] || process.env.TCB_API_KEY;

(async () => {
  const res = await fetch(BASE + '/', {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' },
  });
  const json = await res.json();
  const t = json.definitions && json.definitions.health_certs;
  if (!t) {
    console.log('未找到 health_certs 定义。已注册的表：', Object.keys(json.definitions || {}));
    return;
  }
  console.log('health_certs 字段：');
  const req = t.required || [];
  for (const [k, v] of Object.entries(t.properties || {})) {
    console.log(`  ${k.padEnd(22)} ${String(v.format || v.type).padEnd(14)} ${req.includes(k) ? 'NOT NULL' : 'null'}`);
  }
  console.log('\n完整定义：');
  console.log(JSON.stringify(t, null, 2));
})();

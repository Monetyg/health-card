/**
 * 验证前端 verify.ts 的同域 /api 回退逻辑
 * 模拟：页面在 https://<静态托管域名> 上，fetch(`${location.origin}/api?verifyId=x`)
 * 结论依据：静态托管域名 与 HTTP 访问服务域名 是否为同一个
 */
const STATIC_HOST = 'health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';
const API_HOST = 'health-card-d2ga2cvid6561b93d-1424804512.ap-shanghai.app.tcloudbase.com';

(async () => {
  console.log('静态托管域名 :', STATIC_HOST);
  console.log('HTTP访问域名 :', API_HOST);
  console.log('两者相同?    :', STATIC_HOST === API_HOST ? '是 → 同域，前端直接 fetch(/api) 可行' : '否 → 跨域，需要 CORS 或配同域路由');

  console.log('\n--- 测试 A: 静态托管域名下的 /api 路径 ---');
  const a = await fetch(`https://${STATIC_HOST}/api?verifyId=usen7282px`).catch((e) => ({ err: e.message }));
  if (a.err) console.log('  ✗', a.err);
  else console.log('  HTTP', a.status, '|', (await a.text()).slice(0, 120));

  console.log('\n--- 测试 B: HTTP 访问服务域名（已验证可用）---');
  const b = await fetch(`https://${API_HOST}/api?verifyId=usen7282px`).catch((e) => ({ err: e.message }));
  if (b.err) console.log('  ✗', b.err);
  else console.log('  HTTP', b.status, '|', (await b.text()).slice(0, 120));
})();

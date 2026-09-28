/**
 * 验证前端 SPA 路由 /v/:id（二维码落地页）可正常访问。
 * 二维码指向 https://<静态托管域名>/v/<verifyId>，需确认该路径返回 HTML。
 *
 * 用法：node scripts/test-spa-route.js [verifyId...]
 */
const HOST = 'health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';

function get(pathname) {
  return new Promise((resolve) => {
    https_get(pathname, (r) => resolve(r));
  });
}

function https_get(pathname, cb) {
  const https = require('https');
  https
    .get({ hostname: HOST, path: pathname, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => cb({ status: r.statusCode, len: d.length, head: d.slice(0, 300) }));
    })
    .on('error', (e) => cb({ status: 0, len: 0, head: 'ERR ' + e.message }));
}

(async () => {
  const ids = process.argv.slice(2);
  const paths = ['/', ...ids.map((id) => `/v/${id}`)];
  if (ids.length === 0) paths.push('/v/demo-check');

  let bad = 0;
  for (const p of paths) {
    const r = await get(p);
    const isHtml = /<!DOCTYPE html>|<html/i.test(r.head);
    if (r.status === 200 && isHtml) {
      console.log(`✓ ${p}  ->  HTTP ${r.status}  ${r.len}B  HTML（SPA 回退正常）`);
    } else {
      bad++;
      console.log(`✗ ${p}  ->  HTTP ${r.status}  ${r.len}B  ${r.head.slice(0, 100)}`);
    }
  }
  console.log(bad === 0 ? '\n全部通过：二维码落地页可用' : `\n${bad} 条异常`);
  process.exit(bad === 0 ? 0 : 1);
})();

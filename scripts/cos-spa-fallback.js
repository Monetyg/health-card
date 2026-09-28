/**
 * 用 COS 官方 SDK 配置静态托管底层桶的静态网站
 * 目的：ErrorDocument=index.html + OriginalHttpStatus=Disabled，实现 SPA 路由回退
 *
 * ⚠️ 关键坑（必读）
 *   仅设置 ErrorDocument 时，COS 会把 index.html 的内容返回出去，
 *   但 **HTTP 状态码仍然是 404**。浏览器里页面能正常渲染，所以很容易
 *   被误判为「已修好」；实际扫码打开会命中 404 状态码，部分客户端、
 *   内嵌 WebView、以及做状态码判断的场景（含微信对分享链接的检测）会异常。
 *
 *   必须显式设置 ErrorDocument.OriginalHttpStatus = 'Disabled'，
 *   让回退命中时返回 200 而非原始 404。
 *
 * 注意：这里改的是 COS 桶级 WebsiteConfiguration；CloudBase 控制台
 *   与 `tcb hosting detail` 读的是同一份配置，但后者可能因缓存显示为空，
 *   以本脚本第 3 步的「回读确认」为准。
 *
 * 用法: node scripts/cos-spa-fallback.js <SecretId> <SecretKey> [Bucket] [Region]
 */
const COS = require('cos-nodejs-sdk-v5');

const SECRET_ID = process.argv[2];
const SECRET_KEY = process.argv[3];
const Bucket = process.argv[4] || '2283-static-health-card-d2ga2cvid6561b93d-1424804512';
const Region = process.argv[5] || 'ap-shanghai';

if (!SECRET_ID || !SECRET_KEY) {
  console.error('用法: node scripts/cos-spa-fallback.js <SecretId> <SecretKey> [Bucket] [Region]');
  process.exit(1);
}

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY });

/** 封装 Promise */
const p = (fn, params) => new Promise((res, rej) => fn.call(cos, params, (e, d) => (e ? rej(e) : res(d))));

(async () => {
  console.log('=== 1. 读取当前静态网站配置 ===');
  try {
    const cur = await p(cos.getBucketWebsite, { Bucket, Region });
    console.log(JSON.stringify(cur, null, 2));
  } catch (e) {
    console.log('（尚无配置或读取失败）', e.statusCode, e.error && e.error.Message);
  }

  console.log('\n=== 2. 写入静态网站配置（ErrorDocument=index.html + OriginalHttpStatus=Disabled）===');
  console.log('    OriginalHttpStatus=Disabled → 回退命中时返回 HTTP 200（关键！否则仍是 404）');
  try {
    const r = await p(cos.putBucketWebsite, {
      Bucket,
      Region,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: {
          Key: 'index.html',
          // 'Enabled'(默认) 保留原始 404；'Disabled' 改为返回 200。
          // SPA 路由回退必须用 Disabled。
          OriginalHttpStatus: 'Disabled',
        },
      },
    });
    console.log('✅ 写入成功');
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.log('❌ 写入失败');
    console.log('statusCode:', e.statusCode);
    console.log(e.error || e.message);
    process.exit(1);
  }

  console.log('\n=== 3. 回读确认 ===');
  try {
    const after = await p(cos.getBucketWebsite, { Bucket, Region });
    console.log(JSON.stringify(after, null, 2));
    const doc = after && after.WebsiteConfiguration && after.WebsiteConfiguration.ErrorDocument;
    if (doc && doc.Key === 'index.html' && doc.OriginalHttpStatus === 'Disabled') {
      console.log('✅ 配置正确：ErrorDocument=index.html，OriginalHttpStatus=Disabled');
    } else {
      console.log('⚠️  配置不符合预期，请检查上面的回读结果');
    }
  } catch (e) {
    console.log('读取失败:', e.error || e.message);
  }

  console.log('\n=== 4. 实测 SPA 回退状态码（走 CDN 域名）===');
  const cdnHost = `${Bucket.replace(/^2283-static-/, '')}.tcloudbaseapp.com`;
  const https = require('https');
  const probe = (path) =>
    new Promise((resolve) => {
      https
        .get({ hostname: cdnHost, path, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => resolve({ status: r.statusCode, html: /<!DOCTYPE html>|<html/i.test(d) }));
        })
        .on('error', (e) => resolve({ status: 0, html: false, err: e.message }));
    });

  for (const path of ['/', '/v/fallback-probe']) {
    const r = await probe(path);
    if (r.status === 200 && r.html) {
      console.log(`  ✓ ${path}  HTTP ${r.status}  HTML`);
    } else {
      console.log(`  ✗ ${path}  HTTP ${r.status}  ${r.err || '非 HTML'}   ← CDN 可能有缓存，稍等 1-2 分钟再试`);
    }
  }
  console.log('\n提示：CDN 有缓存，配置变更后可能需要 1-2 分钟生效。');
})();

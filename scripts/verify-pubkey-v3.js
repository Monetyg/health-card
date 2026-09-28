/**
 * v3 + Publishable Key 端到端验证（Node 适配器，无需 jsdom）
 *
 * 运行：
 *   node scripts/verify-pubkey-v3.js
 */
const path = require('path');
const fs = require('fs');

const ENV = 'health-card-d2ga2cvid6561b93d';

function readKey() {
  if (process.env.TCB_PUBLISH_KEY) return process.env.TCB_PUBLISH_KEY.trim();
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.deploy'), 'utf8');
  const m = env.match(/^TCB_PUBLISH_KEY=(.*)$/m);
  return m ? m[1].trim() : '';
}

function dumpErr(e) {
  if (!e) return String(e);
  if (typeof e !== 'object') return String(e);
  const out = { ctor: e.constructor && e.constructor.name };
  for (const k of Object.getOwnPropertyNames(e)) {
    if (k === 'stack') continue;
    try {
      out[k] = e[k];
    } catch {
      out[k] = '<unreadable>';
    }
  }
  return JSON.stringify(out).slice(0, 500);
}

(async () => {
  const pkgDir = path.join(__dirname, '..', 'frontend', 'node_modules', '@cloudbase', 'js-sdk');
  const NodeEntry = path.join(pkgDir, 'dist', 'index.node.cjs.js');

  let cloudbase;
  try {
    cloudbase = require(fs.existsSync(NodeEntry) ? NodeEntry : pkgDir);
    cloudbase = cloudbase.default || cloudbase;
    console.log('✅ 加载 js-sdk v' + require(path.join(pkgDir, 'package.json')).version + '（Node 适配器）');
  } catch (e) {
    console.log('❌ 加载失败:', e.message);
    process.exit(1);
  }

  const key = readKey();
  if (!key) {
    console.log('❌ 未找到 TCB_PUBLISH_KEY');
    process.exit(1);
  }

  const app = cloudbase.init({ env: ENV, accessKey: key });
  console.log('✅ init({ env, accessKey })');

  // ---- verify ----
  try {
    const r = await app.callFunction({ name: 'health-cert-verify', data: { verifyId: 't77yb3emsx' } });
    const out = (r && r.result) || r;
    console.log('✅ callFunction verify :: code =', out && out.code, '| msg =', out && out.msg);
    if (out && out.data) console.log('   姓名 =', out.data.name, '| 证号 =', out.data.certNo);
  } catch (e) {
    console.log('❌ verify ::', dumpErr(e));
  }

  // ---- create ----
  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await app.callFunction({
      name: 'health-cert-create',
      data: {
        name: 'v3验证',
        idCard: '110101199001016513',
        regionName: '广东省',
        hospitalName: '深圳市第一人民医院',
        photoBase64: 'data:image/png;base64,' + png,
        photoExt: 'png',
      },
    });
    const out = (r && r.result) || r;
    console.log('✅ callFunction create :: code =', out && out.code, '| msg =', out && out.msg);
    if (out && out.data) console.log('   verifyId =', out.data.verifyId, '| certNo =', out.data.certNo);
  } catch (e) {
    console.log('❌ create ::', dumpErr(e));
  }
})();

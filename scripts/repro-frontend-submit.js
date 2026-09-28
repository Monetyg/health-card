/**
 * 复现前端「二次确认并提交」失败
 * 完全按 frontend/src/cloud/{cloudbase,certs}.ts 的调用路径在 Node 里跑一遍
 * 目的：拿到真实的错误对象（浏览器 alert 只显示兜底文案，吞掉了细节）
 *
 * 用法：node scripts/repro-frontend-submit.js
 */
const path = require('path');

const ENV_ID = 'health-card-d2ga2cvid6561b93d';
const SDK_PATH = path.join(__dirname, '..', 'frontend', 'node_modules', '@cloudbase', 'js-sdk');

function log(step, ok, extra) {
  console.log(`${ok ? '✅' : '❌'} [${step}]`, extra === undefined ? '' : extra);
}

(async () => {
  let cloudbase;
  try {
    cloudbase = require(SDK_PATH);
    cloudbase = cloudbase.default || cloudbase;
    log('load js-sdk', true, require(path.join(SDK_PATH, 'package.json')).version);
  } catch (e) {
    log('load js-sdk', false, e.message);
    process.exit(1);
  }

  const app = cloudbase.init({ env: ENV_ID });
  log('init app', true, ENV_ID);

  // ---- 1. 匿名登录（复刻 ensureAuth）----
  const auth = app.auth({ persistence: 'local' });
  console.log('   auth.hasLoginState typeof =', typeof auth.hasLoginState);
  try {
    const hs = auth.hasLoginState();
    if (hs && typeof hs.then === 'function') {
      const v = await hs;
      console.log('   hasLoginState (awaited) =', v);
    } else {
      console.log('   hasLoginState (sync) =', hs);
    }
  } catch (e) {
    console.log('   ❌ hasLoginState threw:', e && (e.message || e.code || JSON.stringify(e)));
  }

  try {
    const r = await auth.anonymousAuthProvider().signIn();
    log('anonymous signIn', true, JSON.stringify(r).slice(0, 200));
  } catch (e) {
    log('anonymous signIn', false, e && (e.message || e.code || JSON.stringify(e)));
  }

  // ---- 2. 最小图片 base64（1x1 png）----
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const base64 = `data:image/png;base64,${png}`;

  // ---- 3. 调 create 云函数（复刻 callFn）----
  const payload = {
    name: '复现测试',
    idCard: '110101199001016518',
    regionName: '广东省',
    hospitalName: '深圳市第一人民医院',
    photoBase64: base64,
    photoExt: 'png',
  };

  try {
    const r = await app.callFunction({ name: 'health-cert-create', data: payload });
    log('callFunction health-cert-create', true, 'raw=' + JSON.stringify(r).slice(0, 500));
    const out = (r && r.result) || r;
    console.log('   out.code =', out && out.code, ' out.msg =', out && out.msg);
    if (out && out.data) console.log('   data.verifyId =', out.data.verifyId);
  } catch (e) {
    log('callFunction health-cert-create', false, '');
    console.log('   e.constructor =', e && e.constructor && e.constructor.name);
    console.log('   e.message     =', JSON.stringify(e && e.message));
    console.log('   e.code        =', e && e.code);
    console.log('   raw e         =', JSON.stringify(e).slice(0, 800));
  }

  // ---- 4. 顺带验证 verify 云函数 ----
  try {
    const r = await app.callFunction({ name: 'health-cert-verify', data: { verifyId: 'ddrb54pqmh' } });
    const out = (r && r.result) || r;
    log('callFunction health-cert-verify', true, `code=${out && out.code}`);
  } catch (e) {
    log('callFunction health-cert-verify', false, e && (e.message || e.code));
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

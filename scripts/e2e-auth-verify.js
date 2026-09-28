/**
 * 端到端验证：匿名登录 + 云函数调用（复刻前端真实路径）
 * 在 jsdom 环境里加载 @cloudbase/js-sdk，验证「开启匿名登录」后链路是否打通
 *
 * 运行：
 *   NODE_PATH=C:/Users/monet/.workbuddy/binaries/node/workspace/node_modules \
 *   node scripts/e2e-auth-verify.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const ENV_ID = 'health-card-d2ga2cvid6561b93d';
const ORIGIN = 'https://health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';
const SDK_PATH = path.join(__dirname, '..', 'frontend', 'node_modules', '@cloudbase', 'js-sdk');

// ---- 1. 搭一个最小浏览器环境 ----
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: ORIGIN + '/',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.location = window.location;
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;
global.XMLHttpRequest = window.XMLHttpRequest;
global.fetch = global.fetch || (() => Promise.reject(new Error('no fetch')));
// Node 18+ 自带 fetch/Headers/Request/Response，js-sdk 优先用它们

function log(tag, ok, extra) {
  console.log(`${ok ? '✅' : '❌'} ${tag}${extra !== undefined ? ' :: ' + extra : ''}`);
}

(async () => {
  const cloudbase = require(SDK_PATH);
  const cb = cloudbase.default || cloudbase;
  log('加载 js-sdk', true, require(path.join(SDK_PATH, 'package.json')).version);

  const app = cb.init({ env: ENV_ID });
  const auth = app.auth({ persistence: 'local' });

  // ---- 2. 检查登录态 API 的语义（验证我们修的 bug）----
  const syncType = typeof auth.hasLoginStateSync;
  const asyncType = typeof auth.hasLoginState;
  log('hasLoginStateSync 类型', syncType === 'function', syncType);
  log('hasLoginState 类型', asyncType === 'function', asyncType + '（若为 function 返回 Promise，则 !x 恒 false）');

  let syncVal = null;
  try {
    if (syncType === 'function') syncVal = auth.hasLoginStateSync();
    const asyncRaw = auth.hasLoginState();
    const isPromise = asyncRaw && typeof asyncRaw.then === 'function';
    log('hasLoginState 返回值是否 Promise', isPromise, isPromise ? '是 → 旧代码 !x 恒为 false，登录被跳过' : '否');
    console.log('   登录前 hasLoginStateSync() =', syncVal);
  } catch (e) {
    log('检查登录态', false, e.message);
  }

  // ---- 3. 匿名登录 ----
  try {
    const r = await auth.anonymousAuthProvider().signIn();
    log('匿名登录 signIn', true, JSON.stringify(r).slice(0, 160));
  } catch (e) {
    log('匿名登录 signIn', false, e && (e.message || e.code || e.errorMessage || JSON.stringify(e)));
  }

  // ---- 4. 登录后再次检查 ----
  try {
    const after = auth.hasLoginStateSync ? auth.hasLoginStateSync() : null;
    console.log('   登录后 hasLoginStateSync() =', after);
  } catch (e) {
    console.log('   登录后检查失败:', e.message);
  }

  // ---- 5. 调用 verify 云函数（公开只读，最安全）----
  try {
    const r = await app.callFunction({ name: 'health-cert-verify', data: { verifyId: 't77yb3emsx' } });
    const out = (r && r.result) || r;
    log('callFunction verify', out && out.code === 0, `code=${out && out.code} msg=${out && out.msg}`);
    if (out && out.data) console.log('   返回姓名:', out.data.name, '| 证号:', out.data.certNo);
  } catch (e) {
    log('callFunction verify', false, '');
    console.log('   e.constructor =', e && e.constructor && e.constructor.name);
    console.log('   e.message     =', JSON.stringify(e && e.message));
    console.log('   e.code        =', e && e.code);
    console.log('   JSON          =', JSON.stringify(e).slice(0, 400));
  }

  // ---- 6. 调用 create 云函数（完整签发链路，含照片上传）----
  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await app.callFunction({
      name: 'health-cert-create',
      data: {
        name: '端到端验证',
        idCard: '110101199001016513',
        regionName: '广东省',
        hospitalName: '深圳市第一人民医院',
        photoBase64: `data:image/png;base64,${png}`,
        photoExt: 'png',
      },
    });
    const out = (r && r.result) || r;
    log('callFunction create', out && out.code === 0, `code=${out && out.code} msg=${out && out.msg}`);
    if (out && out.data) {
      console.log('   verifyId =', out.data.verifyId, '| certNo =', out.data.certNo, '| seq =', out.data.seq);
    }
  } catch (e) {
    log('callFunction create', false, '');
    console.log('   e.constructor =', e && e.constructor && e.constructor.name);
    console.log('   e.message     =', JSON.stringify(e && e.message));
    console.log('   JSON          =', JSON.stringify(e).slice(0, 400));
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

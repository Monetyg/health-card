/**
 * 用 Publishable Key 验证 Web 端调用链路
 * 目标：确认「accessKey」方式能调通云函数，从而替代「匿名登录」方案
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB_KEY = process.env.TCB_PUBLISH_KEY || require('fs').readFileSync(path.join(__dirname, '..', '.env.deploy'), 'utf8').match(/^TCB_PUBLISH_KEY=(.*)$/m)?.[1]?.trim() || '';
const ENV = 'health-card-d2ga2cvid6561b93d';
const ORIGIN = 'https://health-card-d2ga2cvid6561b93d-1424804512.tcloudbaseapp.com';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: ORIGIN + '/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;
global.localStorage = dom.window.localStorage;
global.XMLHttpRequest = dom.window.XMLHttpRequest;

const cb = require(path.join(__dirname, '..', 'frontend', 'node_modules', '@cloudbase', 'js-sdk'));
const C = cb.default || cb;

/** 把错误对象的全部可枚举属性都打印出来（js-sdk 常抛非 Error 对象） */
function dumpErr(e) {
  const out = { ctor: e && e.constructor && e.constructor.name };
  if (e && typeof e === 'object') {
    for (const k of Object.getOwnPropertyNames(e)) {
      try {
        out[k] = e[k];
      } catch {
        out[k] = '<unreadable>';
      }
    }
  } else {
    out.value = String(e);
  }
  return JSON.stringify(out).slice(0, 600);
}

(async () => {
  if (!PUB_KEY) {
    console.log('❌ 缺少 TCB_PUBLISH_KEY');
    process.exit(1);
  }
  const app = C.init({ env: ENV, accessKey: PUB_KEY });
  console.log('✅ init with publishable key');

  try {
    const r = await app.callFunction({ name: 'health-cert-verify', data: { verifyId: 't77yb3emsx' } });
    const out = (r && r.result) || r;
    console.log('✅ callFunction verify :: code =', out && out.code, '| msg =', out && out.msg);
    if (out && out.data) console.log('   姓名 =', out.data.name, '| 证号 =', out.data.certNo);
  } catch (e) {
    console.log('❌ verify ::', dumpErr(e));
  }

  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await app.callFunction({
      name: 'health-cert-create',
      data: {
        name: '发布密钥验证',
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

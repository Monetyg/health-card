/**
 * 云函数 health-cert-verify：扫码查验（公开免登录）—— PostgreSQL(PostgREST) 版
 * @module health-cert-verify
 *
 * 双触发：
 *   1. 微信内 wx.cloud.callFunction / js-sdk callFunction → 入参 { verifyId }
 *   2. 普通浏览器 → HTTP 访问服务，?verifyId=xxx 或 POST JSON
 *
 * 出参：{ code: 0, data } | { code: 400|404|410|500, msg }
 *
 * 环境变量：
 *   TCB_ENV_ID / TCB_API_KEY  数据库访问（PostgREST 网关）
 *   ALLOW_ORIGIN  允许跨域的来源，逗号分隔（默认 *）
 */
const { selectOne, isConfigured } = require('./db-pg');
const { maskName } = require('./biz');

/** 允许跨域的来源白名单，来自环境变量，未配置则放开 */
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || '*').trim();

/**
 * 构造 CORS 响应头
 * @param {string} origin 请求方 origin
 */
function corsHeaders(origin) {
  const allow = ALLOW_ORIGIN === '*'
    ? '*'
    : ALLOW_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  const picked = Array.isArray(allow)
    ? (allow.includes(origin) ? origin : allow[0] || '')
    : allow;
  return {
    'Access-Control-Allow-Origin': picked,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

/**
 * 判断本次调用是否来自 HTTP 访问服务
 * @param {any} event
 */
function isHttpEvent(event) {
  return !!(event && (event.httpMethod || event.requestContext || event.headers !== undefined));
}

/**
 * 从 event 中取 verifyId，兼容多种形态
 * @param {any} event
 */
function pickVerifyId(event) {
  if (!event) return '';
  if (event.verifyId) return String(event.verifyId).trim();
  if (event.queryStringParameters && event.queryStringParameters.verifyId) {
    return String(event.queryStringParameters.verifyId).trim();
  }
  if (event.body) {
    let b = event.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
    if (b && b.verifyId) return String(b.verifyId).trim();
  }
  if (event.data && event.data.verifyId) return String(event.data.verifyId).trim();
  const path = event.path || (event.pathParameters && event.pathParameters.proxy);
  if (path) {
    const seg = String(path).split('/').filter(Boolean);
    if (seg.length) return seg[seg.length - 1].trim();
  }
  return '';
}

/**
 * 主入口
 * @param {any} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  const http = isHttpEvent(event);
  const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const headers = corsHeaders(origin);

  /** HTTP 场景下把结果包装成标准 HTTP 响应 */
  const reply = (status, payload) => {
    if (!http) return payload;
    return { statusCode: status, headers, body: JSON.stringify(payload) };
  };

  // 预检请求直接放行
  if (http && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (!isConfigured()) {
      return reply(500, { code: 500, msg: '数据库未配置：请设置 TCB_ENV_ID / TCB_API_KEY 环境变量' });
    }

    const verifyId = pickVerifyId(event);

    // 预览码：录入页未签发的占位码，明确提示不可查验
    if (!verifyId || verifyId.startsWith('preview-')) {
      return reply(400, { code: 400, msg: '预览码不可查验，请签发正式健康证后扫码' });
    }

    const key = verifyId;
    // 主键：verify_id；兼容旧链路误传自增 id / cert_no（领证页曾用 id 跳转）
    let c = await selectOne('health_certs', {
      select: 'id,verify_id,cert_no,name,id_card,gender,age,photo_url,category,region_name,hospital_name,valid_from,valid_to,valid_text,verify_expires_at,status',
      filter: { verify_id: `eq.${key}` }
    });
    if (!c) {
      c = await selectOne('health_certs', {
        select: 'id,verify_id,cert_no,name,id_card,gender,age,photo_url,category,region_name,hospital_name,valid_from,valid_to,valid_text,verify_expires_at,status',
        filter: { cert_no: `eq.${key}` }
      });
    }
    if (!c && /^\d+$/.test(key)) {
      c = await selectOne('health_certs', {
        select: 'id,verify_id,cert_no,name,id_card,gender,age,photo_url,category,region_name,hospital_name,valid_from,valid_to,valid_text,verify_expires_at,status',
        filter: { id: `eq.${key}` }
      });
    }
    if (!c) {
      return reply(404, { code: 404, msg: '查无此证，请确认是否为正式签发的二维码' });
    }

    // 查验期已过（3天未查验则记录被清理，此处兜底 410）
    const now = new Date();
    if (c.verify_expires_at && now > new Date(c.verify_expires_at)) {
      return reply(410, { code: 410, msg: '该查验码已过期（有效期3天），请重新办理或联系发证机构' });
    }

    const expired = c.valid_to && now > new Date(c.valid_to);

    // photoUrl 落库时已是云存储 CDN 链接（公共读永久有效），直接返回
    const data = {
      verifyId: c.verify_id,
      photoUrl: c.photo_url || '',
      name: maskName(c.name),
      certNo: c.cert_no,
      gender: c.gender,
      age: c.age,
      idCard: c.id_card,
      category: c.category,
      regionName: c.region_name,
      hospitalName: c.hospital_name,
      validFrom: c.valid_from,
      validTo: c.valid_to,
      validText: c.valid_text,
      status: expired ? '过期' : (c.status || '有效'),
      verifyTime: now.toISOString()
    };

    return reply(200, { code: 0, data });
  } catch (e) {
    console.error('[health-cert-verify] error', e);
    return reply(500, { code: 500, msg: e && e.message ? e.message : '查验失败' });
  }
};

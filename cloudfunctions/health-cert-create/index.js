/**
 * 云函数 health-cert-create：健康证签发（办证录入）—— PostgreSQL(PostgREST) 版
 * @module health-cert-create
 *
 * 入参（对象或 JSON 字符串）：
 *   name / idCard / regionName / hospitalName
 *   photoBase64  照片 base64（可含 data:image/xxx;base64, 前缀）
 *   photoExt     照片扩展名，默认 jpg
 *
 * 出参：{ code: 0, data: cert } 或 { code: 非0, msg }
 *
 * 环境变量：TCB_ENV_ID / TCB_API_KEY（云存储走 SDK，无需额外配置）
 */
const tcb = require('@cloudbase/node-sdk');
const { customAlphabet } = require('nanoid');
const { insert, selectOne, remove, isConfigured } = require('./db-pg');
const {
  parseIdCard, hashIdCard, genCertNo, genValidRange, maskIdCard
} = require('./biz');

const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });

/** 无歧义字母表（去掉 0/O/1/l/I），便于人工核对 */
const nanoid = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 10);

/** 查验有效期：3天 */
const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** 统一返回 */
function ok(data) { return { code: 0, data }; }
function fail(code, msg) { return { code, msg }; }

/**
 * 兼容 wx.cloud.callFunction 与 HTTP 触发两种入参形态
 * @param {any} event
 */
function normalizeEvent(event) {
  if (!event) return {};
  if (event.body !== undefined || event.httpMethod !== undefined || event.headers !== undefined) {
    let body = event.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (body && typeof body === 'object' && Object.keys(body).length) return body;
    if (event.queryStringParameters) return event.queryStringParameters;
    return {};
  }
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch { return {}; }
  }
  if (event.data && typeof event.data === 'object' && event.name === undefined) return event.data;
  return event;
}

/**
 * base64 解析为 Buffer
 * @param {string} b64 可含 data URI 前缀
 */
function decodeBase64(b64) {
  const pure = String(b64).replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(pure, 'base64');
}

/**
 * 主入口
 * @param {any} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  try {
    if (!isConfigured()) {
      return fail(500, '数据库未配置：请在云函数环境变量中设置 TCB_ENV_ID / TCB_API_KEY');
    }

    const p = normalizeEvent(event);
    const name = String(p.name || '').trim();
    const idCard = String(p.idCard || '').trim();
    const regionName = String(p.regionName || '').trim();
    const hospitalName = String(p.hospitalName || '').trim();
    const photoBase64 = p.photoBase64 || p.photo;
    const photoExt = String(p.photoExt || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';

    // 业务要求：不做身份证合法性校验，用户填什么就签发什么。
    // 仅保留姓名必填（证件主体），其余字段缺省时给默认值，确保流程不中断。
    if (!name) return fail(400, '请填写姓名');
    if (!photoBase64) return fail(400, '请上传证件照片');

    const finalRegion = regionName || '广东省';
    const finalHospital = hospitalName || '—';

    const buf = decodeBase64(photoBase64);
    if (buf.length > 5 * 1024 * 1024) return fail(400, '照片不能超过 5MB');

    // 1) 上传照片到云存储，拿永久公开 CDN 链接
    const month = new Date().toISOString().slice(0, 7);
    const cloudPath = `health-photos/${month}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${photoExt}`;
    const up = await app.uploadFile({ cloudPath, fileContent: buf });
    const fileID = up.fileID;

    // 云存储「所有用户可读」时，换出的 https 链接永久有效
    const urlRes = await app.getTempFileURL({ fileList: [fileID] });
    const photoUrl = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || '';
    if (!photoUrl) return fail(500, '照片上传后获取链接失败，请检查云存储权限是否为「所有用户可读」');

    // 2) 取流水号并生成证件数据
    const seq = await nextSeq();

    // 宽松解析：解析不出来时 birthDate/age/gender 为默认值，不影响签发
    const { birthDate, age, gender } = parseIdCard(idCard);
    const v = genValidRange();
    const now = new Date();
    const verifyId = nanoid();
    const certNo = genCertNo(seq);
    const verifyExpiresAt = new Date(now.getTime() + VERIFY_TTL_MS);

    // 3) 插入数据库（verify_id / cert_no 唯一索引兜底防重）
    const inserted = await insert('health_certs', {
      verify_id: verifyId,
      cert_no: certNo,
      seq,
      name,
      id_card: maskIdCard(idCard),
      id_card_hash: hashIdCard(idCard),
      birth_date: birthDate,
      age,
      gender,
      photo_file_id: fileID,
      photo_url: photoUrl,
      region_name: finalRegion,
      hospital_name: finalHospital,
      category: '食品生产经营',
      valid_from: v.validFrom,
      valid_to: v.validTo,
      valid_text: v.validText,
      verify_expires_at: verifyExpiresAt.toISOString(),
      status: '有效',
      created_at: now.toISOString()
    });
    const row = inserted[0] || {};
    // 路由跳转统一用 verifyId：verify 函数只认 verify_id 查询，
    // 若把自增主键当 id 返回，前端 /cert/:id 会拿主键去查 verify_id 直接 404。
    const newId = verifyId;

    // 4) 惰性清理过期记录（配合定时触发器形成双保险）
    try { await cleanupExpired(); } catch (e) { console.warn('lazy cleanup failed', e && e.message); }

    // 返回结构与原 Express 接口一致（含 id 字段供路由跳转）
    return ok({
      id: newId,
      _id: newId,
      verifyId,
      certNo,
      seq,
      name,
      idCard: maskIdCard(idCard),
      idCardHash: hashIdCard(idCard),
      birthDate,
      age,
      gender,
      photoFileID: fileID,
      photoUrl,
      regionName: finalRegion,
      hospitalName: finalHospital,
      category: '食品生产经营',
      validFrom: v.validFrom,
      validTo: v.validTo,
      validText: v.validText,
      verifyExpiresAt: (row.verify_expires_at || verifyExpiresAt.toISOString()),
      status: '有效',
      createdAt: (row.created_at || now.toISOString())
    });
  } catch (e) {
    console.error('[health-cert-create] error', e);
    return fail(500, e && e.message ? e.message : '签发失败');
  }
};

/**
 * 取下一个流水号：查当前最大 seq，失败则回退 1
 */
async function nextSeq() {
  try {
    const row = await selectOne('health_certs', { select: 'seq', order: 'seq.desc' });
    const maxSeq = Number(row && row.seq) || 0;
    return maxSeq + 1;
  } catch {
    return 1;
  }
}

/**
 * 惰性清理已过查验期的记录
 * verify_expires_at < now()   →  PostgREST: verify_expires_at=lt.<ISO>
 */
async function cleanupExpired() {
  const rows = await remove('health_certs', {
    verify_expires_at: `lt.${new Date().toISOString()}`
  });
  return rows.length;
}

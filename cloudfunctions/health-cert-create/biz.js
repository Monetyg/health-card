/**
 * 业务规则：身份证解析 / 编号 / 有效期 / 脱敏
 * @module biz
 * 与 backend/src/biz.js 逻辑保持一致，云函数内独立副本（云函数需独立依赖）
 */
const crypto = require('crypto');

/**
 * 18位身份证正则 + 校验位校验
 * @param {string} id 身份证号
 * @returns {boolean}
 */
function isValidIdCard(id) {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const m = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let s = 0;
  for (let i = 0; i < 17; i++) s += +id[i] * w[i];
  return m[s % 11].toUpperCase() === id[17].toUpperCase();
}

/**
 * 身份证宽松解析：能按 18 位格式解析就解析，否则回退默认值。
 *
 * 背景（业务要求）：不对身份证做合法性校验，用户填什么就签发什么，
 * 因此本函数必须能容忍任意长度的输入，不能抛错、不能产生 NaN。
 *
 * @param {string} id 身份证号（可为空、可不足 18 位、可含任意字符）
 * @returns {{ birthDate: string, age: number|string, gender: string }}
 */
function parseIdCard(id) {
  const raw = String(id == null ? '' : id).trim();
  // 尝试从字符串中提取 18 位身份证结构：前 17 位数字 + 校验位（数字或 X）
  const m = raw.match(/(\d{17}[\dXx])/);

  // 回退默认值：解析不出来时给一个中性结果，保证签发流程不中断。
  // 注意：age 在 PG 中是 int32，必须给 null 而不是空串，否则报
  // "invalid input syntax for type integer: \"\"" 导致整条插入失败。
  const fallback = { birthDate: null, age: null, gender: null };
  if (!m) return fallback;

  const v = m[1];
  const y = +v.slice(6, 10);
  const mo = +v.slice(10, 12);
  const d = +v.slice(12, 14);

  // 年月日必须落在合理区间，否则视为解析失败
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return fallback;

  const birthDate = `${v.slice(6, 10)}-${v.slice(10, 12)}-${v.slice(12, 14)}`;
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return fallback;

  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) age--;

  return {
    birthDate,
    age,
    gender: (+v[16] % 2 === 1) ? '男' : '女'
  };
}

/**
 * SHA256 加密存身份证（不落明文）
 * @param {string} id 身份证号
 */
function hashIdCard(id) {
  return crypto.createHash('sha256').update(String(id == null ? '' : id)).digest('hex');
}

/**
 * 生成编号：JK + 年份 + 6位随机 + 4位流水
 * @param {number} seq 流水
 */
function genCertNo(seq) {
  const rand = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  return `JK${new Date().getFullYear()}${rand}${String(seq % 10000).padStart(4, '0')}`;
}

/** 有效期：开始=签发前一天，结束=开始+1年-1天 */
function genValidRange() {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 1);
  to.setDate(to.getDate() - 1);
  const f = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return { validFrom: from.toISOString(), validTo: to.toISOString(), validText: `${f(from)} - ${f(to)}` };
}

/**
 * 姓名脱敏 张明 -> 张*明
 * @param {string} name 姓名
 */
function maskName(name) {
  if (!name || name.length <= 2) return name;
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/**
 * 身份证脱敏：前6+**********+后4（后端统一口径）
 * 宽松处理：不足 10 位时原样返回，避免出现「前6 后4」重叠导致的信息错乱
 * @param {string} id 身份证号
 */
function maskIdCard(id) {
  const raw = String(id == null ? '' : id).trim();
  if (raw.length < 10) return raw;
  return raw.slice(0, 6) + '**********' + raw.slice(-4);
}

module.exports = {
  isValidIdCard,
  parseIdCard,
  hashIdCard,
  genCertNo,
  genValidRange,
  maskName,
  maskIdCard
};

/**
 * 业务规则：身份证解析 / 编号 / 有效期 / 脱敏
 * @module biz
 */
const crypto = require('crypto');

/** 18位身份证正则+校验位校验 */
function isValidIdCard(id) {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const w = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
  const m = ['1','0','X','9','8','7','6','5','4','3','2'];
  let s = 0;
  for (let i = 0; i < 17; i++) s += +id[i] * w[i];
  return m[s % 11].toUpperCase() === id[17].toUpperCase();
}

/**
 * 从身份证解析出生日期/年龄/性别
 * @param {string} id 身份证号
 */
function parseIdCard(id) {
  const birth = `${id.slice(6,10)}-${id.slice(10,12)}-${id.slice(12,14)}`;
  const bd = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) age--;
  return { birthDate: birth, age, gender: (+id[16] % 2 === 1) ? '男' : '女' };
}

/** SHA256 加密存身份证 */
function hashIdCard(id) {
  return crypto.createHash('sha256').update(id).digest('hex');
}

/**
 * 生成编号：JK + 年份 + 6位随机 + 4位流水（无地区码）
 * @param {number} seq 流水
 */
function genCertNo(seq) {
  const rand = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  return `JK${new Date().getFullYear()}${rand}${String(seq % 10000).padStart(4, '0')}`;
}

/** 有效期：开始=签发前一天，结束=开始+1年-1天 */
function genValidRange() {
  const from = new Date(); from.setDate(from.getDate() - 1);
  const to = new Date(from); to.setFullYear(to.getFullYear() + 1); to.setDate(to.getDate() - 1);
  const f = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
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

module.exports = { isValidIdCard, parseIdCard, hashIdCard, genCertNo, genValidRange, maskName };

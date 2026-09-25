/**
 * 极简 JSON 文件数据库（初期替代 SQLite，上线可切 MySQL/Prisma）
 * @module db
 */
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, '../data/db.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { certs: [], seq: 0 }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
/** 初始化数据库文件 */
function initDb() { load(); save(load()); }
/** 获取数据库 */
function getDb() { return load(); }
/** 持久化数据库 */
function putDb(db) { save(db); }
module.exports = { initDb, getDb, putDb };

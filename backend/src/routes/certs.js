/**
 * 证照接口：创建 / 查询
 * @module routes/certs
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const { getDb, putDb } = require('../db');
const { isValidIdCard, parseIdCard, hashIdCard, genCertNo, genValidRange } = require('../biz');

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const d = path.join(__dirname, '../../uploads', new Date().toISOString().slice(0, 7));
    fs.mkdirSync(d, { recursive: true });
    cb(null, d);
  },
  filename(req, file, cb) { cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + '.jpg'); }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * 身份证脱敏：前6+**********+后4，后端统一口径
 * @param {string} id 身份证号
 */
function maskIdCard(id) {
  return id.slice(0, 6) + '**********' + id.slice(-4);
}

/**
 * POST /api/certs 提交办证
 * body: name, idCard, regionName, hospitalName + photo(file)
 */
router.post('/', upload.single('photo'), (req, res) => {
  const { name, idCard, regionName, hospitalName } = req.body;
  if (!name || !idCard || !regionName || !hospitalName) return res.status(400).json({ msg: '参数不完整' });
  const cleanId = String(idCard).trim();
  if (!isValidIdCard(cleanId)) return res.status(400).json({ msg: '身份证号不合法' });
  if (!req.file) return res.status(400).json({ msg: '请上传证件照片' });
  const { birthDate, age, gender } = parseIdCard(cleanId);
  const db = getDb();
  db.seq += 1;
  const certNo = genCertNo(db.seq);
  const v = genValidRange();
  const verifyId = nanoid(10);
  const cert = {
    id: db.seq, verifyId, certNo,
    name: String(name).trim(),
    idCard: maskIdCard(cleanId),
    idCardHash: hashIdCard(cleanId),
    birthDate, age, gender,
    photoUrl: '/uploads/' + path.basename(path.dirname(req.file.path)) + '/' + path.basename(req.file.path),
    regionName: String(regionName).trim(), hospitalName: String(hospitalName).trim(),
    category: '食品生产经营',
    validFrom: v.validFrom, validTo: v.validTo, validText: v.validText,
    status: '有效', createdAt: new Date().toISOString()
  };
  db.certs.push(cert);
  putDb(db);
  res.json(cert);
});

/** GET /api/certs/:id 领证页取证面详情 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const c = db.certs.find((x) => String(x.id) === String(req.params.id) || x.verifyId === req.params.id || x.certNo === req.params.id);
  if (!c) return res.status(404).json({ msg: '未找到' });
  res.json(c);
});

module.exports = router;

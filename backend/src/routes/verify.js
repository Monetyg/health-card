/**
 * 查验接口：公开免登录，返回脱敏信息
 * @module routes/verify
 */
const express = require('express');
const { getDb } = require('../db');
const { maskName } = require('../biz');
const router = express.Router();

/** GET /api/verify/:verifyId */
router.get('/:verifyId', (req, res) => {
  const id = String(req.params.verifyId || '').trim();
  // 预览码直接提示，避免前端空白
  if (!id || id.startsWith('preview-')) return res.status(400).json({ msg: '预览码不可查验，请签发正式健康证后扫码' });
  const db = getDb();
  const c = db.certs.find((x) => x.verifyId === id);
  if (!c) return res.status(404).json({ msg: '查无此证，请确认是否为正式签发的二维码' });
  const expired = new Date() > new Date(c.validTo);
  res.json({
    verifyId: c.verifyId,
    photoUrl: c.photoUrl,
    name: maskName(c.name),
    certNo: c.certNo,
    gender: c.gender,
    age: c.age,
    idCard: c.idCard,
    category: c.category,
    regionName: c.regionName,
    hospitalName: c.hospitalName,
    validFrom: c.validFrom,
    validText: c.validText,
    status: expired ? '过期' : c.status,
    verifyTime: new Date().toISOString()
  });
});
module.exports = router;

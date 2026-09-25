/**
 * 健康证后端入口
 * @module app
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const certsRouter = require('./routes/certs');
const verifyRouter = require('./routes/verify');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/certs', certsRouter);
app.use('/api/verify', verifyRouter);

/** 健康检查接口 */
app.get('/api/health', (req, res) => res.json({ ok: true }));

initDb();

app.listen(PORT, () => console.log(`API listening on :${PORT}`));

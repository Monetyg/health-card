/**
 * 云函数 health-cert-cleanup：定时清理过期查验记录 —— PostgreSQL(PostgREST) 版
 * @module health-cert-cleanup
 *
 * 背景：CloudBase 文档型数据库不支持 Mongo TTL 索引；PG 环境用 DELETE 清理，
 * 效果等价：verify_expires_at 到期（签发后3天）的记录会被自动删除。
 *
 * 触发方式：定时触发器，建议每天 03:00 执行一次（见 cloudbaserc.json）
 * 环境变量：TCB_ENV_ID / TCB_API_KEY
 */
const { count, remove, isConfigured } = require('./db-pg');

/**
 * 主入口
 */
exports.main = async () => {
  const started = Date.now();

  try {
    if (!isConfigured()) {
      return { code: 500, msg: '数据库未配置：请设置 TCB_ENV_ID / TCB_API_KEY 环境变量' };
    }

    const filter = { verify_expires_at: `lt.${new Date().toISOString()}` };

    // 先统计将要清理的数量，便于日志核对
    let scanned = 0;
    try { scanned = await count('health_certs', filter); } catch { scanned = 0; }

    // PG 的 DELETE 一次性完成，无需分批
    const deleted = await remove('health_certs', filter);
    const removed = deleted.length;

    const result = {
      code: 0,
      msg: '清理完成',
      scanned,
      removed,
      costMs: Date.now() - started
    };
    console.log('[health-cert-cleanup]', JSON.stringify(result));
    return result;
  } catch (e) {
    console.error('[health-cert-cleanup] error', e);
    return {
      code: 500,
      msg: e && e.message ? e.message : '清理失败',
      costMs: Date.now() - started
    };
  }
};

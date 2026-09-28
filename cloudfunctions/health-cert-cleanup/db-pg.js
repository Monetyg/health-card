/**
 * PostgreSQL 数据访问层（云函数共用）—— PostgREST HTTP 版
 * @module db-pg
 *
 * 背景：CloudBase 体验版/个人版只提供 PostgreSQL 实例，但**不开放 TCP 直连**
 * （官方社区 issue #1237/#1297 中腾讯云工程师已明确说明），因此云函数无法用 `pg`
 * 驱动直连，改用平台内置的 PostgREST 网关 + service_role API Key 访问。
 *
 * 网关：https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/<table>
 * 认证：apikey / Authorization 头均传 API Key（role = service_role，BYPASSRLS）
 *
 * 环境变量（不要写进代码）：
 *   TCB_ENV_ID    CloudBase 环境 ID（如 health-card-d2ga2cvid6561b93d）
 *   TCB_API_KEY   service_role 类型的 API Key
 */

const DEFAULT_ENV_ID = 'health-card-d2ga2cvid6561b93d';

/** 取环境 ID */
function envId() {
  return (process.env.TCB_ENV_ID || DEFAULT_ENV_ID).trim();
}

/** 取 API Key */
function apiKey() {
  return (process.env.TCB_API_KEY || '').trim();
}

/** REST 根地址 */
function restBase() {
  return `https://${envId()}.api.tcloudbasegateway.com/v1/rdb/rest`;
}

/** 环境变量是否已配置 */
function isConfigured() {
  return !!(envId() && apiKey());
}

/**
 * 构造请求头
 * @param {object} extra 额外头
 */
function headers(extra = {}) {
  const k = apiKey();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra
  };
}

/**
 * 统一请求
 * @param {string} method HTTP 方法
 * @param {string} path 形如 `/health_certs?verify_id=eq.xxx`
 * @param {any} [body] 请求体（对象）
 * @param {object} [extraHeaders] 额外头
 * @returns {Promise<{status:number, data:any, raw:string}>}
 */
async function request(method, path, body, extraHeaders) {
  const url = `${restBase()}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await res.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (res.status >= 400) {
    const msg = (data && (data.message || data.msg)) || raw || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return { status: res.status, data, raw };
}

/**
 * 查询多行
 * @param {string} table 表名
 * @param {object} [opts] { select, filter, order, limit }
 */
async function select(table, opts = {}) {
  const qs = [];
  if (opts.select) qs.push(`select=${encodeURIComponent(opts.select)}`);
  for (const [k, v] of Object.entries(opts.filter || {})) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  if (opts.order) qs.push(`order=${encodeURIComponent(opts.order)}`);
  if (opts.limit) qs.push(`limit=${Number(opts.limit)}`);
  const path = `/${table}${qs.length ? `?${qs.join('&')}` : ''}`;
  const r = await request('GET', path);
  return Array.isArray(r.data) ? r.data : [];
}

/**
 * 查询单行（无则 null）
 */
async function selectOne(table, opts = {}) {
  const rows = await select(table, { ...opts, limit: 1 });
  return rows[0] || null;
}

/**
 * 插入一行，返回插入后的行数组
 * @param {string} table
 * @param {object|object[]} row
 */
async function insert(table, row) {
  const r = await request('POST', `/${table}`, row, { Prefer: 'return=representation' });
  return Array.isArray(r.data) ? r.data : [];
}

/**
 * 删除匹配行，返回被删行（Prefer: return=representation 时）
 * @param {string} table
 * @param {object} filter PostgREST 过滤条件，如 { verify_expires_at: 'lt.now()' }
 */
async function remove(table, filter = {}) {
  const qs = Object.entries(filter)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const r = await request('DELETE', `/${table}${qs ? `?${qs}` : ''}`, undefined, {
    Prefer: 'return=representation'
  });
  return Array.isArray(r.data) ? r.data : [];
}

/**
 * 统计匹配行数（用 HEAD + Prefer: count=exact 读 Content-Range）
 * @param {string} table
 * @param {object} filter
 * @returns {Promise<number>}
 */
async function count(table, filter = {}) {
  const qs = ['select=id', 'limit=1'];
  for (const [k, v] of Object.entries(filter)) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  const url = `${restBase()}/${table}?${qs.join('&')}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: headers({ Prefer: 'count=exact' })
  });
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

/**
 * 兼容旧接口：SQL 时代遗留的 query()，此处不再支持，调用即报错提示迁移
 */
async function query() {
  throw new Error('SQL 直连已不可用（体验版不开放 PG TCP 连接），请改用 select/insert/remove/count');
}

module.exports = {
  select,
  selectOne,
  insert,
  remove,
  count,
  query,
  request,
  restBase,
  isConfigured
};

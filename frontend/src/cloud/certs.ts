/**
 * 办证业务调用层：签发 / 取证面
 * @module cloud/certs
 *
 * 通道说明（重要）：
 * 本环境为 CloudBase PostgreSQL 体验版，平台未开放「身份认证 → 权限控制」
 * 页面，前端 js-sdk 的 callFunction 会返回 EXCEED_AUTHORITY。
 * 因此所有云端调用统一走「HTTP 访问服务」，该通道 enableAuth=false，
 * 不需要登录态即可访问。
 *   GET  {VITE_TCB_HTTP_VERIFY}          → health-cert-verify
 *   POST {VITE_TCB_HTTP_CREATE}          → health-cert-create
 */
import { getLastAuthError } from './cloudbase';

/** 统一云函数返回结构 */
export interface TcbResult<T> {
  code: number;
  msg?: string;
  data?: T;
}

/**
 * 把任意抛出物（Error / {code,msg} / 字符串 / undefined）转成可读文案
 * js-sdk 与网关抛出的错误经常不是标准 Error，直接取 e.message 会得到空串，
 * 最终退化成「提交失败」这种无信息量的提示，无法定位问题。
 * @param e 捕获到的异常
 * @param fallback 兜底文案
 */
export function describeError(e: any, fallback = '操作失败'): string {
  if (e === null || e === undefined) return fallback;
  if (typeof e === 'string' && e.trim()) return e.trim();
  const parts: string[] = [];
  const msg = e.message || e.msg || e.errorMessage || e.Message || e.error_description;
  if (msg && typeof msg === 'string') parts.push(msg);
  const code = e.code || e.errorCode || e.Code;
  if (code !== undefined && code !== null && String(code) !== '') parts.push(`（错误码 ${code}）`);
  if (parts.length) return parts.join('');
  try {
    const s = JSON.stringify(e);
    if (s && s !== '{}') return s;
  } catch {
    /* 忽略循环引用 */
  }
  return fallback;
}

/** 签发接口地址：优先环境变量，回退同域 /api/create */
function httpCreateUrl(): string {
  const env = (import.meta.env.VITE_TCB_HTTP_CREATE || '').trim();
  return env || `${location.origin}/api/create`;
}

/**
 * 带超时的 fetch，避免网络异常时按钮永久转圈
 * @param url 请求地址
 * @param init 请求参数
 * @param ms 超时毫秒
 */
async function fetchWithTimeout(url: string, init: RequestInit, ms = 30000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析统一响应结构，非 0 一律抛出可读错误
 * 诊断信息尽量全：HTTP 状态码 + 响应原文片段，便于出现异常时快速定位
 * @param resp fetch 响应
 * @param label 出错时的动作描述
 */
async function parseResult<T>(resp: Response, label: string): Promise<T> {
  const text = await resp.text().catch(() => '');
  let body: TcbResult<T> | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应 */
  }
  if (!body) {
    const snippet = text ? text.replace(/\s+/g, ' ').slice(0, 120) : '（空响应）';
    throw new Error(`${label}失败：服务返回非预期内容（HTTP ${resp.status}）${snippet}`);
  }
  if (body.code !== 0) {
    const detail = body.msg || `code ${body.code}`;
    throw new Error(`${label}失败：${detail}（HTTP ${resp.status}）`);
  }
  return body.data as T;
}

/** File -> base64（保留 data URI 前缀，云函数侧统一处理） */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('照片读取失败，请重新选择图片'));
    fr.readAsDataURL(file);
  });
}

export interface CreateCertPayload {
  name: string;
  idCard: string;
  regionName: string;
  hospitalName: string;
  photo: File;
}

/** 单张照片大小上限，与云函数侧保持一致 */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * 签发健康证
 * 照片以 base64 传给云函数，由云函数上传云存储并换取永久 CDN 链接落库
 * @param payload 表单数据
 */
export async function createCert(payload: CreateCertPayload): Promise<any> {
  // 业务要求：不做身份证校验，只要能填出姓名和照片即可签发。
  // 前端仅拦截「明显缺失」的必填项，避免无意义请求。
  if (!payload.name) throw new Error('请填写姓名');
  if (!payload.photo) throw new Error('请上传证件照片');
  if (payload.photo.size > MAX_PHOTO_BYTES) throw new Error('照片不能超过 5MB，请压缩后重试');

  const photoBase64 = await fileToBase64(payload.photo);
  const ext = (payload.photo.name.split('.').pop() || 'jpg').toLowerCase();
  const url = httpCreateUrl();

  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        idCard: payload.idCard,
        regionName: payload.regionName,
        hospitalName: payload.hospitalName,
        photoBase64,
        photoExt: ext
      })
    });
  } catch (e: any) {
    const detail = describeError(e, '网络异常');
    const authHint = getLastAuthError();
    throw new Error(`提交失败：${detail}${authHint ? `（${authHint}）` : ''}，请检查网络后重试`);
  }

  return parseResult<any>(resp, '提交');
}

/**
 * 领证页取证面详情（按 verifyId）
 * @param id 查验码
 */
export async function getCert(id: string): Promise<any> {
  const env = (import.meta.env.VITE_TCB_HTTP_VERIFY || '').trim();
  const base = env || `${location.origin}/api`;
  const resp = await fetchWithTimeout(`${base}?verifyId=${encodeURIComponent(String(id))}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  return parseResult<any>(resp, '获取证件');
}

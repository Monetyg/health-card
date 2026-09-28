/**
 * 查验通道：统一走 HTTP 访问服务
 * @module cloud/verify
 *
 * 为什么不再区分微信/非微信：
 * 本环境为 CloudBase PostgreSQL 体验版，平台未开放「身份认证 → 权限控制」，
 * 前端 js-sdk 的 callFunction 会返回 EXCEED_AUTHORITY（官方社区 issue #1403
 * 确认该功能在 PG 体验版不可用）。
 * 而 HTTP 访问服务（enableAuth=false）无需登录态即可调用，浏览器与微信内一致，
 * 因此统一走 HTTP，逻辑更简单也更好排查。
 */
import { describeError } from './certs';

/**
 * 微信环境检测（小程序 web-view / 微信浏览器）
 * 保留该判断用于埋点与后续可能的差异化处理
 */
export function isWechat(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // @ts-ignore
  if (typeof window !== 'undefined' && (window as any).wx?.miniProgram) return true;
  return /micromessenger|miniprogram/.test(ua);
}

/**
 * 查验接口基址：
 * 优先取 VITE_TCB_HTTP_VERIFY（完整独立触发地址），
 * 否则回退同域 /api（HTTP 访问服务把 /api 路由到云函数，天然同源无 CORS）
 */
function httpVerifyBase(): string {
  const env = (import.meta.env.VITE_TCB_HTTP_VERIFY || '').trim().replace(/\/$/, '');
  return env || `${location.origin}/api`;
}

/**
 * 拉取查验信息
 * @param verifyId 查验码
 */
export async function fetchVerifyInfo(verifyId: string): Promise<any> {
  const base = httpVerifyBase();
  const url = `${base}?verifyId=${encodeURIComponent(verifyId)}`;

  let resp: Response;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    try {
      resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    throw new Error(`查验失败：${describeError(e, '网络异常')}，请检查网络后重试`);
  }

  const text = await resp.text().catch(() => '');
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON */
  }

  // 410：查验码已过期（云函数主动返回，业务上需区分提示）
  if (resp.status === 410) {
    throw new Error((body && body.msg) || '该查验码已过期（有效期3天），请重新办理或联系发证机构');
  }
  // 404：查无此证
  if (resp.status === 404) {
    throw new Error((body && body.msg) || '查无此证，请确认是否为正式签发的二维码');
  }
  if (!body) {
    throw new Error(`查验失败：服务返回非预期内容（HTTP ${resp.status}）`);
  }
  if (!resp.ok || body.code !== 0) {
    throw new Error(body.msg || `查验失败（code ${body.code}）`);
  }
  return body.data;
}

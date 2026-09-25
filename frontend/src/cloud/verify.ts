/**
 * 查验通道：微信内走 callFunction，非微信走云函数 HTTP 触发
 * @module cloud/verify
 */
import { getCloudApp } from './cloudbase';

const FN_NAME = 'health-cert-verify';

/**
 * 微信环境检测（小程序 web-view / 微信浏览器）
 */
export function isWechat(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // @ts-ignore
  if (typeof window !== 'undefined' && (window as any).wx?.miniProgram) return true;
  return /micromessenger|miniprogram/.test(ua);
}

/**
 * 拉取查验信息，两种通道返回统一结构
 * @param verifyId 查验码
 */
export async function fetchVerifyInfo(verifyId: string): Promise<any> {
  // 通道1：微信内，直连云函数，免鉴权走安全规则
  if (isWechat()) {
    const app = getCloudApp();
    // @ts-ignore
    const r = await app.callFunction({ name: FN_NAME, data: { verifyId } });
    const out = (r.result ?? r) as any;
    if (out?.code !== 0) throw new Error(out?.msg || '查验失败');
    return out.data;
  }
  // 通道2：普通浏览器，走云函数 HTTP 触发地址
  const base = (import.meta.env.VITE_TCB_HTTP_VERIFY || '').replace(/\/$/, '');
  if (!base) throw new Error('未配置 VITE_TCB_HTTP_VERIFY');
  const resp = await fetch(`${base}?verifyId=${encodeURIComponent(verifyId)}`);
  const j = await resp.json();
  if (!resp.ok || j.code !== 0) throw new Error(j.msg || '查验失败');
  return j.data;
}

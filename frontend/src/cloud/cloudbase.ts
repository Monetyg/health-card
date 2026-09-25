/**
 * CloudBase 初始化单例（H5 + 微信共用）
 * @module cloud/cloudbase
 */
import cloudbase from '@cloudbase/js-sdk';

let app: any = null;

/**
 * 获取 CloudBase App 单例
 */
export function getCloudApp() {
  if (app) return app;
  app = cloudbase.init({ env: import.meta.env.VITE_TCB_ENV_ID });
  return app;
}

/**
 * 是否在微信环境（含小程序 web-view / 微信浏览器）
 */
export function isWechatEnv(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // @ts-ignore 小程序 web-view 注入对象
  if (typeof window !== 'undefined' && (window as any).wx?.miniProgram) return true;
  return /micromessenger|miniprogram/.test(ua);
}

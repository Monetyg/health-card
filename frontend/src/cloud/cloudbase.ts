/**
 * CloudBase 初始化单例（H5 + 微信共用）
 * @module cloud/cloudbase
 *
 * 注意：当前业务所有云端调用均走「HTTP 访问服务」（见 cloud/certs、cloud/verify），
 * 不依赖 js-sdk 的登录态，因此本模块仅保留 SDK 初始化能力与工具方法。
 *
 * 保留原因：若后续在支持「权限控制」的环境（非 PG 体验版）启用 callFunction，
 * 可直接复用 getCloudApp()。届时使用 Publishable Key 初始化，
 * 无需再依赖环境侧开启「匿名登录」。
 */
import cloudbase from '@cloudbase/js-sdk';

let app: any = null;

/**
 * 获取 CloudBase App 单例
 * 若配置了 VITE_TCB_PUBLISH_KEY，则以其作为 accessKey 初始化（匿名身份，无需登录步骤）
 */
export function getCloudApp() {
  if (app) return app;
  const env = import.meta.env.VITE_TCB_ENV_ID;
  const accessKey = (import.meta.env.VITE_TCB_PUBLISH_KEY || '').trim();
  app = accessKey ? cloudbase.init({ env, accessKey }) : cloudbase.init({ env });
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

/** 调用链上最近一次鉴权失败原因（HTTP 通道下通常为空） */
let lastAuthError: string = '';

/**
 * 读取最近一次鉴权失败原因
 */
export function getLastAuthError(): string {
  return lastAuthError;
}

/**
 * 记录一次鉴权/调用错误，供错误提示透传
 * @param msg 错误描述
 */
export function setLastAuthError(msg: string): void {
  lastAuthError = msg || '';
}

/** 云函数名常量，避免散落硬编码 */
export const FN = {
  CREATE: 'health-cert-create',
  VERIFY: 'health-cert-verify'
} as const;

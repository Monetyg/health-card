/**
 * 公网/局域网查验地址配置
 * @module publicUrl
 * 优先取 VITE_VERIFY_BASE_URL（局域网填电脑IP，线上填备案域名），否则回退 location.origin
 * 例：VITE_VERIFY_BASE_URL=http://192.168.1.10:5173 npm run dev
 */
export function getVerifyBaseUrl(): string {
  // 必须写成 import.meta.env.VITE_XXX 的静态形式，Vite 才会在构建时替换字面量；
  // 用可选链（?.env?.VITE_XXX）会导致替换失效、变量永远读不到。
  const env = import.meta.env.VITE_VERIFY_BASE_URL;
  if (env && env.trim()) return env.trim().replace(/\/$/, '');
  return location.origin;
}

/**
 * 拼接查验短链
 * @param verifyId 查验码
 */
export function buildVerifyLink(verifyId: string): string {
  return `${getVerifyBaseUrl()}/v/${verifyId}`;
}

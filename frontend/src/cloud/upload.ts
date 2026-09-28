/**
 * [未启用] 前端直传云存储方案 —— 当前流程不使用本模块
 * @module cloud/upload
 *
 * 现状：照片由 health-cert-create 云函数在服务端上传云存储并换取永久 CDN 链接，
 * 前端只需把 base64 随表单一起提交（见 cloud/certs.ts）。
 * 保留本文件仅为记录「前端直传」这一备选实现，供将来需要减少请求体大小时切换。
 *
 * 方案要点：云存储权限设为「所有用户可读」（公共读）。
 * CloudBase 云存储对公共读文件调用 getTempFileURL 返回的链接不会过期，
 * 因此可以安全存入数据库 photoUrl —— 不会像私有读那样 24 小时失效。
 *
 * 注意：公共读意味着拿到链接的任何人都能访问该图，存在隐私风险。
 */
import { getCloudApp } from './cloudbase';

/**
 * 上传照片并返回可长期公开访问的 HTTPS 地址
 * @param file 待上传的图片文件
 * @returns 公开 CDN HTTPS 链接，存入 photoUrl
 */
export async function uploadPhotoToCOS(file: File): Promise<string> {
  const app = getCloudApp();

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const month = new Date().toISOString().slice(0, 7);
  const cloudPath = `health-photos/${month}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  // @ts-ignore js-sdk 上传
  const res = await app.uploadFile({ cloudPath, filePath: file });
  const fileID: string = res.fileID;

  // @ts-ignore 公共读文件换出的链接永久有效，可直接落库
  const urlRes = await app.getTempFileURL({ fileList: [fileID] });
  const httpsUrl: string = urlRes.fileList?.[0]?.tempFileURL || '';
  if (!httpsUrl) throw new Error('获取照片公开链接失败，请检查云存储权限是否为「所有用户可读」');

  return httpsUrl;
}

/**
 * 照片上传 COS 并换取公开 CDN HTTPS 链接
 * @module cloud/upload
 */
import { getCloudApp } from './cloudbase';

/**
 * 上传照片并返回可公开访问的 HTTPS 地址
 * @param file 待上传的图片文件
 * @returns 公开 CDN HTTPS 链接，存入 photoUrl
 */
export async function uploadPhotoToCOS(file: File): Promise<string> {
  const app = getCloudApp();
  await app.auth({ persistence: 'local' }).anonymousAuthProvider().signIn();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const cloudPath = `health-photos/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  // @ts-ignore js-sdk 上传
  const res = await app.uploadFile({ cloudPath, filePath: file });
  const fileID: string = res.fileID;
  // @ts-ignore fileID 换 CDN 临时链接，默认2小时有效，续期靠查验时云函数再换
  const urlRes = await app.getTempFileURL({ fileList: [{ fileID, maxAge: 7200 }] });
  const httpsUrl: string = urlRes.fileList?.[0]?.tempFileURL || '';
  if (!httpsUrl) throw new Error('获取照片公开链接失败');
  return httpsUrl;
}

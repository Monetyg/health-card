<template>
  <div class="cert-wrap">
    <div ref="shotRef" class="shot">
      <div class="card front">
        <div class="card-title">{{ tpl.frontTitle }}</div>
        <div class="cert-no">编号：{{ cert.certNo || '—' }}</div>
        <div class="card-row">
          <div class="card-left">
            <div class="line"><span>姓名：{{ cert.name }}</span><span class="gender">性别：{{ cert.gender || '—' }}</span></div>
            <div class="line small">年龄：{{ cert.age ?? '—' }}岁</div>
            <div class="line">身份证号码：{{ cert.idCard || '—' }}<br />(或其他有效证明)</div>
            <div class="line">体检单位公章：</div>
            <div class="line">单位名称：{{ cert.hospitalName }}</div>
            <div class="line">体检日期：{{ examDate }}(有效期壹年)</div>
          </div>
          <img v-if="cert.photoUrl" :src="cert.photoUrl" class="photo" />
          <div v-else class="photo empty">照片预览</div>
        </div>
        <div class="wm">{{ cert.hospitalName }}</div>
      </div>
      <div class="card back">
        <div class="back-title">{{ backLines[0] }}<br />{{ backLines[1] }}</div>
        <div class="wm">{{ cert.hospitalName }}</div>
      </div>
      <div class="qr-row">
        <div class="qr-box">
          <canvas ref="qr" width="220" height="220"></canvas>
          <div class="qr-no">{{ cert.certNo || '' }}</div>
        </div>
      </div>
    </div>
    <div class="actions">
      <van-button type="primary" block @click="save">保存图片（9:16）</van-button>
      <van-button block @click="print">打印</van-button>
    </div>
  </div>
</template>
<script setup lang="ts">
/**
 * 证面长图：9:16 竖版，移动端满屏，保存即 1080x1920
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { getRegionTemplate } from '../config/regions';
import { buildVerifyLink } from '../config/publicUrl';
const props = defineProps<{ cert: any }>();
const qr = ref<HTMLCanvasElement>();
const shotRef = ref<HTMLElement>();
const tpl = computed(() => getRegionTemplate(props.cert?.regionName));
const backLines = computed(() => {
  const t: string = tpl.value.backTitle;
  const mid = Math.ceil(t.length / 2);
  return [t.slice(0, mid), t.slice(mid)];
});
const examDate = computed(() => {
  const d = new Date(props.cert?.validFrom);
  if (isNaN(+d)) return props.cert?.validText || '—';
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
});
const verifyLink = computed(() => {
  const id = props.cert?.verifyId || `preview-${props.cert?.certNo || 'demo'}`;
  try { return buildVerifyLink(id); } catch { return `/v/${id}`; }
});
/** 二维码 180px 适配 9:16 下半屏，保证可扫 */
async function drawQr() {
  await nextTick();
  if (!qr.value) return;
  try {
    await QRCode.toCanvas(qr.value, verifyLink.value, { width: 180, margin: 2, errorCorrectionLevel: 'M' });
  } catch (e) { console.error(e); }
}
onMounted(drawQr);
watch([() => props.cert?.verifyId, () => props.cert?.certNo], drawQr);
/**
 * 保存 9:16 长图：固定 1080x1920 导出
 */
async function save() {
  const c = await html2canvas(shotRef.value as HTMLElement, { backgroundColor: '#fff', scale: 2, width: 540, height: 960, windowWidth: 540 });
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = (props.cert?.certNo || 'health-cert') + '-9x16.png';
  a.click();
}
function print() { window.print(); }
</script>
<style scoped>
/* 移动优先：外层满宽，证图居中限 430px */
.cert-wrap { background: #f2f2f2; padding: 12px 12px 20px; min-height: 100vh; box-sizing: border-box; }
/* 核心：9:16 竖版，三段纵向排布 */
.shot { aspect-ratio: 9 / 16; width: 100%; max-width: 430px; margin: 0 auto; background: #fff; display: flex; flex-direction: column; padding: 3cqw; box-sizing: border-box; overflow: hidden; container-type: inline-size; }
.card { position: relative; overflow: hidden; border: 2px solid #111; border-radius: 12px; padding: 10px 10px 12px; background: #fff; }
.front { flex: 5.2; margin-bottom: 8px; }
.back { flex: 4; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; }
.card-title { text-align: center; font-size: clamp(14px, 4.4cqw, 19px); margin-bottom: 2px; }
.cert-no { text-align: center; font-size: clamp(10px, 3.2cqw, 13px); color: #333; margin-bottom: 6px; }
.card-row { display: flex; justify-content: space-between; gap: 8px; }
.card-left { font-size: clamp(11px, 3.6cqw, 15px); line-height: 1.85; flex: 1; }
.gender { margin-left: 20px; }
.small { font-size: clamp(10px, 3.3cqw, 14px); color: #333; }
.photo { width: clamp(72px, 26cqw, 108px); height: clamp(100px, 36cqw, 148px); object-fit: cover; border: 1px solid #eee; }
.photo.empty { display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999; font-size: 12px; }
.wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(0,0,0,.07); font-size: clamp(12px, 4cqw, 18px); transform: rotate(-35deg); pointer-events: none; white-space: nowrap; }
.back-title { font-size: clamp(20px, 7.5cqw, 30px); line-height: 1.6; text-align: center; }
/* 二维码占底部固定区，居中 */
.qr-row { flex: 2.6; display: flex; align-items: center; justify-content: center; }
.qr-box { text-align: center; background: #fff; padding: 6px; }
.qr-box canvas { width: clamp(110px, 34cqw, 150px) !important; height: auto !important; image-rendering: pixelated; }
.qr-no { font-size: 11px; margin-top: 2px; }
.actions { max-width: 430px; margin: 10px auto 0; display: grid; gap: 8px; }
@media print { .actions { display: none; } .cert-wrap { background: #fff; padding: 0; } }
</style>

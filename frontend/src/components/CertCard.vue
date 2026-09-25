<template>
  <div class="cert-wrap">
    <div ref="shotRef" class="shot">
      <div class="card">
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
          <div class="qr-link">{{ verifyLink }}</div>
        </div>
      </div>
    </div>
    <div class="actions">
      <van-button type="primary" block @click="save">保存图片</van-button>
      <van-button block @click="print">打印</van-button>
    </div>
  </div>
</template>
<script setup lang="ts">
/**
 * 证面二维码修复：可配局域网IP/域名 + 220px高容错 + 白底描边防模糊
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
/** 查验链接走可配 BaseUrl，解决手机扫 localhost 打不开 */
const verifyLink = computed(() => {
  const id = props.cert?.verifyId || `preview-${props.cert?.certNo || 'demo'}`;
  try { return buildVerifyLink(id); } catch { return `/v/${id}`; }
});
/** 高清晰二维码：220px + margin 2 + 容错 M */
async function drawQr() {
  await nextTick();
  if (!qr.value) return;
  try {
    await QRCode.toCanvas(qr.value, verifyLink.value, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
  } catch (e) { console.error(e); }
}
onMounted(drawQr);
watch([() => props.cert?.verifyId, () => props.cert?.certNo], drawQr);
async function save() {
  const c = await html2canvas(shotRef.value as HTMLElement, { backgroundColor: '#fff', scale: 3 });
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = (props.cert?.certNo || 'health-cert') + '.png';
  a.click();
}
function print() { window.print(); }
</script>
<style scoped>
.cert-wrap { background: #fff; padding: 12px; }
.card { position: relative; overflow: hidden; border: 2px solid #111; border-radius: 14px; padding: 14px 14px 18px; margin-bottom: 12px; background: #fff; }
.card-title { text-align: center; font-size: 19px; margin-bottom: 4px; }
.cert-no { text-align: center; font-size: 13px; color: #333; margin-bottom: 10px; }
.card-row { display: flex; justify-content: space-between; gap: 10px; }
.card-left { font-size: 15px; line-height: 1.9; flex: 1; }
.gender { margin-left: 32px; }
.small { font-size: 14px; color: #333; }
.photo { width: 108px; height: 148px; object-fit: cover; border: 1px solid #eee; }
.photo.empty { display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999; font-size: 12px; }
.wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(0,0,0,.07); font-size: 18px; transform: rotate(-35deg); pointer-events: none; white-space: nowrap; }
.back { min-height: 260px; display: flex; align-items: center; justify-content: center; }
.back-title { font-size: 30px; line-height: 1.6; text-align: center; }
.qr-row { display: flex; justify-content: center; padding: 8px 0 4px; }
.qr-box { text-align: center; background: #fff; padding: 10px; border: 1px solid #eee; }
.qr-box canvas { image-rendering: pixelated; }
.qr-no { font-size: 12px; margin-top: 4px; }
.qr-link { font-size: 10px; color: #999; margin-top: 2px; word-break: break-all; }
.actions { display: grid; gap: 8px; margin-top: 8px; }
</style>

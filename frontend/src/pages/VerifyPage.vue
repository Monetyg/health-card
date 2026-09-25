<template>
  <div class="verify">
    <h2>扫码查验（免登录）</h2>
    <p class="sub">查验码：{{ verifyId }}</p>
    <div v-if="loading">加载中…</div>
    <div v-else-if="err" class="err">
      <van-empty :description="err" />
      <p class="hint">可能原因：扫的是录入页“待签发”预览码；后端重启数据丢失；手机与电脑不在同一 WiFi / 后端没启动。</p>
    </div>
    <div v-else-if="d" class="card">
      <div class="title">{{ d.regionName }}食品从业人员健康证明</div>
      <div class="row">
        <div class="left">
          <p>姓名：{{ d.name }}（已脱敏）</p>
          <p>编号：{{ d.certNo }}</p>
          <p>性别：{{ d.gender }} · {{ d.age }}岁</p>
          <p>身份证：{{ d.idCard }}</p>
          <p>类别：{{ d.category }}</p>
          <p>单位：{{ d.hospitalName }}</p>
          <p>有效期：{{ d.validText }}</p>
          <van-tag :type="d.status === '有效' ? 'success' : 'danger'">{{ d.status }}</van-tag>
        </div>
        <img :src="photoSrc" class="photo" @error="imgErr = true" />
      </div>
      <p v-if="imgErr" class="hint">照片加载失败：{{ d.photoUrl }}（确认后端 :3000 已启动且手机能访问）</p>
      <p class="wm">查验时间 {{ d.verifyTime }}</p>
    </div>
  </div>
</template>
<script setup lang="ts">
/**
 * 查验页：加载/报错/缺图全状态展示，避免扫进去一片空白
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const verifyId = String(route.params.id || '');
const d = ref<any>(null);
const err = ref('');
const loading = ref(true);
const imgErr = ref(false);
/** 照片相对地址转绝对，手机扫 LAN-IP 也能加载 */
const photoSrc = computed(() => {
  const u: string = d.value?.photoUrl || '';
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  return `${location.origin}${u}`;
});
onMounted(async () => {
  try {
    const r = await fetch(`/api/verify/${verifyId}`);
    const j = await r.json();
    if (!r.ok) err.value = j.msg || '查验失败';
    else d.value = j;
  } catch (e: any) {
    err.value = '网络异常，后端不可达：' + (e?.message || e);
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>
.verify { padding: 12px; background-image: repeating-linear-gradient(45deg, #fff, #fff 20px, #f6f6f6 20px, #f6f6f6 40px); min-height: 100vh; }
.sub { color: #999; font-size: 12px; }
.card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; }
.title { text-align: center; font-size: 17px; margin-bottom: 10px; }
.row { display: flex; gap: 10px; }
.left { flex: 1; font-size: 14px; line-height: 1.9; }
.photo { width: 100px; height: 135px; object-fit: cover; border: 1px solid #eee; }
.wm { color: #999; font-size: 12px; margin-top: 8px; }
.err .hint, .hint { color: #999; font-size: 12px; }
</style>

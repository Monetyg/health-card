<template>
  <div>
    <h2>领证</h2>
    <div v-if="loading">加载中…</div>
    <div v-else-if="err" class="err">{{ err }}</div>
    <CertCard v-else-if="cert" :cert="cert" />
  </div>
</template>
<script setup lang="ts">
/** 证面展示页 /cert/:id —— 改走云函数取数据 */
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import CertCard from '../components/CertCard.vue';
import { getCert } from '../cloud/certs';

const route = useRoute();
const cert = ref<any>(null);
const err = ref('');
const loading = ref(true);

onMounted(async () => {
  try {
    cert.value = await getCert(String(route.params.id));
  } catch (e: any) {
    err.value = e?.message || '未找到该健康证';
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>.err { color: #999; font-size: 13px; padding: 12px; }</style>

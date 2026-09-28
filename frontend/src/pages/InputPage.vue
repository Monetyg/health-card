<template>
  <div class="page">
    <h2>健康证录入</h2>
    <van-field v-model="form.name" label="姓名" placeholder="请输入姓名" />
    <van-field v-model="form.idCard" label="身份证" placeholder="18位身份证" @input="onIdInput" />
    <p v-if="parsed">年龄 {{ parsed.age }} · {{ parsed.gender }}</p>
    <van-field v-model="form.regionName" label="地区" placeholder="如 广东省" />
    <van-field v-model="form.hospitalName" label="体检机构" placeholder="如 深圳市第一人民医院" />
    <van-uploader v-model="photos" :max-count="1" />
    <p class="tip">当前版式：{{ tpl.frontTitle }} / {{ form.hospitalName || '未填写医院' }}</p>
    <CertCard :cert="preview" />
    <van-button type="primary" block :loading="submitting" @click="submit">二次确认并提交</van-button>
  </div>
</template>
<script setup lang="ts">
/**
 * 录入页：预览改为计算属性，与输入框同拍，无延迟
 */
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import CertCard from '../components/CertCard.vue';
import { getRegionTemplate } from '../config/regions';
import { createCert, describeError } from '../cloud/certs';
const router = useRouter();
const form = reactive({ name: '', idCard: '', regionName: '广东省', hospitalName: '深圳市第一人民医院' });
const photos = ref<any[]>([]);
const parsed = ref<any>(null);
const submitting = ref(false);
const tpl = computed(() => getRegionTemplate(form.regionName));

/**
 * 按周岁精确算年龄
 * @param y 出生年
 * @param m 出生月
 * @param d 出生日
 */
function calcAge(y: number, m: number, d: number) {
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** 身份证输入后解析年龄性别 */
function onIdInput() {
  const id = form.idCard.trim();
  if (id.length >= 14) {
    const y = +id.slice(6, 10), m = +id.slice(10, 12), d = +id.slice(12, 14);
    parsed.value = { age: calcAge(y, m, d), gender: (+id[16] % 2 === 1) ? '男' : '女' };
  }
}
/**
 * 本地脱敏预览
 * @param id 身份证号
 */
function maskLocal(id: string) {
  const t = (id || '').trim();
  if (t.length < 10) return '—';
  return t.slice(0, 6) + '**********' + t.slice(-4);
}
/**
 * 预览证面：直接从 form/photos 计算，所见即所得
 */
const preview = computed(() => ({
  name: form.name.trim() || '—',
  age: parsed.value?.age ?? '—',
  gender: parsed.value?.gender || '男',
  idCard: maskLocal(form.idCard),
  regionName: form.regionName.trim(),
  hospitalName: form.hospitalName.trim() || '—',
  certNo: '待签发',
  verifyId: '',
  validFrom: new Date().toISOString(),
  photoUrl: photos.value[0]?.content || ''
}));
/** 提交：走云函数签发，照片由云函数上传云存储并换永久 CDN 链接落库 */
async function submit() {
  if (!confirm(`确认提交？\n姓名:${form.name.trim()}\n${tpl.value.frontTitle}\n${form.hospitalName.trim()}`)) return;
  const file = photos.value[0]?.file;
  if (!file) return alert('请上传证件照片');
  if (submitting.value) return;
  submitting.value = true;
  try {
    const cert = await createCert({
      name: form.name.trim(),
      idCard: form.idCard.trim(),
      regionName: form.regionName.trim(),
      hospitalName: form.hospitalName.trim(),
      photo: file
    });
    // 领证页与查验页统一按 verifyId 取数（verify 函数只认 verify_id，用自增 id 会 404）
    const certId = cert?.verifyId || cert?.verify_id || cert?.id || cert?._id;
    if (!certId) throw new Error('云函数未返回证件编号，请稍后重试');
    router.push('/cert/' + certId);
  } catch (e: any) {
    // 透出真实原因（字段校验 / 鉴权 / 网络 / 数据库），不再退化成无信息量的「提交失败」
    alert(describeError(e, '提交失败，请检查网络后重试'));
  } finally {
    submitting.value = false;
  }
}
</script>
<style scoped>.tip { color: #666; font-size: 13px; }</style>

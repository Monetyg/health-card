<template><div><h2>领证</h2><CertCard v-if="cert" :cert="cert" /></div></template>
<script setup lang="ts">
/** 证面展示页 /cert/:id */
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import CertCard from '../components/CertCard.vue';
const cert = ref(null);
onMounted(async () => { cert.value = await fetch('/api/certs/' + useRoute().params.id).then((r) => r.json()); });
</script>

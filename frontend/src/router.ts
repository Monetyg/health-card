/** 路由：/ 录入，/cert/:id 证面，/v/:id 查验 */
import { createRouter, createWebHistory } from 'vue-router';
import InputPage from './pages/InputPage.vue';
import CertPage from './pages/CertPage.vue';
import VerifyPage from './pages/VerifyPage.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: InputPage },
    { path: '/cert/:id', component: CertPage },
    { path: '/v/:id', component: VerifyPage }
  ]
});

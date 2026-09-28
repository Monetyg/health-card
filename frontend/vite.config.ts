import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 前端构建配置
 * 后端已迁移至 CloudBase 云函数，不再需要 /api 与 /uploads 反代 Express。
 * 本地开发如需联调云函数，直接指向 CloudBase 环境即可（VITE_TCB_ENV_ID）。
 */
export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', port: 5173 }
});

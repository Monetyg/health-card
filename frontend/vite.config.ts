import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 前端构建配置：host 开放局域网 + /api 反代后端
 * 局域网真机联调：VITE_VERIFY_BASE_URL=http://<电脑IP>:5173 npm run dev
 */
export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' } }
});

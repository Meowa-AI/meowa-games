import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Playwright 会在长流程中持续写截图；测试产物不应触发游戏整页热重载。
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
});

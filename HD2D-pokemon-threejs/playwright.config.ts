import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  // 两个 Three.js + SwiftShader 场景并行会争抢软件渲染帧，令时间线验收失真。
  workers: 1,
  webServer: {
    // E2E 验证生产产物，避免开发服务器的 HMR 在长剧情中重载页面。
    command: `npm run build && exec ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 用于桌面3D宠物应用的端到端测试
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',
  
  // 测试文件匹配模式
  testMatch: '**/*.test.ts',
  
  // 完全并行运行测试
  fullyParallel: true,
  
  // CI环境下禁止only
  forbidOnly: !!process.env.CI,
  
  // 失败重试次数
  retries: process.env.CI ? 2 : 0,
  
  // 并行工作进程数
  workers: process.env.CI ? 1 : undefined,
  
  // 报告器配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  // 全局设置
  use: {
    // 基础URL
    baseURL: 'http://localhost:5173',
    
    // 追踪配置 - 失败时保留
    trace: 'on-first-retry',
    
    // 截图配置 - 仅失败时
    screenshot: 'only-on-failure',
    
    // 视频配置 - 失败时保留
    video: 'retain-on-failure',
    
    // 动作超时
    actionTimeout: 15000,
    
    // 导航超时
    navigationTimeout: 30000,
  },
  
  // 全局超时
  timeout: 60000,
  
  // 期望超时
  expect: {
    timeout: 10000
  },
  
  // 项目配置 - Electron测试
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.test.ts',
      use: {
        // Electron 特定配置
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  
  // 输出目录
  outputDir: 'test-results',
  
  // 开发服务器配置 (用于Web组件测试)
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
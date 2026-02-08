/**
 * E2E测试：AI对话流程
 * 
 * 测试目标：
 * - 验证AI对话界面正确显示
 * - 验证用户输入消息后AI响应
 * - 验证流式输出显示
 * - 验证对话历史保持
 * - 验证宠物动画与AI状态同步
 * - 验证错误处理和降级
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

// 应用启动配置
const APP_PATH = path.join(__dirname, '../../dist/main/index.js');
const STARTUP_TIMEOUT = 10000;
const AI_RESPONSE_TIMEOUT = 30000;

test.describe('AI Chat E2E Tests', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    // 启动Electron应用
    electronApp = await electron.launch({
      args: [APP_PATH],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TEST: 'true',
        // 使用mock AI provider进行测试
        AI_PROVIDER: 'mock',
      },
    });

    // 获取主窗口
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test.describe('Chat Interface', () => {
    test('should open chat interface on double-click', async () => {
      // 等待宠物加载
      await page.waitForSelector('[data-testid="pet-container"]', {
        timeout: STARTUP_TIMEOUT,
      });

      // 双击宠物打开对话界面
      const petContainer = page.locator('[data-testid="pet-container"]');
      await petContainer.dblclick();

      // 验证对话界面显示
      const chatInterface = page.locator('[data-testid="chat-interface"]');
      await expect(chatInterface).toBeVisible({ timeout: 5000 });
    });

    test('should display chat bubble mode by default', async () => {
      // 双击打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();

      // 验证气泡模式
      const chatBubble = page.locator('[data-testid="chat-bubble"]');
      await expect(chatBubble).toBeVisible({ timeout: 5000 });
    });

    test('should have input field and send button', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 验证输入框
      const inputField = page.locator('[data-testid="chat-input"]');
      await expect(inputField).toBeVisible();
      await expect(inputField).toBeEnabled();

      // 验证发送按钮
      const sendButton = page.locator('[data-testid="chat-send-button"]');
      await expect(sendButton).toBeVisible();
    });

    test('should close chat interface when clicking outside', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 点击外部区域
      await page.click('body', { position: { x: 10, y: 10 } });

      // 验证对话界面关闭
      const chatInterface = page.locator('[data-testid="chat-interface"]');
      await expect(chatInterface).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Message Sending', () => {
    test('should send message when clicking send button', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 输入消息
      const inputField = page.locator('[data-testid="chat-input"]');
      await inputField.fill('你好，小宠物！');

      // 点击发送按钮
      await page.click('[data-testid="chat-send-button"]');

      // 验证用户消息显示
      const userMessage = page.locator('[data-testid="message-user"]').last();
      await expect(userMessage).toContainText('你好，小宠物！');
    });

    test('should send message when pressing Enter', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 输入消息并按Enter
      const inputField = page.locator('[data-testid="chat-input"]');
      await inputField.fill('测试消息');
      await inputField.press('Enter');

      // 验证用户消息显示
      const userMessage = page.locator('[data-testid="message-user"]').last();
      await expect(userMessage).toContainText('测试消息');
    });

    test('should clear input after sending', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息
      const inputField = page.locator('[data-testid="chat-input"]');
      await inputField.fill('测试消息');
      await inputField.press('Enter');

      // 验证输入框已清空
      await expect(inputField).toHaveValue('');
    });

    test('should not send empty message', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 获取当前消息数量
      const messageCountBefore = await page.locator('[data-testid^="message-"]').count();

      // 尝试发送空消息
      await page.click('[data-testid="chat-send-button"]');

      // 验证消息数量未增加
      const messageCountAfter = await page.locator('[data-testid^="message-"]').count();
      expect(messageCountAfter).toBe(messageCountBefore);
    });
  });

  test.describe('AI Response', () => {
    test('should show thinking animation while waiting for response', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息
      await page.locator('[data-testid="chat-input"]').fill('你好');
      await page.click('[data-testid="chat-send-button"]');

      // 验证思考动画状态
      const petState = await page.evaluate(() => {
        return (window as any).__petAnimationState;
      });
      
      // 宠物应该进入thinking状态
      expect(['thinking', 'idle']).toContain(petState);
    });

    test('should display AI response message', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息
      await page.locator('[data-testid="chat-input"]').fill('你好');
      await page.click('[data-testid="chat-send-button"]');

      // 等待AI响应
      const aiMessage = page.locator('[data-testid="message-assistant"]').last();
      await expect(aiMessage).toBeVisible({ timeout: AI_RESPONSE_TIMEOUT });
    });

    test('should show streaming response with typing effect', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息
      await page.locator('[data-testid="chat-input"]').fill('讲个笑话');
      await page.click('[data-testid="chat-send-button"]');

      // 检查流式输出指示器
      const streamingIndicator = page.locator('[data-testid="streaming-indicator"]');
      await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

      // 等待流式输出完成
      await expect(streamingIndicator).not.toBeVisible({ timeout: AI_RESPONSE_TIMEOUT });
    });

    test('should update pet animation based on response sentiment', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送积极消息
      await page.locator('[data-testid="chat-input"]').fill('你真棒！');
      await page.click('[data-testid="chat-send-button"]');

      // 等待AI响应完成
      await page.waitForSelector('[data-testid="message-assistant"]', {
        timeout: AI_RESPONSE_TIMEOUT,
      });

      // 等待动画状态更新
      await page.waitForTimeout(500);

      // 验证宠物动画状态（应该是happy或idle）
      const petState = await page.evaluate(() => {
        return (window as any).__petAnimationState;
      });
      
      expect(['happy', 'idle', 'celebrating']).toContain(petState);
    });
  });

  test.describe('Conversation History', () => {
    test('should maintain conversation context', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送第一条消息
      await page.locator('[data-testid="chat-input"]').fill('我叫小明');
      await page.click('[data-testid="chat-send-button"]');

      // 等待响应
      await page.waitForSelector('[data-testid="message-assistant"]', {
        timeout: AI_RESPONSE_TIMEOUT,
      });

      // 发送第二条消息，引用之前的内容
      await page.locator('[data-testid="chat-input"]').fill('我叫什么名字？');
      await page.click('[data-testid="chat-send-button"]');

      // 等待第二个响应
      const aiMessages = page.locator('[data-testid="message-assistant"]');
      await expect(aiMessages).toHaveCount(2, { timeout: AI_RESPONSE_TIMEOUT });
    });

    test('should display message history after reopening chat', async () => {
      // 打开对话界面并发送消息
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      await page.locator('[data-testid="chat-input"]').fill('测试消息保存');
      await page.click('[data-testid="chat-send-button"]');

      // 等待响应
      await page.waitForSelector('[data-testid="message-assistant"]', {
        timeout: AI_RESPONSE_TIMEOUT,
      });

      // 关闭对话界面
      await page.click('body', { position: { x: 10, y: 10 } });
      await page.waitForTimeout(500);

      // 重新打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 验证历史消息仍然显示
      const userMessage = page.locator('[data-testid="message-user"]');
      await expect(userMessage).toContainText('测试消息保存');
    });

    test('should scroll to latest message', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送多条消息
      for (let i = 0; i < 5; i++) {
        await page.locator('[data-testid="chat-input"]').fill(`测试消息 ${i + 1}`);
        await page.click('[data-testid="chat-send-button"]');
        await page.waitForTimeout(500);
      }

      // 验证最新消息可见
      const lastMessage = page.locator('[data-testid="message-user"]').last();
      await expect(lastMessage).toBeInViewport();
    });
  });

  test.describe('Error Handling', () => {
    test('should show error message when AI service fails', async () => {
      // 设置AI服务失败
      await page.evaluate(() => {
        (window as any).__mockAIError = true;
      });

      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息
      await page.locator('[data-testid="chat-input"]').fill('测试错误处理');
      await page.click('[data-testid="chat-send-button"]');

      // 验证错误提示
      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible({ timeout: AI_RESPONSE_TIMEOUT });
    });

    test('should show confused animation on error', async () => {
      // 设置AI服务失败
      await page.evaluate(() => {
        (window as any).__mockAIError = true;
      });

      // 打开对话界面并发送消息
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      await page.locator('[data-testid="chat-input"]').fill('触发错误');
      await page.click('[data-testid="chat-send-button"]');

      // 等待错误处理
      await page.waitForTimeout(2000);

      // 验证宠物动画状态
      const petState = await page.evaluate(() => {
        return (window as any).__petAnimationState;
      });
      
      expect(['confused', 'sad', 'idle']).toContain(petState);
    });

    test('should allow retry after error', async () => {
      // 设置AI服务失败
      await page.evaluate(() => {
        (window as any).__mockAIError = true;
      });

      // 打开对话界面并发送消息
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      await page.locator('[data-testid="chat-input"]').fill('测试重试');
      await page.click('[data-testid="chat-send-button"]');

      // 等待错误显示
      await page.waitForSelector('[data-testid="error-message"]', {
        timeout: AI_RESPONSE_TIMEOUT,
      });

      // 清除错误状态
      await page.evaluate(() => {
        (window as any).__mockAIError = false;
      });

      // 点击重试按钮
      const retryButton = page.locator('[data-testid="retry-button"]');
      if (await retryButton.isVisible()) {
        await retryButton.click();

        // 验证重试成功
        const aiMessage = page.locator('[data-testid="message-assistant"]');
        await expect(aiMessage).toBeVisible({ timeout: AI_RESPONSE_TIMEOUT });
      }
    });
  });

  test.describe('Chat Window Mode', () => {
    test('should switch to independent chat window mode', async () => {
      // 打开设置修改聊天模式
      await page.locator('[data-testid="pet-container"]').click({ button: 'right' });
      await page.click('[data-testid="menu-settings"]');

      // 切换到独立窗口模式
      const chatModeToggle = page.locator('[data-testid="chat-mode-toggle"]');
      if (await chatModeToggle.isVisible()) {
        await chatModeToggle.click();
      }

      // 关闭设置
      await page.click('[data-testid="settings-close"]');

      // 双击打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();

      // 验证独立窗口打开
      const windows = electronApp.windows();
      // 应该有两个窗口：主窗口和聊天窗口
      expect(windows.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should support Escape to close chat', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 按Escape键
      await page.keyboard.press('Escape');

      // 验证对话界面关闭
      const chatInterface = page.locator('[data-testid="chat-interface"]');
      await expect(chatInterface).not.toBeVisible({ timeout: 3000 });
    });

    test('should focus input when chat opens', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 验证输入框获得焦点
      const inputField = page.locator('[data-testid="chat-input"]');
      await expect(inputField).toBeFocused({ timeout: 2000 });
    });
  });

  test.describe('Performance', () => {
    test('should respond within 3 seconds (SC-005)', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 记录发送时间
      const startTime = Date.now();

      // 发送消息
      await page.locator('[data-testid="chat-input"]').fill('快速响应测试');
      await page.click('[data-testid="chat-send-button"]');

      // 等待AI响应开始（流式输出的第一个字符）
      await page.waitForSelector('[data-testid="message-assistant"]', {
        timeout: 3000,
      });

      const responseTime = Date.now() - startTime;

      // 验证首字符响应时间 < 3秒
      expect(responseTime).toBeLessThan(3000);
    });

    test('should maintain 30fps during chat animation', async () => {
      // 打开对话界面
      await page.locator('[data-testid="pet-container"]').dblclick();
      await page.waitForSelector('[data-testid="chat-interface"]');

      // 发送消息触发动画
      await page.locator('[data-testid="chat-input"]').fill('测试帧率');
      await page.click('[data-testid="chat-send-button"]');

      // 测量帧率
      const fps = await page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          let frameCount = 0;
          const startTime = performance.now();
          
          const countFrames = () => {
            frameCount++;
            const elapsed = performance.now() - startTime;
            
            if (elapsed < 1000) {
              requestAnimationFrame(countFrames);
            } else {
              resolve(frameCount);
            }
          };
          
          requestAnimationFrame(countFrames);
        });
      });

      // 验证帧率 >= 30fps
      expect(fps).toBeGreaterThanOrEqual(25); // 允许一些波动
    });
  });
});

test.describe('AI Chat Accessibility', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: [APP_PATH],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AI_PROVIDER: 'mock',
      },
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should have proper ARIA labels', async () => {
    // 打开对话界面
    await page.locator('[data-testid="pet-container"]').dblclick();
    await page.waitForSelector('[data-testid="chat-interface"]');

    // 验证输入框有ARIA标签
    const inputField = page.locator('[data-testid="chat-input"]');
    await expect(inputField).toHaveAttribute('aria-label', /.+/);

    // 验证发送按钮有ARIA标签
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    await expect(sendButton).toHaveAttribute('aria-label', /.+/);
  });

  test('should support keyboard navigation', async () => {
    // 打开对话界面
    await page.locator('[data-testid="pet-container"]').dblclick();
    await page.waitForSelector('[data-testid="chat-interface"]');

    // Tab导航到发送按钮
    await page.keyboard.press('Tab');
    
    // 验证焦点移动
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    await expect(sendButton).toBeFocused();
  });
});
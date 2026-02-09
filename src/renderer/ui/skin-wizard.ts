/**
 * 换肤向导UI组件
 * T102 [US6] 实现换肤向导UI组件
 * 
 * 功能：
 * - 引导用户上传宠物照片
 * - 显示品种识别结果
 * - 展示3D模型生成进度
 * - 预览和确认生成的模型
 */

import { EventEmitter } from 'events';

// 向导步骤
export type WizardStep = 
  | 'upload'      // 上传照片
  | 'recognize'   // 识别品种
  | 'generate'    // 生成模型
  | 'preview'     // 预览模型
  | 'complete';   // 完成

// 向导状态
export interface WizardState {
  currentStep: WizardStep;
  imagePath: string | null;
  imagePreview: string | null;
  breedResult: BreedResult | null;
  modelResult: ModelResult | null;
  progress: ProgressInfo;
  error: string | null;
}

// 品种识别结果
interface BreedResult {
  breed: string;
  confidence: number;
  species: 'cat' | 'dog' | 'other';
  alternatives?: Array<{ breed: string; confidence: number }>;
}

// 模型生成结果
interface ModelResult {
  modelPath: string;
  riggedModelPath?: string;
  thumbnailPath?: string;
  vertices: number;
  faces: number;
  hasRig: boolean;
}

// 进度信息
interface ProgressInfo {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  step: number;
  totalSteps: number;
  currentStepName: string;
  overallProgress: number;
  stepProgress: number;
  message?: string;
}

// 向导选项
export interface SkinWizardOptions {
  container: HTMLElement;
  onComplete?: (result: ModelResult) => void;
  onCancel?: () => void;
  theme?: 'light' | 'dark';
}

/**
 * 换肤向导组件
 */
export class SkinWizard extends EventEmitter {
  private container: HTMLElement;
  private options: SkinWizardOptions;
  private state: WizardState;
  private elements: WizardElements;
  private isOpen = false;

  constructor(options: SkinWizardOptions) {
    super();
    this.container = options.container;
    this.options = options;
    this.state = this.createInitialState();
    this.elements = {} as WizardElements;
  }

  /**
   * 打开向导
   */
  open(): void {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.state = this.createInitialState();
    this.render();
    this.setupEventListeners();
    this.container.classList.add('skin-wizard-open');
    
    this.emit('open');
  }

  /**
   * 关闭向导
   */
  close(): void {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.cleanup();
    this.container.classList.remove('skin-wizard-open');
    this.container.innerHTML = '';
    
    this.emit('close');
  }

  /**
   * 获取当前状态
   */
  getState(): WizardState {
    return { ...this.state };
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): WizardState {
    return {
      currentStep: 'upload',
      imagePath: null,
      imagePreview: null,
      breedResult: null,
      modelResult: null,
      progress: {
        status: 'idle',
        step: 0,
        totalSteps: 3,
        currentStepName: '',
        overallProgress: 0,
        stepProgress: 0,
      },
      error: null,
    };
  }

  /**
   * 渲染向导
   */
  private render(): void {
    const theme = this.options.theme ?? 'dark';
    
    this.container.innerHTML = `
      <div class="skin-wizard skin-wizard--${theme}">
        <div class="skin-wizard__overlay"></div>
        <div class="skin-wizard__dialog">
          <div class="skin-wizard__header">
            <h2 class="skin-wizard__title">换肤向导</h2>
            <button class="skin-wizard__close" aria-label="关闭">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="skin-wizard__steps">
            ${this.renderStepIndicator()}
          </div>
          
          <div class="skin-wizard__content">
            ${this.renderStepContent()}
          </div>
          
          <div class="skin-wizard__footer">
            ${this.renderFooter()}
          </div>
        </div>
      </div>
      
      <style>
        ${this.getStyles()}
      </style>
    `;

    this.cacheElements();
  }

  /**
   * 渲染步骤指示器
   */
  private renderStepIndicator(): string {
    const steps = [
      { id: 'upload', label: '上传照片', icon: '📷' },
      { id: 'recognize', label: '识别品种', icon: '🔍' },
      { id: 'generate', label: '生成模型', icon: '🎨' },
      { id: 'preview', label: '预览确认', icon: '✨' },
    ];

    const currentIndex = steps.findIndex(s => s.id === this.state.currentStep);

    return steps.map((step, index) => {
      const isActive = step.id === this.state.currentStep;
      const isCompleted = index < currentIndex;
      const isPending = index > currentIndex;

      return `
        <div class="skin-wizard__step ${isActive ? 'skin-wizard__step--active' : ''} ${isCompleted ? 'skin-wizard__step--completed' : ''} ${isPending ? 'skin-wizard__step--pending' : ''}">
          <div class="skin-wizard__step-icon">
            ${isCompleted ? '✓' : step.icon}
          </div>
          <div class="skin-wizard__step-label">${step.label}</div>
        </div>
        ${index < steps.length - 1 ? '<div class="skin-wizard__step-connector"></div>' : ''}
      `;
    }).join('');
  }

  /**
   * 渲染步骤内容
   */
  private renderStepContent(): string {
    switch (this.state.currentStep) {
      case 'upload':
        return this.renderUploadStep();
      case 'recognize':
        return this.renderRecognizeStep();
      case 'generate':
        return this.renderGenerateStep();
      case 'preview':
        return this.renderPreviewStep();
      case 'complete':
        return this.renderCompleteStep();
      default:
        return '';
    }
  }

  /**
   * 渲染上传步骤
   */
  private renderUploadStep(): string {
    return `
      <div class="skin-wizard__upload">
        <div class="skin-wizard__upload-area" id="upload-area">
          ${this.state.imagePreview ? `
            <img src="${this.state.imagePreview}" alt="Preview" class="skin-wizard__preview-image" />
            <button class="skin-wizard__remove-image" id="remove-image">✕</button>
          ` : `
            <div class="skin-wizard__upload-icon">📷</div>
            <div class="skin-wizard__upload-text">
              <p>点击或拖拽上传宠物照片</p>
              <p class="skin-wizard__upload-hint">支持 JPG、PNG、WebP 格式</p>
            </div>
          `}
        </div>
        <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp" hidden />
        
        <div class="skin-wizard__tips">
          <h4>📝 拍照建议</h4>
          <ul>
            <li>选择光线充足的环境</li>
            <li>拍摄宠物的正面或侧面</li>
            <li>确保宠物完整出现在画面中</li>
            <li>避免过度模糊或遮挡</li>
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * 渲染识别步骤
   */
  private renderRecognizeStep(): string {
    const { breedResult, progress } = this.state;

    if (progress.status === 'processing') {
      return `
        <div class="skin-wizard__recognize">
          <div class="skin-wizard__loading">
            <div class="skin-wizard__spinner"></div>
            <p>正在识别宠物品种...</p>
          </div>
        </div>
      `;
    }

    if (breedResult) {
      return `
        <div class="skin-wizard__recognize">
          <div class="skin-wizard__result-card">
            <img src="${this.state.imagePreview}" alt="Pet" class="skin-wizard__result-image" />
            <div class="skin-wizard__result-info">
              <div class="skin-wizard__breed-name">${breedResult.breed}</div>
              <div class="skin-wizard__breed-confidence">
                置信度: ${Math.round(breedResult.confidence * 100)}%
              </div>
              <div class="skin-wizard__breed-species">
                ${breedResult.species === 'cat' ? '🐱 猫' : breedResult.species === 'dog' ? '🐕 狗' : '🐾 其他'}
              </div>
            </div>
          </div>
          
          ${breedResult.alternatives && breedResult.alternatives.length > 0 ? `
            <div class="skin-wizard__alternatives">
              <h4>其他可能的品种</h4>
              <ul>
                ${breedResult.alternatives.map(alt => `
                  <li>
                    <span class="skin-wizard__alt-breed">${alt.breed}</span>
                    <span class="skin-wizard__alt-confidence">${Math.round(alt.confidence * 100)}%</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="skin-wizard__recognize">
        <div class="skin-wizard__error">
          <p>品种识别失败</p>
          <p class="skin-wizard__error-hint">${this.state.error || '请重试'}</p>
        </div>
      </div>
    `;
  }

  /**
   * 渲染生成步骤
   */
  private renderGenerateStep(): string {
    const { progress } = this.state;

    return `
      <div class="skin-wizard__generate">
        <div class="skin-wizard__progress-container">
          <div class="skin-wizard__progress-bar">
            <div class="skin-wizard__progress-fill" style="width: ${progress.overallProgress}%"></div>
          </div>
          <div class="skin-wizard__progress-text">
            ${progress.currentStepName || '准备中...'} - ${Math.round(progress.overallProgress)}%
          </div>
        </div>
        
        <div class="skin-wizard__progress-steps">
          <div class="skin-wizard__progress-step ${progress.step >= 1 ? 'skin-wizard__progress-step--active' : ''} ${progress.step > 1 ? 'skin-wizard__progress-step--completed' : ''}">
            <span class="skin-wizard__progress-step-icon">🔍</span>
            <span class="skin-wizard__progress-step-label">品种识别</span>
          </div>
          <div class="skin-wizard__progress-step ${progress.step >= 2 ? 'skin-wizard__progress-step--active' : ''} ${progress.step > 2 ? 'skin-wizard__progress-step--completed' : ''}">
            <span class="skin-wizard__progress-step-icon">🎨</span>
            <span class="skin-wizard__progress-step-label">3D建模</span>
          </div>
          <div class="skin-wizard__progress-step ${progress.step >= 3 ? 'skin-wizard__progress-step--active' : ''} ${progress.step > 3 ? 'skin-wizard__progress-step--completed' : ''}">
            <span class="skin-wizard__progress-step-icon">🦴</span>
            <span class="skin-wizard__progress-step-label">骨骼绑定</span>
          </div>
        </div>
        
        ${progress.message ? `
          <div class="skin-wizard__progress-message">${progress.message}</div>
        ` : ''}
        
        ${progress.status === 'failed' ? `
          <div class="skin-wizard__error">
            <p>生成失败</p>
            <p class="skin-wizard__error-hint">${this.state.error || '请重试'}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 渲染预览步骤
   */
  private renderPreviewStep(): string {
    const { modelResult, breedResult } = this.state;

    if (!modelResult) {
      return `
        <div class="skin-wizard__preview">
          <div class="skin-wizard__error">
            <p>模型数据不可用</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="skin-wizard__preview">
        <div class="skin-wizard__model-viewer" id="model-viewer">
          <div class="skin-wizard__model-placeholder">
            <div class="skin-wizard__model-icon">🐾</div>
            <p>3D模型预览</p>
            <p class="skin-wizard__model-hint">完整版本将在主界面显示</p>
          </div>
        </div>
        
        <div class="skin-wizard__model-info">
          <h4>模型信息</h4>
          <table class="skin-wizard__info-table">
            <tr>
              <td>品种</td>
              <td>${breedResult?.breed || '未知'}</td>
            </tr>
            <tr>
              <td>顶点数</td>
              <td>${modelResult.vertices.toLocaleString()}</td>
            </tr>
            <tr>
              <td>面数</td>
              <td>${modelResult.faces.toLocaleString()}</td>
            </tr>
            <tr>
              <td>骨骼绑定</td>
              <td>${modelResult.hasRig ? '✓ 已绑定' : '✗ 无'}</td>
            </tr>
          </table>
        </div>
        
        <div class="skin-wizard__preview-actions">
          <p>确认使用此模型作为您的宠物皮肤？</p>
        </div>
      </div>
    `;
  }

  /**
   * 渲染完成步骤
   */
  private renderCompleteStep(): string {
    return `
      <div class="skin-wizard__complete">
        <div class="skin-wizard__success-icon">🎉</div>
        <h3>换肤成功！</h3>
        <p>您的宠物已经换上了新的皮肤</p>
        <p class="skin-wizard__complete-hint">快去看看您的新宠物吧！</p>
      </div>
    `;
  }

  /**
   * 渲染页脚
   */
  private renderFooter(): string {
    const { currentStep, progress, imagePath } = this.state;

    switch (currentStep) {
      case 'upload':
        return `
          <button class="skin-wizard__btn skin-wizard__btn--secondary" id="btn-cancel">取消</button>
          <button class="skin-wizard__btn skin-wizard__btn--primary" id="btn-next" ${!imagePath ? 'disabled' : ''}>
            下一步
          </button>
        `;
      
      case 'recognize':
        return `
          <button class="skin-wizard__btn skin-wizard__btn--secondary" id="btn-back">返回</button>
          <button class="skin-wizard__btn skin-wizard__btn--primary" id="btn-next" ${progress.status === 'processing' ? 'disabled' : ''}>
            下一步
          </button>
        `;
      
      case 'generate':
        return `
          <button class="skin-wizard__btn skin-wizard__btn--secondary" id="btn-cancel-process" ${progress.status !== 'processing' ? 'disabled' : ''}>
            取消生成
          </button>
        `;
      
      case 'preview':
        return `
          <button class="skin-wizard__btn skin-wizard__btn--secondary" id="btn-regenerate">重新生成</button>
          <button class="skin-wizard__btn skin-wizard__btn--primary" id="btn-confirm">确认使用</button>
        `;
      
      case 'complete':
        return `
          <button class="skin-wizard__btn skin-wizard__btn--primary" id="btn-finish">完成</button>
        `;
      
      default:
        return '';
    }
  }

  /**
   * 缓存DOM元素
   */
  private cacheElements(): void {
    this.elements = {
      dialog: this.container.querySelector('.skin-wizard__dialog') as HTMLElement,
      closeBtn: this.container.querySelector('.skin-wizard__close') as HTMLButtonElement,
      content: this.container.querySelector('.skin-wizard__content') as HTMLElement,
      footer: this.container.querySelector('.skin-wizard__footer') as HTMLElement,
      uploadArea: this.container.querySelector('#upload-area') as HTMLElement,
      fileInput: this.container.querySelector('#file-input') as HTMLInputElement,
    };
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 关闭按钮
    this.container.addEventListener('click', this.handleClick.bind(this));
    
    // 文件拖放
    const uploadArea = this.container.querySelector('#upload-area');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
      uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
      uploadArea.addEventListener('drop', this.handleDrop.bind(this));
    }

    // 文件输入
    const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener('change', this.handleFileSelect.bind(this));
    }

    // 监听进度更新
    if (window.electronAPI) {
      window.electronAPI.on('skin:progress', this.handleProgressUpdate.bind(this));
    }
  }

  /**
   * 处理点击事件
   */
  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // 关闭按钮
    if (target.closest('.skin-wizard__close')) {
      this.handleCancel();
      return;
    }

    // 遮罩层点击
    if (target.classList.contains('skin-wizard__overlay')) {
      this.handleCancel();
      return;
    }

    // 上传区域点击
    if (target.closest('#upload-area') && !target.closest('#remove-image')) {
      const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
      fileInput?.click();
      return;
    }

    // 删除图片
    if (target.closest('#remove-image')) {
      this.handleRemoveImage();
      return;
    }

    // 按钮处理
    if (target.closest('#btn-cancel')) {
      this.handleCancel();
    } else if (target.closest('#btn-back')) {
      this.handleBack();
    } else if (target.closest('#btn-next')) {
      this.handleNext();
    } else if (target.closest('#btn-cancel-process')) {
      this.handleCancelProcess();
    } else if (target.closest('#btn-regenerate')) {
      this.handleRegenerate();
    } else if (target.closest('#btn-confirm')) {
      this.handleConfirm();
    } else if (target.closest('#btn-finish')) {
      this.handleFinish();
    }
  }

  /**
   * 处理拖拽悬停
   */
  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const uploadArea = event.currentTarget as HTMLElement;
    uploadArea.classList.add('skin-wizard__upload-area--dragover');
  }

  /**
   * 处理拖拽离开
   */
  private handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const uploadArea = event.currentTarget as HTMLElement;
    uploadArea.classList.remove('skin-wizard__upload-area--dragover');
  }

  /**
   * 处理拖放
   */
  private async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    
    const uploadArea = event.currentTarget as HTMLElement;
    uploadArea.classList.remove('skin-wizard__upload-area--dragover');

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await this.loadImageFile(files[0]);
    }
  }

  /**
   * 处理文件选择
   */
  private async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      await this.loadImageFile(files[0]);
    }
  }

  /**
   * 加载图片文件
   */
  private async loadImageFile(file: File): Promise<void> {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      this.showError('请选择有效的图片文件');
      return;
    }

    // 验证文件大小（最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
      this.showError('图片文件不能超过 10MB');
      return;
    }

    try {
      // 读取文件为 Data URL
      const dataUrl = await this.readFileAsDataUrl(file);
      
      // 保存到临时位置并获取路径
      let imagePath: string;
      if (window.electronAPI) {
        // 在 Electron 环境中，通过 IPC 保存文件
        imagePath = await window.electronAPI.invoke('skin:save-temp-image', {
          data: dataUrl,
          filename: file.name,
        });
      } else {
        // 开发模式下使用 Data URL
        imagePath = dataUrl;
      }

      this.state.imagePath = imagePath;
      this.state.imagePreview = dataUrl;
      this.state.error = null;
      
      this.updateUI();
    } catch (error) {
      this.showError('加载图片失败');
    }
  }

  /**
   * 读取文件为 Data URL
   */
  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 处理删除图片
   */
  private handleRemoveImage(): void {
    this.state.imagePath = null;
    this.state.imagePreview = null;
    this.updateUI();
  }

  /**
   * 处理取消
   */
  private handleCancel(): void {
    this.options.onCancel?.();
    this.close();
  }

  /**
   * 处理返回
   */
  private handleBack(): void {
    const stepOrder: WizardStep[] = ['upload', 'recognize', 'generate', 'preview', 'complete'];
    const currentIndex = stepOrder.indexOf(this.state.currentStep);
    if (currentIndex > 0) {
      this.state.currentStep = stepOrder[currentIndex - 1];
      this.updateUI();
    }
  }

  /**
   * 处理下一步
   */
  private async handleNext(): Promise<void> {
    switch (this.state.currentStep) {
      case 'upload':
        await this.startRecognition();
        break;
      case 'recognize':
        await this.startGeneration();
        break;
    }
  }

  /**
   * 开始品种识别
   */
  private async startRecognition(): Promise<void> {
    if (!this.state.imagePath) return;

    this.state.currentStep = 'recognize';
    this.state.progress = {
      ...this.state.progress,
      status: 'processing',
    };
    this.updateUI();

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.invoke('skin:recognize-breed', this.state.imagePath);
        this.state.breedResult = result;
        this.state.progress.status = 'completed';
      } else {
        // 模拟结果
        await this.delay(1500);
        this.state.breedResult = {
          breed: 'British Shorthair',
          confidence: 0.92,
          species: 'cat',
          alternatives: [
            { breed: 'Scottish Fold', confidence: 0.65 },
            { breed: 'Russian Blue', confidence: 0.45 },
          ],
        };
        this.state.progress.status = 'completed';
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '识别失败';
      this.state.progress.status = 'failed';
    }

    this.updateUI();
  }

  /**
   * 开始模型生成
   */
  private async startGeneration(): Promise<void> {
    if (!this.state.imagePath) return;

    this.state.currentStep = 'generate';
    this.state.progress = {
      status: 'processing',
      step: 1,
      totalSteps: 3,
      currentStepName: '准备中...',
      overallProgress: 0,
      stepProgress: 0,
    };
    this.updateUI();

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.invoke('skin:process-full', this.state.imagePath, {
          modelQuality: 'medium',
          generateRig: true,
        });

        if (result.success) {
          this.state.modelResult = {
            modelPath: result.model.modelPath,
            riggedModelPath: result.rig?.riggedModelPath,
            thumbnailPath: result.model.thumbnailPath,
            vertices: result.model.vertices,
            faces: result.model.faces,
            hasRig: result.rig !== undefined,
          };
          this.state.currentStep = 'preview';
          this.state.progress.status = 'completed';
        } else {
          throw new Error(result.error || '生成失败');
        }
      } else {
        // 模拟生成过程
        await this.simulateGeneration();
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '生成失败';
      this.state.progress.status = 'failed';
    }

    this.updateUI();
  }

  /**
   * 模拟生成过程（开发用）
   */
  private async simulateGeneration(): Promise<void> {
    const stages = [
      { step: 1, name: '识别品种', progress: 25 },
      { step: 2, name: '生成3D模型', progress: 65 },
      { step: 3, name: '绑定骨骼', progress: 100 },
    ];

    for (const stage of stages) {
      this.state.progress = {
        status: 'processing',
        step: stage.step,
        totalSteps: 3,
        currentStepName: stage.name,
        overallProgress: stage.progress,
        stepProgress: 100,
      };
      this.updateUI();
      await this.delay(2000);
    }

    this.state.modelResult = {
      modelPath: '/generated/model.glb',
      riggedModelPath: '/generated/model_rigged.glb',
      thumbnailPath: '/generated/thumbnail.png',
      vertices: 15000,
      faces: 30000,
      hasRig: true,
    };
    this.state.currentStep = 'preview';
  }

  /**
   * 处理进度更新
   */
  private handleProgressUpdate(data: { type: string; taskId: string; progress: ProgressInfo }): void {
    if (data.type === 'skin-process' && this.state.currentStep === 'generate') {
      this.state.progress = data.progress;
      this.updateUI();
    }
  }

  /**
   * 处理取消生成
   */
  private async handleCancelProcess(): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.invoke('skin:cancel', 'current');
    }
    
    this.state.currentStep = 'upload';
    this.state.progress.status = 'idle';
    this.updateUI();
  }

  /**
   * 处理重新生成
   */
  private async handleRegenerate(): Promise<void> {
    this.state.modelResult = null;
    await this.startGeneration();
  }

  /**
   * 处理确认使用
   */
  private async handleConfirm(): Promise<void> {
    if (!this.state.modelResult) return;

    // 应用皮肤
    if (window.electronAPI) {
      await window.electronAPI.invoke('pet:apply-skin', {
        modelPath: this.state.modelResult.riggedModelPath || this.state.modelResult.modelPath,
        breed: this.state.breedResult?.breed,
      });
    }

    this.state.currentStep = 'complete';
    this.updateUI();

    // 通知完成
    this.options.onComplete?.(this.state.modelResult);
    this.emit('complete', this.state.modelResult);
  }

  /**
   * 处理完成
   */
  private handleFinish(): void {
    this.close();
  }

  /**
   * 显示错误
   */
  private showError(message: string): void {
    this.state.error = message;
    this.updateUI();
    
    // 3秒后清除错误
    setTimeout(() => {
      if (this.state.error === message) {
        this.state.error = null;
        this.updateUI();
      }
    }, 3000);
  }

  /**
   * 更新UI
   */
  private updateUI(): void {
    if (!this.isOpen) return;
    this.render();
    this.setupEventListeners();
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 移除事件监听
    if (window.electronAPI) {
      window.electronAPI.off('skin:progress', this.handleProgressUpdate.bind(this));
    }
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
      .skin-wizard {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .skin-wizard__overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }

      .skin-wizard__dialog {
        position: relative;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        background: #1a1a2e;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .skin-wizard--light .skin-wizard__dialog {
        background: #ffffff;
        color: #333;
      }

      .skin-wizard__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .skin-wizard__title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
      }

      .skin-wizard--light .skin-wizard__title {
        color: #333;
      }

      .skin-wizard__close {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
        transition: all 0.2s;
      }

      .skin-wizard__close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      .skin-wizard__steps {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        gap: 8px;
      }

      .skin-wizard__step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        opacity: 0.5;
        transition: opacity 0.3s;
      }

      .skin-wizard__step--active,
      .skin-wizard__step--completed {
        opacity: 1;
      }

      .skin-wizard__step-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        font-size: 16px;
      }

      .skin-wizard__step--active .skin-wizard__step-icon {
        background: #6366f1;
      }

      .skin-wizard__step--completed .skin-wizard__step-icon {
        background: #22c55e;
        color: #fff;
      }

      .skin-wizard__step-label {
        font-size: 12px;
        color: #888;
      }

      .skin-wizard__step-connector {
        width: 30px;
        height: 2px;
        background: rgba(255, 255, 255, 0.2);
      }

      .skin-wizard__content {
        flex: 1;
        padding: 24px;
        overflow-y: auto;
      }

      .skin-wizard__upload-area {
        border: 2px dashed rgba(255, 255, 255, 0.3);
        border-radius: 12px;
        padding: 40px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s;
        position: relative;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .skin-wizard__upload-area:hover,
      .skin-wizard__upload-area--dragover {
        border-color: #6366f1;
        background: rgba(99, 102, 241, 0.1);
      }

      .skin-wizard__upload-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .skin-wizard__upload-text {
        color: #888;
      }

      .skin-wizard__upload-hint {
        font-size: 12px;
        margin-top: 8px;
      }

      .skin-wizard__preview-image {
        max-width: 100%;
        max-height: 200px;
        border-radius: 8px;
        object-fit: contain;
      }

      .skin-wizard__remove-image {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .skin-wizard__tips {
        margin-top: 24px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
      }

      .skin-wizard__tips h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #fff;
      }

      .skin-wizard__tips ul {
        margin: 0;
        padding-left: 20px;
        color: #888;
        font-size: 13px;
      }

      .skin-wizard__tips li {
        margin-bottom: 4px;
      }

      .skin-wizard__loading {
        text-align: center;
        padding: 40px;
      }

      .skin-wizard__spinner {
        width: 48px;
        height: 48px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .skin-wizard__result-card {
        display: flex;
        gap: 20px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
      }

      .skin-wizard__result-image {
        width: 120px;
        height: 120px;
        border-radius: 8px;
        object-fit: cover;
      }

      .skin-wizard__result-info {
        flex: 1;
      }

      .skin-wizard__breed-name {
        font-size: 24px;
        font-weight: 600;
        color: #fff;
        margin-bottom: 8px;
      }

      .skin-wizard__breed-confidence {
        color: #22c55e;
        font-size: 14px;
        margin-bottom: 4px;
      }

      .skin-wizard__breed-species {
        color: #888;
        font-size: 14px;
      }

      .skin-wizard__alternatives {
        margin-top: 20px;
      }

      .skin-wizard__alternatives h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #888;
      }

      .skin-wizard__alternatives ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .skin-wizard__alternatives li {
        display: flex;
        justify-content: space-between;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        margin-bottom: 4px;
      }

      .skin-wizard__alt-confidence {
        color: #888;
      }

      .skin-wizard__progress-container {
        margin-bottom: 24px;
      }

      .skin-wizard__progress-bar {
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
      }

      .skin-wizard__progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #6366f1, #8b5cf6);
        transition: width 0.3s;
      }

      .skin-wizard__progress-text {
        text-align: center;
        margin-top: 12px;
        color: #888;
        font-size: 14px;
      }

      .skin-wizard__progress-steps {
        display: flex;
        justify-content: space-around;
        margin-top: 24px;
      }

      .skin-wizard__progress-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        opacity: 0.5;
      }

      .skin-wizard__progress-step--active {
        opacity: 1;
      }

      .skin-wizard__progress-step--completed {
        opacity: 1;
      }

      .skin-wizard__progress-step--completed .skin-wizard__progress-step-icon {
        color: #22c55e;
      }

      .skin-wizard__progress-step-icon {
        font-size: 24px;
      }

      .skin-wizard__progress-step-label {
        font-size: 12px;
        color: #888;
      }

      .skin-wizard__progress-message {
        text-align: center;
        margin-top: 16px;
        color: #6366f1;
        font-size: 14px;
      }

      .skin-wizard__error {
        text-align: center;
        padding: 20px;
        color: #ef4444;
      }

      .skin-wizard__error-hint {
        color: #888;
        font-size: 14px;
        margin-top: 8px;
      }

      .skin-wizard__model-viewer {
        aspect-ratio: 16/9;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .skin-wizard__model-placeholder {
        text-align: center;
        color: #888;
      }

      .skin-wizard__model-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }

      .skin-wizard__model-hint {
        font-size: 12px;
        margin-top: 8px;
      }

      .skin-wizard__model-info {
        padding: 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .skin-wizard__model-info h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #fff;
      }

      .skin-wizard__info-table {
        width: 100%;
        font-size: 14px;
      }

      .skin-wizard__info-table td {
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .skin-wizard__info-table td:first-child {
        color: #888;
      }

      .skin-wizard__info-table td:last-child {
        text-align: right;
        color: #fff;
      }

      .skin-wizard__preview-actions {
        text-align: center;
        color: #888;
        font-size: 14px;
      }

      .skin-wizard__complete {
        text-align: center;
        padding: 40px;
      }

      .skin-wizard__success-icon {
        font-size: 64px;
        margin-bottom: 20px;
      }

      .skin-wizard__complete h3 {
        margin: 0 0 12px 0;
        font-size: 24px;
        color: #fff;
      }

      .skin-wizard__complete p {
        color: #888;
        margin: 0;
      }

      .skin-wizard__complete-hint {
        margin-top: 8px !important;
        font-size: 14px;
      }

      .skin-wizard__footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .skin-wizard__btn {
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .skin-wizard__btn--primary {
        background: #6366f1;
        color: #fff;
      }

      .skin-wizard__btn--primary:hover:not(:disabled) {
        background: #5558e3;
      }

      .skin-wizard__btn--secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .skin-wizard__btn--secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
      }

      .skin-wizard__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
  }
}

// DOM元素接口
interface WizardElements {
  dialog: HTMLElement;
  closeBtn: HTMLButtonElement;
  content: HTMLElement;
  footer: HTMLElement;
  uploadArea: HTMLElement;
  fileInput: HTMLInputElement;
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      off: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

// 导出工厂函数
export function createSkinWizard(options: SkinWizardOptions): SkinWizard {
  return new SkinWizard(options);
}
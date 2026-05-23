import {
  slugifySequenceId,
  type ClickAnimationSequenceStep,
} from '../../shared/config/click-animation-sequence-file';
import {
  buildFlatStepsFromTriplet,
  detectStartLoopEndTriplets,
  type StartLoopEndTriplet,
} from '../../shared/config/start-loop-end-sequence';
import type {
  ClickAnimationPoolEntry,
  PetDesktopConfig,
} from '../../shared/config/pet-desktop-settings';
import {
  clampModelBrightness,
  clampWindowHeight,
  clampWindowWidth,
  normalizePetDesktopConfig,
  parseSequencePoolKey,
  sequencePoolKey,
} from '../../shared/config/pet-desktop-settings';
import {
  clampPlaybackSpeed,
  clampSourceAnimationFps,
} from '../../shared/config/pet-model-settings';
import {
  REFERENCE_DISPLAY_SCALE,
  applyDisplayScaleToModelScale,
  effectiveModelScaleLimits,
  unapplyDisplayScaleFromModelScale,
} from '../../shared/config/display-scale';

interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

interface PetLiveLayout {
  windowWidth: number;
  windowHeight: number;
  modelScale: number;
  modelBrightness: number;
  position: { x: number; y: number; monitor: number };
}

interface ClickSequenceSummary {
  id: string;
  name: string;
}

interface ClickSequenceFile {
  version: number;
  name: string;
  steps: ClickAnimationSequenceStep[];
}

interface PetDesktopAPI {
  getDesktopConfig: () => Promise<PetDesktopConfig>;
  setDesktopConfig: (config: PetDesktopConfig) => Promise<PetDesktopConfig>;
  previewDesktopConfig?: (config: PetDesktopConfig) => Promise<PetLiveLayout>;
  getLiveLayout?: () => Promise<PetLiveLayout>;
  listModels?: () => Promise<string[]>;
  getConfigForModel?: (modelFileName: string | null) => Promise<PetDesktopConfig>;
  getAnimationClips: () => Promise<string[]>;
  listClickSequences?: (modelFileName?: string | null) => Promise<ClickSequenceSummary[]>;
  getClickSequence?: (
    id: string,
    modelFileName?: string | null
  ) => Promise<ClickSequenceFile | null>;
  saveClickSequence?: (
    id: string,
    file: ClickSequenceFile,
    modelFileName?: string | null
  ) => Promise<ClickSequenceFile>;
  deleteClickSequence?: (id: string, modelFileName?: string | null) => Promise<boolean>;
  createClickSequence?: (
    displayName: string,
    modelFileName?: string | null
  ) => Promise<{ id: string; file: ClickSequenceFile }>;
}

interface WindowAPI {
  getPosition: () => Promise<{ x: number; y: number; monitor: number }>;
  getDisplays: () => Promise<DisplayInfo[]>;
  getDisplayScale: () => Promise<number>;
}

declare global {
  interface Window {
    electronAPI?: {
      pet: PetDesktopAPI;
      window: WindowAPI;
    };
  }
}

const api = window.electronAPI;

let clipNames: string[] = [];
let modelFileNames: string[] = [];
let draft: PetDesktopConfig | null = null;
let savedConfig: PetDesktopConfig | null = null;
let sequenceSummaries: ClickSequenceSummary[] = [];
/** 当前在编辑器中打开的序列 id（与播放方式下拉一致） */
let editingSequenceId: string | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let livePollTimer: ReturnType<typeof setInterval> | null = null;
const focusedLayoutFields = new Set<string>();
/** 当前设置窗口所在显示器的 Windows 缩放倍率 */
let displayScaleFactor = REFERENCE_DISPLAY_SCALE;

const el = {
  modelFile: document.getElementById('model-file') as HTMLSelectElement,
  windowWidth: document.getElementById('window-width') as HTMLInputElement,
  windowHeight: document.getElementById('window-height') as HTMLInputElement,
  modelScale: document.getElementById('model-scale') as HTMLInputElement,
  modelScaleValue: document.getElementById('model-scale-value')!,
  sourceAnimationFps: document.getElementById('source-animation-fps') as HTMLInputElement,
  playbackSpeed: document.getElementById('playback-speed') as HTMLInputElement,
  playbackSpeedValue: document.getElementById('playback-speed-value')!,
  modelBrightness: document.getElementById('model-brightness') as HTMLInputElement,
  modelBrightnessValue: document.getElementById('model-brightness-value')!,
  liveBrightness: document.getElementById('live-brightness')!,
  posX: document.getElementById('pos-x') as HTMLInputElement,
  posY: document.getElementById('pos-y') as HTMLInputElement,
  posMonitor: document.getElementById('pos-monitor') as HTMLSelectElement,
  poolList: document.getElementById('pool-list')!,
  sequencePoolList: document.getElementById('sequence-pool-list')!,
  activeSequenceSelect: document.getElementById('active-sequence-select') as HTMLSelectElement,
  sequenceEditor: document.getElementById('sequence-editor')!,
  sequenceName: document.getElementById('sequence-name') as HTMLInputElement,
  sequenceList: document.getElementById('sequence-list')!,
  status: document.getElementById('status-text')!,
  btnSave: document.getElementById('btn-save')!,
  btnCancel: document.getElementById('btn-cancel')!,
  btnUsePos: document.getElementById('btn-use-current-pos')!,
  btnAddSeq: document.getElementById('btn-add-sequence-step')!,
  startLoopEndPanel: document.getElementById('start-loop-end-panel')!,
  startLoopEndList: document.getElementById('start-loop-end-list')!,
  btnNewSeq: document.getElementById('btn-new-sequence')!,
  btnSaveSeq: document.getElementById('btn-save-sequence')!,
  btnDeleteSeq: document.getElementById('btn-delete-sequence')!,
  liveSize: document.getElementById('live-size')!,
  liveScale: document.getElementById('live-scale')!,
  livePosition: document.getElementById('live-position')!,
};

function formatLiveSize(layout: PetLiveLayout): string {
  return `当前实际：${layout.windowWidth} × ${layout.windowHeight} px`;
}

function formatLiveScale(layout: PetLiveLayout): string {
  const pct = Math.round(displayScaleFactor * 100);
  return `当前实际：模型缩放 ${layout.modelScale.toFixed(2)}×（Windows ${pct}%）`;
}

function modelScaleForDisplay(storedScale: number): number {
  return applyDisplayScaleToModelScale(storedScale, displayScaleFactor);
}

function updateModelScaleSliderRange(): void {
  const { min, max } = effectiveModelScaleLimits(displayScaleFactor);
  el.modelScale.min = String(min);
  el.modelScale.max = String(max);
}

function setModelScaleInputs(storedScale: number): void {
  updateModelScaleSliderRange();
  const displayScale = modelScaleForDisplay(storedScale);
  el.modelScale.value = String(displayScale);
  el.modelScaleValue.textContent = displayScale.toFixed(2);
}

async function refreshDisplayScaleFactor(): Promise<void> {
  const nextScale = await api?.window?.getDisplayScale?.();
  if (typeof nextScale === 'number' && nextScale > 0) {
    const scaleChanged = Math.abs(nextScale - displayScaleFactor) >= 0.001;
    displayScaleFactor = nextScale;
    if (scaleChanged && draft) {
      setModelScaleInputs(draft.modelScale);
    } else {
      updateModelScaleSliderRange();
    }
  }
}

function formatLiveBrightness(layout: PetLiveLayout): string {
  return `当前实际：模型亮度 ${layout.modelBrightness.toFixed(2)}×`;
}

function formatLivePosition(layout: PetLiveLayout): string {
  const { x, y, monitor } = layout.position;
  return `当前实际：X ${x}，Y ${y}，显示器 ${monitor}`;
}

function updateLiveReadouts(layout: PetLiveLayout): void {
  el.liveSize.textContent = formatLiveSize(layout);
  el.liveScale.textContent = formatLiveScale(layout);
  el.liveBrightness.textContent = formatLiveBrightness(layout);
  el.livePosition.textContent = formatLivePosition(layout);
}

function syncLayoutInputsFromLive(layout: PetLiveLayout): void {
  if (!focusedLayoutFields.has('window-width')) {
    el.windowWidth.value = String(layout.windowWidth);
  }
  if (!focusedLayoutFields.has('window-height')) {
    el.windowHeight.value = String(layout.windowHeight);
  }
  if (!focusedLayoutFields.has('model-scale')) {
    el.modelScale.value = String(layout.modelScale);
    el.modelScaleValue.textContent = layout.modelScale.toFixed(2);
  }
  if (!focusedLayoutFields.has('model-brightness')) {
    el.modelBrightness.value = String(layout.modelBrightness);
    el.modelBrightnessValue.textContent = layout.modelBrightness.toFixed(2);
  }
  if (!focusedLayoutFields.has('pos-x')) {
    el.posX.value = String(layout.position.x);
  }
  if (!focusedLayoutFields.has('pos-y')) {
    el.posY.value = String(layout.position.y);
  }
  if (!focusedLayoutFields.has('pos-monitor')) {
    el.posMonitor.value = String(layout.position.monitor);
  }
}

async function refreshLiveLayout(): Promise<void> {
  const layout = await api?.pet?.getLiveLayout?.();
  if (!layout) return;
  updateLiveReadouts(layout);
  syncLayoutInputsFromLive(layout);
}

function scheduleConfigPreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    void applyConfigPreview();
  }, 120);
}

async function applyConfigPreview(): Promise<void> {
  if (!api?.pet?.previewDesktopConfig) return;
  try {
    const config = readForm();
    const layout = await api.pet.previewDesktopConfig(config);
    updateLiveReadouts(layout);
  } catch (error) {
    console.warn('[Settings] Config preview failed:', error);
  }
}

function bindLayoutLiveControls(): void {
  const layoutInputs: (HTMLElement | null)[] = [
    el.windowWidth,
    el.windowHeight,
    el.modelScale,
    el.modelBrightness,
    el.posX,
    el.posY,
    el.posMonitor,
  ];

  for (const input of layoutInputs) {
    if (!input) continue;
    input.addEventListener('focus', () => focusedLayoutFields.add(input.id));
    input.addEventListener('blur', () => {
      focusedLayoutFields.delete(input.id);
      void refreshLiveLayout();
    });
    input.addEventListener('input', scheduleConfigPreview);
    input.addEventListener('change', scheduleConfigPreview);
  }
}

function startLivePolling(): void {
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = setInterval(() => {
    void refreshDisplayScaleFactor().then(() => refreshLiveLayout());
  }, 300);
}

function stopLivePolling(): void {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

function setStatus(text: string, isError = false): void {
  el.status.textContent = text;
  el.status.classList.toggle('is-error', isError);
}

function selectedModelFileName(): string | null {
  return el.modelFile.value.trim() || null;
}

async function reloadSequenceSummaries(modelFileName?: string | null): Promise<void> {
  const target = modelFileName !== undefined ? modelFileName : selectedModelFileName();
  sequenceSummaries = (await api?.pet?.listClickSequences?.(target)) ?? [];
}

async function applyModelSpecificSettings(modelFileName: string | null): Promise<void> {
  if (!api?.pet?.getConfigForModel) {
    return;
  }
  const config = normalizePetDesktopConfig(
    await api.pet.getConfigForModel(modelFileName)
  );
  draft = { ...draft!, ...config, modelFileName: config.modelFileName };
  setModelScaleInputs(config.modelScale);
  el.sourceAnimationFps.value = String(config.sourceAnimationFps);
  el.playbackSpeed.value = String(config.playbackSpeed);
  el.playbackSpeedValue.textContent = config.playbackSpeed.toFixed(2);
  el.modelBrightness.value = String(config.modelBrightness);
  el.modelBrightnessValue.textContent = config.modelBrightness.toFixed(2);
  await reloadSequenceSummaries(modelFileName);
  renderPoolList();
  populateActiveSequenceSelect(config.clickAnimation.activeSequenceId);
  editingSequenceId = null;
  updateSequenceEditorVisibility();
  setStatus(`已加载模型「${modelFileName ?? '自动'}」的独立设置`);
}

function populateActiveSequenceSelect(activeId: string | null): void {
  const prev = el.activeSequenceSelect.value;
  el.activeSequenceSelect.innerHTML = '';
  const randomOpt = document.createElement('option');
  randomOpt.value = '';
  randomOpt.textContent = '随机（按权重）';
  el.activeSequenceSelect.appendChild(randomOpt);

  for (const seq of sequenceSummaries) {
    const opt = document.createElement('option');
    opt.value = seq.id;
    opt.textContent = seq.name;
    el.activeSequenceSelect.appendChild(opt);
  }

  const target = activeId ?? prev;
  if (target && sequenceSummaries.some((s) => s.id === target)) {
    el.activeSequenceSelect.value = target;
  } else {
    el.activeSequenceSelect.value = '';
  }
}

function updateSequenceEditorVisibility(): void {
  el.sequenceEditor.hidden = !editingSequenceId;
}

/** 序列编辑器下拉：模型全部剪辑，并保证当前步已选剪辑在列表中 */
function getSequenceEditorClipNames(currentClip?: string): string[] {
  const names = new Set(clipNames);
  if (currentClip?.trim()) {
    names.add(currentClip.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function poolMapFromConfig(config: PetDesktopConfig): Map<string, ClickAnimationPoolEntry> {
  const map = new Map<string, ClickAnimationPoolEntry>();
  for (const entry of config.clickAnimation.pool) {
    if (!parseSequencePoolKey(entry.clipName)) {
      map.set(entry.clipName, entry);
    }
  }
  return map;
}

function sequencePoolEntryFromConfig(
  config: PetDesktopConfig,
  sequenceId: string
): ClickAnimationPoolEntry {
  const key = sequencePoolKey(sequenceId);
  return (
    config.clickAnimation.pool.find((e) => e.clipName === key) ?? {
      clipName: key,
      weight: 0,
    }
  );
}

function renderPoolList(): void {
  if (!draft) return;
  const map = poolMapFromConfig(draft);
  el.poolList.innerHTML = '';

  for (const name of clipNames) {
    const entry = map.get(name) ?? { clipName: name, weight: 0 };
    const row = document.createElement('div');
    row.className = 'pool-row';

    const checkLabel = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = entry.weight > 0;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'clip-name';
    nameSpan.textContent = name;
    nameSpan.title = name;
    checkLabel.append(check, nameSpan);

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0';
    weightInput.max = '100';
    weightInput.step = '1';
    weightInput.value = String(entry.weight);
    weightInput.disabled = !check.checked;

    check.addEventListener('change', () => {
      weightInput.disabled = !check.checked;
      if (check.checked && Number(weightInput.value) <= 0) {
        weightInput.value = '10';
      }
      scheduleConfigPreview();
    });
    weightInput.addEventListener('input', scheduleConfigPreview);
    weightInput.addEventListener('change', scheduleConfigPreview);

    row.append(checkLabel, weightInput);
    el.poolList.appendChild(row);
  }

  renderSequencePoolList();
  renderStartLoopEndPanel();
}

function renderSequencePoolList(): void {
  if (!draft) return;
  el.sequencePoolList.innerHTML = '';

  if (sequenceSummaries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint hint--inline';
    empty.textContent = '暂无序列，点击下方「新建序列」';
    el.sequencePoolList.appendChild(empty);
    return;
  }

  for (const seq of sequenceSummaries) {
    const entry = sequencePoolEntryFromConfig(draft, seq.id);
    const row = document.createElement('div');
    row.className = 'pool-row sequence-pool-row';
    row.dataset.sequenceId = seq.id;

    const checkLabel = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = entry.weight > 0;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'clip-name';
    nameSpan.textContent = seq.name;
    nameSpan.title = `${seq.name} (${seq.id})`;
    checkLabel.append(check, nameSpan);

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0';
    weightInput.max = '100';
    weightInput.step = '1';
    weightInput.value = String(entry.weight);
    weightInput.disabled = !check.checked;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn--secondary btn--compact';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => {
      selectSequenceForEditing(seq.id);
    });

    check.addEventListener('change', () => {
      weightInput.disabled = !check.checked;
      if (check.checked && Number(weightInput.value) <= 0) {
        weightInput.value = '10';
      }
      scheduleConfigPreview();
    });
    weightInput.addEventListener('input', scheduleConfigPreview);
    weightInput.addEventListener('change', scheduleConfigPreview);

    row.append(checkLabel, weightInput, editBtn);
    el.sequencePoolList.appendChild(row);
  }
}

function selectSequenceForEditing(id: string): void {
  editingSequenceId = id;
  el.sequenceEditor.hidden = false;
  void loadSequenceIntoEditor(id);
}

function readClipPoolFromUi(): ClickAnimationPoolEntry[] {
  const rows = el.poolList.querySelectorAll('.pool-row');
  const pool: ClickAnimationPoolEntry[] = [];
  rows.forEach((row) => {
    const check = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const weightInput = row.querySelector<HTMLInputElement>('input[type="number"]');
    const name = row.querySelector('.clip-name')?.textContent ?? '';
    if (!check?.checked || !name) return;
    pool.push({
      clipName: name,
      weight: Math.max(0, Number(weightInput?.value) || 0),
    });
  });
  return pool;
}

function readSequencePoolFromUi(): ClickAnimationPoolEntry[] {
  const rows = el.sequencePoolList.querySelectorAll('.sequence-pool-row');
  const pool: ClickAnimationPoolEntry[] = [];
  rows.forEach((row) => {
    const id = row.dataset.sequenceId;
    if (!id) return;
    const check = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const weightInput = row.querySelector<HTMLInputElement>('input[type="number"]');
    if (!check?.checked) return;
    pool.push({
      clipName: sequencePoolKey(id),
      weight: Math.max(0, Number(weightInput?.value) || 0),
    });
  });
  return pool;
}

function readPoolFromUi(): ClickAnimationPoolEntry[] {
  return [...readClipPoolFromUi(), ...readSequencePoolFromUi()];
}

function ensureSequenceInPool(sequenceId: string, weight = 0): void {
  if (!draft) return;
  const key = sequencePoolKey(sequenceId);
  if (!draft.clickAnimation.pool.some((e) => e.clipName === key)) {
    draft.clickAnimation.pool.push({ clipName: key, weight });
  }
}

function removeSequenceFromPool(sequenceId: string): void {
  if (!draft) return;
  const key = sequencePoolKey(sequenceId);
  draft.clickAnimation.pool = draft.clickAnimation.pool.filter((e) => e.clipName !== key);
}

function getStartLoopEndTriplets(): StartLoopEndTriplet[] {
  return detectStartLoopEndTriplets(clipNames);
}

function renderStartLoopEndPanel(): void {
  const triplets = getStartLoopEndTriplets();
  el.startLoopEndPanel.hidden = triplets.length === 0;
  el.startLoopEndList.innerHTML = '';

  for (const triplet of triplets) {
    const row = document.createElement('div');
    row.className = 'sle-row';

    const name = document.createElement('div');
    name.className = 'sle-name';
    name.textContent = `${triplet.startClipName}  →  ${triplet.loopClipName}  →  ${triplet.endClipName}`;

    const loopCount = document.createElement('input');
    loopCount.type = 'number';
    loopCount.min = '1';
    loopCount.max = '99';
    loopCount.value = '2';
    loopCount.title = 'Loop 重复次数';

    const loopLabel = document.createElement('label');
    loopLabel.append('Loop×', loopCount);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary btn--compact';
    btn.textContent = '合并为序列';
    btn.addEventListener('click', () => {
      void createSequenceFromTriplet(triplet, Number(loopCount.value) || 2);
    });

    row.append(name, loopLabel, btn);
    el.startLoopEndList.appendChild(row);
  }
}

async function createSequenceFromTriplet(
  triplet: StartLoopEndTriplet,
  loopCount: number
): Promise<void> {
  if (!api?.pet?.createClickSequence || !api.pet.saveClickSequence) {
    setStatus('无法创建序列', true);
    return;
  }
  const displayName = triplet.displayLabel;
  const preferredId = slugifySequenceId(displayName);
  const existing = sequenceSummaries.find((s) => s.id === preferredId);

  try {
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const created = await api.pet.createClickSequence(displayName, selectedModelFileName());
      id = created.id;
    }

    const steps = buildFlatStepsFromTriplet(triplet, loopCount);

    await api.pet.saveClickSequence(
      id,
      {
        version: 1,
        name: displayName,
        steps,
      },
      selectedModelFileName()
    );

    await reloadSequenceSummaries(selectedModelFileName());
    ensureSequenceInPool(id, 10);
    renderSequencePoolList();
    const seqRow = el.sequencePoolList.querySelector<HTMLElement>(
      `[data-sequence-id="${id}"]`
    );
    const seqCheck = seqRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const seqWeight = seqRow?.querySelector<HTMLInputElement>('input[type="number"]');
    if (seqCheck) {
      seqCheck.checked = true;
      if (seqWeight) {
        seqWeight.disabled = false;
        if (Number(seqWeight.value) <= 0) {
          seqWeight.value = '10';
        }
      }
    }
    selectSequenceForEditing(id);
    renderSequenceList(steps);
    scheduleConfigPreview();
    setStatus(`已合并为序列「${displayName}」并加入随机池（与上方单段动画共同参与权重随机）`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : '生成序列失败', true);
  }
}

function renderSequenceList(steps: ClickAnimationSequenceStep[]): void {
  el.sequenceList.innerHTML = '';
  const allClips = getSequenceEditorClipNames();
  const list =
    steps.length > 0
      ? steps
      : [{ clipName: allClips[0] ?? '', delayAfterMs: 0 }];
  list.forEach((step, index) => {
    el.sequenceList.appendChild(createSequenceRow(step, index));
  });
}

function createSequenceRow(step: ClickAnimationSequenceStep, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'seq-row';

  const indexLabel = document.createElement('span');
  indexLabel.textContent = `${index + 1}.`;

  const select = document.createElement('select');
  select.title = step.clipName;
  const options = getSequenceEditorClipNames(step.clipName);
  for (const name of options) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === step.clipName) opt.selected = true;
    select.appendChild(opt);
  }
  if (options.length === 0) {
    const opt = document.createElement('option');
    opt.value = step.clipName || '';
    opt.textContent = step.clipName || '（模型暂无动画列表，请先加载宠物）';
    opt.selected = true;
    select.appendChild(opt);
  }

  const delay = document.createElement('input');
  delay.type = 'number';
  delay.min = '0';
  delay.step = '100';
  delay.value = String(step.delayAfterMs ?? 0);
  delay.title = '播完后等待 (ms)';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn--icon';
  removeBtn.textContent = '删';
  removeBtn.addEventListener('click', () => {
    row.remove();
    reindexSequenceRows();
  });

  row.append(indexLabel, select, delay, removeBtn);
  return row;
}

function reindexSequenceRows(): void {
  const rows = el.sequenceList.querySelectorAll('.seq-row');
  rows.forEach((row, i) => {
    const label = row.querySelector('span');
    if (label) label.textContent = `${i + 1}.`;
  });
}

function readSequenceFromUi(): ClickAnimationSequenceStep[] {
  const rows = el.sequenceList.querySelectorAll('.seq-row');
  const steps: ClickAnimationSequenceStep[] = [];
  rows.forEach((row) => {
    const select = row.querySelector('select');
    const delay = row.querySelector<HTMLInputElement>('input[type="number"]');
    const clipName = select?.value ?? '';
    if (!clipName) return;
    steps.push({
      clipName,
      delayAfterMs: Math.max(0, Number(delay?.value) || 0),
    });
  });
  return steps;
}

async function loadSequenceIntoEditor(id: string): Promise<void> {
  const file = await api?.pet?.getClickSequence?.(id, selectedModelFileName());
  if (!file) {
    el.sequenceName.value = id;
    renderSequenceList([]);
    return;
  }
  el.sequenceName.value = file.name;
  renderSequenceList(file.steps);
}

async function saveCurrentSequenceFile(): Promise<boolean> {
  if (!editingSequenceId || !api?.pet?.saveClickSequence) {
    return false;
  }
  const steps = readSequenceFromUi();
  if (steps.length === 0) {
    setStatus('序列至少包含一步', true);
    return false;
  }
  const name = el.sequenceName.value.trim() || editingSequenceId;
  await api.pet.saveClickSequence(
    editingSequenceId,
    {
      version: 1,
      name,
      steps,
    },
    selectedModelFileName()
  );
  await reloadSequenceSummaries(selectedModelFileName());
  populateActiveSequenceSelect(el.activeSequenceSelect.value || null);
  renderSequencePoolList();
  return true;
}

function populateModelSelect(selectedFileName: string | null): void {
  const prev = el.modelFile.value;
  el.modelFile.innerHTML = '';

  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = '自动（默认优先）';
  el.modelFile.appendChild(autoOpt);

  for (const name of modelFileNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    el.modelFile.appendChild(opt);
  }

  const target = selectedFileName ?? prev;
  if (target && modelFileNames.some((n) => n === target)) {
    el.modelFile.value = target;
  } else {
    el.modelFile.value = '';
  }
}

function fillForm(config: PetDesktopConfig): void {
  draft = config;
  populateModelSelect(config.modelFileName);
  el.windowWidth.value = String(config.windowWidth);
  el.windowHeight.value = String(config.windowHeight);
  setModelScaleInputs(config.modelScale);
  el.sourceAnimationFps.value = String(config.sourceAnimationFps);
  el.playbackSpeed.value = String(config.playbackSpeed);
  el.playbackSpeedValue.textContent = config.playbackSpeed.toFixed(2);
  el.modelBrightness.value = String(config.modelBrightness);
  el.modelBrightnessValue.textContent = config.modelBrightness.toFixed(2);
  el.posX.value = String(config.position.x);
  el.posY.value = String(config.position.y);
  renderPoolList();
  populateActiveSequenceSelect(config.clickAnimation.activeSequenceId);
  editingSequenceId = null;
  updateSequenceEditorVisibility();
}

function readForm(): PetDesktopConfig {
  const activeId = el.activeSequenceSelect.value || null;
  const modelFileName = el.modelFile.value.trim() || null;
  return normalizePetDesktopConfig({
    modelFileName,
    windowWidth: clampWindowWidth(Number(el.windowWidth.value)),
    windowHeight: clampWindowHeight(Number(el.windowHeight.value)),
    modelScale: unapplyDisplayScaleFromModelScale(
      Number(el.modelScale.value),
      displayScaleFactor
    ),
    sourceAnimationFps: clampSourceAnimationFps(Number(el.sourceAnimationFps.value)),
    playbackSpeed: clampPlaybackSpeed(Number(el.playbackSpeed.value)),
    modelBrightness: clampModelBrightness(Number(el.modelBrightness.value)),
    position: {
      x: Math.round(Number(el.posX.value) || 0),
      y: Math.round(Number(el.posY.value) || 0),
      monitor: Number(el.posMonitor.value) || 0,
    },
    clickAnimation: {
      pool: readPoolFromUi(),
      activeSequenceId: activeId,
    },
  });
}

async function waitForAnimationClipsAfterModelChange(
  previousClipNames: string[],
  maxAttempts = 24,
  intervalMs = 250
): Promise<string[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const clips = (await api?.pet?.getAnimationClips()) ?? [];
    if (
      clips.length > 0 &&
      (clips.length !== previousClipNames.length ||
        clips.some((name, index) => name !== previousClipNames[index]))
    ) {
      return clips;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return (await api?.pet?.getAnimationClips()) ?? [];
}

async function reloadSettingsAfterApply(applied: PetDesktopConfig): Promise<void> {
  const previousModel = savedConfig?.modelFileName ?? null;
  const modelChanged = previousModel !== applied.modelFileName;
  const previousClips = clipNames;

  savedConfig = applied;
  draft = applied;

  if (modelChanged) {
    modelFileNames = (await api?.pet?.listModels?.()) ?? modelFileNames;
    clipNames = await waitForAnimationClipsAfterModelChange(previousClips);
  } else {
    const clips = (await api?.pet?.getAnimationClips()) ?? [];
    if (clips.length > 0) {
      clipNames = clips;
    }
  }

  await reloadSequenceSummaries(applied.modelFileName);
  populateModelSelect(applied.modelFileName);
  el.windowWidth.value = String(applied.windowWidth);
  el.windowHeight.value = String(applied.windowHeight);
  setModelScaleInputs(applied.modelScale);
  el.sourceAnimationFps.value = String(applied.sourceAnimationFps);
  el.playbackSpeed.value = String(applied.playbackSpeed);
  el.playbackSpeedValue.textContent = applied.playbackSpeed.toFixed(2);
  el.modelBrightness.value = String(applied.modelBrightness);
  el.modelBrightnessValue.textContent = applied.modelBrightness.toFixed(2);
  el.posX.value = String(applied.position.x);
  el.posY.value = String(applied.position.y);
  await loadDisplays(applied.position.monitor);
  renderPoolList();
  populateActiveSequenceSelect(applied.clickAnimation.activeSequenceId);
  editingSequenceId = null;
  updateSequenceEditorVisibility();
  focusedLayoutFields.clear();
  await refreshLiveLayout();
}

async function loadDisplays(selectedMonitor: number): Promise<void> {
  el.posMonitor.innerHTML = '';
  const displays = (await api?.window?.getDisplays?.()) ?? [];
  for (const d of displays) {
    const opt = document.createElement('option');
    opt.value = String(d.id);
    opt.textContent = d.isPrimary
      ? `主显示器 (${d.bounds.width}x${d.bounds.height})`
      : `显示器 ${d.id} (${d.bounds.width}x${d.bounds.height})`;
    if (d.id === selectedMonitor) opt.selected = true;
    el.posMonitor.appendChild(opt);
  }
}

async function init(): Promise<void> {
  if (!api?.pet?.getDesktopConfig) {
    setStatus('无法连接主进程 API', true);
    return;
  }

  modelFileNames = (await api.pet.listModels?.()) ?? [];
  clipNames = (await api.pet.getAnimationClips()) ?? [];
  await refreshDisplayScaleFactor();
  const config = normalizePetDesktopConfig(await api.pet.getDesktopConfig());
  await reloadSequenceSummaries(config.modelFileName);
  savedConfig = config;
  await loadDisplays(config.position.monitor);
  fillForm(config);
  bindLayoutLiveControls();
  startLivePolling();
  await refreshLiveLayout();
  setStatus(`已加载 ${clipNames.length} 个动画剪辑；布局与播放参数可实时预览`);
}

window.addEventListener('beforeunload', () => {
  stopLivePolling();
  if (previewTimer) clearTimeout(previewTimer);
});

el.modelFile.addEventListener('change', () => {
  void applyModelSpecificSettings(selectedModelFileName()).then(() => {
    scheduleConfigPreview();
  });
});

el.modelScale.addEventListener('input', () => {
  el.modelScaleValue.textContent = Number(el.modelScale.value).toFixed(2);
  scheduleConfigPreview();
});

el.sourceAnimationFps.addEventListener('input', scheduleConfigPreview);
el.sourceAnimationFps.addEventListener('change', scheduleConfigPreview);

el.playbackSpeed.addEventListener('input', () => {
  el.playbackSpeedValue.textContent = Number(el.playbackSpeed.value).toFixed(2);
  scheduleConfigPreview();
});

el.modelBrightness.addEventListener('input', () => {
  el.modelBrightnessValue.textContent = Number(el.modelBrightness.value).toFixed(2);
  scheduleConfigPreview();
});

el.activeSequenceSelect.addEventListener('change', scheduleConfigPreview);

el.btnUsePos.addEventListener('click', () => {
  void (async () => {
    const pos = await api?.window?.getPosition?.();
    if (!pos) return;
    el.posX.value = String(pos.x);
    el.posY.value = String(pos.y);
    el.posMonitor.value = String(pos.monitor);
    setStatus('已读取当前窗口位置');
    scheduleConfigPreview();
  })();
});

el.btnAddSeq.addEventListener('click', () => {
  const step: ClickAnimationSequenceStep = {
    clipName: getSequenceEditorClipNames()[0] ?? '',
    delayAfterMs: 0,
  };
  el.sequenceList.appendChild(
    createSequenceRow(step, el.sequenceList.querySelectorAll('.seq-row').length)
  );
});

el.btnNewSeq.addEventListener('click', () => {
  void (async () => {
    if (!api?.pet?.createClickSequence) {
      setStatus('无法创建序列', true);
      return;
    }
    try {
      const { id, file } = await api.pet.createClickSequence(
        '新序列',
        selectedModelFileName()
      );
      await reloadSequenceSummaries(selectedModelFileName());
      ensureSequenceInPool(id, 0);
      renderSequencePoolList();
      selectSequenceForEditing(id);
      el.sequenceName.value = file.name;
      renderSequenceList(file.steps);
      setStatus(`已新建序列（${id}.json），勾选上方可参与随机`);
    } catch (error) {
      console.error(error);
      const msg =
        error instanceof Error ? error.message : '新建序列失败，请确认模型目录可写';
      setStatus(msg, true);
    }
  })();
});

el.btnSaveSeq.addEventListener('click', () => {
  void (async () => {
    try {
      const ok = await saveCurrentSequenceFile();
      if (ok) {
        setStatus('序列已保存到模型目录');
      }
    } catch (error) {
      console.error(error);
      setStatus('序列保存失败', true);
    }
  })();
});

el.btnDeleteSeq.addEventListener('click', () => {
  void (async () => {
    if (!editingSequenceId || !api?.pet?.deleteClickSequence) {
      return;
    }
    if (!confirm(`确定删除序列「${el.sequenceName.value || editingSequenceId}」？`)) {
      return;
    }
    const deletedId = editingSequenceId;
    await api.pet.deleteClickSequence(deletedId, selectedModelFileName());
    removeSequenceFromPool(deletedId);
    editingSequenceId = null;
    await reloadSequenceSummaries(selectedModelFileName());
    if (el.activeSequenceSelect.value === deletedId) {
      el.activeSequenceSelect.value = '';
    }
    populateActiveSequenceSelect(el.activeSequenceSelect.value || null);
    renderSequencePoolList();
    updateSequenceEditorVisibility();
    setStatus('序列已删除');
  })();
});

el.btnCancel.addEventListener('click', () => {
  void (async () => {
    if (savedConfig && api?.pet?.previewDesktopConfig) {
      try {
        await api.pet.previewDesktopConfig(savedConfig);
      } catch {
        // ignore
      }
    }
    window.close();
  })();
});

el.btnSave.addEventListener('click', () => {
  void (async () => {
    try {
      if (editingSequenceId && readSequenceFromUi().length > 0) {
        const saved = await saveCurrentSequenceFile();
        if (!saved) return;
      }
      const config = readForm();
      const applied = normalizePetDesktopConfig(await api!.pet.setDesktopConfig(config));
      await reloadSettingsAfterApply(applied);
      setStatus('已保存并应用到宠物窗口');
    } catch (error) {
      console.error(error);
      setStatus('保存失败', true);
    }
  })();
});

void init();

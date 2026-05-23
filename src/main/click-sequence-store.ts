import * as fs from 'fs';

import * as path from 'path';

import {

  createEmptySequenceFile,

  normalizeClickAnimationSequenceFile,

  slugifySequenceId,

  type ClickAnimationSequenceFile,

  type ClickAnimationSequenceSummary,

} from '../shared/config/click-animation-sequence-file';

import type {
  ClickAnimationSequenceStep,
  ClickAnimationSettings,
} from '../shared/config/pet-desktop-settings';
import { parseSequencePoolKey } from '../shared/config/pet-desktop-settings';

import { getLogger } from './logger';

import { loadPetDesktopConfig } from './pet-desktop-config-store';

import {
  resolveClickSequencesDirectory,
  resolveLegacySharedClickSequencesDirectory,
} from './utils/pet-model-path';



const logger = getLogger('click-sequence-store');



function resolveModelFileName(modelFileName?: string | null): string | null {

  if (modelFileName !== undefined) {

    return modelFileName;

  }

  try {

    return loadPetDesktopConfig().modelFileName;

  } catch {

    return null;

  }

}



const SAFE_ID = /^[\w-]+$/;

export function collectReferencedSequenceIds(
  clickAnimation: Pick<ClickAnimationSettings, 'pool' | 'activeSequenceId'>
): string[] {
  const ids = new Set<string>();
  if (clickAnimation.activeSequenceId?.trim()) {
    ids.add(clickAnimation.activeSequenceId.trim());
  }
  for (const entry of clickAnimation.pool) {
    const seqId = parseSequencePoolKey(entry.clipName);
    if (seqId) {
      ids.add(seqId);
    }
  }
  return [...ids];
}

/** 将旧版共用 click-sequences/ 中本模型引用的序列复制到 {basename}.click-sequences/ */
export function migrateLegacySequencesForModel(
  modelFileName: string | null | undefined,
  clickAnimation: Pick<ClickAnimationSettings, 'pool' | 'activeSequenceId'>
): void {
  const legacyDir = resolveLegacySharedClickSequencesDirectory(modelFileName);
  const newDir = resolveClickSequencesDirectory(modelFileName);
  if (!legacyDir || !newDir || !fs.existsSync(legacyDir)) {
    return;
  }

  const poolSeqIds = new Set(
    clickAnimation.pool
      .map((e) => parseSequencePoolKey(e.clipName))
      .filter((id): id is string => !!id)
  );

  for (const id of collectReferencedSequenceIds(clickAnimation)) {
    // 仅迁移随机池 seq: 引用的序列；避免 activeSequenceId 误指共用目录时被复制到错误模型
    if (!poolSeqIds.has(id)) {
      continue;
    }
    if (!SAFE_ID.test(id)) {
      continue;
    }
    const src = path.join(legacyDir, `${id}.json`);
    const dest = path.join(newDir, `${id}.json`);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.mkdirSync(newDir, { recursive: true });
      fs.copyFileSync(src, dest);
      logger.info('Migrated click sequence from shared folder to per-model dir', {
        id,
        modelFileName,
      });
    }
  }
}

/** 移除指向其它模型共用目录/本模型无文件的序列引用 */
export function sanitizeClickAnimationForModel(
  clickAnimation: ClickAnimationSettings,
  modelFileName?: string | null
): ClickAnimationSettings {
  const pool = clickAnimation.pool.filter((entry) => {
    const seqId = parseSequencePoolKey(entry.clipName);
    if (!seqId) {
      return true;
    }
    const filePath = sequenceFilePath(seqId, modelFileName);
    return !!filePath && fs.existsSync(filePath);
  });

  let activeSequenceId = clickAnimation.activeSequenceId;
  if (activeSequenceId) {
    const filePath = sequenceFilePath(activeSequenceId, modelFileName);
    if (!filePath || !fs.existsSync(filePath)) {
      activeSequenceId = null;
    }
  }

  return {
    pool,
    activeSequenceId,
  };
}

function ensureSequencesDirectory(modelFileName?: string | null): string | null {

  const dir = resolveClickSequencesDirectory(resolveModelFileName(modelFileName));

  if (!dir) {

    return null;

  }

  if (!fs.existsSync(dir)) {

    fs.mkdirSync(dir, { recursive: true });

  }

  return dir;

}



function sequenceFilePath(id: string, modelFileName?: string | null): string | null {

  if (!SAFE_ID.test(id)) {

    return null;

  }

  const dir = ensureSequencesDirectory(modelFileName);

  if (!dir) {

    return null;

  }

  return path.join(dir, `${id}.json`);

}



export function listClickSequences(

  modelFileName?: string | null

): ClickAnimationSequenceSummary[] {

  const dir = ensureSequencesDirectory(modelFileName);

  if (!dir || !fs.existsSync(dir)) {

    return [];

  }



  const summaries: ClickAnimationSequenceSummary[] = [];

  for (const file of fs.readdirSync(dir)) {

    if (!file.toLowerCase().endsWith('.json')) {

      continue;

    }

    const id = file.slice(0, -5);

    if (!SAFE_ID.test(id)) {

      continue;

    }

    const loaded = loadClickSequence(id, modelFileName);

    summaries.push({

      id,

      name: loaded?.name ?? id,

    });

  }



  return summaries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

}



export function loadClickSequence(

  id: string,

  modelFileName?: string | null

): ClickAnimationSequenceFile | null {

  const filePath = sequenceFilePath(id, modelFileName);

  if (!filePath || !fs.existsSync(filePath)) {

    return null;

  }

  try {

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;

    return normalizeClickAnimationSequenceFile(raw);

  } catch (error) {

    logger.warn(`Failed to load click sequence ${id}`, error);

    return null;

  }

}



export function loadClickSequenceSteps(

  id: string,

  modelFileName?: string | null

): ClickAnimationSequenceStep[] {

  return loadClickSequence(id, modelFileName)?.steps ?? [];

}



export function saveClickSequence(

  id: string,

  file: ClickAnimationSequenceFile,

  modelFileName?: string | null

): ClickAnimationSequenceFile {

  const normalized = normalizeClickAnimationSequenceFile(file);

  if (!normalized) {

    throw new Error('Invalid sequence data');

  }



  const filePath = sequenceFilePath(id, modelFileName);

  if (!filePath) {

    throw new Error('Invalid sequence id or model directory unavailable');

  }



  ensureSequencesDirectory(modelFileName);

  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');

  logger.info(`Click sequence saved: ${id}.json`);

  return normalized;

}



export function deleteClickSequence(

  id: string,

  modelFileName?: string | null

): boolean {

  const filePath = sequenceFilePath(id, modelFileName);

  if (!filePath || !fs.existsSync(filePath)) {

    return false;

  }

  fs.unlinkSync(filePath);

  logger.info(`Click sequence deleted: ${id}.json`);

  return true;

}



export function createClickSequenceId(

  displayName: string,

  modelFileName?: string | null

): string {

  const base = slugifySequenceId(displayName);

  let candidate = base;

  let n = 1;

  while (loadClickSequence(candidate, modelFileName)) {

    candidate = `${base}-${n}`;

    n += 1;

  }

  return candidate;

}



export function createNewClickSequence(

  displayName: string,

  modelFileName?: string | null

): {

  id: string;

  file: ClickAnimationSequenceFile;

} {

  const id = createClickSequenceId(displayName, modelFileName);

  const file = createEmptySequenceFile(displayName.trim() || '新序列');

  saveClickSequence(id, file, modelFileName);

  return { id, file };

}



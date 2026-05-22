import * as fs from 'fs';

import * as path from 'path';

import {

  createEmptySequenceFile,

  normalizeClickAnimationSequenceFile,

  slugifySequenceId,

  type ClickAnimationSequenceFile,

  type ClickAnimationSequenceSummary,

} from '../shared/config/click-animation-sequence-file';

import type { ClickAnimationSequenceStep } from '../shared/config/pet-desktop-settings';

import { getLogger } from './logger';

import { loadPetDesktopConfig } from './pet-desktop-config-store';

import { resolveClickSequencesDirectory } from './utils/pet-model-path';



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



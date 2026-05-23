/**
 * 解析宠物 3D 模型文件路径
 * 支持开发/打包环境，以及自定义文件名（任意 .glb）
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

const PREFERRED_MODEL_NAMES = ['default-pet.glb', 'pet-default.glb', 'pet.glb'];

/**
 * 收集可能存放模型的目录（按优先级）
 */
function getModelSearchDirs(): string[] {
  const dirs: string[] = [];

  // 开发：项目根目录 assets/models
  dirs.push(path.join(app.getAppPath(), 'assets', 'models'));

  // 打包：extraResources 中的 models
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'models'));
  }

  // 相对于编译后主进程文件
  dirs.push(path.join(__dirname, '../../../assets/models'));

  return [...new Set(dirs)];
}

function listGlbFilesInDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * 列出所有可用 .glb 模型文件名（去重、排序）
 */
export function listPetModelFileNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const dir of getModelSearchDirs()) {
    for (const name of listGlbFilesInDir(dir)) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      names.push(name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * 在目录中查找模型文件（未指定文件名时使用首选名或首个 .glb）
 */
function findModelInDir(dir: string, preferredFileName?: string | null): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }

  if (preferredFileName) {
    const exact = path.join(dir, preferredFileName);
    if (fs.existsSync(exact)) {
      return exact;
    }
    const match = listGlbFilesInDir(dir).find(
      (f) => f.toLowerCase() === preferredFileName.toLowerCase()
    );
    if (match) {
      return path.join(dir, match);
    }
    return null;
  }

  for (const name of PREFERRED_MODEL_NAMES) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  const glbFiles = listGlbFilesInDir(dir);
  if (glbFiles.length > 0) {
    return path.join(dir, glbFiles[0]!);
  }

  return null;
}

/**
 * 解析磁盘上的模型绝对路径
 */
/** @deprecated 旧版共用目录名，仅用于迁移 */
export const LEGACY_SHARED_CLICK_SEQUENCES_DIR = 'click-sequences';

/** 与 {basename}.pet-settings.json 对应：{basename}.click-sequences */
export const CLICK_SEQUENCES_DIR_SUFFIX = '.click-sequences';

/**
 * 点击动画序列 JSON：与 .glb 同目录，{basename}.click-sequences/{id}.json
 * （不再使用 models/click-sequences/ 共用目录，避免裘卡等模型的序列被其它模型误用）
 */
export function resolveClickSequencesDirectory(modelFileName?: string | null): string | null {
  const glbPath = resolvePetModelFilePath(modelFileName);
  if (!glbPath) {
    return null;
  }
  const base = path.basename(glbPath, path.extname(glbPath));
  return path.join(path.dirname(glbPath), `${base}${CLICK_SEQUENCES_DIR_SUFFIX}`);
}

/** 旧版共用目录：{models}/click-sequences（迁移用） */
export function resolveLegacySharedClickSequencesDirectory(
  modelFileName?: string | null
): string | null {
  const modelDir = resolvePetModelDirectory(modelFileName);
  if (!modelDir) {
    return null;
  }
  return path.join(modelDir, LEGACY_SHARED_CLICK_SEQUENCES_DIR);
}

/**
 * 各模型独立设置文件：与 .glb 同目录，名为 {basename}.pet-settings.json
 */
export function resolvePetModelSettingsFilePath(
  modelFileName?: string | null
): string | null {
  const glbPath = resolvePetModelFilePath(modelFileName);
  if (!glbPath) {
    return null;
  }
  const base = path.basename(glbPath, path.extname(glbPath));
  return path.join(path.dirname(glbPath), `${base}${PET_MODEL_SETTINGS_SUFFIX}`);
}

export const PET_MODEL_SETTINGS_SUFFIX = '.pet-settings.json';

/**
 * 当前加载的 .glb 所在目录（模型文件夹）
 */
export function resolvePetModelDirectory(modelFileName?: string | null): string | null {
  const filePath = resolvePetModelFilePath(modelFileName);
  return filePath ? path.dirname(filePath) : null;
}

export function resolvePetModelFilePath(modelFileName?: string | null): string | null {
  const preferred =
    typeof modelFileName === 'string' && modelFileName.trim()
      ? modelFileName.trim()
      : null;

  for (const dir of getModelSearchDirs()) {
    const found = findModelInDir(dir, preferred);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * 返回供 GLTFLoader 使用的 URL
 * - 开发模式（http://localhost）：返回 Vite 可访问的相对路径
 * - 生产模式（file://）：返回 file:// URL
 */
export function getPetModelLoadUrl(modelFileName?: string | null): string | null {
  const filePath = resolvePetModelFilePath(modelFileName);
  if (!filePath) {
    return null;
  }

  const isDev = !app.isPackaged;
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (isDev && rendererUrl?.startsWith('http')) {
    // Vite publicDir=assets → 使用绝对 URL，避免 GLTFLoader 相对路径解析失败
    const fileName = path.basename(filePath);
    const base = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`;
    return `${base}models/${encodeURIComponent(fileName)}`;
  }

  return pathToFileURL(filePath).href;
}

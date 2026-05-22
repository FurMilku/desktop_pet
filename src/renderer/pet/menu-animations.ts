/** 右键菜单中的可播放动画项 */
export interface PetMenuAnimation {
  id: string;
  /** 菜单显示名（与 GLB 剪辑原名一致） */
  label: string;
  clipName: string;
}

export function menuIdForClip(clipName: string): string {
  return `clip-${encodeURIComponent(clipName)}`;
}

export function parseMenuAnimationId(id: string): {
  kind: 'clip';
  value: string;
} | null {
  if (!id.startsWith('clip-')) {
    return null;
  }
  return { kind: 'clip', value: decodeURIComponent(id.slice('clip-'.length)) };
}

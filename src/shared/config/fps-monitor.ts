export type FpsMonitorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const FPS_MONITOR_POSITIONS: FpsMonitorPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

export const DEFAULT_FPS_MONITOR_POSITION: FpsMonitorPosition = 'top-left';

export const FPS_MONITOR_POSITION_LABELS: Record<FpsMonitorPosition, string> = {
  'top-left': '左上',
  'top-right': '右上',
  'bottom-left': '左下',
  'bottom-right': '右下',
};

export function normalizeFpsMonitorPosition(
  raw: string | null | undefined
): FpsMonitorPosition {
  if (raw && FPS_MONITOR_POSITIONS.includes(raw as FpsMonitorPosition)) {
    return raw as FpsMonitorPosition;
  }
  return DEFAULT_FPS_MONITOR_POSITION;
}

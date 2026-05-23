import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FPS_MONITOR_POSITION,
  normalizeFpsMonitorPosition,
} from '../../../src/shared/config/fps-monitor';

describe('fps-monitor', () => {
  it('defaults to top-left', () => {
    expect(DEFAULT_FPS_MONITOR_POSITION).toBe('top-left');
    expect(normalizeFpsMonitorPosition(undefined)).toBe('top-left');
  });

  it('normalizes valid positions', () => {
    expect(normalizeFpsMonitorPosition('bottom-right')).toBe('bottom-right');
  });

  it('rejects invalid positions', () => {
    expect(normalizeFpsMonitorPosition('center')).toBe('top-left');
  });
});

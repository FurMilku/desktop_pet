import { describe, expect, it } from 'vitest';

import { slugifySequenceId } from '../../../src/shared/config/click-animation-sequence-file';

describe('slugifySequenceId', () => {
  it('strips non-ascii characters for safe file ids', () => {
    expect(slugifySequenceId('新序列')).toBe('sequence');
    expect(slugifySequenceId('My Combo!')).toBe('my-combo');
    expect(slugifySequenceId('  hello world  ')).toBe('hello-world');
  });
});

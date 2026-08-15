import { describe, expect, it } from 'vitest';
import { INVALID_TRAIN_ID_ERROR, isValidTrainId, parseTrainId } from '@/lib/train-id';

describe('train-id', () => {
  it('accepts valid 4–5 digit IDs', () => {
    expect(isValidTrainId('1295')).toBe(true);
    expect(isValidTrainId('12951')).toBe(true);
    expect(isValidTrainId('00000')).toBe(true);
    expect(parseTrainId('12001')).toBe('12001');
  });

  it('rejects invalid IDs', () => {
    for (const raw of ['', 'abc', '123', '123456', '12ab3', '12951!', '12 951']) {
      expect(isValidTrainId(raw)).toBe(false);
      expect(parseTrainId(raw)).toBeNull();
    }
  });

  it('normalizes surrounding whitespace', () => {
    expect(parseTrainId('  12951  ')).toBe('12951');
    expect(isValidTrainId('\t12001\n')).toBe(true);
  });

  it('exposes a stable invalid-id error message', () => {
    expect(INVALID_TRAIN_ID_ERROR).toMatch(/4–5 digit/i);
  });
});

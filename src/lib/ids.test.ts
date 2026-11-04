import { describe, expect, it } from 'vitest';
import { newId } from './ids';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns UUIDv7 values', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(id).toMatch(UUID_V7);
  });

  it('returns increasing values when called back to back', () => {
    const a = newId();
    const b = newId();
    expect(a < b).toBe(true);

    const many = Array.from({ length: 1000 }, () => newId());
    expect([...many].sort()).toEqual(many);
    expect(new Set(many).size).toBe(many.length);
  });
});

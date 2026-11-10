// Map bounds (SP3 plan Task 11A): the API bbox wraps across the antimeridian (Review Focus 5,
// client side), and the kept bounds survive a storage that throws.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOUNDS, readSavedBounds, saveBounds, toApiBbox } from './map-view';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toApiBbox (Review Focus 5)', () => {
  it('wraps a west edge past −180', () => {
    expect(toApiBbox({ west: -190, south: 50, east: -150, north: 70 })).toEqual([
      170, 50, -150, 70,
    ]);
  });

  it('wraps an east edge past 180', () => {
    expect(toApiBbox({ west: 170, south: 50, east: 200, north: 70 })).toEqual([170, 50, -160, 70]);
  });

  it('covers every longitude when the span reaches 360°', () => {
    expect(toApiBbox({ west: -400, south: 10, east: 400, north: 60 })).toEqual([-180, 10, 180, 60]);
  });

  it('clamps latitudes to ±90', () => {
    expect(toApiBbox({ west: -10, south: -95, east: 10, north: 95 })).toEqual([-10, -90, 10, 90]);
  });

  it('keeps an ordinary box and an east edge on the antimeridian', () => {
    expect(toApiBbox({ west: -125, south: 24, east: -66, north: 50 })).toEqual([...DEFAULT_BOUNDS]);
    expect(toApiBbox({ west: 100, south: 0, east: 180, north: 10 })).toEqual([100, 0, 180, 10]);
  });
});

function memorySession(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k: string) => items.get(k) ?? null,
    key: (i: number) => [...items.keys()][i] ?? null,
    removeItem: (k: string) => void items.delete(k),
    setItem: (k: string, v: string) => void items.set(k, v),
  };
}

describe('saved bounds', () => {
  it('round-trips through sessionStorage', () => {
    const s = memorySession();
    vi.stubGlobal('sessionStorage', s);
    expect(readSavedBounds()).toBeNull();
    saveBounds([-110, 40, -100, 45]);
    expect(s.getItem('ee_map_bounds')).toBe('[-110,40,-100,45]');
    expect(readSavedBounds()).toEqual([-110, 40, -100, 45]);
  });

  it('ignores a garbled value', () => {
    const s = memorySession();
    s.setItem('ee_map_bounds', '{"west":1}');
    vi.stubGlobal('sessionStorage', s);
    expect(readSavedBounds()).toBeNull();
    s.setItem('ee_map_bounds', 'not json');
    expect(readSavedBounds()).toBeNull();
  });

  it('returns null and saves nothing when sessionStorage throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    vi.stubGlobal('sessionStorage', blocked);
    expect(readSavedBounds()).toBeNull();
    expect(() => saveBounds([-110, 40, -100, 45])).not.toThrow();
  });
});

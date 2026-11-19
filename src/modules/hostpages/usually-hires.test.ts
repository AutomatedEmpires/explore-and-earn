// "Usually hires": the circular window of 1-3 months with the most first-publish dates (SP2
// spec section 8.5, Task 32).
import { describe, expect, it } from 'vitest';
import { usuallyHires } from './usually-hires';

const dates = (...isos: string[]) => isos.map((iso) => new Date(iso));

describe('usuallyHires', () => {
  it('names the run of months a host hires in', () => {
    expect(usuallyHires(dates('2025-02-03', '2025-03-10', '2026-04-20'))).toBe('Feb–Apr');
  });

  it('wraps around the new year', () => {
    expect(usuallyHires(dates('2024-11-05', '2024-12-01', '2025-01-15'))).toBe('Nov–Jan');
  });

  it('needs at least two past listings', () => {
    expect(usuallyHires([])).toBeNull();
    expect(usuallyHires(dates('2025-02-03'))).toBeNull();
  });

  it('trims empty end months, so a single busy month wins', () => {
    expect(usuallyHires(dates('2025-02-03', '2026-02-10', '2025-08-01'))).toBe('Feb');
  });

  it('breaks a tie between windows by the earliest start month', () => {
    expect(usuallyHires(dates('2025-08-01', '2025-09-01', '2025-02-01', '2025-03-01'))).toBe(
      'Feb–Mar',
    );
  });

  it('prefers the shorter window when counts tie, and the higher count over both', () => {
    expect(usuallyHires(dates('2025-02-01', '2025-03-01', '2025-09-01', '2026-09-20'))).toBe('Sep');
    expect(usuallyHires(dates('2025-05-01', '2025-05-02', '2025-07-01', '2025-07-02'))).toBe(
      'May–Jul',
    );
  });

  it('bins dates by UTC month', () => {
    // 2025-03-01 02:00 UTC is still February in the US, and counts as March.
    expect(usuallyHires(dates('2025-03-01T02:00:00Z', '2026-03-31T23:00:00Z'))).toBe('Mar');
  });
});

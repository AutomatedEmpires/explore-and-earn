/**
 * Deterministic dashboard sparkline (7 bars, 0..100) derived from a real count.
 *
 * A zero metric has no history to imply, so it renders a FLAT low baseline that
 * reads as "no activity yet" — never a fake rising build-up (which previously
 * showed climbing bars on tiles whose value was 0). A small count rises gently;
 * a large count rises steeply. No random, no fixtures — same input → same bars.
 */
export function sparkFromCount(count: number): number[] {
  if (count <= 0) return [8, 8, 8, 8, 8, 8, 8];
  // Amplitude scales with the real count so a tiny pool reads as a flatter
  // build-up and a busy metric reads as a steep climb. Bounded 0..100.
  const amp = Math.min(1, 0.45 + Math.log10(count + 1) * 0.35);
  const curve = [0.28, 0.4, 0.36, 0.55, 0.62, 0.78, 1];
  return curve.map((c) => Math.round(14 + c * 86 * amp));
}

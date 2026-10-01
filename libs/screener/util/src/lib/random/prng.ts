/**
 * Small, fast, seedable PRNG (mulberry32). Not cryptographically secure: it exists so that
 * generated market data, price histories and simulated failures are reproducible.
 */
export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** `true` with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Standard normal sample (Box–Muller). */
  normal(mean?: number, stdDev?: number): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random: Random = {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new RangeError('Cannot pick from an empty list');
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    normal: (mean = 0, stdDev = 1) => {
      // 1 - next() keeps u in (0, 1] so the log is finite.
      const u = 1 - next();
      const v = next();
      return (
        mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
      );
    },
  };
  return random;
}

/** Deterministic 32-bit hash (FNV-1a) used to derive per-item seeds from strings. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

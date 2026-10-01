import { createRandom, hashString } from './prng';

describe('createRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('keeps values within the requested bounds', () => {
    const random = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const n = random.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const f = random.float(-3, 5);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(5);
      const int = random.int(2, 4);
      expect([2, 3, 4]).toContain(int);
    }
  });

  it('respects chance probabilities at the extremes', () => {
    const random = createRandom(3);
    expect(
      Array.from({ length: 100 }, () => random.chance(0)).some(Boolean),
    ).toBe(false);
    expect(
      Array.from({ length: 100 }, () => random.chance(1)).every(Boolean),
    ).toBe(true);
  });

  it('picks items from the list and rejects an empty list', () => {
    const random = createRandom(9);
    expect(['a', 'b', 'c']).toContain(random.pick(['a', 'b', 'c']));
    expect(() => random.pick([])).toThrow(RangeError);
  });

  it('samples a roughly standard normal distribution', () => {
    const random = createRandom(11);
    const samples = Array.from({ length: 20_000 }, () => random.normal());
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance =
      samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
    expect(createRandom(11).normal(10, 0)).toBe(10);
  });
});

describe('hashString', () => {
  it('is stable and spreads similar inputs', () => {
    expect(hashString('NASDAQ:ABC')).toBe(hashString('NASDAQ:ABC'));
    expect(hashString('NASDAQ:ABC')).not.toBe(hashString('NASDAQ:ABD'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
});

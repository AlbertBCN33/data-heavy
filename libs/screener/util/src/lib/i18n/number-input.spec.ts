import { parseRange } from '../query/url-codec';
import { formatNumberInput, normalizeNumberInput } from './number-input';

describe('number input', () => {
  describe('formatNumberInput', () => {
    it('uses the locale decimal separator and no grouping', () => {
      expect(formatNumberInput(2.5, 'en-US')).toBe('2.5');
      expect(formatNumberInput(2.5, 'es-ES')).toBe('2,5');
      expect(formatNumberInput(1500000, 'es-ES')).toBe('1500000');
    });

    it('renders missing values as empty', () => {
      expect(formatNumberInput(undefined, 'en-US')).toBe('');
      expect(formatNumberInput(Number.NaN, 'en-US')).toBe('');
    });
  });

  describe('normalizeNumberInput', () => {
    it.each([
      ['en-US', '1,234.5', '1234.5'],
      ['en-US', '2.5B', '2.5B'],
      ['en-US', ' -3 ', '-3'],
      ['es-ES', '1.234,5', '1234.5'],
      ['es-ES', '2,5', '2.5'],
      ['es-ES', '1.000', '1000'],
      ['es-ES', '1.000.000', '1000000'],
      ['es-ES', '2.5', '2.5'],
      ['es-ES', '1.5B', '1.5B'],
      ['es-ES', '12.5000', '12.5000'],
      ['es-ES', '2,5B', '2.5B'],
      ['es-ES', '', ''],
    ])('%s: "%s" → "%s"', (locale, input, expected) => {
      expect(normalizeNumberInput(input, locale)).toBe(expected);
    });

    it('produces values the URL range parser accepts', () => {
      const min = normalizeNumberInput('2,5', 'es-ES');
      const max = normalizeNumberInput('1.000', 'es-ES');
      expect(parseRange(`${min}..${max}`)).toEqual({ min: 2.5, max: 1000 });
    });
  });
});

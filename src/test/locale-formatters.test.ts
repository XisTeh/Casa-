import { describe, expect, it } from 'vitest';
import {
  calculateItemTotalCents,
  formatCurrencyFromCents,
  parseBrazilianCurrencyToCents,
  parseBrazilianDecimal,
} from '../application/locale-formatters';

describe('formatadores monetários', () => {
  it('interpreta valores brasileiros sem usar ponto flutuante para dinheiro', () => {
    expect(parseBrazilianCurrencyToCents('R$ 8,90')).toBe(890);
    expect(parseBrazilianCurrencyToCents('1.234,56')).toBe(123456);
    expect(parseBrazilianDecimal('1,25')).toBe(1.25);
    expect(calculateItemTotalCents(1.25, 3990)).toBe(4988);
    expect(formatCurrencyFromCents(4988)).toContain('49,88');
  });

  it('rejeita campos monetários inválidos', () => {
    expect(parseBrazilianCurrencyToCents('')).toBeNull();
    expect(parseBrazilianCurrencyToCents('-2,00')).toBeNull();
    expect(parseBrazilianDecimal('produto')).toBeNull();
  });
});

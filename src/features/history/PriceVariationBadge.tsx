import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';
import type { PriceVariation } from '../../application/price-history-selectors';

const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
});

export function PriceVariationBadge({ variation }: { variation: PriceVariation }) {
  if (variation.trend === 'unavailable') {
    return (
      <span className="price-variation price-variation--unavailable">
        <Sparkles aria-hidden="true" size={14} /> Sem comparação
      </span>
    );
  }

  if (variation.trend === 'stable') {
    return (
      <span className="price-variation price-variation--stable">
        <Minus aria-hidden="true" size={14} /> 0% · Estável
      </span>
    );
  }

  const percentage = variation.percentage;
  const isIncrease = variation.trend === 'increase';
  const text =
    percentage === undefined
      ? `${isIncrease ? 'Aumentou' : 'Caiu'} · percentual indisponível`
      : `${isIncrease ? '+' : '−'}${percentageFormatter.format(Math.abs(percentage))}% · ${isIncrease ? 'Aumentou' : 'Caiu'}`;
  const Icon = isIncrease ? ArrowUp : ArrowDown;

  return (
    <span className={`price-variation price-variation--${variation.trend}`}>
      <Icon aria-hidden="true" size={14} /> {text}
    </span>
  );
}

import { formatCurrencyFromCents, formatDate } from '../../application/locale-formatters';
import type { UnitPriceProjection } from '../../application/price-history-selectors';

const chartWidth = 600;
const chartHeight = 190;
const padding = { top: 18, right: 18, bottom: 38, left: 64 };

export function PriceEvolutionChart({ projection }: { projection: UnitPriceProjection }) {
  const records = projection.chronologicalRecords;

  if (records.length < 2) {
    return (
      <div className="price-chart-empty">
        <strong>Uma compra registrada</strong>
        <span>Precisamos de mais compras nesta unidade para mostrar a evolução.</span>
      </div>
    );
  }

  const values = records.map((record) => record.unitPriceCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const points = records.map((record, index) => ({
    record,
    x: padding.left + (index / (records.length - 1)) * plotWidth,
    y:
      max === min
        ? padding.top + plotHeight / 2
        : padding.top + ((max - record.unitPriceCents) / spread) * plotHeight,
  }));
  const ariaLabel = `Evolução de ${records.length} preços em ${projection.unit}, de ${formatCurrencyFromCents(records[0]!.unitPriceCents)} a ${formatCurrencyFromCents(records.at(-1)!.unitPriceCents)}.`;

  return (
    <figure className="price-chart">
      <svg aria-label={ariaLabel} role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <line
          className="price-chart__grid"
          x1={padding.left}
          x2={chartWidth - padding.right}
          y1={padding.top}
          y2={padding.top}
        />
        <line
          className="price-chart__grid"
          x1={padding.left}
          x2={chartWidth - padding.right}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
        />
        <text
          className="price-chart__axis"
          x={padding.left - 10}
          y={padding.top + 4}
          textAnchor="end"
        >
          {formatCurrencyFromCents(max)}
        </text>
        <text
          className="price-chart__axis"
          x={padding.left - 10}
          y={padding.top + plotHeight + 4}
          textAnchor="end"
        >
          {formatCurrencyFromCents(min)}
        </text>
        <polyline
          className="price-chart__line"
          points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
        />
        {points.map(({ record, x, y }) => (
          <circle key={record.item.id} className="price-chart__point" cx={x} cy={y} r="5">
            <title>{`${formatDate(record.purchasedAt)}: ${formatCurrencyFromCents(record.unitPriceCents)}/${record.unit}`}</title>
          </circle>
        ))}
        <text className="price-chart__axis" x={padding.left} y={chartHeight - 9} textAnchor="start">
          {formatDate(records[0]!.purchasedAt)}
        </text>
        <text
          className="price-chart__axis"
          x={chartWidth - padding.right}
          y={chartHeight - 9}
          textAnchor="end"
        >
          {formatDate(records.at(-1)!.purchasedAt)}
        </text>
      </svg>
      <figcaption>Preço por {projection.unit}, em ordem cronológica</figcaption>
    </figure>
  );
}

import { useId, useState } from 'react';
import { formatCurrencyFromCents } from '../../application/locale-formatters';
import type { CumulativeSpendingPoint } from '../../application/spending-selectors';

const width = 760;
const height = 286;
const padding = { top: 28, right: 30, bottom: 44, left: 78 };

type ChartPoint = CumulativeSpendingPoint & { x: number; y: number };
type ActivePoint = ChartPoint & { id: string; monthLabel: string };

type CumulativeSpendingChartProps = {
  series: CumulativeSpendingPoint[];
  previousSeries?: CumulativeSpendingPoint[];
  budgetCents?: number;
  daysInMonth: number;
  previousDaysInMonth?: number;
  monthLabel: string;
  previousMonthLabel: string;
};

function buildPoints(
  series: CumulativeSpendingPoint[],
  daysInMonth: number,
  maxValue: number,
): ChartPoint[] {
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  return series.map((point) => ({
    ...point,
    x: padding.left + ((point.day - 1) / Math.max(1, daysInMonth - 1)) * plotWidth,
    y: padding.top + ((maxValue - point.cumulativeTotalCents) / maxValue) * plotHeight,
  }));
}

function linePoints(points: ChartPoint[], baselineY: number) {
  if (!points.length) return '';
  return `${padding.left},${baselineY} ${points.map(({ x, y }) => `${x},${y}`).join(' ')}`;
}

export function CumulativeSpendingChart({
  series,
  previousSeries = [],
  budgetCents,
  daysInMonth,
  previousDaysInMonth = daysInMonth,
  monthLabel,
  previousMonthLabel,
}: CumulativeSpendingChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);
  const rawMax = Math.max(
    ...series.map((point) => point.cumulativeTotalCents),
    ...previousSeries.map((point) => point.cumulativeTotalCents),
    budgetCents ?? 0,
    1,
  );
  const hasFinancialScale =
    series.length > 0 || previousSeries.length > 0 || budgetCents !== undefined;
  const maxValue = Math.max(100, Math.ceil((rawMax * 1.1) / 100) * 100);
  const plotHeight = height - padding.top - padding.bottom;
  const baselineY = padding.top + plotHeight;
  const currentPoints = buildPoints(series, daysInMonth, maxValue);
  const comparisonPoints = buildPoints(previousSeries, previousDaysInMonth, maxValue);
  const currentLine = linePoints(currentPoints, baselineY);
  const comparisonLine = linePoints(comparisonPoints, baselineY);
  const budgetY =
    budgetCents === undefined
      ? undefined
      : padding.top + ((maxValue - budgetCents) / maxValue) * plotHeight;
  const dayLabels = [...new Set([1, 5, 10, 15, 20, 25, daysInMonth])].filter(
    (day) => day <= daysInMonth,
  );
  const accessibleSummary = series.length
    ? `${monthLabel}: ${formatCurrencyFromCents(series.at(-1)!.cumulativeTotalCents)} acumulados.`
    : `${monthLabel}: nenhum gasto registrado.`;
  const tooltipWidth = 204;
  const tooltipHeight = 54;
  const tooltipX = activePoint
    ? Math.min(width - tooltipWidth - 8, Math.max(8, activePoint.x - tooltipWidth / 2))
    : 0;
  const tooltipY = activePoint
    ? activePoint.y > padding.top + tooltipHeight + 14
      ? activePoint.y - tooltipHeight - 12
      : activePoint.y + 14
    : 0;

  function renderPoints(points: ChartPoint[], idPrefix: string, label: string) {
    return points.map((point) => {
      const id = `${idPrefix}-${point.day}`;
      const ariaLabel = `${label}, dia ${point.day}: ${formatCurrencyFromCents(point.cumulativeTotalCents)} acumulados`;
      return (
        <g
          aria-label={ariaLabel}
          className={`spending-chart__interactive-point spending-chart__interactive-point--${idPrefix}`}
          key={id}
          onBlur={() => setActivePoint((current) => (current?.id === id ? null : current))}
          onClick={() => setActivePoint({ ...point, id, monthLabel: label })}
          onFocus={() => setActivePoint({ ...point, id, monthLabel: label })}
          onMouseEnter={() => setActivePoint({ ...point, id, monthLabel: label })}
          role="button"
          tabIndex={0}
        >
          <circle cx={point.x} cy={point.y} r="12" />
          <circle className="spending-chart__point" cx={point.x} cy={point.y} r="5" />
        </g>
      );
    });
  }

  return (
    <figure
      className={`spending-chart${series.length === 0 ? ' spending-chart--empty' : ''}`}
      onMouseLeave={() => setActivePoint(null)}
    >
      <svg
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title id={titleId}>Gastos acumulados no mês</title>
        <desc id={descriptionId}>
          {accessibleSummary} A linha secundária compara {previousMonthLabel}. Os valores também
          estão disponíveis nos cartões e listas da página.
        </desc>
        {[padding.top, padding.top + plotHeight / 2, baselineY].map((y) => (
          <line
            className="spending-chart__grid"
            key={y}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
          />
        ))}
        <text
          className="spending-chart__axis"
          textAnchor="end"
          x={padding.left - 12}
          y={padding.top + 4}
        >
          {hasFinancialScale ? formatCurrencyFromCents(maxValue) : '—'}
        </text>
        <text
          className="spending-chart__axis"
          textAnchor="end"
          x={padding.left - 12}
          y={padding.top + plotHeight / 2 + 4}
        >
          {hasFinancialScale ? formatCurrencyFromCents(Math.round(maxValue / 2)) : ''}
        </text>
        <text
          className="spending-chart__axis"
          textAnchor="end"
          x={padding.left - 12}
          y={baselineY + 4}
        >
          {formatCurrencyFromCents(0)}
        </text>
        {dayLabels.map((day) => {
          const x =
            padding.left +
            ((day - 1) / Math.max(1, daysInMonth - 1)) * (width - padding.left - padding.right);
          return (
            <text
              className="spending-chart__axis spending-chart__day"
              key={day}
              textAnchor={day === 1 ? 'start' : day === daysInMonth ? 'end' : 'middle'}
              x={x}
              y={height - 14}
            >
              {day}
            </text>
          );
        })}
        {budgetY !== undefined && (
          <g className="spending-chart__budget">
            <line x1={padding.left} x2={width - padding.right} y1={budgetY} y2={budgetY} />
            <text textAnchor="end" x={width - padding.right} y={budgetY - 7}>
              Limite · {formatCurrencyFromCents(budgetCents!)}
            </text>
          </g>
        )}
        {comparisonPoints.length > 0 && (
          <polyline
            className="spending-chart__line spending-chart__line--previous"
            points={comparisonLine}
          />
        )}
        {currentPoints.length > 0 && (
          <>
            <polyline
              className="spending-chart__area"
              points={`${padding.left},${baselineY} ${currentPoints.map(({ x, y }) => `${x},${y}`).join(' ')} ${currentPoints.at(-1)!.x},${baselineY}`}
            />
            <polyline className="spending-chart__line" points={currentLine} />
          </>
        )}
        {renderPoints(comparisonPoints, 'previous', previousMonthLabel)}
        {renderPoints(currentPoints, 'current', monthLabel)}
        {activePoint && (
          <g aria-hidden="true" className="spending-chart__tooltip">
            <rect height={tooltipHeight} rx="11" width={tooltipWidth} x={tooltipX} y={tooltipY} />
            <text x={tooltipX + 13} y={tooltipY + 21}>
              {activePoint.monthLabel} · dia {activePoint.day}
            </text>
            <text className="spending-chart__tooltip-value" x={tooltipX + 13} y={tooltipY + 41}>
              {formatCurrencyFromCents(activePoint.cumulativeTotalCents)} acumulados
            </text>
          </g>
        )}
      </svg>
      {series.length === 0 && (
        <div className="spending-chart__empty-copy">
          <strong>Nenhum gasto registrado neste mês.</strong>
          <span>Suas compras finalizadas aparecerão aqui automaticamente.</span>
        </div>
      )}
      <figcaption>
        <span>
          <i className="spending-chart__legend-dot" />
          {monthLabel}
        </span>
        <span>
          <i className="spending-chart__legend-line" />
          {previousMonthLabel}
        </span>
        {budgetCents !== undefined && (
          <span>
            <i className="spending-chart__legend-budget" />
            Limite
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {activePoint
            ? `${activePoint.monthLabel}, dia ${activePoint.day}: ${formatCurrencyFromCents(activePoint.cumulativeTotalCents)} acumulados.`
            : ''}
        </span>
      </figcaption>
    </figure>
  );
}

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatCurrencyFromCents, formatDate } from '../../application/locale-formatters';
import type { MonthlyReport } from '../../application/monthly-report-selectors';

const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

type Props = { report: MonthlyReport };

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <article className="monthly-report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function purchaseDetail(report: MonthlyReport, kind: 'largest' | 'smallest') {
  const purchase = kind === 'largest' ? report.largestPurchase : report.smallestPurchase;
  return purchase
    ? `${purchase.storeNameSnapshot} · ${formatDate(purchase.completedAt ?? purchase.startedAt)}`
    : undefined;
}

export function MonthlyReportSection({ report }: Props) {
  const [expanded, setExpanded] = useState(false);
  const maximumEvolution = useMemo(
    () => Math.max(...report.evolution.map((point) => point.totalCents), 1),
    [report.evolution],
  );
  const hasData = report.purchaseCount > 0;
  const comparison = report.comparison;
  const comparisonValue =
    comparison.percentage === undefined
      ? 'Sem base anterior'
      : `${comparison.differenceCents > 0 ? '+' : comparison.differenceCents < 0 ? '−' : ''}${formatCurrencyFromCents(Math.abs(comparison.differenceCents))}`;

  return (
    <section className="monthly-report" aria-labelledby="monthly-report-title">
      <header className="monthly-report__header">
        <div>
          <p className="eyebrow">Relatório mensal</p>
          <h2 id="monthly-report-title">Resumo do mês</h2>
          <p>Indicadores calculados diretamente das compras concluídas.</p>
        </div>
        <button
          aria-controls="monthly-report-details"
          aria-expanded={expanded}
          className="monthly-report__toggle"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? 'Ocultar relatório' : 'Ver relatório completo'}
          <ChevronDown aria-hidden="true" className={expanded ? 'is-open' : ''} size={18} />
        </button>
      </header>

      <div className="monthly-report__preview">
        <Metric
          label="Ticket médio"
          value={hasData ? formatCurrencyFromCents(report.averageTicketCents) : '—'}
          detail={hasData ? `${report.purchaseCount} compras no cálculo` : 'Ainda sem compras'}
        />
        <Metric
          label="Maior compra"
          value={
            report.largestPurchase
              ? formatCurrencyFromCents(report.largestPurchase.totalPriceCents)
              : '—'
          }
          detail={purchaseDetail(report, 'largest')}
        />
        <Metric
          label="Produtos diferentes"
          value={hasData ? report.distinctProductCount : '—'}
          detail={hasData ? 'Identidades compradas no mês' : 'Sem dados neste mês'}
        />
      </div>

      {expanded && (
        <div className="monthly-report__details" id="monthly-report-details">
          {!hasData ? (
            <div className="monthly-report__empty">
              <ReceiptText aria-hidden="true" size={25} />
              <div>
                <strong>Nenhuma compra concluída neste mês</strong>
                <p>Quando houver compras, o relatório será preenchido automaticamente.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="monthly-report__metrics">
                <Metric
                  label="Total gasto"
                  value={formatCurrencyFromCents(report.totalSpentCents)}
                />
                <Metric
                  label="Orçamento"
                  value={
                    report.budgetAmountCents === undefined
                      ? 'Não definido'
                      : formatCurrencyFromCents(report.budgetAmountCents)
                  }
                  detail={
                    report.budgetPercentage === undefined
                      ? undefined
                      : `${percentage.format(report.budgetPercentage)}% utilizado`
                  }
                />
                <Metric
                  label={
                    report.availableCents !== undefined && report.availableCents < 0
                      ? 'Acima do orçamento'
                      : 'Quanto sobrou'
                  }
                  value={
                    report.availableCents === undefined
                      ? '—'
                      : formatCurrencyFromCents(Math.abs(report.availableCents))
                  }
                />
                <Metric label="Quantidade de compras" value={report.purchaseCount} />
                <Metric
                  label="Ticket médio"
                  value={formatCurrencyFromCents(report.averageTicketCents)}
                />
                <Metric
                  label="Maior compra"
                  value={
                    report.largestPurchase
                      ? formatCurrencyFromCents(report.largestPurchase.totalPriceCents)
                      : '—'
                  }
                  detail={purchaseDetail(report, 'largest')}
                />
                <Metric
                  label="Menor compra"
                  value={
                    report.smallestPurchase
                      ? formatCurrencyFromCents(report.smallestPurchase.totalPriceCents)
                      : '—'
                  }
                  detail={purchaseDetail(report, 'smallest')}
                />
                <Metric
                  label="Mercado com maior gasto"
                  value={report.highestSpendingStore?.name ?? '—'}
                  detail={
                    report.highestSpendingStore
                      ? formatCurrencyFromCents(report.highestSpendingStore.totalCents)
                      : undefined
                  }
                />
                <Metric
                  label="Mercado com mais compras"
                  value={report.mostFrequentStore?.name ?? '—'}
                  detail={
                    report.mostFrequentStore
                      ? `${report.mostFrequentStore.purchaseCount} compras`
                      : undefined
                  }
                />
                <Metric
                  label="Produto com maior gasto"
                  value={report.highestSpendingProduct?.name ?? '—'}
                  detail={
                    report.highestSpendingProduct
                      ? formatCurrencyFromCents(report.highestSpendingProduct.totalCents)
                      : undefined
                  }
                />
                <Metric
                  label="Produto comprado mais vezes"
                  value={report.mostPurchasedProduct?.name ?? '—'}
                  detail={
                    report.mostPurchasedProduct
                      ? `${report.mostPurchasedProduct.purchaseCount} compras`
                      : undefined
                  }
                />
                <Metric label="Produtos diferentes" value={report.distinctProductCount} />
                <Metric
                  label="Comparação com mês anterior"
                  value={comparisonValue}
                  detail={
                    comparison.percentage === undefined
                      ? 'O mês anterior não possui gastos'
                      : `${comparison.percentage > 0 ? 'Aumento' : comparison.percentage < 0 ? 'Redução' : 'Sem variação'} de ${percentage.format(Math.abs(comparison.percentage))}%`
                  }
                />
              </div>

              <section className="monthly-highlights" aria-labelledby="monthly-highlights-title">
                <header>
                  <Sparkles aria-hidden="true" size={19} />
                  <h3 id="monthly-highlights-title">Destaques do mês</h3>
                </header>
                <div>
                  <Metric
                    label="Maior compra"
                    value={formatCurrencyFromCents(report.largestPurchase!.totalPriceCents)}
                    detail={purchaseDetail(report, 'largest')}
                  />
                  <Metric
                    label="Produto mais comprado"
                    value={report.mostPurchasedProduct?.name ?? '—'}
                    detail={
                      report.mostPurchasedProduct
                        ? `${report.mostPurchasedProduct.purchaseCount} compras`
                        : undefined
                    }
                  />
                  <Metric
                    label="Maior gasto por produto"
                    value={report.highestSpendingProduct?.name ?? '—'}
                    detail={
                      report.highestSpendingProduct
                        ? formatCurrencyFromCents(report.highestSpendingProduct.totalCents)
                        : undefined
                    }
                  />
                  <Metric
                    label="Mercado mais utilizado"
                    value={report.mostFrequentStore?.name ?? '—'}
                    detail={
                      report.mostFrequentStore
                        ? `${report.mostFrequentStore.purchaseCount} compras`
                        : undefined
                    }
                  />
                  <Metric
                    label="Maior queda de preço"
                    value={report.largestPriceDecrease?.name ?? 'Sem comparação'}
                    detail={
                      report.largestPriceDecrease ? (
                        <>
                          <ArrowDownRight aria-hidden="true" size={14} />{' '}
                          {formatCurrencyFromCents(
                            Math.abs(report.largestPriceDecrease.differenceCents),
                          )}{' '}
                          por {report.largestPriceDecrease.unit}
                        </>
                      ) : (
                        'São necessárias duas compras comparáveis'
                      )
                    }
                  />
                  <Metric
                    label="Maior aumento de preço"
                    value={report.largestPriceIncrease?.name ?? 'Sem comparação'}
                    detail={
                      report.largestPriceIncrease ? (
                        <>
                          <ArrowUpRight aria-hidden="true" size={14} />{' '}
                          {formatCurrencyFromCents(report.largestPriceIncrease.differenceCents)} por{' '}
                          {report.largestPriceIncrease.unit}
                        </>
                      ) : (
                        'São necessárias duas compras comparáveis'
                      )
                    }
                  />
                </div>
              </section>
            </>
          )}

          <section className="monthly-evolution" aria-labelledby="monthly-evolution-title">
            <header>
              <BarChart3 aria-hidden="true" size={19} />
              <div>
                <h3 id="monthly-evolution-title">Evolução entre meses</h3>
                <p>Últimos seis meses disponíveis até o período selecionado.</p>
              </div>
            </header>
            {report.evolution.some((point) => point.purchaseCount > 0) ? (
              <div className="monthly-evolution__chart">
                {report.evolution.map((point) => (
                  <div key={`${point.year}-${point.month}`}>
                    <span>{formatCurrencyFromCents(point.totalCents)}</span>
                    <i
                      aria-hidden="true"
                      style={
                        {
                          '--month-height': `${Math.max(4, (point.totalCents / maximumEvolution) * 100)}%`,
                        } as CSSProperties
                      }
                    />
                    <strong>
                      {shortMonth.format(new Date(point.year, point.month - 1, 1)).replace('.', '')}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="monthly-evolution__empty">
                Ainda não há meses com compras para comparar.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

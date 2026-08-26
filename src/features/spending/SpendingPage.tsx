import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Pencil,
  ReceiptText,
  Store,
  Tags,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCurrencyFromCents, formatDate } from '../../application/locale-formatters';
import {
  buildMonthlySpendingProjection,
  parseMonthPeriod,
  serializeMonthPeriod,
  shiftMonth,
  type MonthPeriod,
} from '../../application/spending-selectors';
import { buildMonthlyReport } from '../../application/monthly-report-selectors';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ErrorState, LoadingState } from '../../components/StateView/StateView';
import type { PurchaseSession } from '../../domain/purchase';
import { PurchaseDetailDialog } from '../history/PurchaseDetailDialog';
import { usePurchase } from '../purchase/PurchaseContext';
import { BudgetDialog } from './BudgetDialog';
import { useBudgets } from './BudgetContext';
import { CumulativeSpendingChart } from './CumulativeSpendingChart';
import { MonthlyReportSection } from './MonthlyReportSection';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const shortMonthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const percentageFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function monthName(period: MonthPeriod) {
  const value = monthFormatter.format(new Date(period.year, period.month - 1, 1));
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

function shortMonthName(period: MonthPeriod) {
  const value = shortMonthFormatter.format(new Date(period.year, period.month - 1, 1));
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

export function SpendingPage() {
  const { completedSessions, isLoading: purchasesLoading, error: purchasesError } = usePurchase();
  const {
    budgets,
    isLoading: budgetsLoading,
    error: budgetsError,
    setMonthlyBudget,
  } = useBudgets();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showBudget, setShowBudget] = useState(false);
  const period = parseMonthPeriod(searchParams.get('mes'));
  const projection = useMemo(
    () => buildMonthlySpendingProjection(completedSessions, budgets, period),
    [budgets, completedSessions, period],
  );
  const monthlyReport = useMemo(
    () => buildMonthlyReport(completedSessions, budgets, period),
    [budgets, completedSessions, period],
  );
  const selectedPurchase =
    projection.sessions.find((session) => session.id === searchParams.get('compra')) ?? null;
  const previousPeriod = shiftMonth(period, -1);
  const currentMonthName = shortMonthName(period);
  const previousMonthName = shortMonthName(previousPeriod);
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const previousDaysInMonth = new Date(previousPeriod.year, previousPeriod.month, 0).getDate();

  function navigateMonth(offset: number) {
    const next = new URLSearchParams(searchParams);
    next.set('mes', serializeMonthPeriod(shiftMonth(period, offset)));
    next.delete('compra');
    setSearchParams(next, { replace: true });
  }

  function openPurchase(session: PurchaseSession) {
    const next = new URLSearchParams(searchParams);
    next.set('compra', session.id);
    setSearchParams(next, { replace: true });
  }

  function closePurchase() {
    const next = new URLSearchParams(searchParams);
    next.delete('compra');
    setSearchParams(next, { replace: true });
  }

  if (purchasesLoading || budgetsLoading)
    return <LoadingState description="Organizando as finanças da casa…" />;
  if (purchasesError || budgetsError)
    return (
      <ErrorState
        description={purchasesError ?? budgetsError ?? 'Não foi possível abrir os gastos.'}
      />
    );

  const comparison = projection.comparison;
  const comparisonText =
    comparison.percentage === undefined
      ? 'Sem comparação'
      : `${comparison.percentage > 0 ? '+' : comparison.percentage < 0 ? '−' : ''}${percentageFormatter.format(Math.abs(comparison.percentage))}%`;
  const comparisonClass =
    comparison.trend === 'increase'
      ? 'is-increase'
      : comparison.trend === 'decrease'
        ? 'is-decrease'
        : 'is-neutral';
  const comparisonDetail =
    comparison.percentage === undefined
      ? `${previousMonthName} sem base comparável`
      : `${comparison.trend === 'increase' ? 'Aumento' : comparison.trend === 'decrease' ? 'Redução' : 'Estável'} vs. ${previousMonthName} · ${formatCurrencyFromCents(Math.abs(comparison.differenceCents))}`;
  const available = projection.availableCents;
  const budgetPercentage = projection.budgetPercentage ?? 0;
  const budgetMessage =
    projection.budgetStatus === 'exceeded'
      ? available !== undefined && available < 0
        ? `Orçamento ultrapassado em ${formatCurrencyFromCents(Math.abs(available))}.`
        : 'O orçamento deste mês foi totalmente utilizado.'
      : projection.budgetStatus === 'warning'
        ? `Você já utilizou ${percentageFormatter.format(budgetPercentage)}% do orçamento deste mês.`
        : projection.budgetStatus === 'moderate'
          ? 'Os gastos entraram na faixa de atenção moderada.'
          : 'O orçamento está seguindo dentro do planejado.';

  return (
    <div className="spending-page">
      <PageHeader
        eyebrow="Finanças da casa"
        title="Gastos"
        description="Acompanhe quanto a casa está gastando ao longo do mês."
        accessory={
          <Button
            icon={
              projection.budget ? (
                <Pencil aria-hidden="true" size={18} />
              ) : (
                <CircleDollarSign aria-hidden="true" size={18} />
              )
            }
            onClick={() => setShowBudget(true)}
          >
            {projection.budget ? 'Editar orçamento' : 'Definir orçamento'}
          </Button>
        }
      />

      <div className="spending-month-picker" aria-label="Mês dos gastos">
        <button aria-label="Ver mês anterior" onClick={() => navigateMonth(-1)} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <div>
          <CalendarDays aria-hidden="true" size={18} />
          <strong>{monthName(period)}</strong>
        </div>
        <button aria-label="Ver próximo mês" onClick={() => navigateMonth(1)} type="button">
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>

      <section aria-label="Resumo financeiro do mês" className="spending-summary">
        <article>
          <span>
            <WalletCards aria-hidden="true" size={17} /> Gasto no mês
          </span>
          <strong>{formatCurrencyFromCents(projection.totalSpentCents)}</strong>
          <small>
            {projection.purchaseCount}{' '}
            {projection.purchaseCount === 1 ? 'compra concluída' : 'compras concluídas'}
          </small>
        </article>
        <article>
          <span>Orçamento mensal</span>
          <strong>
            {projection.budgetAmountCents !== undefined
              ? formatCurrencyFromCents(projection.budgetAmountCents)
              : 'Não definido'}
          </strong>
          <small>
            {projection.budget
              ? `${percentageFormatter.format(budgetPercentage)}% utilizado`
              : 'Defina um valor para acompanhar o limite'}
          </small>
        </article>
        <article className={available !== undefined && available < 0 ? 'is-negative' : ''}>
          <span>Disponível</span>
          <strong>
            {available !== undefined ? formatCurrencyFromCents(Math.max(0, available)) : '—'}
          </strong>
          <small>
            {available !== undefined && available < 0
              ? `${formatCurrencyFromCents(Math.abs(available))} acima do orçamento`
              : projection.daysRemaining !== undefined
                ? `${projection.daysRemaining} dias restantes`
                : 'Saldo do período'}
          </small>
        </article>
        <article className={comparisonClass}>
          <span>Comparação</span>
          <strong>{comparisonText}</strong>
          <small>{comparisonDetail}</small>
        </article>
      </section>

      <section className={`budget-panel budget-panel--${projection.budgetStatus}`}>
        <div className="budget-panel__copy">
          <p className="eyebrow">Orçamento mensal</p>
          {projection.budget ? (
            <>
              <h2>
                {formatCurrencyFromCents(projection.totalSpentCents)} de{' '}
                {formatCurrencyFromCents(projection.budget.amountCents)}
              </h2>
              <p>{budgetMessage}</p>
            </>
          ) : (
            <>
              <h2>Planeje o limite da casa</h2>
              <p>Defina um orçamento para visualizar progresso, saldo disponível e média diária.</p>
            </>
          )}
        </div>
        {projection.budget ? (
          <div className="budget-panel__progress">
            <div
              className="budget-panel__track"
              role="progressbar"
              aria-label="Orçamento mensal utilizado"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(budgetPercentage))}
            >
              <span style={{ width: `${Math.min(100, budgetPercentage)}%` }} />
            </div>
            <div>
              <strong>{percentageFormatter.format(budgetPercentage)}% utilizado</strong>
              <span>
                {available !== undefined && available >= 0
                  ? `${formatCurrencyFromCents(available)} disponíveis`
                  : 'Limite mensal alcançado'}
              </span>
            </div>
            {projection.daysRemaining !== undefined && (
              <small>
                {projection.daysRemaining} dias restantes
                {projection.dailyAvailableCents !== undefined
                  ? ` · média disponível de ${formatCurrencyFromCents(projection.dailyAvailableCents)}/dia`
                  : ''}
              </small>
            )}
          </div>
        ) : (
          <Button onClick={() => setShowBudget(true)} variant="secondary">
            Definir orçamento de {monthName(period).toLocaleLowerCase('pt-BR')}
          </Button>
        )}
      </section>

      <MonthlyReportSection report={monthlyReport} />

      <section className="spending-section spending-evolution">
        <header>
          <div>
            <CircleDollarSign aria-hidden="true" size={19} />
            <div>
              <p className="eyebrow">Evolução dos gastos</p>
              <h2>Gastos acumulados no mês</h2>
            </div>
          </div>
          <span>{formatCurrencyFromCents(projection.totalSpentCents)} acumulados</span>
        </header>
        <CumulativeSpendingChart
          budgetCents={projection.budgetAmountCents}
          daysInMonth={daysInMonth}
          monthLabel={currentMonthName}
          previousMonthLabel={previousMonthName}
          previousDaysInMonth={previousDaysInMonth}
          previousSeries={projection.previousCumulativeSeries}
          series={projection.cumulativeSeries}
        />
      </section>

      {projection.sessions.length > 0 && (
        <>
          <div className="spending-breakdowns">
            <section className="spending-section">
              <header>
                <div>
                  <Tags aria-hidden="true" size={19} />
                  <h2>Por categoria</h2>
                </div>
                <span>Snapshots das compras</span>
              </header>
              <div className="spending-ranking">
                {projection.categories.map((category, index) => (
                  <article key={category.key}>
                    <span className="spending-ranking__position">{index + 1}</span>
                    <div>
                      <div>
                        <strong>{category.name}</strong>
                        <span>
                          {formatCurrencyFromCents(category.totalCents)} ·{' '}
                          {percentageFormatter.format(category.percentage)}%
                        </span>
                      </div>
                      <span className="spending-ranking__bar" aria-hidden="true">
                        <i style={{ '--bar-width': `${category.percentage}%` } as CSSProperties} />
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="spending-section">
              <header>
                <div>
                  <Store aria-hidden="true" size={19} />
                  <h2>Onde compramos</h2>
                </div>
                <span>Participação no mês</span>
              </header>
              <div className="spending-ranking">
                {projection.stores.map((storeProjection, index) => (
                  <article key={storeProjection.key}>
                    <span className="spending-ranking__position">{index + 1}</span>
                    <div>
                      <div>
                        <strong>{storeProjection.name}</strong>
                        <span>
                          {formatCurrencyFromCents(storeProjection.totalCents)} ·{' '}
                          {storeProjection.purchaseCount}{' '}
                          {storeProjection.purchaseCount === 1 ? 'compra' : 'compras'}
                        </span>
                      </div>
                      <span
                        className="spending-ranking__bar spending-ranking__bar--store"
                        aria-hidden="true"
                      >
                        <i
                          style={
                            { '--bar-width': `${storeProjection.percentage}%` } as CSSProperties
                          }
                        />
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <section className="spending-section spending-largest">
            <header>
              <div>
                <ReceiptText aria-hidden="true" size={19} />
                <h2>Maiores compras do mês</h2>
              </div>
              <span>Clique para ver os itens</span>
            </header>
            <div>
              {projection.largestPurchases.map((purchase) => (
                <button key={purchase.id} onClick={() => openPurchase(purchase)} type="button">
                  <span>
                    <strong>{purchase.storeNameSnapshot}</strong>
                    <small>
                      {formatDate(purchase.completedAt ?? purchase.startedAt)} ·{' '}
                      {purchase.items.length} {purchase.items.length === 1 ? 'item' : 'itens'}
                    </small>
                  </span>
                  <strong>{formatCurrencyFromCents(purchase.totalPriceCents)}</strong>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      {showBudget && (
        <BudgetDialog
          budget={projection.budget}
          onClose={() => setShowBudget(false)}
          onSave={(amountCents) => setMonthlyBudget(period.year, period.month, amountCents)}
          period={period}
        />
      )}
      {selectedPurchase && (
        <PurchaseDetailDialog onClose={closePurchase} session={selectedPurchase} />
      )}
    </div>
  );
}

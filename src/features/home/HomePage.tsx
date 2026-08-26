import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  HouseHeart,
  ListChecks,
  ShoppingBag,
} from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrencyFromCents, formatDateTime } from '../../application/locale-formatters';
import { ProfileAvatar } from '../../components/ProfileAvatar/ProfileAvatar';
import { Badge } from '../../components/Badge/Badge';
import { Card } from '../../components/Card/Card';
import { getShoppingListSummary } from '../../domain/shopping-list';
import { usePurchase } from '../purchase/PurchaseContext';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useHousehold } from '../house/HouseContext';
import { useBudgets } from '../spending/BudgetContext';
import {
  buildMonthlySpendingProjection,
  getCurrentMonth,
} from '../../application/spending-selectors';
import { ReplenishmentSuggestions } from '../products/ReplenishmentSuggestions';

const today = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})
  .format(new Date())
  .toLocaleUpperCase('pt-BR');

export function HomePage() {
  const { activeHouse, activeMember } = useHousehold();
  const { isLoading: isLoadingShoppingList, items: shoppingListItems } = useShoppingList();
  const { isLoading: isLoadingPurchase, latestCompletedSession, completedSessions } = usePurchase();
  const { budgets, isLoading: isLoadingBudgets } = useBudgets();
  const shoppingListSummary = getShoppingListSummary(shoppingListItems);
  const { year: currentYear, month: currentMonth } = getCurrentMonth();
  const spending = useMemo(
    () =>
      buildMonthlySpendingProjection(completedSessions, budgets, {
        year: currentYear,
        month: currentMonth,
      }),
    [budgets, completedSessions, currentMonth, currentYear],
  );
  const spendingPercentage = Math.round(spending.budgetPercentage ?? 0);
  const currentMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
    new Date(currentYear, currentMonth - 1, 1),
  );

  return (
    <div className="home-page">
      <header className="home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">{today}</p>
          <h1>
            Olá, {activeMember.displayName} <span aria-hidden="true">👋</span>
          </h1>
          <div className="home-hero__house">
            <span className="home-hero__house-icon">
              <HouseHeart aria-hidden="true" size={18} />
            </span>
            <span>
              <small>Casa ativa</small>
              <strong>{activeHouse.name}</strong>
            </span>
          </div>
        </div>
        <div className="home-hero__identity" aria-hidden="true">
          <span className="home-hero__monogram">ê</span>
          <ProfileAvatar profile={activeMember} size="profile" />
        </div>
      </header>

      <section className="home-overview" aria-labelledby="home-overview-title">
        <div className="home-overview__header">
          <div>
            <h2 id="home-overview-title">Resumo da casa</h2>
            <p>O essencial para organizar o dia.</p>
          </div>
        </div>

        <div className="home-grid">
          <Card className="summary-card summary-card--list">
            <div className="summary-card__header">
              <span className="summary-card__icon">
                <ListChecks aria-hidden="true" size={22} />
              </span>
              <Badge tone="accent">Em andamento</Badge>
            </div>
            <div className="summary-card__content">
              <p className="summary-card__label">Lista de compras</p>
              <h3>
                {isLoadingShoppingList
                  ? 'Preparando lista…'
                  : `${shoppingListSummary.pendingItems} ${shoppingListSummary.pendingItems === 1 ? 'item faltando' : 'itens faltando'}`}
              </h3>
              <p>
                {isLoadingShoppingList
                  ? 'Organizando o que a casa precisa'
                  : shoppingListSummary.priorityItems > 0
                    ? `${shoppingListSummary.priorityItems} ${shoppingListSummary.priorityItems === 1 ? 'item prioritário' : 'itens prioritários'}`
                    : 'Tudo em ordem por aqui'}
              </p>
            </div>
            <footer className="summary-card__footer">
              <Link className="summary-card__link" to="/lista">
                Ver lista <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </footer>
          </Card>

          <Card className="summary-card summary-card--spending">
            <div className="summary-card__header">
              <span className="summary-card__icon">
                <CircleDollarSign aria-hidden="true" size={22} />
              </span>
              <span className="summary-card__period">Este mês</span>
            </div>
            <div className="summary-card__content">
              <p className="summary-card__label">Gastos de {currentMonthName}</p>
              <h3>
                {isLoadingPurchase || isLoadingBudgets
                  ? 'Calculando…'
                  : formatCurrencyFromCents(spending.totalSpentCents)}
              </h3>
              <p>
                {spending.budget
                  ? `de ${formatCurrencyFromCents(spending.budget.amountCents)}`
                  : 'gastos neste mês'}
              </p>
            </div>
            <footer
              className={`summary-card__footer ${spending.budget ? 'summary-card__footer--budget' : ''}`}
            >
              {spending.budget && (
                <div
                  className="budget-ring"
                  role="progressbar"
                  aria-label="Orçamento mensal utilizado"
                  aria-valuenow={Math.min(100, spendingPercentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={
                    {
                      '--budget-progress': `${Math.min(100, spendingPercentage) * 3.6}deg`,
                    } as CSSProperties
                  }
                >
                  <span>{spendingPercentage}%</span>
                </div>
              )}
              <div className="budget-progress__meta">
                <span>
                  {spending.budget ? 'do orçamento mensal' : 'Orçamento ainda não definido'}
                </span>
                <Link to="/gastos">{spending.budget ? 'Ver gastos' : 'Definir orçamento'}</Link>
              </div>
            </footer>
          </Card>

          <Card className="summary-card summary-card--purchase">
            <div className="summary-card__header">
              <span className="summary-card__icon">
                <ShoppingBag aria-hidden="true" size={22} />
              </span>
              <Badge tone={latestCompletedSession ? 'success' : 'neutral'}>
                {latestCompletedSession ? <Check aria-hidden="true" size={13} /> : null}
                {isLoadingPurchase
                  ? 'Consultando'
                  : latestCompletedSession
                    ? 'Concluída'
                    : 'Sem registro'}
              </Badge>
            </div>
            <div className="summary-card__content">
              <p className="summary-card__label">Última compra</p>
              <h3>
                {isLoadingPurchase
                  ? 'Consultando…'
                  : (latestCompletedSession?.storeNameSnapshot ?? 'Nenhuma compra concluída')}
              </h3>
              <p>
                {latestCompletedSession?.completedAt
                  ? formatDateTime(latestCompletedSession.completedAt)
                  : 'Sua próxima compra aparecerá aqui'}
              </p>
            </div>
            <footer className="summary-card__footer latest-purchase">
              <strong>
                {latestCompletedSession
                  ? formatCurrencyFromCents(latestCompletedSession.totalPriceCents)
                  : '—'}
              </strong>
              <Link
                to={
                  latestCompletedSession
                    ? `/historico?compra=${latestCompletedSession.id}`
                    : '/historico'
                }
                aria-label="Abrir histórico de compras"
              >
                <ChevronRight aria-hidden="true" size={20} />
              </Link>
            </footer>
          </Card>
        </div>
      </section>

      <ReplenishmentSuggestions compact />
    </div>
  );
}

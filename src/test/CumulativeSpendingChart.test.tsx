import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CumulativeSpendingChart } from '../features/spending/CumulativeSpendingChart';

const currentSeries = [
  {
    day: 3,
    date: '2026-08-03T10:00:00.000Z',
    dailyTotalCents: 100_00,
    cumulativeTotalCents: 100_00,
  },
  {
    day: 8,
    date: '2026-08-08T10:00:00.000Z',
    dailyTotalCents: 150_00,
    cumulativeTotalCents: 250_00,
  },
  {
    day: 18,
    date: '2026-08-18T10:00:00.000Z',
    dailyTotalCents: 250_00,
    cumulativeTotalCents: 500_00,
  },
];

describe('CumulativeSpendingChart', () => {
  it('expõe pontos interativos, comparação e limite do orçamento', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CumulativeSpendingChart
        budgetCents={1_000_00}
        daysInMonth={31}
        monthLabel="Agosto"
        previousMonthLabel="Julho"
        previousSeries={[{ ...currentSeries[0]!, cumulativeTotalCents: 80_00 }]}
        series={currentSeries}
      />,
    );

    expect(screen.getByRole('img', { name: 'Gastos acumulados no mês' })).toBeInTheDocument();
    expect(container.querySelector('.spending-chart__line--previous')).toBeInTheDocument();
    expect(container.querySelector('.spending-chart__budget')).toHaveTextContent('R$ 1.000,00');

    const day18 = screen.getByRole('button', { name: /Agosto, dia 18/ });
    await user.click(day18);
    expect(screen.getByText(/Agosto, dia 18:/)).toHaveTextContent('R$ 500,00 acumulados');
  });

  it('mantém estrutura, eixos e mensagem honesta quando o mês está vazio', () => {
    render(
      <CumulativeSpendingChart
        daysInMonth={31}
        monthLabel="Agosto"
        previousMonthLabel="Julho"
        series={[]}
      />,
    );
    expect(screen.getByText('Nenhum gasto registrado neste mês.')).toBeInTheDocument();
    expect(
      screen.getByText('Suas compras finalizadas aparecerão aqui automaticamente.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gastos acumulados no mês' })).toBeInTheDocument();
  });

  it('mantém o último dia do mês anterior dentro do gráfico ao comparar fevereiro com janeiro', () => {
    const { container } = render(
      <CumulativeSpendingChart
        daysInMonth={28}
        monthLabel="Fevereiro"
        previousDaysInMonth={31}
        previousMonthLabel="Janeiro"
        previousSeries={[
          {
            day: 31,
            date: '2026-01-31T10:00:00.000Z',
            dailyTotalCents: 100_00,
            cumulativeTotalCents: 100_00,
          },
        ]}
        series={[]}
      />,
    );
    const point = container.querySelector('.spending-chart__interactive-point--previous circle');
    expect(Number(point?.getAttribute('cx'))).toBeLessThanOrEqual(730);
  });
});

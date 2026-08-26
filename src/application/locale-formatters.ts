const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
});

export function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

export function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value)).replace('.', '');
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}

export function formatMonthYear(value: string) {
  const formatted = monthYearFormatter.format(new Date(value));
  return formatted.charAt(0).toLocaleUpperCase('pt-BR') + formatted.slice(1);
}

export function parseBrazilianDecimal(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBrazilianCurrencyToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, '');

  if (!cleaned) {
    return null;
  }

  let normalized: string;

  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = cleaned.split('.');
    normalized = parts.length === 2 && parts[1]?.length !== 3 ? cleaned : parts.join('');
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function calculateItemTotalCents(quantity: number, unitPriceCents: number) {
  return Math.round(quantity * unitPriceCents);
}

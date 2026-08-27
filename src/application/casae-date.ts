export const CASAE_TIME_ZONE = 'America/Sao_Paulo';

export type CasaeDateParts = { year: number; month: number; day: number };

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CASAE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getCasaeDateParts(value: string | Date): CasaeDateParts {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Map(
    partsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.get('year')!,
    month: parts.get('month')!,
    day: parts.get('day')!,
  };
}

export function getCasaeDayKey(value: string | Date) {
  const { year, month, day } = getCasaeDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getCasaeDayOrdinal(value: string | Date) {
  const { year, month, day } = getCasaeDateParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

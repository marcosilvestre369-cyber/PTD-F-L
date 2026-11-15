/**
 * Utilitários de data e hora formatados para Portugal (Europe/Lisbon)
 */

export function getTodayDateString(): string {
  // Retorna YYYY-MM-DD no fuso de Lisboa
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export function formatDatePt(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  // Aceita YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function formatDateTimePt(isoStr: string | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('pt-PT', {
      timeZone: 'Europe/Lisbon',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoStr;
  }
}

export function isDateInPast(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const today = getTodayDateString();
  return dateStr < today;
}

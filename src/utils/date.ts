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

/**
 * Colaboradores só podem alterar o estado das tarefas de um dia até às 02:00 (hora de Lisboa) do dia seguinte.
 */
export function isTaskStatusLockedForCollaborator(taskDate: string | undefined, now: Date = new Date()): boolean {
  if (!taskDate || !/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) return false;
  const [y, m, d] = taskDate.split('-').map(Number);
  const nextDayStr = new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().split('T')[0];

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  const hour = parseInt(map.hour || '0', 10) % 24;

  if (todayStr > nextDayStr) return true;
  if (todayStr === nextDayStr && hour >= 2) return true;
  return false;
}

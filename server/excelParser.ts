import * as XLSX from 'xlsx';
import type { DailyTask, MealSchedule, ImportedRowPreview, Collaborator } from '../src/types/index.ts';
import { getPrincipalTaskDescription } from './pdfParser.ts';

// Garante resolução correta em ESM e CJS sem depender de XLSX.SSF
const xlsxLib: typeof XLSX = ((XLSX as any)?.utils ? XLSX : (XLSX as any)?.default || XLSX) as typeof XLSX;

export type ImportWorkbookScope = 'BOTH' | 'PTD' | 'PTS';

export interface ParsedSpreadsheetResult {
  sourceType: ImportWorkbookScope;
  week: string;
  sheetsFound: string[];
  hasPtdSheet: boolean;
  hasPtsSheet: boolean;
  detectedWeeks?: string[];
  previewRows: ImportedRowPreview[];
  generatedTasks: DailyTask[];
  generatedMeals: MealSchedule[];
  ptdTasksCount: number;
  ptsTasksCount: number;
  mealsCount: number;
  warnings: string[];
  error?: string;
}

const WEEKDAY_KEYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

const ABSENT_KEYWORDS = ['FOLGA', 'FÉRIAS', 'FERIAS', 'AUSÊNCIA', 'AUSENCIA', 'AUSENTE', 'BAIXA'];

/**
 * Normaliza texto para comparação tolerante a acentos e múltiplos espaços/quebras de linha
 */
function normalizeText(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Converte número de série de data do Excel em YYYY-MM-DD em JS puro (imune a falhas de XLSX.SSF em ESM/bundlers)
 */
function excelSerialToIsoDate(serial: number, is1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null;
  const baseUtcMs = is1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(baseUtcMs + Math.floor(serial) * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Extrai ano explícito (ex: 2027) apenas quando faz parte de uma designação de semana/data válida
 */
function extractYearFromText(text?: string): number | null {
  if (!text) return null;
  const fullDmy = text.match(/\b\d{1,2}[/\-]\d{1,2}[/\-](20\d{2})\b/);
  if (fullDmy) return parseInt(fullDmy[1], 10);
  const iso = text.match(/\b(20\d{2})-\d{1,2}-\d{1,2}\b/);
  if (iso) return parseInt(iso[1], 10);
  const match = text.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function getCurrentOperationalYear(): number {
  const y = new Date().getFullYear();
  return y >= 2026 ? y : 2026;
}

/**
 * Converte fração horária numérica do Excel (ex: 0.375 ou 46398.375 -> 09:00), Date ou texto horário
 */
function formatTimeCell(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  if (typeof val === 'number') {
    const frac = val % 1;
    if ((val >= 0 && val < 1) || (val >= 1 && frac > 0.0001)) {
      const totalMinutes = Math.round(frac * 24 * 60);
      const hh = Math.floor(totalMinutes / 60) % 24;
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return String(val).trim();
  }

  const str = String(val).replace(/\s+/g, ' ').trim();
  const timeMatch = str.match(/^(\d{1,2})[:.hH](\d{2})$/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }
  return str;
}

/**
 * Gera 7 datas consecutivas (Seg..Dom) a partir da designação da semana (ex: "Semana 09/11 a 15/11" ou "Semana 04/01/2027 a 10/01/2027")
 */
function extractWeekDaysFromLabel(weekLabel?: string, fallbackYear = 2026): string[] {
  const defaultYear = fallbackYear >= 2026 ? fallbackYear : 2026;
  const defaultStart = new Date(Date.UTC(defaultYear, 10, 9)); // fallback seguro

  if (weekLabel) {
    const isoMatch = weekLabel.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const fullMatch = weekLabel.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
    const allShortMatches = Array.from(weekLabel.matchAll(/(\d{1,2})[/\-](\d{1,2})/g));

    if (isoMatch) {
      defaultStart.setUTCFullYear(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10)
      );
    } else if (fullMatch) {
      const day = parseInt(fullMatch[1], 10);
      const month = parseInt(fullMatch[2], 10);
      let year = parseInt(fullMatch[3], 10);
      if (year < 100) year += 2000;
      defaultStart.setUTCFullYear(year, month - 1, day);
    } else if (allShortMatches.length > 0) {
      const firstMatch = allShortMatches[0];
      const day = parseInt(firstMatch[1], 10);
      const month = parseInt(firstMatch[2], 10);
      let year = extractYearFromText(weekLabel) ?? defaultYear;

      // Caso especial transição Dez -> Jan dentro de um ficheiro de ano seguinte (ex: 28/12 a 03/01 em 2027)
      if (allShortMatches.length >= 2) {
        const endMonth = parseInt(allShortMatches[1][2], 10);
        if (month === 12 && endMonth === 1) {
          year = year - 1;
        }
      }
      defaultStart.setUTCFullYear(year, month - 1, day);
    }
  }

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(defaultStart.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

/**
 * Converte uma célula de cabeçalho (Date, número serial Excel ou texto) numa data YYYY-MM-DD
 */
function parseHeaderCellToDate(
  cell: any,
  fallbackDates: string[],
  fallbackYear = 2026,
  is1904 = false
): string | null {
  if (cell === null || cell === undefined || cell === '') return null;

  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toISOString().split('T')[0];
  }

  if (typeof cell === 'number' && cell > 35000 && cell < 75000) {
    const iso = excelSerialToIsoDate(cell, is1904);
    if (iso) return iso;
  }

  const raw = String(cell).trim();
  if (!raw) return null;

  // Formato ISO YYYY-MM-DD
  const isoMatch = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // Formato DD/MM/YYYY
  const dmyFullMatch = raw.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dmyFullMatch) {
    let year = parseInt(dmyFullMatch[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${dmyFullMatch[2].padStart(2, '0')}-${dmyFullMatch[1].padStart(2, '0')}`;
  }

  // Formato DD/MM (ex: "seg 09/11" ou "16/11")
  const dmMatch = raw.match(/(\d{1,2})[/\-](\d{1,2})/);
  if (dmMatch) {
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    const matchingFallback = fallbackDates.find(fd => fd.endsWith(`-${month}-${day}`));
    if (matchingFallback) return matchingFallback;

    const baseYear = fallbackDates[0] ? parseInt(fallbackDates[0].slice(0, 4), 10) : fallbackYear;
    const baseMonth = fallbackDates[0] ? parseInt(fallbackDates[0].slice(5, 7), 10) : parseInt(month, 10);
    let year = baseYear;
    if (baseMonth === 12 && parseInt(month, 10) === 1) year += 1;
    if (baseMonth === 1 && parseInt(month, 10) === 12) year -= 1;
    return `${year}-${month}-${day}`;
  }

  // Nome do dia da semana (seg, ter, qua, qui, sex, sab, dom)
  const norm = normalizeText(raw);
  const idx = WEEKDAY_KEYS.findIndex(k => norm === k || norm.startsWith(`${k} `) || norm.startsWith(`${k}-`));
  if (idx >= 0 && fallbackDates[idx]) {
    return fallbackDates[idx];
  }

  return null;
}

/**
 * Formata um intervalo de 7 dias para uma etiqueta legível de semana (ex: "Semana 04/01/2027 a 10/01/2027")
 */
function buildWeekLabelsFromDates(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const sorted = Array.from(new Set(dates)).sort();
  const currentYear = getCurrentOperationalYear();

  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return parseInt(y, 10) === currentYear ? `${d}/${m}` : `${d}/${m}/${y}`;
  };

  const labels: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const diffDays = Math.round(
      (new Date(curr + 'T00:00:00Z').getTime() - new Date(prev + 'T00:00:00Z').getTime()) / 86400000
    );
    const spanDays = Math.round(
      (new Date(curr + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime()) / 86400000
    );

    if (diffDays > 2 || spanDays >= 7) {
      labels.push(`Semana ${fmt(start)} a ${fmt(prev)}`);
      start = curr;
    }
    prev = curr;
  }
  labels.push(`Semana ${fmt(start)} a ${fmt(prev)}`);
  return labels;
}

/**
 * Remapeia uma data ISO de uma folha semanal única para o dia correspondente na semana selecionada
 */
function remapDateToTargetWeek(dateStr: string, targetWeekDates: string[]): string {
  if (targetWeekDates.length !== 7) return dateStr;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const targetByUtcDay = new Map<number, string>();
  for (const td of targetWeekDates) {
    const dt = new Date(`${td}T00:00:00Z`);
    if (!Number.isNaN(dt.getTime())) {
      targetByUtcDay.set(dt.getUTCDay(), td);
    }
  }
  return targetByUtcDay.get(d.getUTCDay()) || dateStr;
}

/**
 * Localiza um colaborador pelo nº mecanográfico ou nome (tolerante a acentos e múltiplos espaços)
 */
function findCollaborator(rawNameOrNum: string, collaborators: Collaborator[]): Collaborator | undefined {
  const cleanRaw = rawNameOrNum.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanRaw) return undefined;

  const numMatch = cleanRaw.match(/\b(\d{3,8})\b/);
  if (numMatch) {
    const byNum = collaborators.find(c => c.mecanographicNumber.trim() === numMatch[1]);
    if (byNum) return byNum;
  }

  const normInput = normalizeText(cleanRaw);
  const exact = collaborators.find(c => normalizeText(c.name) === normInput);
  if (exact) return exact;

  const partials = collaborators.filter(c => {
    const cNorm = normalizeText(c.name);
    return cNorm.includes(normInput) || normInput.includes(cNorm);
  });
  if (partials.length === 1) return partials[0];

  const inputTokens = normInput.split(' ').filter(t => t.length >= 3);
  if (inputTokens.length > 0) {
    const tokenMatches = collaborators.filter(c => {
      const cTokens = normalizeText(c.name).split(' ');
      return inputTokens.every(t => cTokens.includes(t));
    });
    if (tokenMatches.length === 1) return tokenMatches[0];
  }

  return undefined;
}

/**
 * Localiza uma folha específica dentro do workbook Excel (ex: PTD ou PTS)
 */
function findSheetByTarget(workbook: XLSX.WorkBook, target: 'PTD' | 'PTS'): string | undefined {
  const exact = workbook.SheetNames.find(s => normalizeText(s) === target);
  if (exact) return exact;

  const startsWith = workbook.SheetNames.find(s => normalizeText(s).startsWith(target));
  if (startsWith) return startsWith;

  return workbook.SheetNames.find(s => normalizeText(s).includes(target));
}

interface PtdBlock {
  headerRowIdx: number;
  dataStartIdx: number;
  endRowIdx: number;
  dayColumns: { colIdx: number; mealColIdx?: number; date: string }[];
}

/**
 * Analisa a folha PTD (ptd app — Tarefas Principais e Refeições), suportando blocos semanais únicos ou múltiplos
 */
function parsePtdSheet(
  sheet: XLSX.WorkSheet,
  weekDates: string[],
  defaultYear: number,
  is1904: boolean,
  collaborators: Collaborator[],
  importId: string,
  explicitWeekSelected = false
): {
  previewRows: ImportedRowPreview[];
  generatedTasks: DailyTask[];
  generatedMeals: MealSchedule[];
  warnings: string[];
  workingByDate: Map<string, Set<string>>;
  allFoundDates: Set<string>;
} {
  const warnings: string[] = [];
  const previewRows: ImportedRowPreview[] = [];
  const generatedTasks: DailyTask[] = [];
  const generatedMeals: MealSchedule[] = [];
  const workingByDate = new Map<string, Set<string>>();
  const allFoundDates = new Set<string>();

  const rows = xlsxLib.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) {
    warnings.push('A folha PTD encontra-se vazia.');
    return { previewRows, generatedTasks, generatedMeals, warnings, workingByDate, allFoundDates };
  }

  // Usar o ano operacional corrente (ou ano explicitamente indicado na semana) — nunca assumir 2027 a partir de títulos como "PTD 2027"
  const sheetYear = defaultYear;

  // Varrer todas as linhas para detetar blocos semanais (suporta 1 semana ou 52 semanas no mesmo ficheiro)
  const blocks: PtdBlock[] = [];
  let rollingFallbackDates = [...weekDates];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const joined = row.map(c => String(c || '')).join(' ');
    const normJoined = normalizeText(joined);
    if (normJoined.includes('SEMANA') && /\d{1,2}[/\-]\d{1,2}/.test(joined)) {
      rollingFallbackDates = extractWeekDaysFromLabel(joined, extractYearFromText(joined) ?? sheetYear);
    }

    const foundCols: { colIdx: number; date: string }[] = [];
    row.forEach((cell, cIdx) => {
      const parsedDate = parseHeaderCellToDate(cell, rollingFallbackDates, sheetYear, is1904);
      if (parsedDate) {
        foundCols.push({ colIdx: cIdx, date: parsedDate });
      }
    });

    if (foundCols.length >= 3) {
      let dataStartIdx = r + 1;
      let subHeaderRowIdx = -1;
      for (let sr = r + 1; sr <= Math.min(r + 2, rows.length - 1); sr++) {
        const normSub = rows[sr].map(c => normalizeText(String(c || '')));
        if (normSub.some(c => c === 'TAREFA' || c.startsWith('REF') || c.includes('REFEIC'))) {
          subHeaderRowIdx = sr;
          dataStartIdx = sr + 1;
          break;
        }
      }

      const dayColumns = foundCols.map((fc, i) => {
        const nextColIdx = i + 1 < foundCols.length ? foundCols[i + 1].colIdx : fc.colIdx + 2;
        let taskCol = fc.colIdx;
        let mealCol: number | undefined;

        if (subHeaderRowIdx !== -1) {
          const subRow = rows[subHeaderRowIdx];
          for (let scan = fc.colIdx; scan < Math.min(fc.colIdx + 2, nextColIdx, subRow.length); scan++) {
            const subLabel = normalizeText(String(subRow[scan] || ''));
            if (
              subLabel.startsWith('REF') ||
              subLabel.includes('REFEIC') ||
              subLabel.includes('ALMOCO') ||
              subLabel.includes('HORA')
            ) {
              mealCol = scan;
            } else if (subLabel.includes('TAREFA')) {
              taskCol = scan;
            }
          }
          if (mealCol === undefined && nextColIdx - fc.colIdx === 2) {
            mealCol = fc.colIdx + 1;
          }
        } else if (nextColIdx - fc.colIdx === 2) {
          mealCol = fc.colIdx + 1;
        }

        allFoundDates.add(fc.date);
        return { colIdx: taskCol, mealColIdx: mealCol, date: fc.date };
      });

      if (blocks.length > 0) {
        blocks[blocks.length - 1].endRowIdx = r;
      }

      blocks.push({
        headerRowIdx: r,
        dataStartIdx,
        endRowIdx: rows.length,
        dayColumns,
      });

      if (subHeaderRowIdx !== -1) {
        r = subHeaderRowIdx;
      }
    }
  }

  // Se a folha PTD contiver apenas 1 semana (<= 7 dias distintos) e o utilizador selecionou explicitamente uma semana alvo,
  // alinha as colunas da semana (Seg..Dom) com as datas exatas da semana escolhida.
  if (explicitWeekSelected && weekDates.length === 7 && allFoundDates.size > 0 && allFoundDates.size <= 7) {
    const targetSet = new Set(weekDates);
    const alreadyMatches = Array.from(allFoundDates).every(d => targetSet.has(d));
    if (!alreadyMatches) {
      allFoundDates.clear();
      for (const b of blocks) {
        b.dayColumns = b.dayColumns.map(dc => {
          const newDate = remapDateToTargetWeek(dc.date, weekDates);
          allFoundDates.add(newDate);
          return { ...dc, date: newDate };
        });
      }
    }
  }

  // Fallback para formato tabular PTD: [Colaborador, Data, Tarefa, Refeição]
  if (blocks.length === 0) {
    let tabHeaderIdx = -1;
    let tabHeaders: string[] = [];
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const h = rows[r].map(c => normalizeText(String(c || '')));
      if (h.some(x => x.includes('DATA') || x.includes('DIA')) && h.some(x => x.includes('TAREFA'))) {
        tabHeaderIdx = r;
        tabHeaders = h;
        break;
      }
    }

    if (tabHeaderIdx >= 0) {
      const colColab = Math.max(0, tabHeaders.findIndex(h => h.includes('COLAB') || h.includes('NOME') || h.includes('MEC')));
      const colDate = tabHeaders.findIndex(h => h.includes('DATA') || h.includes('DIA'));
      const colTask = tabHeaders.findIndex(h => h.includes('TAREFA'));
      const colMeal = tabHeaders.findIndex(h => h.includes('REF') || h.includes('HORA'));

      for (let r = tabHeaderIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const rawColab = String(row[colColab] || '').trim();
        const parsedDate = parseHeaderCellToDate(row[colDate], rollingFallbackDates, sheetYear, is1904);
        const rawTask = String(row[colTask] || '').trim().toUpperCase();
        const rawMeal = colMeal >= 0 ? formatTimeCell(row[colMeal]) : '';

        if (!rawColab || !parsedDate) continue;
        allFoundDates.add(parsedDate);

        const colab = findCollaborator(rawColab, collaborators);
        if (!colab) {
          warnings.push(`Folha PTD (Linha ${r + 1}): Colaborador "${rawColab}" não encontrado.`);
          continue;
        }

        const isAbsent = ABSENT_KEYWORDS.some(k => normalizeText(rawTask).includes(k));
        if (isAbsent) {
          previewRows.push({
            rawLine: `${colab.name} | ${parsedDate} | ${rawTask}`,
            collaboratorName: colab.name,
            mecanographicNumber: colab.mecanographicNumber,
            date: parsedDate,
            taskType: 'PRINCIPAL',
            description: `Situação: ${rawTask}`,
            isMatched: true,
          });
          continue;
        }

        if (colab.role !== 'ADMIN') {
          if (!workingByDate.has(parsedDate)) workingByDate.set(parsedDate, new Set());
          workingByDate.get(parsedDate)!.add(colab.mecanographicNumber);

          const taskDesc = getPrincipalTaskDescription(rawTask);
          previewRows.push({
            rawLine: `${colab.name} | ${parsedDate} | ${rawTask} | ${rawMeal}`,
            collaboratorName: colab.name,
            mecanographicNumber: colab.mecanographicNumber,
            date: parsedDate,
            taskType: 'PRINCIPAL',
            description: taskDesc,
            mealTime: rawMeal || undefined,
            isMatched: true,
          });

          if (rawTask) {
            generatedTasks.push({
              id: `task-ptd-${colab.mecanographicNumber}-${parsedDate}`,
              collaboratorId: colab.id,
              mecanographicNumber: colab.mecanographicNumber,
              collaboratorName: colab.name,
              date: parsedDate,
              description: taskDesc,
              type: 'PRINCIPAL',
              source: 'PTD',
              importId,
              status: 'POR_ASSINALAR',
              history: [],
            });
          }

          if (rawMeal && /\d{1,2}:\d{2}/.test(rawMeal)) {
            generatedMeals.push({
              id: `meal-ptd-${colab.mecanographicNumber}-${parsedDate}`,
              collaboratorId: colab.id,
              mecanographicNumber: colab.mecanographicNumber,
              collaboratorName: colab.name,
              date: parsedDate,
              time: rawMeal,
              source: 'PTD',
            });
          }
        }
      }

      return { previewRows, generatedTasks, generatedMeals, warnings, workingByDate, allFoundDates };
    }

    warnings.push('Folha PTD: Não foi possível detetar as colunas dos dias da semana (ex: seg 09/11 ... dom 15/11).');
    return { previewRows, generatedTasks, generatedMeals, warnings, workingByDate, allFoundDates };
  }

  const seenTaskIds = new Set<string>();
  const seenMealIds = new Set<string>();

  for (const block of blocks) {
    const firstDayCol = block.dayColumns[0].colIdx;
    let colColabIdx = 0;
    for (let sr = Math.max(0, block.headerRowIdx - 2); sr <= block.headerRowIdx; sr++) {
      const idx = rows[sr].findIndex((c, ci) => {
        if (ci >= firstDayCol) return false;
        const n = normalizeText(String(c || ''));
        return n === 'NOME' || n.includes('COLABORADOR') || n.includes('MECANOGRAFICO');
      });
      if (idx >= 0) {
        colColabIdx = idx;
        break;
      }
    }

    for (let r = block.dataStartIdx; r < block.endRowIdx; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      let rawColab = String(row[colColabIdx] || '').trim();
      if (!rawColab && firstDayCol > 1) {
        for (let c = 0; c < firstDayCol; c++) {
          const candidate = String(row[c] || '').trim();
          if (candidate) {
            rawColab = candidate;
            break;
          }
        }
      }
      if (!rawColab) continue;

      const normColab = normalizeText(rawColab);
      if (
        normColab.startsWith('TURNO') ||
        normColab === 'NOME' ||
        normColab === 'COLABORADOR' ||
        normColab === 'TAREFA' ||
        normColab.includes('PLANO TAREFAS') ||
        normColab.startsWith('SEMANA')
      ) {
        continue;
      }

      let colab = findCollaborator(rawColab, collaborators);
      if (!colab && firstDayCol > 1) {
        // Caso tenha nº mecanográfico noutra coluna antes do primeiro dia
        for (let c = 0; c < firstDayCol; c++) {
          if (c === colColabIdx) continue;
          const alt = String(row[c] || '').trim();
          if (alt) {
            colab = findCollaborator(alt, collaborators);
            if (colab) break;
          }
        }
      }

      if (!colab) {
        warnings.push(`Folha PTD (Linha ${r + 1}): Colaborador "${rawColab}" não encontrado no registo da secção.`);
        continue;
      }

      block.dayColumns.forEach(dc => {
        const rawTaskCell = String(row[dc.colIdx] || '').trim();
        const rawMealCell = dc.mealColIdx !== undefined ? formatTimeCell(row[dc.mealColIdx]) : '';

        if (!rawTaskCell && !rawMealCell) return;

        let taskPart = rawTaskCell.replace(/\s+/g, ' ').trim().toUpperCase();
        let mealPart = rawMealCell;

        if (!mealPart && taskPart) {
          const mealMatch = taskPart.match(/(\d{1,2}[:.hH]\d{2})/);
          if (mealMatch) {
            mealPart = formatTimeCell(mealMatch[1]);
            taskPart = taskPart.replace(mealMatch[0], '').replace(/[()/\-–]/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }

        const normTask = normalizeText(taskPart);
        const isAbsent = ABSENT_KEYWORDS.some(k => normTask.includes(k));

        if (isAbsent) {
          const situationLabel = normTask.includes('FERIAS')
            ? 'FÉRIAS'
            : normTask.includes('FOLGA')
            ? 'FOLGA'
            : 'AUSÊNCIA';
          previewRows.push({
            rawLine: `${colab!.name} | ${dc.date} | ${situationLabel}`,
            collaboratorName: colab!.name,
            mecanographicNumber: colab!.mecanographicNumber,
            date: dc.date,
            taskType: 'PRINCIPAL',
            description: `Situação: ${situationLabel}`,
            isMatched: true,
          });
          return;
        }

        if (colab!.role !== 'ADMIN') {
          if (!workingByDate.has(dc.date)) workingByDate.set(dc.date, new Set());
          workingByDate.get(dc.date)!.add(colab!.mecanographicNumber);

          const taskDesc = taskPart ? getPrincipalTaskDescription(taskPart) : '';
          if (taskDesc) {
            previewRows.push({
              rawLine: `${colab!.name} | ${dc.date} | ${taskPart}${mealPart ? ` (${mealPart})` : ''}`,
              collaboratorName: colab!.name,
              mecanographicNumber: colab!.mecanographicNumber,
              date: dc.date,
              taskType: 'PRINCIPAL',
              description: taskDesc,
              mealTime: mealPart || undefined,
              isMatched: true,
            });

            const tId = `task-ptd-${colab!.mecanographicNumber}-${dc.date}`;
            if (!seenTaskIds.has(tId)) {
              seenTaskIds.add(tId);
              generatedTasks.push({
                id: tId,
                collaboratorId: colab!.id,
                mecanographicNumber: colab!.mecanographicNumber,
                collaboratorName: colab!.name,
                date: dc.date,
                description: taskDesc,
                type: 'PRINCIPAL',
                source: 'PTD',
                importId,
                status: 'POR_ASSINALAR',
                history: [],
              });
            }
          }

          if (mealPart && /\d{1,2}:\d{2}/.test(mealPart)) {
            const mId = `meal-ptd-${colab!.mecanographicNumber}-${dc.date}`;
            if (!seenMealIds.has(mId)) {
              seenMealIds.add(mId);
              generatedMeals.push({
                id: mId,
                collaboratorId: colab!.id,
                mecanographicNumber: colab!.mecanographicNumber,
                collaboratorName: colab!.name,
                date: dc.date,
                time: mealPart,
                source: 'PTD',
              });
            }
          }
        }
      });
    }
  }

  return { previewRows, generatedTasks, generatedMeals, warnings, workingByDate, allFoundDates };
}

interface PtsBlock {
  headerRowIdx: number;
  endRowIdx: number;
  headersNorm: string[];
  dayColumns: { colIdx: number; date: string }[];
}

/**
 * Analisa a folha PTS (pts app — Tarefas Secundárias), suportando blocos semanais únicos ou múltiplos
 */
function parsePtsSheet(
  sheet: XLSX.WorkSheet,
  weekDates: string[],
  defaultYear: number,
  is1904: boolean,
  collaborators: Collaborator[],
  importId: string,
  workingByDate: Map<string, Set<string>>,
  explicitWeekSelected = false
): {
  previewRows: ImportedRowPreview[];
  generatedTasks: DailyTask[];
  warnings: string[];
  allFoundDates: Set<string>;
} {
  const warnings: string[] = [];
  const previewRows: ImportedRowPreview[] = [];
  const generatedTasks: DailyTask[] = [];
  const allFoundDates = new Set<string>();

  const rows = xlsxLib.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) {
    warnings.push('A folha PTS encontra-se vazia.');
    return { previewRows, generatedTasks, warnings, allFoundDates };
  }

  // Usar o ano operacional corrente (ou ano explicitamente indicado na semana) — nunca assumir 2027 a partir de títulos como "PTS 2027"
  const sheetYear = defaultYear;

  // Varrer todas as linhas da folha PTS para encontrar todos os cabeçalhos semanais
  const blocks: PtsBlock[] = [];
  let rollingFallbackDates = [...weekDates];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const joined = row.map(c => String(c || '')).join(' ');
    const normJoined = normalizeText(joined);
    if (normJoined.includes('SEMANA') && /\d{1,2}[/\-]\d{1,2}/.test(joined)) {
      rollingFallbackDates = extractWeekDaysFromLabel(joined, extractYearFromText(joined) ?? sheetYear);
    }

    const foundCols: { colIdx: number; date: string }[] = [];
    row.forEach((cell, cIdx) => {
      const parsed = parseHeaderCellToDate(cell, rollingFallbackDates, sheetYear, is1904);
      if (parsed) foundCols.push({ colIdx: cIdx, date: parsed });
    });

    if (foundCols.length >= 3) {
      foundCols.forEach(fc => allFoundDates.add(fc.date));
      if (blocks.length > 0) {
        blocks[blocks.length - 1].endRowIdx = r;
      }
      blocks.push({
        headerRowIdx: r,
        endRowIdx: rows.length,
        headersNorm: row.map(c => normalizeText(String(c || ''))),
        dayColumns: foundCols,
      });
    }
  }

  // Se a folha PTS contiver apenas 1 semana (<= 7 dias distintos) e o utilizador selecionou explicitamente uma semana alvo,
  // alinha os dias da semana (Seg..Dom) com as datas da semana selecionada.
  if (explicitWeekSelected && weekDates.length === 7 && allFoundDates.size > 0 && allFoundDates.size <= 7) {
    const targetSet = new Set(weekDates);
    const alreadyMatches = Array.from(allFoundDates).every(d => targetSet.has(d));
    if (!alreadyMatches) {
      allFoundDates.clear();
      for (const b of blocks) {
        b.dayColumns = b.dayColumns.map(dc => {
          const newDate = remapDateToTargetWeek(dc.date, weekDates);
          allFoundDates.add(newDate);
          return { ...dc, date: newDate };
        });
      }
    }
  }

  if (blocks.length === 0) {
    warnings.push('Folha PTS: Não foi possível detetar o cabeçalho dos dias da semana.');
    return { previewRows, generatedTasks, warnings, allFoundDates };
  }

  const createdIds = new Set<string>();

  for (const block of blocks) {
    const firstDayCol = block.dayColumns[0].colIdx;
    const isCollaboratorMatrix = block.headersNorm
      .slice(0, firstDayCol)
      .some(h => h.includes('COLABORADOR') || h.includes('NOME') || h.includes('MECANOGRAFICO'));

    if (isCollaboratorMatrix) {
      const colColab = Math.max(
        0,
        block.headersNorm.findIndex(h => h.includes('COLABORADOR') || h.includes('NOME') || h.includes('MEC'))
      );
      for (let r = block.headerRowIdx + 1; r < block.endRowIdx; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const rawColab = String(row[colColab] || '').trim();
        if (!rawColab || normalizeText(rawColab).startsWith('TURNO') || normalizeText(rawColab).startsWith('SEMANA')) {
          continue;
        }

        const colab = findCollaborator(rawColab, collaborators);
        if (!colab) {
          warnings.push(`Folha PTS (Linha ${r + 1}): Colaborador "${rawColab}" não encontrado.`);
          continue;
        }

        block.dayColumns.forEach(dc => {
          const cellVal = String(row[dc.colIdx] || '').replace(/\s+/g, ' ').trim();
          if (!cellVal) return;
          const normCell = normalizeText(cellVal);
          if (ABSENT_KEYWORDS.some(k => normCell.includes(k))) return;

          if (colab.role !== 'ADMIN') {
            const slug = normCell.replace(/[^A-Z0-9]/g, '-').toLowerCase();
            const taskId = `task-pts-${slug}-${colab.mecanographicNumber}-${dc.date}`;
            if (!createdIds.has(taskId)) {
              createdIds.add(taskId);
              generatedTasks.push({
                id: taskId,
                collaboratorId: colab.id,
                mecanographicNumber: colab.mecanographicNumber,
                collaboratorName: colab.name,
                date: dc.date,
                description: cellVal,
                type: 'SECUNDARIA',
                source: 'PTS',
                importId,
                status: 'POR_ASSINALAR',
                history: [],
              });
            }

            previewRows.push({
              rawLine: `${cellVal} | ${dc.date} -> ${colab.name}`,
              collaboratorName: colab.name,
              mecanographicNumber: colab.mecanographicNumber,
              date: dc.date,
              taskType: 'SECUNDARIA',
              description: cellVal,
              isMatched: true,
            });
          }
        });
      }
      continue;
    }

    // Formato padrão PTS: Coluna TAREFA | Coluna HORÁRIO | seg .. dom
    let colTaskIdx = block.headersNorm.findIndex((h, idx) => idx < firstDayCol && h.includes('TAREFA'));
    if (colTaskIdx === -1) colTaskIdx = 0;

    let colTimeIdx = block.headersNorm.findIndex(
      (h, idx) => idx < firstDayCol && (h.includes('HORA') || h.includes('TURNO') || h.includes('PERIOD'))
    );
    if (colTimeIdx === -1 && firstDayCol >= 2) colTimeIdx = colTaskIdx + 1;

    let currentShiftSuffix = '';

    for (let r = block.headerRowIdx + 1; r < block.endRowIdx; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawTask = String(row[colTaskIdx] || '').replace(/\s+/g, ' ').trim();
      const rawTime = colTimeIdx >= 0 ? formatTimeCell(row[colTimeIdx]) : '';

      if (!rawTask) continue;
      const normTask = normalizeText(rawTask);

      if (normTask.startsWith('TURNO')) {
        if (normTask.includes('MANHA')) currentShiftSuffix = 'MANHÃ';
        else if (normTask.includes('TARDE') || normTask.includes('NOITE')) currentShiftSuffix = 'NOITE';
        else currentShiftSuffix = '';
        continue;
      }

      if (normTask === 'TAREFA' || normTask.includes('PLANO SEMANAL') || normTask.startsWith('SEMANA')) {
        continue;
      }

      let taskDescription = rawTask;
      if ((normTask === 'QUEBRA' || normTask === 'ARRUMAR CAIXAS CHEP') && currentShiftSuffix) {
        taskDescription = `${rawTask} (${currentShiftSuffix})`;
      }

      const taskSlugBase = normalizeText(taskDescription).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

      block.dayColumns.forEach(dc => {
        const cellRaw = String(row[dc.colIdx] || '').trim();
        if (!cellRaw || cellRaw === '-' || cellRaw === '—') return;

        const cleanedCell = cellRaw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        const normCell = normalizeText(cleanedCell);

        if (normCell === 'TODOS' || normCell === 'TODOS OS COLABORADORES') {
          const workingSet = workingByDate.get(dc.date);
          const targetColabs = collaborators.filter(c => {
            if (c.status !== 'ATIVO' || c.role === 'ADMIN' || c.role === 'GESTOR_STOCKS_PDE') return false;
            if (workingSet && workingSet.size > 0) {
              return workingSet.has(c.mecanographicNumber);
            }
            return true;
          });

          targetColabs.forEach(colab => {
            const taskId = `task-pts-${taskSlugBase}-${colab.mecanographicNumber}-${dc.date}`;
            if (!createdIds.has(taskId)) {
              createdIds.add(taskId);
              generatedTasks.push({
                id: taskId,
                collaboratorId: colab.id,
                mecanographicNumber: colab.mecanographicNumber,
                collaboratorName: colab.name,
                date: dc.date,
                description: taskDescription,
                time: rawTime || undefined,
                type: 'SECUNDARIA',
                source: 'PTS',
                importId,
                status: 'POR_ASSINALAR',
                history: [],
              });
            }
          });

          previewRows.push({
            rawLine: `${taskDescription}${rawTime ? ` (${rawTime})` : ''} | ${dc.date} -> TODOS`,
            collaboratorName: `TODOS OS COLABORADORES (${targetColabs.length})`,
            date: dc.date,
            taskType: 'SECUNDARIA',
            description: taskDescription,
            time: rawTime || undefined,
            isMatched: true,
          });
          return;
        }

        const directColab = findCollaborator(cleanedCell, collaborators);
        const candidates = directColab
          ? [cleanedCell]
          : cellRaw
              .split(/[,;/+\n]+/)
              .map(s => s.replace(/\s+/g, ' ').trim())
              .filter(Boolean);

        candidates.forEach(candidate => {
          const colab = findCollaborator(candidate, collaborators);
          if (!colab) {
            warnings.push(`Folha PTS (${dc.date} · ${taskDescription}): Colaborador "${candidate}" não encontrado.`);
            previewRows.push({
              rawLine: `${taskDescription} | ${dc.date} -> ${candidate}`,
              collaboratorName: candidate,
              date: dc.date,
              taskType: 'SECUNDARIA',
              description: taskDescription,
              time: rawTime || undefined,
              isMatched: false,
              warning: 'Colaborador não encontrado no registo.',
            });
            return;
          }

          if (colab.role !== 'ADMIN') {
            const taskId = `task-pts-${taskSlugBase}-${colab.mecanographicNumber}-${dc.date}`;
            if (!createdIds.has(taskId)) {
              createdIds.add(taskId);
              generatedTasks.push({
                id: taskId,
                collaboratorId: colab.id,
                mecanographicNumber: colab.mecanographicNumber,
                collaboratorName: colab.name,
                date: dc.date,
                description: taskDescription,
                time: rawTime || undefined,
                type: 'SECUNDARIA',
                source: 'PTS',
                importId,
                status: 'POR_ASSINALAR',
                history: [],
              });
            }
          }

          previewRows.push({
            rawLine: `${taskDescription}${rawTime ? ` (${rawTime})` : ''} | ${dc.date} -> ${colab.name}`,
            collaboratorName: colab.name,
            mecanographicNumber: colab.mecanographicNumber,
            date: dc.date,
            taskType: 'SECUNDARIA',
            description: taskDescription,
            time: rawTime || undefined,
            isMatched: true,
          });
        });
      });
    }
  }

  return { previewRows, generatedTasks, warnings, allFoundDates };
}

/**
 * Analisa e extrai informação de um ficheiro Excel (.xlsx):
 * - A informação de ptd app é retirada da folha PTD do ficheiro carregado.
 * - A informação de pts app é retirada da folha PTS do ficheiro carregado.
 * - Se o ficheiro contiver várias semanas (ex: ficheiro anual 2027), filtra automaticamente para a semana escolhida.
 */
export function parseScheduleWorkbook(
  dataBuffer: Buffer,
  fileName: string,
  sourceType: ImportWorkbookScope,
  weekLabel: string,
  collaborators: Collaborator[],
  importIds?: { ptdId?: string; ptsId?: string },
  options?: { explicitWeekSelected?: boolean }
): ParsedSpreadsheetResult {
  const currentYear = getCurrentOperationalYear();
  const explicitYearInWeek = extractYearFromText(weekLabel);
  const inferredYear = explicitYearInWeek ?? currentYear;
  const weekDates = extractWeekDaysFromLabel(weekLabel, inferredYear);

  let workbook: XLSX.WorkBook;
  try {
    workbook = xlsxLib.read(dataBuffer, { type: 'buffer' });
  } catch (err: any) {
    return {
      sourceType,
      week: weekLabel,
      sheetsFound: [],
      hasPtdSheet: false,
      hasPtsSheet: false,
      previewRows: [],
      generatedTasks: [],
      generatedMeals: [],
      ptdTasksCount: 0,
      ptsTasksCount: 0,
      mealsCount: 0,
      warnings: [],
      error: `Erro ao ler o ficheiro Excel (.xlsx): ${err.message}`,
    };
  }

  const is1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const sheetsFound = workbook.SheetNames || [];
  const ptdSheetName = findSheetByTarget(workbook, 'PTD');
  const ptsSheetName = findSheetByTarget(workbook, 'PTS');

  const hasPtdSheet = Boolean(ptdSheetName);
  const hasPtsSheet = Boolean(ptsSheetName);

  if (sourceType === 'PTD' && !ptdSheetName) {
    return {
      sourceType,
      week: weekLabel,
      sheetsFound,
      hasPtdSheet,
      hasPtsSheet,
      previewRows: [],
      generatedTasks: [],
      generatedMeals: [],
      ptdTasksCount: 0,
      ptsTasksCount: 0,
      mealsCount: 0,
      warnings: [],
      error: `Folha "PTD" não encontrada no ficheiro .xlsx. Folhas encontradas: ${sheetsFound.join(', ') || 'nenhuma'}.`,
    };
  }

  if (sourceType === 'PTS' && !ptsSheetName) {
    return {
      sourceType,
      week: weekLabel,
      sheetsFound,
      hasPtdSheet,
      hasPtsSheet,
      previewRows: [],
      generatedTasks: [],
      generatedMeals: [],
      ptdTasksCount: 0,
      ptsTasksCount: 0,
      mealsCount: 0,
      warnings: [],
      error: `Folha "PTS" não encontrada no ficheiro .xlsx. Folhas encontradas: ${sheetsFound.join(', ') || 'nenhuma'}.`,
    };
  }

  if (sourceType === 'BOTH' && !ptdSheetName && !ptsSheetName) {
    return {
      sourceType,
      week: weekLabel,
      sheetsFound,
      hasPtdSheet,
      hasPtsSheet,
      previewRows: [],
      generatedTasks: [],
      generatedMeals: [],
      ptdTasksCount: 0,
      ptsTasksCount: 0,
      mealsCount: 0,
      warnings: [],
      error: `Não foram encontradas as folhas "PTD" ou "PTS" no ficheiro .xlsx. Folhas encontradas: ${sheetsFound.join(', ') || 'nenhuma'}.`,
    };
  }

  const warnings: string[] = [];
  let previewRows: ImportedRowPreview[] = [];
  let generatedTasks: DailyTask[] = [];
  let generatedMeals: MealSchedule[] = [];
  let workingByDate = new Map<string, Set<string>>();
  const allFoundDates = new Set<string>();

  const explicitWeekSelected = Boolean(options?.explicitWeekSelected);
  let ptdFoundCount = 0;
  let ptsFoundCount = 0;

  if ((sourceType === 'BOTH' || sourceType === 'PTD') && ptdSheetName) {
    const ptdRes = parsePtdSheet(
      workbook.Sheets[ptdSheetName],
      weekDates,
      inferredYear,
      is1904,
      collaborators,
      importIds?.ptdId || `imp-ptd-${Date.now()}`,
      explicitWeekSelected
    );
    previewRows.push(...ptdRes.previewRows);
    generatedTasks.push(...ptdRes.generatedTasks);
    generatedMeals.push(...ptdRes.generatedMeals);
    warnings.push(...ptdRes.warnings);
    workingByDate = ptdRes.workingByDate;
    ptdFoundCount = ptdRes.allFoundDates.size;
    ptdRes.allFoundDates.forEach(d => allFoundDates.add(d));
  } else if (sourceType === 'BOTH' && !ptdSheetName) {
    warnings.push(`Aviso: A folha "PTD" não foi encontrada no ficheiro .xlsx (apenas a folha "${ptsSheetName}" foi lida).`);
  }

  if ((sourceType === 'BOTH' || sourceType === 'PTS') && ptsSheetName) {
    if (sourceType === 'PTS' && ptdSheetName) {
      const refPtd = parsePtdSheet(
        workbook.Sheets[ptdSheetName],
        weekDates,
        inferredYear,
        is1904,
        collaborators,
        'ref-only',
        explicitWeekSelected
      );
      workingByDate = refPtd.workingByDate;
    }

    const ptsRes = parsePtsSheet(
      workbook.Sheets[ptsSheetName],
      weekDates,
      inferredYear,
      is1904,
      collaborators,
      importIds?.ptsId || `imp-pts-${Date.now()}`,
      workingByDate,
      explicitWeekSelected
    );
    previewRows.push(...ptsRes.previewRows);
    generatedTasks.push(...ptsRes.generatedTasks);
    warnings.push(...ptsRes.warnings);
    ptsFoundCount = ptsRes.allFoundDates.size;
    ptsRes.allFoundDates.forEach(d => allFoundDates.add(d));
  } else if (sourceType === 'BOTH' && !ptsSheetName) {
    warnings.push(`Aviso: A folha "PTS" não foi encontrada no ficheiro .xlsx (apenas a folha "${ptdSheetName}" foi lida).`);
  }

  const sortedFoundDates = Array.from(allFoundDates).sort();
  const detectedWeeks = buildWeekLabelsFromDates(sortedFoundDates);
  const isMultiWeekWorkbook = ptdFoundCount > 7 || ptsFoundCount > 7 || allFoundDates.size > 7;

  // Se o workbook contiver múltiplas semanas (> 7 dias distintos), filtrar exatamente para a semana selecionada
  if (isMultiWeekWorkbook) {
    const exactTargetSet = new Set(weekDates);
    let activeDateFilter: Set<string> | null = null;

    if (weekDates.some(d => allFoundDates.has(d))) {
      activeDateFilter = exactTargetSet;
    } else {
      // Fallback caso o utilizador tenha escrito "Semana DD/MM a DD/MM" sem o ano
      const targetMonthDays = new Set(weekDates.map(d => d.slice(5)));
      const matched = sortedFoundDates.filter(d => targetMonthDays.has(d.slice(5)));
      if (matched.length > 0) {
        activeDateFilter = new Set(matched);
      }
    }

    if (!activeDateFilter) {
      return {
        sourceType,
        week: weekLabel,
        sheetsFound,
        hasPtdSheet,
        hasPtsSheet,
        detectedWeeks,
        previewRows: [],
        generatedTasks: [],
        generatedMeals: [],
        ptdTasksCount: 0,
        ptsTasksCount: 0,
        mealsCount: 0,
        warnings: [],
        error: `A semana "${weekLabel}" não corresponde às datas encontradas no ficheiro (${detectedWeeks.slice(0, 8).join(', ')}${detectedWeeks.length > 8 ? '...' : ''}). Selecione uma das semanas detetadas.`,
      };
    }

    previewRows = previewRows.filter(r => Boolean(r.date && activeDateFilter!.has(r.date)));
    generatedTasks = generatedTasks.filter(t => activeDateFilter!.has(t.date));
    generatedMeals = generatedMeals.filter(m => activeDateFilter!.has(m.date));

    // Se a semana selecionada não especificou outro ano, garantir que as datas ficam no ano corrente (ex: 2026, não 2027)
    if (!explicitYearInWeek) {
      const targetYearPrefix = `${currentYear}-`;
      const normalizeToCurrentYear = (iso: string) =>
        iso.startsWith(targetYearPrefix) ? iso : `${currentYear}-${iso.slice(5)}`;

      previewRows = previewRows.map(r => (r.date ? { ...r, date: normalizeToCurrentYear(r.date) } : r));
      generatedTasks = generatedTasks.map(t => {
        const newDate = normalizeToCurrentYear(t.date);
        return newDate === t.date ? t : { ...t, id: t.id.replace(t.date, newDate), date: newDate };
      });
      generatedMeals = generatedMeals.map(m => {
        const newDate = normalizeToCurrentYear(m.date);
        return newDate === m.date ? m : { ...m, id: m.id.replace(m.date, newDate), date: newDate };
      });
    }
  }

  const effectiveWeek =
    !explicitWeekSelected && !isMultiWeekWorkbook && detectedWeeks.length === 1
      ? detectedWeeks[0]
      : weekLabel;

  const ptdTasksCount = generatedTasks.filter(t => t.source === 'PTD').length;
  const ptsTasksCount = generatedTasks.filter(t => t.source === 'PTS').length;

  return {
    sourceType,
    week: effectiveWeek,
    sheetsFound,
    hasPtdSheet,
    hasPtsSheet,
    detectedWeeks,
    previewRows,
    generatedTasks,
    generatedMeals,
    ptdTasksCount,
    ptsTasksCount,
    mealsCount: generatedMeals.length,
    warnings,
  };
}

/**
 * Mantida para compatibilidade retroativa caso seja chamada diretamente
 */
export function parseScheduleSpreadsheet(
  dataBuffer: Buffer,
  fileName: string,
  sourceType: ImportWorkbookScope,
  weekLabel: string,
  collaborators: Collaborator[]
): ParsedSpreadsheetResult {
  return parseScheduleWorkbook(dataBuffer, fileName, sourceType, weekLabel, collaborators);
}

/**
 * Gera um ficheiro Excel modelo oficial (.xlsx) com duas folhas separadas:
 * - Folha "PTD": tarefas principais e refeições (ptd app)
 * - Folha "PTS": tarefas secundárias e horários (pts app)
 */
export function generateScheduleTemplateBuffer(collaborators: Collaborator[]): Buffer {
  const activeWorkers = collaborators.filter(
    c => c.status === 'ATIVO' && c.role !== 'ADMIN' && c.role !== 'GESTOR_STOCKS_PDE'
  );

  // --- Folha 1: PTD ---
  const ptdRow1 = ['PLANO TAREFAS FRUTAS E LEGUMES', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const ptdRow2 = ['SEMANA 09/11 a 15/11', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const ptdRow3 = [
    'NOME',
    'seg 09/11', '',
    'ter 10/11', '',
    'qua 11/11', '',
    'qui 12/11', '',
    'sex 13/11', '',
    'sáb 14/11', '',
    'dom 15/11', '',
  ];
  const ptdRow4 = [
    '',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
    'TAREFA', 'REF.',
  ];

  const ptdDataRows = activeWorkers.map(c => [
    c.name,
    'A', '09:00',
    'B', '09:00',
    'FOLGA', '',
    'S', '08:00',
    'L', '12:00',
    'TAKEOUT', '11:30',
    'FOLGA', '',
  ]);

  const ptdSheet = xlsxLib.utils.aoa_to_sheet([ptdRow1, ptdRow2, ptdRow3, ptdRow4, ...ptdDataRows]);
  ptdSheet['!cols'] = [
    { wch: 24 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 8 },
  ];

  // --- Folha 2: PTS ---
  const ptsRow1 = ['PLANO SEMANAL DE TAREFAS', '', '', '', '', '', '', '', ''];
  const ptsRow2 = ['SEMANA 09/11 a 15/11', '', '', '', '', '', '', '', ''];
  const ptsRow3 = [
    'TAREFA',
    'HORÁRIO',
    'seg 09/11',
    'ter 10/11',
    'qua 11/11',
    'qui 12/11',
    'sex 13/11',
    'sáb 14/11',
    'dom 15/11',
  ];

  const firstWorker = activeWorkers[0]?.name || 'ALVARO SANTOS';
  const secondWorker = activeWorkers[1]?.name || 'ANTONIO MOTA';

  const ptsRows = [
    ['TURNO DA MANHÃ', '', '', '', '', '', '', '', ''],
    ["VERIFICAR R's e VALIDADES", 'DURANTE O TURNO', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS'],
    ['PICAR FOLHETO E AUDITAR FALTA DE PREÇOS', '07:50', firstWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker],
    ['LIMPAR MONTRAS DO TAKEOUT', '07:50', secondWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker],
    ['ANÁLISE EXCESSO STOCK', 'ATÉ AS 8:45', secondWorker, secondWorker, secondWorker, secondWorker, secondWorker, firstWorker, firstWorker],
    ['QUEBRA', '12:00', firstWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker],
    ['DEPRECIADOS', '12:00', secondWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker],
    ['TURNO DA TARDE / NOITE', '', '', '', '', '', '', '', ''],
    ['LIMPAR BALANÇAS', '21:00', firstWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker],
    ['QUEBRA', '22:00', secondWorker, firstWorker, secondWorker, firstWorker, secondWorker, firstWorker, secondWorker],
    ['FOTOS FECHO', 'FECHO DA LOJA', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS', 'TODOS'],
  ];

  const ptsSheet = xlsxLib.utils.aoa_to_sheet([ptsRow1, ptsRow2, ptsRow3, ...ptsRows]);
  ptsSheet['!cols'] = [
    { wch: 36 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  const workbook = xlsxLib.utils.book_new();
  xlsxLib.utils.book_append_sheet(workbook, ptdSheet, 'PTD');
  xlsxLib.utils.book_append_sheet(workbook, ptsSheet, 'PTS');

  return xlsxLib.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

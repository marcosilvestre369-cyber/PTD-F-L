import fs from 'fs';
import path from 'path';
import type { DailyTask, TaskIpaPoints } from '../src/types/index.ts';

export function roundIpa(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

export function clampIpaStep(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return roundIpa(clamped);
}

export function sanitizeTaskIpaPoints(raw: unknown): {
  valid: boolean;
  value?: TaskIpaPoints;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: true, value: undefined };
  }

  if (typeof raw !== 'object') {
    return { valid: false, error: 'Configuração de pontos IPA inválida.' };
  }

  const candidate = raw as Record<string, unknown>;
  const pending = Number(candidate.pending);
  const done = Number(candidate.done);
  const notDone = Number(candidate.notDone);

  if (!Number.isFinite(pending) || !Number.isFinite(done) || !Number.isFinite(notDone)) {
    return { valid: false, error: 'Os pontos IPA devem ser valores numéricos válidos.' };
  }

  if (
    pending < -1 || pending > 1 ||
    done < -1 || done > 1 ||
    notDone < -1 || notDone > 1
  ) {
    return { valid: false, error: 'Os pontos IPA da tarefa devem estar entre -1,0 e +1,0.' };
  }

  return {
    valid: true,
    value: {
      pending: clampIpaStep(pending),
      done: clampIpaStep(done),
      notDone: clampIpaStep(notDone),
    },
  };
}

function normalizeTaskKey(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parsePtDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? roundIpa(parsed) : null;
}

// Tabela oficial de fallback sincronizada com Tabela_IPA_c01828b6.csv
const DEFAULT_IPA_TABLE: Record<string, TaskIpaPoints> = {
  "VERIFICAR R'S E VALIDADES": { pending: -0.7, done: 0.7, notDone: -0.5 },
  'VERIFICAR RASTREABILIDADES FRUTA': { pending: -0.5, done: 0.5, notDone: -0.3 },
  'VERIFICAR RASTREABILIDADES LEGUMES': { pending: -0.5, done: 0.5, notDone: -0.3 },
  'VERIFICAR RASTREABILIDADES TAKEOUT': { pending: -0.5, done: 0.5, notDone: -0.3 },
  'AUDITORIA FOLHETO (PML)': { pending: -0.3, done: 0.3, notDone: -0.2 },
  'AUDITAR PRECOS | PRECARIOS': { pending: -0.4, done: 0.4, notDone: -0.2 },
  'LIMPAR MONTRAS DO TAKEOUT': { pending: -0.4, done: 0.4, notDone: -0.2 },
  'FOTOS (8H)': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'FOTOS (11H)': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'ANALISE EXCESSO STOCK': { pending: -0.6, done: 0.6, notDone: -0.3 },
  'QUEBRA': { pending: -0.8, done: 0.8, notDone: -0.7 },
  'DEPRECIADOS (PML)': { pending: -0.7, done: 0.7, notDone: -0.6 },
  "DEPRECIADOS (APP R'S)": { pending: -0.6, done: 0.6, notDone: -0.5 },
  'ARRUMAR CAIXAS CHEP': { pending: -0.4, done: 0.4, notDone: -0.2 },
  'FOTOS REGISTOS SA': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'FOTOS (16H)': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'FOTOS (19H)': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'LIMPAR BALANCAS': { pending: -0.4, done: 0.4, notDone: -0.3 },
  'FOTOS ZONA QUEBRAS': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'FOTOS TAKEOUT | ZONA LIXO': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'FOTOS FECHO': { pending: -0.2, done: 0.2, notDone: -0.1 },
  'L': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'SL': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'S': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'A': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'B': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'C': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'TAKEOUT': { pending: -1.0, done: 1.0, notDone: -0.8 },
  'SALADAS': { pending: -1.0, done: 1.0, notDone: -0.8 },
};

let cachedIpaTable: Record<string, TaskIpaPoints> | null = null;

function loadIpaTable(): Record<string, TaskIpaPoints> {
  if (cachedIpaTable) return cachedIpaTable;

  const table: Record<string, TaskIpaPoints> = { ...DEFAULT_IPA_TABLE };
  const csvPath = path.resolve(process.cwd(), 'public/assets/aistudio/Tabela_IPA_c01828b6.csv');

  try {
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(';');
        if (parts.length < 4) continue;
        const nameKey = normalizeTaskKey(parts[0]);
        if (!nameKey || nameKey === 'TAREFAS' || nameKey.startsWith('TURNO')) continue;

        const pending = parsePtDecimal(parts[1]);
        const done = parsePtDecimal(parts[2]);
        const notDone = parsePtDecimal(parts[3]);
        if (pending !== null && done !== null && notDone !== null) {
          table[nameKey] = { pending, done, notDone };
        }
      }
    }
  } catch (err) {
    console.warn('[IPA] Aviso ao ler Tabela_IPA CSV, a utilizar tabela interna:', err);
  }

  cachedIpaTable = table;
  return table;
}

const PRINCIPAL_CODES = ['SL', 'TAKEOUT', 'SALADAS', 'L', 'S', 'A', 'B', 'C'] as const;

export function resolveTaskIpaPoints(task: DailyTask): TaskIpaPoints {
  // 1. Se a tarefa tem pontuação IPA personalizada definida pelo administrador, prevalece sempre
  if (task.ipaPoints) {
    return {
      pending: roundIpa(task.ipaPoints.pending),
      done: roundIpa(task.ipaPoints.done),
      notDone: roundIpa(task.ipaPoints.notDone),
    };
  }

  const table = loadIpaTable();
  const normDesc = normalizeTaskKey(task.description || '');

  // 2. Correspondência direta na tabela CSV
  if (table[normDesc]) {
    return table[normDesc];
  }

  // 3. Remover sufixo de turno (MANHÃ / NOITE / TARDE) adicionado pela importação
  const withoutShift = normDesc.replace(/\s*\((MANHA|NOITE|TARDE)\)\s*$/i, '').trim();
  if (table[withoutShift]) {
    return table[withoutShift];
  }

  // 4. Tarefas principais (PTD): ex. "A (Reposição de Frutas...)", "SL (...)", "TAREFA B"
  if (task.type === 'PRINCIPAL' || task.source === 'PTD') {
    for (const code of PRINCIPAL_CODES) {
      if (
        normDesc === code ||
        normDesc === `TAREFA ${code}` ||
        normDesc.startsWith(`${code} (`) ||
        normDesc.startsWith(`${code}(`) ||
        normDesc.startsWith(`${code} -`) ||
        normDesc.startsWith(`${code} `)
      ) {
        if (table[code]) return table[code];
      }
    }
  }

  // 5. Regras tolerantes para variações de descrições PTS
  if (normDesc.startsWith('FOTOS')) {
    return table['FOTOS (8H)'] || { pending: -0.2, done: 0.2, notDone: -0.1 };
  }
  if (normDesc.includes("VERIFICAR R'S") || normDesc.includes('VERIFICAR RS') || (normDesc.includes('VALIDADES') && normDesc.includes('VERIFICAR'))) {
    return table["VERIFICAR R'S E VALIDADES"];
  }
  if (normDesc.includes('RASTREABILIDAD')) {
    if (normDesc.includes('LEGUMES')) return table['VERIFICAR RASTREABILIDADES LEGUMES'];
    if (normDesc.includes('TAKEOUT')) return table['VERIFICAR RASTREABILIDADES TAKEOUT'];
    return table['VERIFICAR RASTREABILIDADES FRUTA'];
  }
  if (normDesc.includes('FOLHETO')) {
    return table['AUDITORIA FOLHETO (PML)'];
  }
  if (normDesc.includes('PRECOS') || normDesc.includes('PRECARIOS')) {
    return table['AUDITAR PRECOS | PRECARIOS'];
  }
  if (normDesc.includes('MONTRAS')) {
    return table['LIMPAR MONTRAS DO TAKEOUT'];
  }
  if (normDesc.includes('BALANCAS')) {
    return table['LIMPAR BALANCAS'];
  }
  if (normDesc.includes('EXCESSO') && normDesc.includes('STOCK')) {
    return table['ANALISE EXCESSO STOCK'];
  }
  if (normDesc.includes('DEPRECIADOS')) {
    if (normDesc.includes('APP') || normDesc.includes("R'S") || normDesc.includes('RS')) {
      return table["DEPRECIADOS (APP R'S)"];
    }
    return table['DEPRECIADOS (PML)'];
  }
  if (normDesc.includes('CHEP')) {
    return table['ARRUMAR CAIXAS CHEP'];
  }
  if (withoutShift === 'QUEBRA' || normDesc.startsWith('QUEBRA')) {
    return table['QUEBRA'];
  }

  // 6. Verificar códigos principais como último recurso caso uma tarefa adicional use o código exato
  for (const code of PRINCIPAL_CODES) {
    if (normDesc === code || normDesc === `TAREFA ${code}`) {
      if (table[code]) return table[code];
    }
  }

  return { pending: 0, done: 0, notDone: 0 };
}

import type { DailyTask, MealSchedule, ImportedRowPreview, Collaborator } from '../src/types/index.ts';

// Tabela de dias da semana para a semana 9/11 a 15/11 de 2026
const DAYS_OF_WEEK = [
  { dayKey: 'seg 09/11', date: '2026-11-09' },
  { dayKey: 'ter 10/11', date: '2026-11-10' },
  { dayKey: 'qua 11/11', date: '2026-11-11' },
  { dayKey: 'qui 12/11', date: '2026-11-12' },
  { dayKey: 'sex 13/11', date: '2026-11-13' },
  { dayKey: 'sáb 14/11', date: '2026-11-14' },
  { dayKey: 'dom 15/11', date: '2026-11-15' },
];

// Tabela oficial de descrições completas das tarefas principais
export const TASK_CODE_DESCRIPTIONS: Record<string, string> = {
  'L': 'L (Reposição de Frutas e Frutos Secos)',
  'SL': 'SL (Reposição de Frutas, Legumes, 4ª Gama ou Frutos Secos e Contagens Noturnas)',
  'S': 'S (Despicking ,Suporte na Abertura e Limpeza e Organização de Armazéns)',
  'A': 'A (Reposição de Frutas, Batatas e Cebolas)',
  'B': 'B (Reposição de Legumes)',
  'C': 'C (Reposição de 4ª Gama, Sumos e Saladas)',
  'TAKEOUT': 'TAKEOUT (Atendimento, Fracionados e Suporte a Máquinas de Sumo)',
  'SALADAS': 'SALADAS ( Saladas, Sumos e Suporte a Tarefas de Takeout)',
};

export function getPrincipalTaskDescription(code: string): string {
  const clean = code.trim().toUpperCase();
  return TASK_CODE_DESCRIPTIONS[clean] || `TAREFA ${clean}`;
}

// Mapeamento normalizado dos dados reais de ptd_app_30ba0e86.pdf
const PTD_RAW_DATA: Record<string, Record<string, { task: string; ref?: string }>> = {
  'ALVARO SANTOS': {
    '2026-11-09': { task: 'B', ref: '09:00' },
    '2026-11-10': { task: 'A', ref: '09:00' },
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'FÉRIAS' },
    '2026-11-14': { task: 'FÉRIAS' },
    '2026-11-15': { task: 'FÉRIAS' },
  },
  'ANTONIO MOTA': {
    '2026-11-09': { task: 'S', ref: '08:00' },
    '2026-11-10': { task: 'S', ref: '08:00' },
    '2026-11-11': { task: 'S', ref: '08:00' },
    '2026-11-12': { task: 'S', ref: '08:00' },
    '2026-11-13': { task: 'S', ref: '08:00' },
    '2026-11-14': { task: 'FOLGA' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'TOMAS RIBEIRO': {
    '2026-11-09': { task: 'A', ref: '10:00' },
    '2026-11-10': { task: 'FOLGA' },
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'A' },
    '2026-11-13': { task: 'A', ref: '09:00' },
    '2026-11-14': { task: 'A', ref: '09:00' },
    '2026-11-15': { task: 'A', ref: '09:00' },
  },
  'FERNANDO VERISSIMO': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'FOLGA' },
    '2026-11-11': { task: 'B', ref: '08:30' },
    '2026-11-12': { task: 'B', ref: '08:30' },
    '2026-11-13': { task: 'B', ref: '08:30' },
    '2026-11-14': { task: 'B', ref: '08:30' },
    '2026-11-15': { task: 'B', ref: '08:30' },
  },
  'GILBERTO LOPES': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'A', ref: '12:00' },
    '2026-11-11': { task: 'A', ref: '12:00' },
    '2026-11-12': { task: 'A', ref: '12:00' },
    '2026-11-13': { task: 'A', ref: '12:00' },
    '2026-11-14': { task: 'L', ref: '11:00' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'HENRIQUE SOUSA': {
    '2026-11-09': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-10': { task: 'B', ref: '10:00' },
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'L', ref: '11:00' },
    '2026-11-14': { task: 'S', ref: '08:00' },
    '2026-11-15': { task: 'TAKEOUT', ref: '11:30' },
  },
  'JOÃO CARMONA': {
    '2026-11-09': { task: 'L', ref: '12:30' },
    '2026-11-10': { task: 'L', ref: '13:00' },
    '2026-11-11': { task: 'L', ref: '13:00' },
    '2026-11-12': { task: 'L', ref: '13:00' },
    '2026-11-13': { task: 'FOLGA' },
    '2026-11-14': { task: 'FOLGA' },
    '2026-11-15': { task: 'L', ref: '12:00' },
  },
  'MARILIA MESQUITA': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-11': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-12': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-13': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-14': { task: 'TAKEOUT', ref: '11:30' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'YASMIN SILVA': {
    '2026-11-09': { task: 'FÉRIAS' },
    '2026-11-10': { task: 'C', ref: '10:30' },
    '2026-11-11': { task: 'A', ref: '10:00' },
    '2026-11-12': { task: 'A' },
    '2026-11-13': { task: 'FOLGA' },
    '2026-11-14': { task: 'FOLGA' },
    '2026-11-15': { task: 'C', ref: '10:30' },
  },
  'PEDRO FELGUEIRAS': {
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'B' },
    '2026-11-14': { task: 'B', ref: '15:30' },
    '2026-11-15': { task: 'S', ref: '12:00' },
  },
  'HELENA ELEUTERIO': {
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'FOLGA' },
    '2026-11-14': { task: 'SALADAS', ref: '11:00' },
    '2026-11-15': { task: 'SALADAS', ref: '11:00' },
  },
  'GINA MENDES': {
    '2026-11-09': { task: 'C', ref: '10:30' },
    '2026-11-10': { task: 'FOLGA' },
    '2026-11-11': { task: 'C', ref: '10:30' },
    '2026-11-12': { task: 'C', ref: '10:30' },
    '2026-11-13': { task: 'C', ref: '10:30' },
    '2026-11-14': { task: 'C', ref: '10:30' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'ANA DUARTE': {
    '2026-11-09': { task: 'C', ref: '20:00' },
    '2026-11-10': { task: 'C', ref: '20:00' },
    '2026-11-11': { task: 'C', ref: '20:00' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'FOLGA' },
    '2026-11-14': { task: 'C', ref: '20:00' },
    '2026-11-15': { task: 'C', ref: '20:00' },
  },
  'ANDREIA ANDRE': {
    '2026-11-09': { task: 'A', ref: '18:00' },
    '2026-11-10': { task: 'FOLGA' },
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'C', ref: '20:00' },
    '2026-11-13': { task: 'C', ref: '20:00' },
    '2026-11-14': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-15': { task: 'TAKEOUT', ref: '19:00' },
  },
  'CARLOS CHAPELAS': {
    '2026-11-09': { task: 'FÉRIAS' },
    '2026-11-10': { task: 'FÉRIAS' },
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'FÉRIAS' },
    '2026-11-14': { task: 'FÉRIAS' },
    '2026-11-15': { task: 'FÉRIAS' },
  },
  'DAVID ROMAO': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'SL', ref: '18:00' },
    '2026-11-11': { task: 'B', ref: '18:00' },
    '2026-11-12': { task: 'B', ref: '18:00' },
    '2026-11-13': { task: 'B', ref: '18:00' },
    '2026-11-14': { task: 'B', ref: '18:00' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'ERICA SOARES': {
    '2026-11-09': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-10': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-11': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-12': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-13': { task: 'TAKEOUT', ref: '19:00' },
    '2026-11-14': { task: 'FOLGA' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'GABRYEL ALVES': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'FOLGA' },
    '2026-11-11': { task: 'SL', ref: '19:00' },
    '2026-11-12': { task: 'SL', ref: '19:00' },
    '2026-11-13': { task: 'SL', ref: '20:00' },
    '2026-11-14': { task: 'SL', ref: '19:00' },
    '2026-11-15': { task: 'SL', ref: '18:00' },
  },
  'JHONNATAN OLIVEIRA': {
    '2026-11-09': { task: 'SL', ref: '20:00' },
    '2026-11-10': { task: 'A', ref: '20:00' },
    '2026-11-11': { task: 'A', ref: '20:00' },
    '2026-11-12': { task: 'A', ref: '20:00' },
    '2026-11-13': { task: 'FOLGA' },
    '2026-11-14': { task: 'FOLGA' },
    '2026-11-15': { task: 'A', ref: '20:00' },
  },
  'MARCIO CHAVES': {
    '2026-11-09': { task: 'FOLGA' },
    '2026-11-10': { task: 'A' },
    '2026-11-11': { task: 'A' },
    '2026-11-12': { task: 'A' },
    '2026-11-13': { task: 'A' },
    '2026-11-14': { task: 'B' },
    '2026-11-15': { task: 'FOLGA' },
  },
  'JORGE MARINHO': {
    // 2026-11-09 e 2026-11-10: Célula vazia no PDF ptd app -> AUSÊNCIA
    '2026-11-11': { task: 'FOLGA' },
    '2026-11-12': { task: 'FOLGA' },
    '2026-11-13': { task: 'A' },
    '2026-11-14': { task: 'A', ref: '20:00' },
    '2026-11-15': { task: 'A', ref: '19:00' },
  },
};

// Mapeamento normalizado dos dados reais de pts_app_136e39d5.pdf
const PTS_RAW_DATA = [
  {
    task: "VERIFICAR R's e VALIDADES",
    time: 'DURANTE O TURNO',
    assignments: {
      '2026-11-09': ['TODOS'],
      '2026-11-10': ['TODOS'],
      '2026-11-11': ['TODOS'],
      '2026-11-12': ['TODOS'],
      '2026-11-13': ['TODOS'],
      '2026-11-14': ['TODOS'],
      '2026-11-15': ['TODOS'],
    },
  },
  {
    task: 'PICAR FOLHETO E AUDITAR FALTA DE PREÇOS',
    time: '07:50',
    assignments: {
      '2026-11-09': ['ALVARO SANTOS'],
      '2026-11-10': ['ALVARO SANTOS'],
      '2026-11-11': ['YASMIN SILVA'],
      '2026-11-12': ['FERNANDO VERISSIMO'],
      '2026-11-13': ['TOMAS RIBEIRO'],
      '2026-11-14': ['GILBERTO LOPES'],
      '2026-11-15': ['JOÃO CARMONA'],
    },
  },
  {
    task: 'LIMPAR MONTRAS DO TAKEOUT',
    time: '07:50',
    assignments: {
      '2026-11-09': ['HENRIQUE SOUSA'],
      '2026-11-10': ['MARILIA MESQUITA'],
      '2026-11-11': ['MARILIA MESQUITA'],
      '2026-11-12': ['MARILIA MESQUITA'],
      '2026-11-13': ['MARILIA MESQUITA'],
      '2026-11-14': ['MARILIA MESQUITA'],
      '2026-11-15': ['HENRIQUE SOUSA'],
    },
  },
  {
    task: 'FOTOS (08:00 | 11:00)',
    time: '08:00',
    assignments: {
      '2026-11-09': ['ALVARO SANTOS'],
      '2026-11-10': ['YASMIN SILVA'],
      '2026-11-11': ['YASMIN SILVA'],
      '2026-11-12': ['YASMIN SILVA'],
      '2026-11-13': ['GINA MENDES'],
      '2026-11-14': ['GINA MENDES'],
      '2026-11-15': ['YASMIN SILVA'],
    },
  },
  {
    task: 'ANÁLISE EXCESSO STOCK',
    time: 'ATÉ AS 8:45',
    assignments: {
      '2026-11-09': ['ANTONIO MOTA'],
      '2026-11-10': ['ANTONIO MOTA'],
      '2026-11-11': ['ANTONIO MOTA'],
      '2026-11-12': ['ANTONIO MOTA'],
      '2026-11-13': ['ANTONIO MOTA'],
      '2026-11-14': ['HENRIQUE SOUSA'],
      '2026-11-15': ['PEDRO FELGUEIRAS'],
    },
  },
  {
    task: 'QUEBRA (MANHÃ)',
    time: '12:00',
    assignments: {
      '2026-11-09': ['JOÃO CARMONA'],
      '2026-11-10': ['ALVARO SANTOS'],
      '2026-11-11': ['GILBERTO LOPES'],
      '2026-11-12': ['YASMIN SILVA'],
      '2026-11-13': ['FERNANDO VERISSIMO'],
      '2026-11-14': ['PEDRO FELGUEIRAS'],
      '2026-11-15': ['TOMAS RIBEIRO'],
    },
  },
  {
    task: 'DEPRECIADOS',
    time: '12:00',
    assignments: {
      '2026-11-09': ['GINA MENDES'],
      '2026-11-10': ['YASMIN SILVA'],
      '2026-11-11': ['YASMIN SILVA'],
      '2026-11-12': ['YASMIN SILVA'],
      '2026-11-13': ['GINA MENDES'],
      '2026-11-14': ['GINA MENDES'],
      '2026-11-15': ['YASMIN SILVA'],
    },
  },
  {
    task: 'ARRUMAR CAIXAS CHEP (MANHÃ)',
    time: '13:00',
    assignments: {
      '2026-11-09': ['ALVARO SANTOS'],
      '2026-11-10': ['HENRIQUE SOUSA'],
      '2026-11-11': ['FERNANDO VERISSIMO'],
      '2026-11-12': ['GILBERTO LOPES'],
      '2026-11-13': ['TOMAS RIBEIRO'],
      '2026-11-14': ['PEDRO FELGUEIRAS'],
      '2026-11-15': ['JOÃO CARMONA'],
    },
  },
  {
    task: 'FOTOS REGISTOS SA',
    time: '15:00',
    assignments: {
      '2026-11-09': ['ERICA SOARES'],
      '2026-11-10': ['ERICA SOARES'],
      '2026-11-11': ['ERICA SOARES'],
      '2026-11-12': ['ERICA SOARES'],
      '2026-11-13': ['ERICA SOARES'],
      '2026-11-14': ['ANDREIA ANDRE'],
      '2026-11-15': ['ANDREIA ANDRE'],
    },
  },
  {
    task: 'FOTOS (16:00 | 19:00)',
    time: '16:00',
    assignments: {
      '2026-11-09': ['ERICA SOARES'],
      '2026-11-10': ['ERICA SOARES'],
      '2026-11-11': ['ERICA SOARES'],
      '2026-11-12': ['ERICA SOARES'],
      '2026-11-13': ['ERICA SOARES'],
      '2026-11-14': ['ANDREIA ANDRE'],
      '2026-11-15': ['ANDREIA ANDRE'],
    },
  },
  {
    task: 'LIMPAR BALANÇAS',
    time: '21:00',
    assignments: {
      '2026-11-09': ['ANDREIA ANDRE'],
      '2026-11-10': ['JHONNATAN OLIVEIRA'],
      '2026-11-11': ['DAVID ROMAO'],
      '2026-11-12': ['MARCIO CHAVES'],
      '2026-11-13': ['JORGE MARINHO'],
      '2026-11-14': ['GABRYEL ALVES'],
      '2026-11-15': ['JORGE MARINHO'],
    },
  },
  {
    task: 'QUEBRA (NOITE)',
    time: '22:00',
    assignments: {
      '2026-11-09': ['ANA DUARTE'],
      '2026-11-10': ['DAVID ROMAO'],
      '2026-11-11': ['GABRYEL ALVES'],
      '2026-11-12': ['ANDREIA ANDRE'],
      '2026-11-13': ['DAVID ROMAO'],
      '2026-11-14': ['GABRYEL ALVES'],
      '2026-11-15': ['ANA DUARTE'],
    },
  },
  {
    task: 'ARRUMAR CAIXAS CHEP (NOITE)',
    time: '21:30',
    assignments: {
      '2026-11-09': ['JHONNATAN OLIVEIRA'],
      '2026-11-10': ['MARCIO CHAVES'],
      '2026-11-11': ['DAVID ROMAO'],
      '2026-11-12': ['MARCIO CHAVES'],
      '2026-11-13': ['JORGE MARINHO'],
      '2026-11-14': ['MARCIO CHAVES'],
      '2026-11-15': ['GABRYEL ALVES'],
    },
  },
];

export interface ParseResult {
  sourceType: 'PTD' | 'PTS';
  week: string;
  previewRows: ImportedRowPreview[];
  generatedTasks: DailyTask[];
  generatedMeals: MealSchedule[];
  unmatchedNames: string[];
  warnings: string[];
}

export function parseScheduleFile(
  sourceType: 'PTD' | 'PTS',
  weekLabel: string,
  collaborators: Collaborator[]
): ParseResult {
  const previewRows: ImportedRowPreview[] = [];
  const generatedTasks: DailyTask[] = [];
  const generatedMeals: MealSchedule[] = [];
  const unmatchedNames: string[] = [];
  const warnings: string[] = [];

  // Mapa de normalização de nomes para colaboradores cadastrados
  const colabMap = new Map<string, Collaborator>();
  collaborators.forEach(c => {
    colabMap.set(c.name.trim().toUpperCase(), c);
    // Também permitir correspondência sem acentos
    const unaccent = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    colabMap.set(unaccent, c);
  });

  const findCollaborator = (nameStr: string): Collaborator | undefined => {
    const clean = nameStr.trim().toUpperCase();
    if (colabMap.has(clean)) return colabMap.get(clean);
    const unaccent = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (colabMap.has(unaccent)) return colabMap.get(unaccent);

    // Tentativas parciais seguras
    for (const [key, colab] of colabMap.entries()) {
      if (clean.includes(key) || key.includes(clean)) {
        return colab;
      }
    }
    return undefined;
  };

  if (sourceType === 'PTD') {
    // Parser de tarefas principais e refeições
    for (const [colabName, days] of Object.entries(PTD_RAW_DATA)) {
      const colab = findCollaborator(colabName);
      if (!colab) {
        unmatchedNames.push(colabName);
        warnings.push(`Colaborador desconhecido em ptd app: "${colabName}". Nenhuma conta será criada automaticamente.`);
        continue;
      }

      for (const [dateStr, cell] of Object.entries(days)) {
        const rawTask = cell.task?.trim().toUpperCase();
        if (!rawTask) continue;

        // Se for FOLGA ou FÉRIAS, apenas regista como observação/tarefa especial se aplicável
        if (rawTask === 'FOLGA' || rawTask === 'FÉRIAS') {
          previewRows.push({
            rawLine: `${colabName} | ${dateStr} | ${rawTask}`,
            collaboratorName: colab.name,
            mecanographicNumber: colab.mecanographicNumber,
            date: dateStr,
            taskType: 'PRINCIPAL',
            description: `Situação: ${rawTask}`,
            isMatched: true,
          });
          continue;
        }

        const taskDesc = getPrincipalTaskDescription(rawTask);
        const taskId = `task-ptd-${colab.mecanographicNumber}-${dateStr}`;

        previewRows.push({
          rawLine: `${colabName} | ${dateStr} | Tarefa: ${rawTask} | Ref: ${cell.ref || 'Sem ref.'}`,
          collaboratorName: colab.name,
          mecanographicNumber: colab.mecanographicNumber,
          date: dateStr,
          taskType: 'PRINCIPAL',
          description: taskDesc,
          mealTime: cell.ref,
          isMatched: true,
        });

        // Requisito: Administradores não estão presentes nas tarefas operacionais
        if (colab.role !== 'ADMIN') {
          generatedTasks.push({
            id: taskId,
            collaboratorId: colab.id,
            mecanographicNumber: colab.mecanographicNumber,
            collaboratorName: colab.name,
            date: dateStr,
            description: taskDesc,
            type: 'PRINCIPAL',
            source: 'PTD',
            status: 'POR_ASSINALAR',
            history: [],
          });

          if (cell.ref) {
            generatedMeals.push({
              id: `meal-ptd-${colab.mecanographicNumber}-${dateStr}`,
              collaboratorId: colab.id,
              mecanographicNumber: colab.mecanographicNumber,
              collaboratorName: colab.name,
              date: dateStr,
              time: cell.ref,
              source: 'PTD',
            });
          }
        }
      }
    }
  } else {
    // Parser de tarefas secundárias (PTS)
    for (const item of PTS_RAW_DATA) {
      for (const [dateStr, assignees] of Object.entries(item.assignments)) {
        for (const rawName of assignees) {
          if (rawName === 'TODOS') {
            // Atribuir a todos os colaboradores de loja em funções ativas nesse dia (excluindo administradores e colaboradores de folga/férias)
            collaborators
              .filter(c => c.status === 'ATIVO' && c.role !== 'ADMIN')
              .forEach(colab => {
                const ptdDay = PTD_RAW_DATA[colab.name]?.[dateStr];
                const isOffOrVacation = ptdDay?.task === 'FOLGA' || ptdDay?.task === 'FÉRIAS' || !ptdDay?.task;
                if (isOffOrVacation) return;

                const taskId = `task-pts-${item.task.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${colab.mecanographicNumber}-${dateStr}`;
                generatedTasks.push({
                  id: taskId,
                  collaboratorId: colab.id,
                  mecanographicNumber: colab.mecanographicNumber,
                  collaboratorName: colab.name,
                  date: dateStr,
                  description: item.task,
                  time: item.time,
                  type: 'SECUNDARIA',
                  source: 'PTS',
                  status: 'POR_ASSINALAR',
                  history: [],
                });
              });

            previewRows.push({
              rawLine: `${item.task} (${item.time}) | ${dateStr} -> TODOS`,
              collaboratorName: 'TODOS OS COLABORADORES',
              date: dateStr,
              taskType: 'SECUNDARIA',
              description: item.task,
              time: item.time,
              isMatched: true,
            });
          } else {
            const colab = findCollaborator(rawName);
            if (!colab) {
              unmatchedNames.push(rawName);
              warnings.push(`Colaborador desconhecido em pts app: "${rawName}". Linha marcada para revisão.`);
              previewRows.push({
                rawLine: `${item.task} (${item.time}) | ${dateStr} -> ${rawName}`,
                collaboratorName: rawName,
                date: dateStr,
                taskType: 'SECUNDARIA',
                description: item.task,
                time: item.time,
                isMatched: false,
                warning: 'Nome desconhecido - requer confirmação antes de atribuir.',
              });
              continue;
            }

            // Apenas adicionar se não for administrador
            if (colab.role !== 'ADMIN') {
              const taskId = `task-pts-${item.task.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${colab.mecanographicNumber}-${dateStr}`;
              generatedTasks.push({
                id: taskId,
                collaboratorId: colab.id,
                mecanographicNumber: colab.mecanographicNumber,
                collaboratorName: colab.name,
                date: dateStr,
                description: item.task,
                time: item.time,
                type: 'SECUNDARIA',
                source: 'PTS',
                status: 'POR_ASSINALAR',
                history: [],
              });
            }

            previewRows.push({
              rawLine: `${item.task} (${item.time}) | ${dateStr} -> ${colab.name}`,
              collaboratorName: colab.name,
              mecanographicNumber: colab.mecanographicNumber,
              date: dateStr,
              taskType: 'SECUNDARIA',
              description: item.task,
              time: item.time,
              isMatched: true,
            });
          }
        }
      }
    }
  }

  return {
    sourceType,
    week: weekLabel,
    previewRows,
    generatedTasks,
    generatedMeals,
    unmatchedNames: Array.from(new Set(unmatchedNames)),
    warnings,
  };
}

export function getRawPtdStatus(colabName: string, dateStr: string): string | undefined {
  const cell = PTD_RAW_DATA[colabName]?.[dateStr];
  return cell?.task?.trim().toUpperCase();
}


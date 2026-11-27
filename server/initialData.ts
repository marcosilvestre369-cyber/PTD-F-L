import type { Collaborator, Article, DailyTask, MealSchedule, StockRecord } from '../src/types/index.ts';

// 2.1 Lista inicial fornecida no PRP
// Administradores: 56359 MARCO SILVESTRE e 436450 YASMIN SILVA
// Colaboradores confirmados: 456516 TOMAS RIBEIRO e 456466 JORGE MARINHO
export const INITIAL_COLLABORATORS: Collaborator[] = [
  {
    id: 'colab-338118',
    mecanographicNumber: '338118',
    name: 'ALVARO SANTOS',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-35317',
    mecanographicNumber: '35317',
    name: 'ANTONIO MOTA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-456516',
    mecanographicNumber: '456516', // Confirmado no PRP
    name: 'TOMAS RIBEIRO',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-4624',
    mecanographicNumber: '4624',
    name: 'FERNANDO VERISSIMO',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-294114',
    mecanographicNumber: '294114',
    name: 'GILBERTO LOPES',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-50813',
    mecanographicNumber: '50813',
    name: 'HENRIQUE SOUSA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-109191',
    mecanographicNumber: '109191',
    name: 'JOÃO CARMONA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-2789',
    mecanographicNumber: '2789',
    name: 'MARILIA MESQUITA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-436450',
    mecanographicNumber: '436450',
    name: 'YASMIN SILVA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-439378',
    mecanographicNumber: '439378',
    name: 'PEDRO FELGUEIRAS',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-3078',
    mecanographicNumber: '3078',
    name: 'ANA DUARTE',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-447268',
    mecanographicNumber: '447268',
    name: 'ANDREIA ANDRE',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-223241',
    mecanographicNumber: '223241',
    name: 'CARLOS CHAPELAS',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-420639',
    mecanographicNumber: '420639',
    name: 'DAVID ROMAO',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-410771',
    mecanographicNumber: '410771',
    name: 'ERICA SOARES',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-415681',
    mecanographicNumber: '415681',
    name: 'GABRYEL ALVES',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-447256',
    mecanographicNumber: '447256',
    name: 'JHONNATAN OLIVEIRA',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-450355',
    mecanographicNumber: '450355',
    name: 'MARCIO CHAVES',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-456412',
    mecanographicNumber: '456412',
    name: 'HELENA ELEUTERIO',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-456365',
    mecanographicNumber: '456365',
    name: 'GINA MENDES',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-456466',
    mecanographicNumber: '456466', // Confirmado no PRP
    name: 'JORGE MARINHO',
    role: 'COLABORADOR',
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
  {
    id: 'colab-56359',
    mecanographicNumber: '56359',
    name: 'MARCO SILVESTRE',
    role: 'ADMIN', // Administrador inicial
    status: 'ATIVO',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  },
];

import {
  FULL_SECTION_ARTICLES,
  CATALOG_VERSION,
  CATALOG_UPDATED_AT,
  REMOVED_CATALOG_IDS,
} from './catalogData.ts';

export { CATALOG_VERSION, CATALOG_UPDATED_AT, REMOVED_CATALOG_IDS };

// Artigos do catálogo oficial da secção (966 artigos únicos extraídos dos ficheiros oficiais de 19-11-2026)
export const INITIAL_ARTICLES: Article[] = FULL_SECTION_ARTICLES;


// Tarefas, horários de refeição e stocks inicializam vazios para testes reais
export const INITIAL_TASKS: DailyTask[] = [];
export const INITIAL_MEALS: MealSchedule[] = [];
export const INITIAL_STOCKS: StockRecord[] = [];

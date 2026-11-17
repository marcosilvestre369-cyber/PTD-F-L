import fs from 'fs';
import path from 'path';
import type {
  Collaborator,
  Article,
  DailyTask,
  MealSchedule,
  StockRecord,
  StockStatus,
  ImportRecord,
  AuditLog,
  TaskStatus,
  DailyReportSummary,
  ShiftStatusInfo,
  PdeRequest,
  PdeStatus,
  Role,
  ReportScope,
  ReportPeriod,
  InAppNotification,
  WeeklyTaskCompletion,
  CollaboratorAnnualScore,
  TaskPerformanceResponse,
} from '../src/types/index.ts';
import {
  INITIAL_COLLABORATORS,
  INITIAL_ARTICLES,
} from './initialData.ts';
import {
  syncAllToFirestore,
  syncDocument,
  deleteDocument,
  syncDocumentsBatch,
  deleteDocumentsBatch,
  loadAllFromFirestore,
  getFirebaseConfigInfo,
} from './firebaseSync.ts';
import type { DailyStatistic } from './firebaseSync.ts';

export interface LisbonDateTimeParts {
  dateStr: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDay: number; // 1 = Segunda ... 7 = Domingo
}

export function getLisbonDateTimeParts(now: Date = new Date()): LisbonDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10) % 24;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);
  const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoDay = utcDay === 0 ? 7 : utcDay;
  return { dateStr, year, month, day, hour, minute, second, isoDay };
}

export function getWeekBoundsFromDate(dateStr: string, referenceYear?: number): {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const utcDay = utcDate.getUTCDay();
  const isoDay = utcDay === 0 ? 7 : utcDay;
  const mon = new Date(utcDate.getTime() - (isoDay - 1) * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const refYear = referenceYear ?? getLisbonDateTimeParts().year;
  const fmtDay = (dt: Date) =>
    `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}${
      dt.getUTCFullYear() !== refYear ? `/${dt.getUTCFullYear()}` : ''
    }`;
  return {
    weekStart: mon.toISOString().split('T')[0],
    weekEnd: sun.toISOString().split('T')[0],
    weekLabel: `Semana ${fmtDay(mon)} a ${fmtDay(sun)}`,
  };
}

export function getCollaboratorVisibleWeekWindow(now: Date = new Date()) {
  const lisbon = getLisbonDateTimeParts(now);
  const currentWeek = getWeekBoundsFromDate(lisbon.dateStr, lisbon.year);
  const [cy, cm, cd] = currentWeek.weekStart.split('-').map(Number);
  const prevMonStr = new Date(Date.UTC(cy, cm - 1, cd) - 7 * 86400000).toISOString().split('T')[0];
  const previousWeek = getWeekBoundsFromDate(prevMonStr, lisbon.year);
  // Sempre que uma semana termina, fica disponível para o colaborador apenas nas 3 primeiras horas da semana que se inicia (Segunda 00:00:00 a 02:59:59)
  const isInPreviousWeekGracePeriod = lisbon.isoDay === 1 && lisbon.hour < 3;
  return {
    todayStr: lisbon.dateStr,
    currentYear: lisbon.year,
    currentWeek,
    previousWeek,
    isInPreviousWeekGracePeriod,
  };
}

function normalizeStockStatus(raw: string | undefined): StockStatus {
  if (raw === 'TRATADO' || raw === 'RESOLVIDO') return 'TRATADO';
  if (raw === 'NAO_CONSIDERADO') return 'NAO_CONSIDERADO';
  return 'POR_TRATAR';
}

function normalizePdeStatus(raw: string | undefined): PdeStatus {
  if (raw === 'RESOLVIDO') return 'RESOLVIDO';
  if (raw === 'NAO_CONSIDERADO' || raw === 'REJEITADO') return 'NAO_CONSIDERADO';
  return 'PENDENTE';
}

interface AppStore {
  collaborators: Collaborator[];
  articles: Article[];
  tasks: DailyTask[];
  meals: MealSchedule[];
  stocks: StockRecord[];
  imports: ImportRecord[];
  audits: AuditLog[];
  pdes: PdeRequest[];
  notifications: InAppNotification[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

class StorageManager {
  private store: AppStore;
  private isLoaded = false;
  private hadLocalStore = false;
  private hydrationPromise: Promise<void> = Promise.resolve();

  constructor() {
    this.store = {
      collaborators: [],
      articles: [],
      tasks: [],
      meals: [],
      stocks: [],
      imports: [],
      audits: [],
      pdes: [],
      notifications: [],
    };
    this.init();
  }

  public async ready(): Promise<void> {
    await this.hydrationPromise;
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.store = JSON.parse(raw);
        // Garantir listas
        this.store.collaborators = this.store.collaborators || [];
        this.store.articles = this.store.articles || [];
        this.store.tasks = this.store.tasks || [];
        this.store.meals = this.store.meals || [];
        this.store.stocks = this.store.stocks || [];
        this.store.imports = this.store.imports || [];
        this.store.audits = this.store.audits || [];
        this.store.pdes = this.store.pdes || [];
        this.store.notifications = this.store.notifications || [];

        // Requisito: Administrador Marco Silvestre não está presente nas tarefas operacionais de loja
        this.store.tasks = this.store.tasks.filter(t => t.mecanographicNumber !== '56359');
        this.store.meals = this.store.meals.filter(m => m.mecanographicNumber !== '56359');

        // Yasmin Silva despromovida para Colaborador
        const yasmin = this.store.collaborators.find(c => c.mecanographicNumber === '436450');
        if (yasmin && yasmin.role !== 'COLABORADOR') {
          yasmin.role = 'COLABORADOR';
          yasmin.updatedAt = new Date().toISOString();
        }

        // Corrigir Nº Mecanográfico de Henrique Sousa (56813 -> 508913)
        this.migrateCollaboratorNumber('56813', '508913', 'HENRIQUE SOUSA');

        // Garantir que todos os colaboradores ativos entram diretamente pelo número
        this.store.collaborators.forEach(c => {
          if (c.status === 'PENDENTE_ATIVACAO') {
            c.status = 'ATIVO';
          }
        });

        // Normalizar estados legados de Stocks e PDE
        this.store.stocks.forEach(s => {
          const norm = normalizeStockStatus(s.status as string);
          if ((s.status as string) !== norm) {
            s.status = norm;
          }
        });
        this.store.pdes.forEach(p => {
          const norm = normalizePdeStatus(p.status as string);
          if ((p.status as string) !== norm) {
            p.status = norm;
          }
        });

        // Atualizar catálogo oficial completo com os 956 artigos dos 6 ficheiros de Barcode
        if (this.store.articles.length < 500) {
          this.store.articles = [...INITIAL_ARTICLES];
          this.logAudit(
            'SISTEMA',
            'Catálogo',
            'ATUALIZAR_CATALOGO',
            'Catálogo',
            `Catálogo atualizado com os 956 artigos oficiais extraídos dos 6 ficheiros PDF de Barcode da secção`
          );
        }

        this.hadLocalStore = true;
        this.save();
      } else {
        // Inicialização sem escalas, tarefas, horários de refeição ou stocks de exemplo
        const initialCollaborators = [...INITIAL_COLLABORATORS];

        this.store = {
          collaborators: initialCollaborators,
          articles: [...INITIAL_ARTICLES],
          tasks: [],
          meals: [],
          stocks: [],
          imports: [],
          audits: [
            {
              id: 'audit-init',
              timestamp: new Date().toISOString(),
              authorNumber: 'SISTEMA',
              authorName: 'Inicialização',
              action: 'BOOTSTRAP',
              entity: 'Sistema',
              details: 'Base de dados inicializada com lista oficial de colaboradores e catálogo da secção',
            },
          ],
          pdes: [],
          notifications: [],
        };
        this.save();
      }
      this.isLoaded = true;

      // Hidratação imediata a partir da base de dados Firestore e sincronização bidirecional
      this.hydrationPromise = this.hydrateFromFirestore();
    } catch (err) {
      console.error('Erro ao inicializar storage:', err);
      this.store = {
        collaborators: [...INITIAL_COLLABORATORS],
        articles: [...INITIAL_ARTICLES],
        tasks: [],
        meals: [],
        stocks: [],
        imports: [],
        audits: [],
        pdes: [],
        notifications: [],
      };
    }
  }

  private async hydrateFromFirestore(): Promise<void> {
    let remoteArticlesCount = 0;
    try {
      const remote = await loadAllFromFirestore();
      if (remote) {
        let changed = false;
        remoteArticlesCount = remote.articles?.length || 0;

        // 1. Colaboradores (preservar edições/adições/remoções guardadas na nuvem)
        if (remote.collaborators && remote.collaborators.length > 0) {
          if (!this.hadLocalStore) {
            this.store.collaborators = [...remote.collaborators];
          } else {
            const colabMap = new Map(this.store.collaborators.map(c => [c.id, c]));
            for (const rc of remote.collaborators) {
              const local = colabMap.get(rc.id);
              if (!local || (rc.updatedAt || '') >= (local.updatedAt || '')) {
                colabMap.set(rc.id, rc);
              }
            }
            this.store.collaborators = Array.from(colabMap.values());
          }
          // Garantir consistência das regras permanentes de colaboradores
          const yasmin = this.store.collaborators.find(c => c.mecanographicNumber === '436450');
          if (yasmin && yasmin.role !== 'COLABORADOR') {
            yasmin.role = 'COLABORADOR';
            yasmin.updatedAt = new Date().toISOString();
          }
          this.store.collaborators.forEach(c => {
            if (c.status === 'PENDENTE_ATIVACAO') c.status = 'ATIVO';
          });
          changed = true;
        }

        // 2. Artigos do catálogo
        if (remote.articles && remote.articles.length > 0) {
          const artMap = new Map(this.store.articles.map(a => [a.id, a]));
          for (const ra of remote.articles) {
            const local = artMap.get(ra.id);
            if (!local || (ra.updatedAt || '') >= (local.updatedAt || '')) {
              artMap.set(ra.id, ra);
            }
          }
          this.store.articles = Array.from(artMap.values());
          changed = true;
        }

        // 3. Tarefas
        if (remote.tasks && remote.tasks.length > 0) {
          const taskMap = new Map(this.store.tasks.map(t => [t.id, t]));
          for (const rt of remote.tasks) {
            if (rt.mecanographicNumber !== '56359') {
              taskMap.set(rt.id, rt);
            }
          }
          this.store.tasks = Array.from(taskMap.values());
          changed = true;
        }

        // 4. Refeições
        if (remote.meals && remote.meals.length > 0) {
          const mealMap = new Map(this.store.meals.map(m => [m.id, m]));
          for (const rm of remote.meals) {
            if (rm.mecanographicNumber !== '56359') {
              mealMap.set(rm.id, rm);
            }
          }
          this.store.meals = Array.from(mealMap.values());
          changed = true;
        }

        // 5. Stocks
        if (remote.stocks && remote.stocks.length > 0) {
          const stockMap = new Map(this.store.stocks.map(s => [s.id, s]));
          for (const rs of remote.stocks) {
            rs.status = normalizeStockStatus(rs.status as string);
            stockMap.set(rs.id, rs);
          }
          this.store.stocks = Array.from(stockMap.values());
          changed = true;
        }

        // 6. PDEs
        if (remote.pdes && remote.pdes.length > 0) {
          const pdeMap = new Map(this.store.pdes.map(p => [p.id, p]));
          for (const rp of remote.pdes) {
            rp.status = normalizePdeStatus(rp.status as string);
            pdeMap.set(rp.id, rp);
          }
          this.store.pdes = Array.from(pdeMap.values());
          changed = true;
        }

        // 7. Notificações
        if (remote.notifications && remote.notifications.length > 0) {
          const notifMap = new Map(this.store.notifications.map(n => [n.id, n]));
          for (const rn of remote.notifications) {
            notifMap.set(rn.id, rn);
          }
          this.store.notifications = Array.from(notifMap.values());
          changed = true;
        }

        // 8. Importações (Excel / PDF e linhas de Folga/Férias)
        if (remote.imports && remote.imports.length > 0) {
          const importMap = new Map(this.store.imports.map(i => [i.id, i]));
          for (const ri of remote.imports) {
            importMap.set(ri.id, ri);
          }
          this.store.imports = Array.from(importMap.values()).sort(
            (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          );
          changed = true;
        }

        // 9. Auditoria
        if (remote.audits && remote.audits.length > 0) {
          const auditMap = new Map(this.store.audits.map(a => [a.id, a]));
          for (const ra of remote.audits) {
            auditMap.set(ra.id, ra);
          }
          this.store.audits = Array.from(auditMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          changed = true;
        }

        if (this.migrateCollaboratorNumber('56813', '508913', 'HENRIQUE SOUSA')) {
          changed = true;
        }
        if (remote.collaborators?.some(c => c.id === 'colab-56813')) {
          await deleteDocument('collaborators', 'colab-56813');
        }

        if (changed) {
          this.save();
          console.log('[Storage] Base de dados hidratada com sucesso a partir do Firestore.');
        }
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar a partir do Firestore:', err);
    }

    // Garantir que dados locais (ou catálogo inicial) fiquem sincronizados no Firestore
    syncAllToFirestore(this.store, {
      includeArticles: remoteArticlesCount < this.store.articles.length,
    }).catch(err => {
      console.warn('[Firebase] Erro ao sincronizar com Firestore:', err);
    });
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.store, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.error('Erro ao gravar store.json:', err);
    }
  }

  // --- Auditoria ---
  public logAudit(authorNumber: string, authorName: string, action: string, entity: string, details: string) {
    const entry: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      authorNumber,
      authorName,
      action,
      entity,
      details,
    };
    this.store.audits.unshift(entry);
    this.save();
    if (entry.action !== 'BOOTSTRAP') {
      syncDocument('audits', entry.id, entry);
    }
  }

  public getAudits(): AuditLog[] {
    return this.store.audits;
  }

  public isDateVisibleForCollaborator(dateStr: string, now: Date = new Date()): boolean {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const windowInfo = getCollaboratorVisibleWeekWindow(now);
    if (dateStr >= windowInfo.currentWeek.weekStart && dateStr <= windowInfo.currentWeek.weekEnd) {
      return true;
    }
    if (
      windowInfo.isInPreviousWeekGracePeriod &&
      dateStr >= windowInfo.previousWeek.weekStart &&
      dateStr <= windowInfo.previousWeek.weekEnd
    ) {
      return true;
    }
    return false;
  }

  // --- Datas Selecionáveis da Semana ---
  public getAvailableDates(user?: Collaborator): { date: string; label: string; week: string }[] {
    const windowInfo = getCollaboratorVisibleWeekWindow();
    const seedDates = new Set<string>();

    // Incluir sempre a semana atual a decorrer
    seedDates.add(windowInfo.todayStr);

    // Se estiver dentro da janela de tolerância de 3h na segunda-feira, garantir que a semana que acabou também está presente
    if (windowInfo.isInPreviousWeekGracePeriod) {
      seedDates.add(windowInfo.previousWeek.weekStart);
    }

    // Incluir todas as datas das tarefas, refeições ou importações publicadas
    this.store.tasks.forEach(t => { if (t.date) seedDates.add(t.date); });
    this.store.meals.forEach(m => { if (m.date) seedDates.add(m.date); });
    this.store.imports.forEach(imp => {
      if (imp.status === 'PUBLICADO' && Array.isArray(imp.rows)) {
        imp.rows.forEach((r: any) => { if (r?.date) seedDates.add(r.date); });
      }
    });

    // Expandir cada semana presente para incluir os 7 dias completos (Seg a Dom)
    const datesSet = new Set<string>();
    const weekLabelByMon = new Map<string, string>();

    for (const dateStr of seedDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      const [year, month, day] = dateStr.split('-').map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      if (Number.isNaN(utcDate.getTime())) continue;
      const bounds = getWeekBoundsFromDate(dateStr, windowInfo.currentYear);
      const [my, mm, md] = bounds.weekStart.split('-').map(Number);
      const monUtc = new Date(Date.UTC(my, mm - 1, md));

      for (let i = 0; i < 7; i++) {
        const wd = new Date(monUtc.getTime() + i * 86400000).toISOString().split('T')[0];
        datesSet.add(wd);
      }

      if (!weekLabelByMon.has(bounds.weekStart)) {
        weekLabelByMon.set(bounds.weekStart, bounds.weekLabel);
      }
    }

    let sorted = Array.from(datesSet).sort();

    // Regra: apenas administradores consultam várias semanas; colaboradores veem apenas a semana em vigor (+ semana anterior nas 3h iniciais de segunda)
    if (user && user.role !== 'ADMIN') {
      sorted = sorted.filter(d => this.isDateVisibleForCollaborator(d));
    }

    const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    return sorted.map(dateStr => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = weekdayNames[utcDate.getUTCDay()];
      const label = `${dayOfWeek}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
      const bounds = getWeekBoundsFromDate(dateStr, windowInfo.currentYear);
      return {
        date: dateStr,
        label,
        week: weekLabelByMon.get(bounds.weekStart) || bounds.weekLabel,
      };
    });
  }

  // --- Adicionar Tarefas da Semana Seguinte (16/11 a 22/11) ---
  public async addNextWeek(weekLabel: string, author: Collaborator): Promise<{ success: boolean; tasksCount: number }> {
    const nextWeekDates = [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ];

    const newTasks: DailyTask[] = [];
    const newMeals: MealSchedule[] = [];

    // Colaboradores da secção (excluindo administradores)
    const workers = this.store.collaborators.filter(c => c.role !== 'ADMIN' && c.status === 'ATIVO');

    nextWeekDates.forEach((date, dayIdx) => {
      workers.forEach((colab, cIdx) => {
        // Rotação padrão de tarefas e folgas da secção
        const isOff = (cIdx + dayIdx) % 7 === 0 || (cIdx + dayIdx) % 7 === 1;
        if (!isOff) {
          const taskType = (cIdx + dayIdx) % 3 === 0 ? 'A' : (cIdx + dayIdx) % 3 === 1 ? 'B' : 'C';
          const mealHour = cIdx % 2 === 0 ? '10:00' : '19:00';

          const taskDesc = `TAREFA ${taskType}`;

          newTasks.push({
            id: `task-next-${colab.mecanographicNumber}-${date}`,
            collaboratorId: colab.id,
            mecanographicNumber: colab.mecanographicNumber,
            collaboratorName: colab.name,
            date,
            description: taskDesc,
            type: 'PRINCIPAL',
            source: 'PTD',
            status: 'POR_ASSINALAR',
            history: [],
          });

          // Tarefa secundária rotativa
          newTasks.push({
            id: `task-next-sec-${colab.mecanographicNumber}-${date}`,
            collaboratorId: colab.id,
            mecanographicNumber: colab.mecanographicNumber,
            collaboratorName: colab.name,
            date,
            description: cIdx % 2 === 0 ? 'VERIFICAR R\'s e VALIDADES' : 'ARRUMAR CAIXAS CHEP',
            type: 'SECUNDARIA',
            source: 'PTS',
            time: cIdx % 2 === 0 ? 'DURANTE O TURNO' : '13:00',
            status: 'POR_ASSINALAR',
            history: [],
          });

          newMeals.push({
            id: `meal-next-${colab.mecanographicNumber}-${date}`,
            collaboratorId: colab.id,
            mecanographicNumber: colab.mecanographicNumber,
            collaboratorName: colab.name,
            date,
            time: mealHour,
            source: 'PTD',
          });
        }
      });
    });

    // Adicionar as novas tarefas e refeições
    this.store.tasks.push(...newTasks);
    this.store.meals.push(...newMeals);

    // Registar importação da semana seguinte
    const nextImp: ImportRecord = {
      id: `imp-${Date.now()}`,
      sourceType: 'PTD',
      week: weekLabel || 'Semana 16/11 a 22/11',
      fileName: 'ptd_app_semana_seguinte.pdf',
      fileHash: `hash-next-${Date.now()}`,
      version: 1,
      status: 'PUBLICADO',
      uploadedAt: new Date().toISOString(),
      uploadedBy: author.name,
      publishedAt: new Date().toISOString(),
      publishedBy: author.name,
      rowCount: newTasks.length,
      warnings: [],
      rows: [],
    };
    this.store.imports.unshift(nextImp);

    this.logAudit(
      author.mecanographicNumber,
      author.name,
      'IMPORTAR_SEMANA_SEGUINTE',
      'Importação',
      `Adicionadas tarefas da semana ${weekLabel} (${newTasks.length} tarefas criadas)`
    );
    this.save();

    await Promise.all([
      syncDocument('imports', nextImp.id, nextImp),
      syncDocumentsBatch('tasks', newTasks),
      syncDocumentsBatch('meals', newMeals),
    ]);

    return { success: true, tasksCount: newTasks.length };
  }

  // --- Colaboradores ---
  public getCollaborators(includeInactive = false): Collaborator[] {
    if (includeInactive) return this.store.collaborators;
    return this.store.collaborators.filter(c => c.status !== 'DESATIVADO');
  }

  public getCollaboratorByNumber(mecanographicNumber: string): Collaborator | undefined {
    return this.store.collaborators.find(
      c => c.mecanographicNumber.trim() === mecanographicNumber.trim()
    );
  }

  public getCollaboratorById(id: string): Collaborator | undefined {
    return this.store.collaborators.find(c => c.id === id);
  }

  private migrateCollaboratorNumber(oldNumber: string, newNumber: string, expectedName?: string): boolean {
    let changed = false;
    const oldId = `colab-${oldNumber}`;
    const target = this.store.collaborators.find(
      c => c.mecanographicNumber === oldNumber || c.id === oldId
    );
    const alreadyNew = this.store.collaborators.find(c => c.mecanographicNumber === newNumber);

    if (target) {
      if (alreadyNew && alreadyNew.id !== target.id) {
        this.store.collaborators = this.store.collaborators.filter(c => c.id !== target.id);
      } else {
        target.mecanographicNumber = newNumber;
        if (target.id === oldId) {
          target.id = `colab-${newNumber}`;
        }
        if (expectedName && target.name !== expectedName) {
          target.name = expectedName;
        }
        target.updatedAt = new Date().toISOString();
      }
      deleteDocument('collaborators', oldId);
      changed = true;
    }

    const newColabId = alreadyNew?.id || target?.id || `colab-${newNumber}`;

    this.store.tasks.forEach(t => {
      if (t.mecanographicNumber === oldNumber || t.collaboratorId === oldId) {
        t.mecanographicNumber = newNumber;
        t.collaboratorId = newColabId;
        if (expectedName) t.collaboratorName = expectedName;
        changed = true;
      }
    });
    this.store.meals.forEach(m => {
      if (m.mecanographicNumber === oldNumber || m.collaboratorId === oldId) {
        m.mecanographicNumber = newNumber;
        m.collaboratorId = newColabId;
        if (expectedName) m.collaboratorName = expectedName;
        changed = true;
      }
    });
    this.store.stocks.forEach(s => {
      if (s.authorNumber === oldNumber) {
        s.authorNumber = newNumber;
        if (expectedName) s.authorName = expectedName;
        changed = true;
      }
    });
    this.store.pdes.forEach(p => {
      if (p.submittedByNumber === oldNumber) {
        p.submittedByNumber = newNumber;
        if (expectedName) p.submittedByName = expectedName;
        changed = true;
      }
      if (p.resolvedByNumber === oldNumber) {
        p.resolvedByNumber = newNumber;
        if (expectedName) p.resolvedByName = expectedName;
        changed = true;
      }
    });
    this.store.notifications.forEach(n => {
      if (n.recipientNumber === oldNumber) {
        n.recipientNumber = newNumber;
        if (expectedName) n.recipientName = expectedName;
        changed = true;
      }
      if (n.senderNumber === oldNumber) {
        n.senderNumber = newNumber;
        if (expectedName) n.senderName = expectedName;
        changed = true;
      }
    });

    return changed;
  }

  public addCollaborator(
    mecanographicNumber: string,
    name: string,
    role: Role,
    author: Collaborator
  ): { success: boolean; error?: string; collaborator?: Collaborator } {
    const numClean = mecanographicNumber.trim();
    if (!numClean) {
      return { success: false, error: 'Número mecanográfico obrigatório.' };
    }
    if (!name.trim()) {
      return { success: false, error: 'Nome do colaborador obrigatório.' };
    }

    const exists = this.store.collaborators.find(c => c.mecanographicNumber === numClean);
    if (exists) {
      return { success: false, error: `Número mecanográfico ${numClean} já se encontra registado (${exists.name}).` };
    }

    const newColab: Collaborator = {
      id: `colab-${numClean}-${Date.now()}`,
      mecanographicNumber: numClean,
      name: name.trim().toUpperCase(),
      role,
      status: 'ATIVO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.store.collaborators.push(newColab);
    this.logAudit(author.mecanographicNumber, author.name, 'ADICIONAR_COLABORADOR', 'Colaborador', `Adicionado ${newColab.name} (${newColab.mecanographicNumber}) como ${newColab.role}`);
    this.save();
    syncDocument('collaborators', newColab.id, newColab);
    return { success: true, collaborator: newColab };
  }

  public updateCollaborator(
    id: string,
    updates: {
      mecanographicNumber?: string;
      name?: string;
      role?: Role;
      status?: 'ATIVO' | 'DESATIVADO';
    },
    author: Collaborator
  ): { success: boolean; error?: string; collaborator?: Collaborator } {
    const target = this.store.collaborators.find(c => c.id === id);
    if (!target) {
      return { success: false, error: 'Colaborador não encontrado.' };
    }

    const nextNumber = updates.mecanographicNumber !== undefined
      ? updates.mecanographicNumber.trim()
      : target.mecanographicNumber;
    const nextName = updates.name !== undefined
      ? updates.name.trim().toUpperCase()
      : target.name;
    const nextRole: Role = updates.role !== undefined ? updates.role : target.role;
    const nextStatus = updates.status !== undefined ? updates.status : (target.status === 'DESATIVADO' ? 'DESATIVADO' : 'ATIVO');

    if (!nextNumber) {
      return { success: false, error: 'Número mecanográfico obrigatório.' };
    }
    if (!nextName) {
      return { success: false, error: 'Nome do colaborador obrigatório.' };
    }
    if (nextRole !== 'ADMIN' && nextRole !== 'COLABORADOR' && nextRole !== 'GESTOR_STOCKS_PDE') {
      return { success: false, error: 'Perfil inválido.' };
    }
    if (nextStatus !== 'ATIVO' && nextStatus !== 'DESATIVADO') {
      return { success: false, error: 'Estado inválido.' };
    }

    const duplicate = this.store.collaborators.find(
      c => c.id !== target.id && c.mecanographicNumber.trim() === nextNumber
    );
    if (duplicate) {
      return {
        success: false,
        error: `O número mecanográfico ${nextNumber} já está atribuído a ${duplicate.name}.`,
      };
    }

    // Impedir remoção/desativação do último administrador ativo
    if (
      target.role === 'ADMIN' &&
      target.status === 'ATIVO' &&
      (nextRole !== 'ADMIN' || nextStatus !== 'ATIVO')
    ) {
      const otherActiveAdmins = this.store.collaborators.filter(
        c => c.role === 'ADMIN' && c.status === 'ATIVO' && c.id !== target.id
      );
      if (otherActiveAdmins.length === 0) {
        return {
          success: false,
          error: 'Não é permitido remover privilégios ou desativar o último administrador ativo do sistema.',
        };
      }
    }

    const oldNumber = target.mecanographicNumber;
    const oldName = target.name;
    const oldRole = target.role;
    const oldStatus = target.status;

    target.mecanographicNumber = nextNumber;
    target.name = nextName;
    target.role = nextRole;
    target.status = nextStatus;
    target.updatedAt = new Date().toISOString();

    // Propagar alterações de número ou nome pelos registos associados
    if (oldNumber !== nextNumber || oldName !== nextName) {
      this.store.tasks.forEach(t => {
        if (t.collaboratorId === target.id || t.mecanographicNumber === oldNumber) {
          t.mecanographicNumber = nextNumber;
          t.collaboratorName = nextName;
          syncDocument('tasks', t.id, t);
        }
      });

      this.store.meals.forEach(m => {
        if (m.collaboratorId === target.id || m.mecanographicNumber === oldNumber) {
          m.mecanographicNumber = nextNumber;
          m.collaboratorName = nextName;
          syncDocument('meals', m.id, m);
        }
      });

      this.store.stocks.forEach(s => {
        let modified = false;
        if (s.authorNumber === oldNumber) {
          s.authorNumber = nextNumber;
          s.authorName = nextName;
          modified = true;
        }
        if (s.assignedTo === oldName) {
          s.assignedTo = nextName;
          modified = true;
        }
        if (modified) syncDocument('stocks', s.id, s);
      });

      this.store.pdes.forEach(p => {
        let modified = false;
        if (p.submittedByNumber === oldNumber) {
          p.submittedByNumber = nextNumber;
          p.submittedByName = nextName;
          modified = true;
        }
        if (p.resolvedByNumber === oldNumber) {
          p.resolvedByNumber = nextNumber;
          p.resolvedByName = nextName;
          modified = true;
        }
        if (modified) syncDocument('pdes', p.id, p);
      });

      this.store.notifications.forEach(n => {
        let modified = false;
        if (n.recipientNumber === oldNumber) {
          n.recipientNumber = nextNumber;
          n.recipientName = nextName;
          modified = true;
        }
        if (n.senderNumber === oldNumber) {
          n.senderNumber = nextNumber;
          n.senderName = nextName;
          modified = true;
        }
        if (modified) syncDocument('notifications', n.id, n);
      });
    }

    const changes: string[] = [];
    if (oldNumber !== nextNumber) changes.push(`Nº ${oldNumber} -> ${nextNumber}`);
    if (oldName !== nextName) changes.push(`Nome "${oldName}" -> "${nextName}"`);
    if (oldRole !== nextRole) changes.push(`Perfil ${oldRole} -> ${nextRole}`);
    if (oldStatus !== nextStatus) changes.push(`Estado ${oldStatus} -> ${nextStatus}`);

    this.logAudit(
      author.mecanographicNumber,
      author.name,
      'EDITAR_COLABORADOR',
      'Colaborador',
      `Editado ${nextName} (${nextNumber}): ${changes.length > 0 ? changes.join(', ') : 'sem alterações de campos'}`
    );
    this.save();
    syncDocument('collaborators', target.id, target);
    return { success: true, collaborator: target };
  }

  public deactivateCollaborator(
    id: string,
    author: Collaborator
  ): { success: boolean; error?: string } {
    const target = this.store.collaborators.find(c => c.id === id);
    if (!target) {
      return { success: false, error: 'Colaborador não encontrado.' };
    }

    if (target.role === 'ADMIN' && target.status === 'ATIVO') {
      const activeAdmins = this.store.collaborators.filter(
        c => c.role === 'ADMIN' && c.status === 'ATIVO' && c.id !== target.id
      );
      if (activeAdmins.length === 0) {
        return { success: false, error: 'Não é permitido desativar o último administrador ativo do sistema.' };
      }
    }

    target.status = 'DESATIVADO';
    target.updatedAt = new Date().toISOString();
    this.logAudit(author.mecanographicNumber, author.name, 'DESATIVAR_COLABORADOR', 'Colaborador', `Desativado ${target.name} (${target.mecanographicNumber})`);
    this.save();
    syncDocument('collaborators', target.id, target);
    return { success: true };
  }

  public deleteCollaborator(
    id: string,
    author: Collaborator
  ): { success: boolean; error?: string } {
    const target = this.store.collaborators.find(c => c.id === id);
    if (!target) {
      return { success: false, error: 'Colaborador não encontrado.' };
    }

    if (target.role === 'ADMIN' && target.status === 'ATIVO') {
      const activeAdmins = this.store.collaborators.filter(
        c => c.role === 'ADMIN' && c.status === 'ATIVO' && c.id !== target.id
      );
      if (activeAdmins.length === 0) {
        return { success: false, error: 'Não é permitido apagar o último administrador ativo do sistema.' };
      }
    }

    this.store.collaborators = this.store.collaborators.filter(c => c.id !== id);
    this.logAudit(author.mecanographicNumber, author.name, 'APAGAR_COLABORADOR', 'Colaborador', `Apagado colaborador ${target.name} (${target.mecanographicNumber})`);
    this.save();
    deleteDocument('collaborators', id);
    return { success: true };
  }

  public saveDirect(): void {
    this.save();
  }

  public updateCollaboratorRole(
    id: string,
    newRole: Role,
    author: Collaborator
  ): { success: boolean; error?: string } {
    const target = this.store.collaborators.find(c => c.id === id);
    if (!target) return { success: false, error: 'Colaborador não encontrado.' };

    if (target.role === 'ADMIN' && newRole !== 'ADMIN') {
      const activeAdmins = this.store.collaborators.filter(
        c => c.role === 'ADMIN' && c.status === 'ATIVO' && c.id !== target.id
      );
      if (activeAdmins.length === 0) {
        return { success: false, error: 'Não é permitido retirar privilégios ao último administrador ativo.' };
      }
    }

    target.role = newRole;
    target.updatedAt = new Date().toISOString();
    this.logAudit(author.mecanographicNumber, author.name, 'ALTERAR_PERFIL', 'Colaborador', `Perfil de ${target.name} (${target.mecanographicNumber}) alterado para ${newRole}`);
    this.save();
    syncDocument('collaborators', target.id, target);
    return { success: true };
  }

  public registerSuccessfulLogin(mecanographicNumber: string) {
    const target = this.store.collaborators.find(c => c.mecanographicNumber === mecanographicNumber);
    if (!target) return;
    target.lastLoginAt = new Date().toISOString();
    this.save();
    syncDocument('collaborators', target.id, target);
  }

  // --- Tarefas diárias ---
  public getTasks(filter: { date?: string; collaboratorId?: string; mecanographicNumber?: string }): DailyTask[] {
    return this.store.tasks.filter(t => {
      // Ignorar tarefas de administradores
      if (t.mecanographicNumber === '56359') return false;
      if (filter.date && t.date !== filter.date) return false;
      if (filter.collaboratorId && t.collaboratorId !== filter.collaboratorId) return false;
      if (filter.mecanographicNumber && t.mecanographicNumber !== filter.mecanographicNumber) return false;
      return true;
    });
  }

  public addAdditionalTask(
    collaboratorNumber: string,
    date: string,
    description: string,
    time: string | undefined,
    author: Collaborator
  ): { success: boolean; error?: string; task?: DailyTask } {
    const colab = this.getCollaboratorByNumber(collaboratorNumber);
    if (!colab) return { success: false, error: 'Colaborador não encontrado.' };
    if (!description.trim()) return { success: false, error: 'Descrição da tarefa obrigatória.' };
    if (!date) return { success: false, error: 'Data obrigatória.' };

    const newTask: DailyTask = {
      id: `task-add-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      collaboratorId: colab.id,
      mecanographicNumber: colab.mecanographicNumber,
      collaboratorName: colab.name,
      date,
      description: description.trim(),
      type: 'ADICIONAL',
      source: 'ADMINISTRADOR',
      time: time?.trim() || undefined,
      status: 'POR_ASSINALAR',
      history: [],
    };

    this.store.tasks.push(newTask);
    this.logAudit(author.mecanographicNumber, author.name, 'CRIAR_TAREFA_ADICIONAL', 'Tarefa', `Atribuída a ${colab.name} em ${date}: ${description}`);
    this.save();
    syncDocument('tasks', newTask.id, newTask);

    // Criar notificação na app para o colaborador destinatário (quando atribuída por admin/outro colaborador)
    if (author.mecanographicNumber !== colab.mecanographicNumber) {
      const notification: InAppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        recipientNumber: colab.mecanographicNumber,
        recipientName: colab.name,
        senderNumber: author.mecanographicNumber,
        senderName: author.name,
        category: 'TAREFA',
        title: 'Nova Tarefa Atribuída',
        message: `${author.name} atribuiu-lhe uma nova tarefa para ${date}: "${description.trim()}"${time ? ` às ${time}` : ''}.`,
        taskId: newTask.id,
        date,
        createdAt: new Date().toISOString(),
        read: false,
      };
      this.store.notifications.push(notification);
      this.save();
      syncDocument('notifications', notification.id, notification);
    }

    return { success: true, task: newTask };
  }

  public updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    observation: string | undefined,
    user: Collaborator
  ): { success: boolean; error?: string; task?: DailyTask } {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, error: 'Tarefa não encontrada.' };

    if (user.role !== 'ADMIN' && task.mecanographicNumber !== user.mecanographicNumber) {
      return { success: false, error: 'Sem permissão para alterar tarefas de outro colaborador.' };
    }

    const previousStatus = task.status;
    const answeredAt = new Date().toISOString();

    task.history.push({
      status: previousStatus,
      observation: task.observation,
      answeredAt: task.answeredAt || answeredAt,
      answeredBy: task.answeredBy || user.name,
    });

    task.status = status;
    task.observation = observation?.trim() || undefined;
    task.answeredAt = answeredAt;
    task.answeredBy = user.name;

    this.logAudit(user.mecanographicNumber, user.name, 'ASSINALAR_TAREFA', 'Tarefa', `Tarefa "${task.description}" alterada para ${status}`);
    this.save();
    syncDocument('tasks', task.id, task);
    return { success: true, task };
  }

  public updateTaskDetails(
    taskId: string,
    data: { description?: string; time?: string },
    user: Collaborator
  ): { success: boolean; error?: string; task?: DailyTask } {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, error: 'Tarefa não encontrada.' };

    if (user.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem editar tarefas.' };
    }

    if (data.description !== undefined && data.description.trim()) {
      task.description = data.description.trim();
    }
    if (data.time !== undefined) {
      task.time = data.time.trim() || undefined;
    }

    this.logAudit(user.mecanographicNumber, user.name, 'EDITAR_TAREFA', 'Tarefa', `Tarefa "${task.id}" editada: ${task.description}`);
    this.save();
    syncDocument('tasks', task.id, task);
    return { success: true, task };
  }

  public deleteTask(
    taskId: string,
    user: Collaborator
  ): { success: boolean; error?: string } {
    const index = this.store.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return { success: false, error: 'Tarefa não encontrada.' };
    const task = this.store.tasks[index];

    if (user.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem remover tarefas.' };
    }

    this.store.tasks.splice(index, 1);
    this.logAudit(user.mecanographicNumber, user.name, 'ELIMINAR_TAREFA', 'Tarefa', `Tarefa "${task.description}" de ${task.collaboratorName} removida.`);
    this.save();
    deleteDocument('tasks', taskId);
    return { success: true };
  }

  // --- Horários de Refeição ---
  public getMealSchedule(date: string, mecanographicNumber: string): MealSchedule | undefined {
    return this.store.meals.find(m => m.date === date && m.mecanographicNumber === mecanographicNumber);
  }

  public getAllMealsForDate(date: string): MealSchedule[] {
    return this.store.meals.filter(m => m.date === date);
  }

  // --- Situação Diária do Colaborador (Trabalho, Folga, Férias, Ausência) ---
  public getShiftStatus(date: string, mecanographicNumber: string): ShiftStatusInfo {
    const colab = this.store.collaborators.find(c => c.mecanographicNumber === mecanographicNumber);
    const colabName = colab ? colab.name : 'Colaborador';

    const tasks = this.store.tasks.filter(t => t.date === date && t.mecanographicNumber === mecanographicNumber);
    const meal = this.store.meals.find(m => m.date === date && m.mecanographicNumber === mecanographicNumber);

    if (tasks.length > 0) {
      return {
        date,
        collaboratorNumber: mecanographicNumber,
        collaboratorName: colabName,
        shiftStatus: 'TRABALHO',
        label: 'Em Turno',
        description: 'Colaborador com turno e tarefas escaladas na secção.',
        mealTime: meal?.time,
        tasksCount: tasks.length,
      };
    }

    // Consultar primeiro importações publicadas dinâmicas (para qualquer semana importada via Excel)
    let dynamicStatus: string | undefined;
    for (const imp of this.store.imports || []) {
      if (imp.status !== 'PUBLICADO' || !imp.rows) continue;
      const matchRow = imp.rows.find(
        (r: any) => r.date === date && r.mecanographicNumber === mecanographicNumber && r.description?.startsWith('Situação:')
      );
      if (matchRow) {
        if (matchRow.description.includes('FÉRIAS')) dynamicStatus = 'FÉRIAS';
        else if (matchRow.description.includes('FOLGA')) dynamicStatus = 'FOLGA';
        else dynamicStatus = 'AUSÊNCIA';
        break;
      }
    }

    const rawStatus = dynamicStatus;

    if (rawStatus === 'FÉRIAS') {
      return {
        date,
        collaboratorNumber: mecanographicNumber,
        collaboratorName: colabName,
        shiftStatus: 'FÉRIAS',
        label: 'Férias',
        description: 'Colaborador em período de férias programado no plano da secção.',
        tasksCount: 0,
      };
    }

    if (rawStatus === 'FOLGA') {
      return {
        date,
        collaboratorNumber: mecanographicNumber,
        collaboratorName: colabName,
        shiftStatus: 'FOLGA',
        label: 'Folga',
        description: 'Dia de descanso semanal (folga) programado no plano de tarefas da secção.',
        tasksCount: 0,
      };
    }

    return {
      date,
      collaboratorNumber: mecanographicNumber,
      collaboratorName: colabName,
      shiftStatus: 'AUSÊNCIA',
      label: 'Ausência',
      description: 'Sem turno escalado nesta data (ausência programada / não escalado).',
      tasksCount: 0,
    };
  }

  public getAllShiftsForDate(date: string): ShiftStatusInfo[] {
    const workers = this.store.collaborators.filter(c => c.status === 'ATIVO' && c.role !== 'ADMIN');
    return workers.map(w => this.getShiftStatus(date, w.mecanographicNumber));
  }

  // --- Catálogo de Artigos ---
  public getArticles(activeOnly = true): Article[] {
    if (activeOnly) return this.store.articles.filter(a => a.active);
    return this.store.articles;
  }

  public getArticleById(id: string): Article | undefined {
    return this.store.articles.find(a => a.id === id);
  }

  public getArticleBySku(sku: string): Article | undefined {
    return this.store.articles.find(a => a.sku.trim() === sku.trim());
  }

  public addArticle(
    sku: string,
    description: string,
    unit: string,
    barcode: string | undefined,
    category: string,
    author: Collaborator
  ): { success: boolean; error?: string; article?: Article } {
    const skuClean = sku.trim();
    if (!skuClean) return { success: false, error: 'Código/SKU obrigatório.' };
    if (!description.trim()) return { success: false, error: 'Descrição obrigatória.' };

    const exists = this.store.articles.find(a => a.sku.toLowerCase() === skuClean.toLowerCase());
    if (exists) {
      return { success: false, error: `Já existe um artigo com o código ${skuClean} (${exists.description}).` };
    }

    const newArticle: Article = {
      id: `art-${skuClean}`,
      sku: skuClean,
      description: description.trim().toUpperCase(),
      unit: unit.trim().toUpperCase() || 'KG',
      barcode: barcode?.trim() || undefined,
      category: category.trim() || 'Geral',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.store.articles.push(newArticle);
    this.logAudit(author.mecanographicNumber, author.name, 'ADICIONAR_ARTIGO', 'Catálogo', `Artigo adicionado: [${skuClean}] ${newArticle.description}`);
    this.save();
    syncDocument('articles', newArticle.id, newArticle);
    return { success: true, article: newArticle };
  }

  public updateArticle(
    id: string,
    data: { description?: string; unit?: string; barcode?: string; category?: string; active?: boolean },
    author: Collaborator
  ): { success: boolean; error?: string; article?: Article } {
    const article = this.store.articles.find(a => a.id === id);
    if (!article) return { success: false, error: 'Artigo não encontrado.' };

    if (data.description) article.description = data.description.trim().toUpperCase();
    if (data.unit) article.unit = data.unit.trim().toUpperCase();
    if (data.barcode !== undefined) article.barcode = data.barcode.trim() || undefined;
    if (data.category) article.category = data.category.trim();
    if (data.active !== undefined) article.active = data.active;
    article.updatedAt = new Date().toISOString();

    this.logAudit(author.mecanographicNumber, author.name, 'ATUALIZAR_ARTIGO', 'Catálogo', `Artigo atualizado: [${article.sku}] ${article.description}`);
    this.save();
    syncDocument('articles', article.id, article);
    return { success: true, article };
  }

  // --- Stocks (Excessos e Roturas) ---
  public getStocks(filter?: { date?: string; type?: string; status?: string; articleQuery?: string }): StockRecord[] {
    let list = [...this.store.stocks];
    if (filter?.date) {
      list = list.filter(s => s.treatmentDate === filter.date || s.registrationDate === filter.date);
    }
    if (filter?.type) {
      list = list.filter(s => s.type === filter.type);
    }
    if (filter?.status) {
      list = list.filter(s => s.status === filter.status);
    }
    if (filter?.articleQuery) {
      const q = filter.articleQuery.toLowerCase().trim();
      list = list.filter(s => s.articleDescription.toLowerCase().includes(q) || s.articleSku.includes(q));
    }
    return list;
  }

  public getStockById(id: string): StockRecord | undefined {
    return this.store.stocks.find(s => s.id === id);
  }

  public createStockRecord(
    payload: {
      articleId: string;
      type: 'EXCESSO' | 'ROTURA';
      registrationDate: string;
      boxes?: number;
      dateType?: "R's" | "Validade";
      stockDate?: string;
      lot?: string;
      observation?: string;
      needsReview?: boolean;
    },
    author: Collaborator
  ): { success: boolean; error?: string; record?: StockRecord; warning?: string } {
    const article = this.getArticleById(payload.articleId);
    if (!article) {
      return { success: false, error: 'Artigo não encontrado no catálogo.' };
    }
    if (!article.active) {
      return { success: false, error: 'O artigo selecionado está inativo no catálogo.' };
    }
    if (!payload.registrationDate) {
      return { success: false, error: 'Data de registo operacional obrigatória.' };
    }

    let warning: string | undefined;

    if (payload.type === 'EXCESSO') {
      if (payload.boxes === undefined || payload.boxes === null || !Number.isInteger(payload.boxes) || payload.boxes <= 0) {
        return { success: false, error: 'Quantidade em caixas deve ser um número inteiro superior a zero.' };
      }
      if (!payload.dateType || (payload.dateType !== "R's" && payload.dateType !== 'Validade')) {
        return { success: false, error: 'Tipo de data obrigatório: selecione "R\'s" ou "Validade".' };
      }
      if (!payload.stockDate) {
        return { success: false, error: `Data de ${payload.dateType} é obrigatória.` };
      }

      const existing = this.store.stocks.find(
        s =>
          s.articleId === payload.articleId &&
          s.type === 'EXCESSO' &&
          s.registrationDate === payload.registrationDate &&
          s.dateType === payload.dateType &&
          s.stockDate === payload.stockDate
      );
      if (existing) {
        warning = 'Já existe um registo deste artigo para a mesma data e lote/validade. O novo registo foi gravado com contexto independente.';
      }
    }

    const now = new Date().toISOString();
    const newRecord: StockRecord = {
      id: `stk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      articleId: article.id,
      articleSku: article.sku,
      articleDescription: article.description,
      type: payload.type,
      registrationDate: payload.registrationDate,
      treatmentDate: payload.registrationDate,
      status: 'POR_TRATAR',
      authorId: author.id,
      authorNumber: author.mecanographicNumber,
      authorName: author.name,
      createdAt: now,
      updatedAt: now,
      boxes: payload.type === 'EXCESSO' ? payload.boxes : undefined,
      dateType: payload.type === 'EXCESSO' ? payload.dateType : undefined,
      stockDate: payload.type === 'EXCESSO' ? payload.stockDate : undefined,
      lot: payload.lot?.trim() || undefined,
      needsReview: payload.type === 'ROTURA' ? true : undefined,
      observation: payload.observation?.trim() || undefined,
      history: [
        {
          timestamp: now,
          authorName: author.name,
          action: 'CRIAÇÃO',
          details: `Registo criado por ${author.name}: ${payload.type === 'EXCESSO' ? `${payload.boxes} cx, ${payload.dateType} ${payload.stockDate}` : 'Revisão de parâmetros requerida'}`,
        },
      ],
    };

    this.store.stocks.push(newRecord);
    this.logAudit(
      author.mecanographicNumber,
      author.name,
      'CRIAR_STOCK',
      'Stock',
      `Registo de ${newRecord.type} para [${newRecord.articleSku}] ${newRecord.articleDescription}`
    );

    // Notificar Administradores e Gestores de Stocks & PDE sobre o novo registo de stock
    const recipients = this.store.collaborators.filter(
      c =>
        c.status === 'ATIVO' &&
        (c.role === 'ADMIN' || c.role === 'GESTOR_STOCKS_PDE') &&
        c.mecanographicNumber !== author.mecanographicNumber
    );
    const createdNotifications: InAppNotification[] = [];
    for (const recipient of recipients) {
      const notif: InAppNotification = {
        id: `notif-stk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${recipient.mecanographicNumber}`,
        recipientNumber: recipient.mecanographicNumber,
        recipientName: recipient.name,
        senderNumber: author.mecanographicNumber,
        senderName: author.name,
        category: 'STOCK',
        title: newRecord.type === 'EXCESSO' ? 'Novo Registo de Excesso (Stock)' : 'Novo Registo de Rotura (Stock)',
        message: `${author.name} registou [${newRecord.articleSku}] ${newRecord.articleDescription}${newRecord.boxes ? ` (${newRecord.boxes} cx)` : ''} em ${newRecord.registrationDate}.`,
        stockId: newRecord.id,
        date: newRecord.registrationDate,
        createdAt: now,
        read: false,
      };
      this.store.notifications.push(notif);
      createdNotifications.push(notif);
    }

    this.save();
    syncDocument('stocks', newRecord.id, newRecord);
    for (const n of createdNotifications) {
      syncDocument('notifications', n.id, n);
    }
    return { success: true, record: newRecord, warning };
  }

  public updateStockRecord(
    id: string,
    payload: {
      treatmentDate?: string;
      status?: StockStatus;
      assignedTo?: string;
      resolutionNote?: string;
      boxes?: number;
      dateType?: "R's" | "Validade";
      stockDate?: string;
      lot?: string;
      observation?: string;
    },
    user: Collaborator
  ): { success: boolean; error?: string; record?: StockRecord } {
    const record = this.store.stocks.find(s => s.id === id);
    if (!record) return { success: false, error: 'Registo de stock não encontrado.' };

    const isOwner = record.authorNumber === user.mecanographicNumber;
    const canManage = user.role === 'ADMIN' || user.role === 'GESTOR_STOCKS_PDE';

    if (!isOwner && !canManage) {
      return { success: false, error: 'Apenas tem permissão para editar os seus próprios registos de stock.' };
    }

    if (payload.status !== undefined && !['POR_TRATAR', 'TRATADO', 'NAO_CONSIDERADO'].includes(payload.status)) {
      return { success: false, error: 'Estado operacional inválido. Utilize Por tratar, Tratado ou Não considerado.' };
    }

    let validatedAssignedTo: string | undefined;
    if (payload.assignedTo !== undefined && payload.assignedTo.trim() !== '') {
      const candidate = payload.assignedTo.trim();
      const matchedManager = this.store.collaborators.find(
        c =>
          c.status === 'ATIVO' &&
          (c.role === 'ADMIN' || c.role === 'GESTOR_STOCKS_PDE') &&
          (c.name.toLowerCase() === candidate.toLowerCase() || c.mecanographicNumber === candidate)
      );
      if (!matchedManager) {
        return {
          success: false,
          error: 'O responsável atribuído tem de ser um Administrador ou Gestor de Stocks & PDE ativo.',
        };
      }
      validatedAssignedTo = matchedManager.name;
    }

    const now = new Date().toISOString();
    const changes: string[] = [];

    if (payload.treatmentDate && payload.treatmentDate !== record.treatmentDate) {
      changes.push(`Data de tratamento: ${record.treatmentDate} -> ${payload.treatmentDate}`);
      record.treatmentDate = payload.treatmentDate;
    }

    if (payload.status && payload.status !== record.status) {
      changes.push(`Estado: ${record.status} -> ${payload.status}`);
      record.status = payload.status;
      if (payload.status === 'TRATADO' || payload.status === 'NAO_CONSIDERADO') {
        record.resolvedAt = now;
        record.resolvedBy = user.name;
      } else {
        record.resolvedAt = undefined;
        record.resolvedBy = undefined;
      }
    }

    if (payload.assignedTo !== undefined) {
      const nextAssigned = validatedAssignedTo || undefined;
      changes.push(`Responsável: ${nextAssigned || 'Nenhum'}`);
      record.assignedTo = nextAssigned;
    }

    if (payload.resolutionNote !== undefined) {
      changes.push(`Nota: ${payload.resolutionNote}`);
      record.resolutionNote = payload.resolutionNote?.trim() || undefined;
    }

    if (payload.boxes !== undefined && record.type === 'EXCESSO') {
      if (!Number.isInteger(payload.boxes) || payload.boxes <= 0) {
        return { success: false, error: 'Quantidade em caixas deve ser inteira e superior a zero.' };
      }
      changes.push(`Caixas: ${record.boxes} -> ${payload.boxes}`);
      record.boxes = payload.boxes;
    }

    if (payload.dateType !== undefined && record.type === 'EXCESSO') {
      changes.push(`Tipo de data: ${record.dateType} -> ${payload.dateType}`);
      record.dateType = payload.dateType;
    }

    if (payload.stockDate !== undefined && record.type === 'EXCESSO') {
      changes.push(`Data: ${record.stockDate} -> ${payload.stockDate}`);
      record.stockDate = payload.stockDate;
    }

    if (payload.lot !== undefined) {
      record.lot = payload.lot?.trim() || undefined;
    }

    if (payload.observation !== undefined) {
      record.observation = payload.observation?.trim() || undefined;
    }

    record.updatedAt = now;
    record.history.push({
      timestamp: now,
      authorName: user.name,
      action: 'ATUALIZAÇÃO',
      details: changes.join('; ') || 'Registo atualizado',
    });

    this.logAudit(
      user.mecanographicNumber,
      user.name,
      'ATUALIZAR_STOCK',
      'Stock',
      `Atualizado registo [${record.articleSku}]: ${changes.join('; ')}`
    );
    this.save();
    syncDocument('stocks', record.id, record);
    return { success: true, record };
  }

  // --- Relatório Diário e Periódico ---
  public getDailyReport(
    date: string,
    filters?: {
      articleQuery?: string;
      type?: string;
      status?: string;
      period?: ReportPeriod;
      reportScope?: ReportScope;
    }
  ): DailyReportSummary {
    const q = filters?.articleQuery?.toLowerCase().trim();
    const typeFilter = filters?.type;
    const statusFilter = filters?.status;
    const period: ReportPeriod = filters?.period || 'DIA';
    const reportScope: ReportScope = filters?.reportScope || 'TODOS';

    // Determinar prefixo de filtragem temporal e etiqueta legível
    let matchPrefix = date;
    let periodLabel = date;

    if (period === 'MES') {
      matchPrefix = date.slice(0, 7); // YYYY-MM
      const parts = matchPrefix.split('-');
      const y = parts[0];
      const m = parts[1];
      const monthsPt = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const mIdx = parseInt(m, 10) - 1;
      periodLabel = `${monthsPt[mIdx] || m} de ${y}`;
    } else if (period === 'ANO') {
      matchPrefix = date.slice(0, 4); // YYYY
      periodLabel = `Ano de ${matchPrefix}`;
    } else {
      matchPrefix = date.slice(0, 10); // YYYY-MM-DD
      const parts = matchPrefix.split('-');
      periodLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : matchPrefix;
    }

    const matchesPeriod = (d?: string) => {
      if (!d) return false;
      return d.startsWith(matchPrefix);
    };

    // 1. Filtragem de Stocks
    const allMatches = this.store.stocks.filter(s => {
      if (typeFilter && s.type !== typeFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q && !s.articleDescription.toLowerCase().includes(q) && !s.articleSku.includes(q)) return false;
      return true;
    });

    const dayRecordsMap = new Map<string, StockRecord>();
    for (const r of allMatches) {
      if (matchesPeriod(r.registrationDate) || matchesPeriod(r.treatmentDate)) {
        dayRecordsMap.set(r.id, r);
      }
    }
    const dayRecords = Array.from(dayRecordsMap.values());

    const dayExcessRecords = dayRecords.filter(r => r.type === 'EXCESSO');
    const dayRuptureRecords = dayRecords.filter(r => r.type === 'ROTURA');

    const previousPendingRecords = allMatches.filter(r => {
      if (r.status !== 'POR_TRATAR') return false;
      if (period === 'MES') {
        const startOfMonth = `${matchPrefix}-01`;
        return r.treatmentDate < startOfMonth && r.registrationDate < startOfMonth;
      } else if (period === 'ANO') {
        const startOfYear = `${matchPrefix}-01-01`;
        return r.treatmentDate < startOfYear && r.registrationDate < startOfYear;
      }
      return r.treatmentDate < date && r.registrationDate < date;
    });

    const distinctExcessArticles = new Set(dayExcessRecords.map(r => r.articleId)).size;
    const totalBoxes = dayExcessRecords.reduce((sum, r) => sum + (r.boxes || 0), 0);
    const pendingTreatmentDay = dayRecords.filter(r => r.status === 'POR_TRATAR').length;

    const prevPendingExcess = previousPendingRecords.filter(r => r.type === 'EXCESSO');
    const prevPendingRupture = previousPendingRecords.filter(r => r.type === 'ROTURA');
    const prevTotalBoxes = prevPendingExcess.reduce((sum, r) => sum + (r.boxes || 0), 0);

    // 2. Dados de PDE para o período selecionado
    const dayPdes = (this.store.pdes || []).filter(
      p => matchesPeriod(p.arrivalDate) || matchesPeriod(p.submittedAt)
    );
    const pdeMetrics = {
      totalCount: dayPdes.length,
      pendingCount: dayPdes.filter(p => p.status === 'PENDENTE').length,
      resolvedCount: dayPdes.filter(p => p.status === 'RESOLVIDO').length,
      notConsideredCount: dayPdes.filter(p => p.status === 'NAO_CONSIDERADO').length,
    };

    // 3. Desempenho de tarefas (dia/período e semana) e IPA anual por colaborador
    const lisbonNow = getLisbonDateTimeParts();
    const reportYear = /^\d{4}/.test(date) ? date.slice(0, 4) : String(lisbonNow.year);
    let weekRefDate = lisbonNow.dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      weekRefDate = date;
    } else if (/^\d{4}-\d{2}$/.test(date)) {
      weekRefDate = lisbonNow.dateStr.startsWith(date) ? lisbonNow.dateStr : `${date}-01`;
    } else if (/^\d{4}$/.test(date)) {
      weekRefDate = lisbonNow.dateStr.startsWith(date) ? lisbonNow.dateStr : `${date}-01-01`;
    }
    const weekBounds = getWeekBoundsFromDate(weekRefDate, Number(reportYear) || lisbonNow.year);

    const periodTasks = (this.store.tasks || []).filter(t => matchesPeriod(t.date));
    const activeCollaborators = this.store.collaborators.filter(c => c.status === 'ATIVO');

    const colabMap = new Map<string, {
      mecanographicNumber: string;
      name: string;
      role?: Role;
      totalTasks: number;
      completedTasks: number;
      notDoneTasks: number;
      pendingTasks: number;
      completionRate: number;
    }>();

    for (const c of activeCollaborators) {
      colabMap.set(c.mecanographicNumber, {
        mecanographicNumber: c.mecanographicNumber,
        name: c.name,
        role: c.role,
        totalTasks: 0,
        completedTasks: 0,
        notDoneTasks: 0,
        pendingTasks: 0,
        completionRate: 0,
      });
    }

    for (const t of periodTasks) {
      let entry = colabMap.get(t.mecanographicNumber);
      if (!entry) {
        const knownColab = this.getCollaboratorByNumber(t.mecanographicNumber);
        entry = {
          mecanographicNumber: t.mecanographicNumber,
          name: t.collaboratorName,
          role: knownColab?.role,
          totalTasks: 0,
          completedTasks: 0,
          notDoneTasks: 0,
          pendingTasks: 0,
          completionRate: 0,
        };
        colabMap.set(t.mecanographicNumber, entry);
      }
      entry.totalTasks += 1;
      if (t.status === 'FEITA') entry.completedTasks += 1;
      else if (t.status === 'NAO_FEITA') entry.notDoneTasks += 1;
      else entry.pendingTasks += 1;
    }

    const collaboratorTasks = Array.from(colabMap.values())
      .filter(item => item.totalTasks > 0)
      .map(item => {
        const weekStats = this.getWeeklyTaskCompletion(
          weekBounds.weekStart,
          weekBounds.weekEnd,
          weekBounds.weekLabel,
          item.mecanographicNumber
        );
        return {
          ...item,
          completionRate: item.totalTasks > 0 ? Math.round((item.completedTasks / item.totalTasks) * 100) : 0,
          weeklyCompletionRate: weekStats.completionRate,
          weeklyCompletedTasks: weekStats.completedTasks,
          weeklyTotalTasks: weekStats.totalTasks,
          weeklyLabel: weekStats.weekLabel,
          annualScore: this.getCollaboratorAnnualScore(item.mecanographicNumber, reportYear),
        };
      })
      .sort((a, b) => b.totalTasks - a.totalTasks || a.name.localeCompare(b.name));

    const totalTasksCount = periodTasks.length;
    const completedTasksCount = periodTasks.filter(t => t.status === 'FEITA').length;
    const notDoneTasksCount = periodTasks.filter(t => t.status === 'NAO_FEITA').length;
    const pendingTasksCount = periodTasks.filter(t => t.status === 'POR_ASSINALAR').length;
    const globalCompletionRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

    return {
      reportDate: date,
      period,
      reportScope,
      periodLabel,
      sectionName: 'Frutas e Legumes',
      generatedAt: new Date().toISOString(),
      filters: {
        articleQuery: filters?.articleQuery,
        type: filters?.type,
        status: filters?.status,
        period,
        reportScope,
      },
      metrics: {
        excessCount: dayExcessRecords.length,
        excessBoxesTotal: totalBoxes,
        distinctArticlesExcess: distinctExcessArticles,
        ruptureCount: dayRuptureRecords.length,
        pendingTreatmentCount: pendingTreatmentDay,
      },
      dayExcessRecords,
      dayRuptureRecords,
      previousPendingRecords,
      previousPendingMetrics: {
        count: previousPendingRecords.length,
        excessCount: prevPendingExcess.length,
        excessBoxesTotal: prevTotalBoxes,
        ruptureCount: prevPendingRupture.length,
      },
      pdeMetrics,
      pdeRecords: dayPdes,
      collaboratorTasks,
      tasksMetrics: {
        totalTasks: totalTasksCount,
        completedTasks: completedTasksCount,
        notDoneTasks: notDoneTasksCount,
        pendingTasks: pendingTasksCount,
        globalCompletionRate,
      },
    };
  }

  // --- Importações de PDF ---
  public getImports(): ImportRecord[] {
    return this.store.imports;
  }

  public async publishImport(
    importRecord: ImportRecord,
    newTasks: DailyTask[],
    newMeals: MealSchedule[],
    author: Collaborator
  ): Promise<{ success: boolean; error?: string }> {
    // Preservar tarefas adicionais
    const existingTasksMap = new Map<string, DailyTask>();
    for (const t of this.store.tasks) {
      const key = `${t.mecanographicNumber}_${t.date}_${t.type}_${t.description.trim().toLowerCase()}`;
      existingTasksMap.set(key, t);
    }

    const removedTaskIds: string[] = [];
    this.store.tasks = this.store.tasks.filter(t => {
      if (t.type === 'ADICIONAL') return true;
      if (t.source !== importRecord.sourceType) return true;
      removedTaskIds.push(t.id);
      return false;
    });

    const addedTasks: DailyTask[] = [];
    for (const nt of newTasks) {
      // Requisito: Administradores não estão presentes nas tarefas operacionais
      if (nt.mecanographicNumber === '56359') continue;

      const key = `${nt.mecanographicNumber}_${nt.date}_${nt.type}_${nt.description.trim().toLowerCase()}`;
      const prev = existingTasksMap.get(key);
      if (prev && prev.status !== 'POR_ASSINALAR') {
        nt.status = prev.status;
        nt.observation = prev.observation;
        nt.answeredAt = prev.answeredAt;
        nt.answeredBy = prev.answeredBy;
        nt.history = [...prev.history];
      }
      this.store.tasks.push(nt);
      addedTasks.push(nt);
    }

    const removedMealIds: string[] = [];
    this.store.meals = this.store.meals.filter(m => {
      if (m.source === importRecord.sourceType) {
        removedMealIds.push(m.id);
        return false;
      }
      return true;
    });
    const validMeals = newMeals.filter(m => m.mecanographicNumber !== '56359');
    this.store.meals.push(...validMeals);

    importRecord.status = 'PUBLICADO';
    importRecord.publishedAt = new Date().toISOString();
    importRecord.publishedBy = author.name;

    const idx = this.store.imports.findIndex(i => i.id === importRecord.id);
    if (idx >= 0) {
      this.store.imports[idx] = importRecord;
    } else {
      this.store.imports.unshift(importRecord);
    }

    this.logAudit(
      author.mecanographicNumber,
      author.name,
      'PUBLICAR_IMPORTACAO',
      'Importação',
      `Publicado ${importRecord.sourceType} [${importRecord.week}] com ${addedTasks.length} tarefas e ${validMeals.length} refeições`
    );
    this.save();

    const newTaskIds = new Set(addedTasks.map(t => t.id));
    const newMealIds = new Set(validMeals.map(m => m.id));
    await Promise.all([
      syncDocument('imports', importRecord.id, importRecord),
      deleteDocumentsBatch('tasks', removedTaskIds.filter(id => !newTaskIds.has(id))),
      deleteDocumentsBatch('meals', removedMealIds.filter(id => !newMealIds.has(id))),
      syncDocumentsBatch('tasks', addedTasks),
      syncDocumentsBatch('meals', validMeals),
    ]);

    return { success: true };
  }

  public async revertImport(importId: string, author: Collaborator): Promise<{ success: boolean; error?: string }> {
    const target = this.store.imports.find(i => i.id === importId);
    if (!target) return { success: false, error: 'Importação não encontrada.' };

    target.status = 'ANULADO';
    const removedTaskIds: string[] = [];
    this.store.tasks = this.store.tasks.filter(t => {
      if (t.importId === importId) {
        removedTaskIds.push(t.id);
        return false;
      }
      return true;
    });

    this.logAudit(
      author.mecanographicNumber,
      author.name,
      'ANULAR_IMPORTACAO',
      'Importação',
      `Anulada importação ${target.fileName} (${target.sourceType} - ${target.week})`
    );
    this.save();

    await Promise.all([
      syncDocument('imports', target.id, target),
      deleteDocumentsBatch('tasks', removedTaskIds),
    ]);

    return { success: true };
  }

  // --- Estatísticas & Histórico da Secção (Persistência e Análise) ---
  public getStatistics(): DailyStatistic[] {
    const dates = this.getAvailableDates().map(d => d.date);
    const activeWorkers = this.store.collaborators.filter(c => c.status === 'ATIVO' && c.role !== 'ADMIN').length;

    return dates.map(date => {
      const dayTasks = this.store.tasks.filter(t => t.date === date);
      const totalTasks = dayTasks.length;
      const completedTasks = dayTasks.filter(t => t.status === 'FEITA').length;
      const notDoneTasks = dayTasks.filter(t => t.status === 'NAO_FEITA').length;
      const pendingTasks = dayTasks.filter(t => t.status === 'POR_ASSINALAR').length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const dayStocks = this.store.stocks.filter(s => s.registrationDate === date || s.treatmentDate === date);
      const excessList = dayStocks.filter(s => s.type === 'EXCESSO');
      const ruptureList = dayStocks.filter(s => s.type === 'ROTURA');
      const totalExcessItems = excessList.length;
      const totalExcessBoxes = excessList.reduce((acc, curr) => acc + (curr.boxes || 0), 0);
      const totalRuptures = ruptureList.length;
      const resolvedStocks = dayStocks.filter(s => s.status === 'TRATADO' || (s.status as string) === 'RESOLVIDO').length;
      const pendingStocks = dayStocks.filter(s => s.status === 'POR_TRATAR').length;

      return {
        id: `stat-${date}`,
        date,
        totalTasks,
        completedTasks,
        notDoneTasks,
        pendingTasks,
        completionRate,
        totalExcessItems,
        totalExcessBoxes,
        totalRuptures,
        resolvedStocks,
        pendingStocks,
        activeCollaboratorsCount: activeWorkers,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  public getHistoricalRecords() {
    const fbInfo = getFirebaseConfigInfo();
    return {
      audits: this.store.audits,
      tasksAnswered: this.store.tasks.filter(t => t.status !== 'POR_ASSINALAR' || (t.history && t.history.length > 0)),
      stocksHistory: this.store.stocks,
      totalRegisteredArticles: this.store.articles.length,
      totalRegisteredTasks: this.store.tasks.length,
      databaseInfo: {
        provider: 'Firebase Firestore',
        projectId: fbInfo.projectId,
        databaseId: fbInfo.databaseId,
        status: fbInfo.connected ? 'CONNECTED' : 'LOCAL_ONLY',
      },
    };
  }

  public async forceDatabaseSync(): Promise<{ success: boolean; message: string }> {
    try {
      const ok = await syncAllToFirestore(this.store);
      return {
        success: ok,
        message: ok ? 'Todos os dados foram sincronizados com a base de dados Firestore com sucesso.' : 'Falha na sincronização.',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao sincronizar.' };
    }
  }

  // ---------------- PDE (Pedidos de Qualidade) ----------------
  public getPdes(filters?: { status?: string; articleQuery?: string; date?: string; collaboratorNumber?: string }): PdeRequest[] {
    let list = [...this.store.pdes];

    if (filters?.status && filters.status !== 'TODOS') {
      list = list.filter(p => p.status === filters.status);
    }

    if (filters?.date) {
      list = list.filter(p => p.arrivalDate === filters.date);
    }

    if (filters?.collaboratorNumber) {
      list = list.filter(p => p.submittedByNumber === filters.collaboratorNumber);
    }

    if (filters?.articleQuery) {
      const q = filters.articleQuery.toLowerCase().trim();
      list = list.filter(
        p =>
          p.sku.toLowerCase().includes(q) ||
          p.articleDescription.toLowerCase().includes(q) ||
          p.batchNumber.toLowerCase().includes(q)
      );
    }

    // Ordenar pelos mais recentes primeiro
    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  public createPde(
    data: {
      articleId: string;
      batchNumber: string;
      arrivalDate: string;
      expirationDate: string;
      defectReason: string;
      notes?: string;
      photos?: string[];
    },
    user: Collaborator
  ): { success: boolean; pde?: PdeRequest; error?: string } {
    if (!data.articleId || !data.batchNumber || !data.arrivalDate || !data.expirationDate || !data.defectReason) {
      return { success: false, error: 'Todos os campos obrigatórios devem ser preenchidos.' };
    }

    // REGRA ESTRITA DO UTILIZADOR: "só é valido o pde se o artigo tiver chegado no proprio dia"
    const today = getLisbonDateTimeParts().dateStr;
    if (data.arrivalDate !== today) {
      return {
        success: false,
        error: `O pedido de PDE só é válido se o artigo tiver chegado no próprio dia (${today}). A data de chegada selecionada foi ${data.arrivalDate}.`,
      };
    }

    const article = this.store.articles.find(a => a.id === data.articleId || a.sku === data.articleId);
    if (!article) {
      return { success: false, error: 'Artigo não encontrado no catálogo da secção.' };
    }

    // Limite estrito de 5 fotos
    const rawPhotos = Array.isArray(data.photos) ? data.photos.slice(0, 5) : [];

    const newPde: PdeRequest = {
      id: `pde-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      articleId: article.id,
      sku: article.sku,
      articleDescription: article.description,
      category: article.category,
      unit: article.unit,
      batchNumber: data.batchNumber.trim().toUpperCase(),
      arrivalDate: data.arrivalDate,
      expirationDate: data.expirationDate,
      defectReason: data.defectReason,
      notes: data.notes?.trim() || undefined,
      photos: rawPhotos,
      submittedByNumber: user.mecanographicNumber,
      submittedByName: user.name,
      submittedAt: new Date().toISOString(),
      status: 'PENDENTE',
    };

    this.store.pdes.unshift(newPde);
    this.logAudit(
      user.mecanographicNumber,
      user.name,
      'CRIAR_PDE',
      'PDE',
      `Pedido de PDE de qualidade criado para ${article.sku} - ${article.description} (Lote: ${newPde.batchNumber}, Motivo: ${newPde.defectReason}) com ${newPde.photos.length} fotos`
    );

    // Notificar Administradores e Gestores de Stocks & PDE sobre o novo pedido PDE
    const pdeRecipients = this.store.collaborators.filter(
      c =>
        c.status === 'ATIVO' &&
        (c.role === 'ADMIN' || c.role === 'GESTOR_STOCKS_PDE') &&
        c.mecanographicNumber !== user.mecanographicNumber
    );
    const pdeNotifications: InAppNotification[] = [];
    for (const recipient of pdeRecipients) {
      const notif: InAppNotification = {
        id: `notif-pde-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${recipient.mecanographicNumber}`,
        recipientNumber: recipient.mecanographicNumber,
        recipientName: recipient.name,
        senderNumber: user.mecanographicNumber,
        senderName: user.name,
        category: 'PDE',
        title: 'Novo Pedido PDE de Qualidade',
        message: `${user.name} submeteu PDE para [${newPde.sku}] ${newPde.articleDescription} (Lote: ${newPde.batchNumber} · ${newPde.defectReason}).`,
        pdeId: newPde.id,
        date: newPde.arrivalDate,
        createdAt: newPde.submittedAt,
        read: false,
      };
      this.store.notifications.push(notif);
      pdeNotifications.push(notif);
    }

    this.saveDirect();
    syncDocument('pdes', newPde.id, newPde);
    for (const n of pdeNotifications) {
      syncDocument('notifications', n.id, n);
    }

    return { success: true, pde: newPde };
  }

  public updatePdeStatus(
    id: string,
    update: {
      status: PdeStatus;
      resolutionNotes?: string;
      resolutionAction?: string;
    },
    user: Collaborator
  ): { success: boolean; pde?: PdeRequest; error?: string } {
    const pde = this.store.pdes.find(p => p.id === id);
    if (!pde) {
      return { success: false, error: 'Pedido de PDE não encontrado.' };
    }

    const prevStatus = pde.status;
    pde.status = update.status;

    // REGRA ESTRITA DO UTILIZADOR: "as fotos são apagadas da base de dado no momento em que o processo é dado como resolvido pelos administradores"
    if (update.status === 'RESOLVIDO') {
      pde.photos = []; // FOTOS APAGADAS DA BASE DE DADOS
      pde.resolvedAt = new Date().toISOString();
      pde.resolvedByNumber = user.mecanographicNumber;
      pde.resolvedByName = user.name;
      pde.resolutionNotes = update.resolutionNotes?.trim() || undefined;
      pde.resolutionAction = update.resolutionAction?.trim() || 'Processo de Qualidade Concluído';
    } else if (update.status === 'NAO_CONSIDERADO') {
      pde.resolvedAt = new Date().toISOString();
      pde.resolvedByNumber = user.mecanographicNumber;
      pde.resolvedByName = user.name;
      pde.resolutionNotes = update.resolutionNotes?.trim() || undefined;
      pde.resolutionAction = 'Não considerado';
    } else if (update.status === 'PENDENTE') {
      pde.resolvedAt = undefined;
      pde.resolvedByNumber = undefined;
      pde.resolvedByName = undefined;
      pde.resolutionAction = undefined;
    }

    this.logAudit(
      user.mecanographicNumber,
      user.name,
      'ATUALIZAR_PDE',
      'PDE',
      `PDE ${pde.id} (${pde.sku}) alterado de ${prevStatus} para ${pde.status}. ${update.status === 'RESOLVIDO' ? 'Fotografias apagadas da base de dados com sucesso.' : ''}`
    );

    this.saveDirect();
    syncDocument('pdes', pde.id, pde);

    return { success: true, pde };
  }

  public deletePde(id: string, user: Collaborator): { success: boolean; error?: string } {
    const index = this.store.pdes.findIndex(p => p.id === id);
    if (index === -1) {
      return { success: false, error: 'Pedido de PDE não encontrado.' };
    }

    const pde = this.store.pdes[index];
    if (user.role !== 'ADMIN' && pde.submittedByNumber !== user.mecanographicNumber) {
      return { success: false, error: 'Apenas tem permissão para apagar os pedidos de PDE submetidos por si.' };
    }

    this.store.pdes.splice(index, 1);
    this.logAudit(
      user.mecanographicNumber,
      user.name,
      'APAGAR_PDE',
      'PDE',
      `Pedido de PDE ${pde.id} (${pde.sku} - Lote ${pde.batchNumber}) removido da secção por ${user.name}`
    );

    this.saveDirect();
    deleteDocument('pdes', pde.id);
    return { success: true };
  }

  public async publishSpreadsheetImport(
    importRecord: ImportRecord,
    tasks: DailyTask[],
    meals: MealSchedule[],
    user: Collaborator
  ): Promise<{ success: boolean; error?: string }> {
    try {
      importRecord.status = 'PUBLICADO';
      importRecord.publishedAt = new Date().toISOString();
      importRecord.publishedBy = user.name;
      this.store.imports.unshift(importRecord);

      // Datas afetadas por esta folha (incluindo datas de linhas FOLGA/FÉRIAS)
      const affectedDates = new Set<string>();
      tasks.forEach(t => t.date && affectedDates.add(t.date));
      meals.forEach(m => m.date && affectedDates.add(m.date));
      (importRecord.rows || []).forEach((r: any) => r.date && affectedDates.add(r.date));

      // Preservar respostas existentes por chave lógica
      const existingTasksMap = new Map<string, DailyTask>();
      for (const t of this.store.tasks) {
        const key = `${t.mecanographicNumber}_${t.date}_${t.type}_${t.description.trim().toLowerCase()}`;
        existingTasksMap.set(key, t);
      }

      // Substituir apenas tarefas da mesma fonte (PTD ou PTS) nas datas importadas, preservando ADICIONAL e outras semanas
      const removedTaskIds: string[] = [];
      this.store.tasks = this.store.tasks.filter(t => {
        if (t.type === 'ADICIONAL') return true;
        if (t.source === importRecord.sourceType && affectedDates.has(t.date)) {
          removedTaskIds.push(t.id);
          return false;
        }
        return true;
      });

      const preparedTasks: DailyTask[] = [];
      for (const nt of tasks) {
        if (nt.mecanographicNumber === '56359') continue;
        nt.importId = importRecord.id;
        const key = `${nt.mecanographicNumber}_${nt.date}_${nt.type}_${nt.description.trim().toLowerCase()}`;
        const prev = existingTasksMap.get(key);
        if (prev && prev.status !== 'POR_ASSINALAR') {
          nt.status = prev.status;
          nt.observation = prev.observation;
          nt.answeredAt = prev.answeredAt;
          nt.answeredBy = prev.answeredBy;
          nt.history = [...prev.history];
        }
        preparedTasks.push(nt);
      }
      this.store.tasks = [...preparedTasks, ...this.store.tasks];

      // Substituir horários de refeição da mesma fonte nas datas importadas
      const removedMealIds: string[] = [];
      const validMeals = meals.filter(m => m.mecanographicNumber !== '56359');
      if (importRecord.sourceType === 'PTD' || validMeals.length > 0) {
        this.store.meals = this.store.meals.filter(m => {
          if (m.source === importRecord.sourceType && affectedDates.has(m.date)) {
            removedMealIds.push(m.id);
            return false;
          }
          return true;
        });
        this.store.meals = [...validMeals, ...this.store.meals];
      }

      this.logAudit(
        user.mecanographicNumber,
        user.name,
        'PUBLICAR_IMPORTACAO_EXCEL',
        'Importações',
        `Importação ${importRecord.sourceType} (${importRecord.fileName}) publicada: ${preparedTasks.length} tarefas e ${validMeals.length} refeições`
      );

      this.saveDirect();

      const newTaskIds = new Set(preparedTasks.map(t => t.id));
      const newMealIds = new Set(validMeals.map(m => m.id));

      // Garantir persistência em lote no Firestore antes de concluir
      await Promise.all([
        syncDocument('imports', importRecord.id, importRecord),
        deleteDocumentsBatch('tasks', removedTaskIds.filter(id => !newTaskIds.has(id))),
        deleteDocumentsBatch('meals', removedMealIds.filter(id => !newMealIds.has(id))),
        syncDocumentsBatch('tasks', preparedTasks),
        syncDocumentsBatch('meals', validMeals),
      ]);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao publicar importação.' };
    }
  }

  // --- Notificações na App ---
  public getNotifications(recipientNumber: string): InAppNotification[] {
    const user = this.getCollaboratorByNumber(recipientNumber);
    const isAdminOrGestor = user?.role === 'ADMIN' || user?.role === 'GESTOR_STOCKS_PDE';

    return (this.store.notifications || [])
      .filter(n => {
        if (n.recipientNumber !== recipientNumber) return false;
        if (isAdminOrGestor) {
          return n.category === 'STOCK' || n.category === 'PDE';
        }
        return !n.category || n.category === 'TAREFA';
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public markNotificationAsRead(id: string, recipientNumber: string): boolean {
    const notif = (this.store.notifications || []).find(
      n => n.id === id && n.recipientNumber === recipientNumber
    );
    if (!notif) return false;
    notif.read = true;
    this.saveDirect();
    syncDocument('notifications', notif.id, notif);
    return true;
  }

  public markAllNotificationsAsRead(recipientNumber: string): boolean {
    let changed = false;
    for (const notif of this.store.notifications || []) {
      if (notif.recipientNumber === recipientNumber && !notif.read) {
        notif.read = true;
        syncDocument('notifications', notif.id, notif);
        changed = true;
      }
    }
    if (changed) this.saveDirect();
    return true;
  }

  // --- Cumprimento Semanal e Pontuação Anual de Colaboradores ---
  public getWeeklyTaskCompletion(
    weekStart: string,
    weekEnd: string,
    weekLabel: string,
    mecanographicNumber?: string
  ): WeeklyTaskCompletion {
    const weekTasks = (this.store.tasks || []).filter(t => {
      if (t.mecanographicNumber === '56359') return false;
      if (mecanographicNumber && t.mecanographicNumber !== mecanographicNumber) return false;
      return t.date >= weekStart && t.date <= weekEnd;
    });
    const totalTasks = weekTasks.length;
    const completedTasks = weekTasks.filter(t => t.status === 'FEITA').length;
    const notDoneTasks = weekTasks.filter(t => t.status === 'NAO_FEITA').length;
    const pendingTasks = weekTasks.filter(t => t.status === 'POR_ASSINALAR').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      weekStart,
      weekEnd,
      weekLabel,
      totalTasks,
      completedTasks,
      notDoneTasks,
      pendingTasks,
      completionRate,
    };
  }

  public getCollaboratorAnnualScore(mecanographicNumber: string, year: string): CollaboratorAnnualScore {
    const colab = this.getCollaboratorByNumber(mecanographicNumber);
    const eligible = Boolean(colab && colab.role === 'COLABORADOR');

    if (!eligible) {
      return {
        year,
        eligible: false,
        taskTotalCount: 0,
        taskCompletedCount: 0,
        taskNotDoneCount: 0,
        taskPendingCount: 0,
        taskCompletionRate: 0,
        taskCompletedPoints: 0,
        taskNotDonePoints: 0,
        taskPendingPoints: 0,
        daily100Count: 0,
        daily100Points: 0,
        weeklyOver90Count: 0,
        weeklyOver90Points: 0,
        tasksNetPoints: 0,
        stockAddedCount: 0,
        stockAddedPoints: 0,
        stockTreatedCount: 0,
        stockTreatedPoints: 0,
        stockNetPoints: 0,
        pdeAddedCount: 0,
        pdeAddedPoints: 0,
        pdeResolvedCount: 0,
        pdeResolvedPoints: 0,
        pdeNetPoints: 0,
        totalPoints: 0,
      };
    }

    const yearPrefix = `${year}-`;
    const numericYear = parseInt(year, 10) || undefined;
    const todayLisbonStr = getLisbonDateTimeParts().dateStr;

    // 1. Tarefas do ano (reset anual automático no final de cada ano por prefixo YYYY-)
    const yearTasks = (this.store.tasks || []).filter(
      t => t.mecanographicNumber === mecanographicNumber && t.date.startsWith(yearPrefix)
    );
    const taskTotalCount = yearTasks.length;
    const taskCompletedCount = yearTasks.filter(t => t.status === 'FEITA').length;
    const taskNotDoneCount = yearTasks.filter(t => t.status === 'NAO_FEITA').length;
    const taskPendingCount = yearTasks.filter(t => t.status === 'POR_ASSINALAR').length;
    const taskCompletionRate = taskTotalCount > 0 ? Math.round((taskCompletedCount / taskTotalCount) * 100) : 0;

    // Regra 2: +5 pontos por cada tarefa concluída
    const taskCompletedPoints = taskCompletedCount * 5;
    // Regra 3: -3 pontos por cada tarefa não feita
    const taskNotDonePoints = taskNotDoneCount * -3;
    // Regra 4: -2 pontos por cada tarefa por assinalar
    const taskPendingPoints = taskPendingCount * -2;

    // Regra 5: Se a taxa de cumprimento (dia) for de 100%, ganha +8 pontos por dia
    const tasksByDay = new Map<string, DailyTask[]>();
    for (const t of yearTasks) {
      const list = tasksByDay.get(t.date) || [];
      list.push(t);
      tasksByDay.set(t.date, list);
    }
    let daily100Count = 0;
    for (const dayTasks of tasksByDay.values()) {
      if (dayTasks.length > 0 && dayTasks.every(t => t.status === 'FEITA')) {
        daily100Count += 1;
      }
    }
    const daily100Points = daily100Count * 8;

    // Regra 6: Se a taxa de cumprimento tarefas (semana) for > 90%, ganha +5 pontos (só atribuído após o último dia da semana)
    const tasksByWeek = new Map<string, { weekEnd: string; tasks: DailyTask[] }>();
    for (const t of yearTasks) {
      const wb = getWeekBoundsFromDate(t.date, numericYear);
      const existing = tasksByWeek.get(wb.weekStart);
      if (existing) {
        existing.tasks.push(t);
      } else {
        tasksByWeek.set(wb.weekStart, { weekEnd: wb.weekEnd, tasks: [t] });
      }
    }
    let weeklyOver90Count = 0;
    for (const { weekEnd, tasks: weekTasks } of tasksByWeek.values()) {
      // Só atribuído após o último dia da semana (Domingo) ter terminado
      if (todayLisbonStr <= weekEnd) continue;
      const total = weekTasks.length;
      if (total === 0) continue;
      const completed = weekTasks.filter(t => t.status === 'FEITA').length;
      const rate = Math.round((completed / total) * 100);
      if (rate > 90) {
        weeklyOver90Count += 1;
      }
    }
    const weeklyOver90Points = weeklyOver90Count * 5;

    const tasksNetPoints =
      taskCompletedPoints +
      taskNotDonePoints +
      taskPendingPoints +
      daily100Points +
      weeklyOver90Points;

    // 2. Regra 7: Excessos de stock ou roturas/revisões no ano (+1 ponto registo, +6 pontos tratado)
    const yearStocks = (this.store.stocks || []).filter(s => {
      if (s.type !== 'EXCESSO' && s.type !== 'ROTURA') return false;
      if (s.authorNumber !== mecanographicNumber) return false;
      const dateRef = s.registrationDate || s.createdAt || '';
      return dateRef.startsWith(yearPrefix);
    });
    const stockAddedCount = yearStocks.length;
    const stockAddedPoints = stockAddedCount * 1;
    const stockTreatedCount = yearStocks.filter(
      s => s.status === 'TRATADO' || (s.status as string) === 'RESOLVIDO'
    ).length;
    const stockTreatedPoints = stockTreatedCount * 6;
    const stockNetPoints = stockAddedPoints + stockTreatedPoints;

    // 3. Regra 8: Pedidos de PDE no ano (+4 pontos registo, +9 pontos resolvido)
    const yearPdes = (this.store.pdes || []).filter(p => {
      if (p.submittedByNumber !== mecanographicNumber) return false;
      const dateRef = p.arrivalDate || p.submittedAt || '';
      return dateRef.startsWith(yearPrefix);
    });
    const pdeAddedCount = yearPdes.length;
    const pdeAddedPoints = pdeAddedCount * 4;
    const pdeResolvedCount = yearPdes.filter(p => p.status === 'RESOLVIDO').length;
    const pdeResolvedPoints = pdeResolvedCount * 9;
    const pdeNetPoints = pdeAddedPoints + pdeResolvedPoints;

    // Regra 9: Soma de todos os pontos ganhos e retirados
    const totalPoints = tasksNetPoints + stockNetPoints + pdeNetPoints;

    return {
      year,
      eligible: true,
      taskTotalCount,
      taskCompletedCount,
      taskNotDoneCount,
      taskPendingCount,
      taskCompletionRate,
      taskCompletedPoints,
      taskNotDonePoints,
      taskPendingPoints,
      daily100Count,
      daily100Points,
      weeklyOver90Count,
      weeklyOver90Points,
      tasksNetPoints,
      stockAddedCount,
      stockAddedPoints,
      stockTreatedCount,
      stockTreatedPoints,
      stockNetPoints,
      pdeAddedCount,
      pdeAddedPoints,
      pdeResolvedCount,
      pdeResolvedPoints,
      pdeNetPoints,
      totalPoints,
    };
  }

  public getTaskPerformance(dateStr: string, mecanographicNumber?: string): TaskPerformanceResponse {
    const windowInfo = getCollaboratorVisibleWeekWindow();
    const targetColab = mecanographicNumber ? this.getCollaboratorByNumber(mecanographicNumber) : undefined;
    const validSelectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : windowInfo.todayStr;
    const selectedBounds = getWeekBoundsFromDate(validSelectedDate, windowInfo.currentYear);

    const currentWeek = this.getWeeklyTaskCompletion(
      windowInfo.currentWeek.weekStart,
      windowInfo.currentWeek.weekEnd,
      windowInfo.currentWeek.weekLabel,
      mecanographicNumber
    );

    const selectedWeek = this.getWeeklyTaskCompletion(
      selectedBounds.weekStart,
      selectedBounds.weekEnd,
      selectedBounds.weekLabel,
      mecanographicNumber
    );

    const scoreYear = validSelectedDate.slice(0, 4);
    const annualScore =
      mecanographicNumber && targetColab
        ? this.getCollaboratorAnnualScore(mecanographicNumber, scoreYear)
        : null;

    return {
      collaboratorNumber: targetColab?.mecanographicNumber,
      collaboratorName: targetColab?.name,
      role: targetColab?.role,
      currentWeek,
      selectedWeek,
      annualScore,
    };
  }
}

export const storage = new StorageManager();

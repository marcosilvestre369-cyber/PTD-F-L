export type Role = 'ADMIN' | 'ADMIN_2' | 'COLABORADOR' | 'GESTOR_STOCKS_PDE';

export type CollaboratorStatus = 'PENDENTE_ATIVACAO' | 'ATIVO' | 'DESATIVADO';

export interface Collaborator {
  id: string;
  mecanographicNumber: string; // Guardado como texto
  name: string;
  role: Role;
  status: CollaboratorStatus;
  pin?: string; // Armazenado no servidor (hash ou PIN individual)
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  failedAttempts?: number;
  lockedUntil?: string;
}

export type TaskType = 'PRINCIPAL' | 'SECUNDARIA' | 'ADICIONAL';
export type TaskSource = 'PTD' | 'PTS' | 'ADMINISTRADOR';
export type TaskStatus = 'POR_ASSINALAR' | 'FEITA' | 'NAO_FEITA';

export interface TaskHistoryEntry {
  status: TaskStatus;
  observation?: string;
  answeredAt: string;
  answeredBy: string;
}

export interface TaskIpaPoints {
  pending: number; // POR_ASSINALAR (-1.0 a 1.0, passo 0.1)
  done: number; // FEITA (-1.0 a 1.0, passo 0.1)
  notDone: number; // NAO_FEITA (-1.0 a 1.0, passo 0.1)
}

export interface DailyTask {
  id: string;
  collaboratorId: string;
  mecanographicNumber: string;
  collaboratorName: string;
  date: string; // YYYY-MM-DD
  description: string;
  type: TaskType;
  source: TaskSource;
  time?: string; // Horário facultativo da fonte (ex: "07:50", "12:00")
  ipaPoints?: TaskIpaPoints; // Pontos IPA atribuídos pelo administrador (-1 a 1, passo 0.1)
  importId?: string;
  status: TaskStatus;
  observation?: string;
  answeredAt?: string;
  answeredBy?: string;
  history: TaskHistoryEntry[];
}

export interface MealSchedule {
  id: string;
  collaboratorId: string;
  mecanographicNumber: string;
  collaboratorName: string;
  date: string; // YYYY-MM-DD
  time: string; // ex: "09:00" ou intervalo "12:00 - 13:00"
  startTime?: string;
  endTime?: string;
  source: 'PTD' | 'PTS' | 'MANUAL';
  importId?: string;
  hasConflict?: boolean;
  conflictDetails?: string;
}

export type ShiftSituation = 'TRABALHO' | 'FOLGA' | 'FÉRIAS' | 'AUSÊNCIA';

export interface ShiftStatusInfo {
  date: string;
  collaboratorNumber: string;
  collaboratorName: string;
  shiftStatus: ShiftSituation;
  label: string;
  description: string;
  mealTime?: string;
  tasksCount: number;
}

export interface Article {
  id: string;
  sku: string; // Código único
  description: string;
  unit: string; // KG ou EA
  barcode?: string;
  category: string; // Frutas, Legumes, Especialidades, Bio, etc.
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockType = 'EXCESSO' | 'ROTURA';
export type StockStatus = 'POR_TRATAR' | 'TRATADO' | 'NAO_CONSIDERADO';
export type StockDateType = "R's" | "Validade";

export interface StockHistoryEntry {
  timestamp: string;
  authorName: string;
  action: string;
  details: string;
}

export interface StockRecord {
  id: string;
  articleId: string;
  articleSku: string;
  articleDescription: string;
  type: StockType;
  registrationDate: string; // YYYY-MM-DD (data do registo operacional)
  treatmentDate: string; // YYYY-MM-DD (data atribuída para tratamento, defeito = registrationDate)
  status: StockStatus;
  authorId: string;
  authorNumber: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  // Campos de excesso
  boxes?: number; // Caixas inteiras > 0
  dateType?: StockDateType; // "R's" ou "Validade"
  stockDate?: string; // YYYY-MM-DD
  lot?: string;
  // Campos de rotura/revisão
  needsReview?: boolean;
  // Observação geral
  observation?: string;
  // Tratamento
  assignedTo?: string; // Responsável facultativo
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  history: StockHistoryEntry[];
}

export type ImportStatus = 'CARREGADO' | 'EM_REVISAO' | 'PUBLICADO' | 'ANULADO' | 'FALHOU';

export interface ImportedRowPreview {
  rawLine: string;
  collaboratorName?: string;
  mecanographicNumber?: string;
  date?: string;
  taskType: TaskType;
  description: string;
  time?: string;
  mealTime?: string;
  isMatched: boolean;
  warning?: string;
}

export interface ImportRecord {
  id: string;
  sourceType: 'PTD' | 'PTS';
  week: string; // ex: "9/11 a 15/11"
  fileName: string;
  fileHash: string;
  version: number;
  status: ImportStatus;
  supersededByVersion?: number;
  uploadedAt: string;
  uploadedBy: string;
  publishedAt?: string;
  publishedBy?: string;
  rowCount: number;
  warnings: string[];
  rows: ImportedRowPreview[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  authorNumber: string;
  authorName: string;
  action: string;
  entity: string;
  details: string;
}

export interface WeeklyTaskCompletion {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalTasks: number;
  completedTasks: number;
  notDoneTasks: number;
  pendingTasks: number;
  completionRate: number;
}

export interface CollaboratorAnnualScore {
  year: string;
  eligible: boolean;
  taskTotalCount: number;
  taskCompletedCount: number;
  taskNotDoneCount: number;
  taskPendingCount: number;
  taskCompletionRate: number;
  taskCompletedPoints: number;
  taskNotDonePoints: number;
  taskPendingPoints: number;
  daily100Count: number;
  daily100Points: number;
  weeklyOver95Count: number;
  weeklyOver95Points: number;
  tasksNetPoints: number;
  stockAddedCount: number;
  stockAddedPoints: number;
  stockTreatedCount: number;
  stockTreatedPoints: number;
  stockNotConsideredCount?: number;
  stockNotConsideredPoints?: number;
  stockNetPoints: number;
  pdeAddedCount: number;
  pdeAddedPoints: number;
  pdeResolvedCount: number;
  pdeResolvedPoints: number;
  pdeNetPoints: number;
  totalPoints: number;
}

export interface WorkingCollaboratorDailyProgress {
  mecanographicNumber: string;
  name: string;
  mealTime?: string;
  totalTasks: number;
  completedTasks: number;
  notDoneTasks: number;
  pendingTasks: number;
  completionRate: number;
  annualScore: CollaboratorAnnualScore;
}

export interface TaskPerformanceResponse {
  collaboratorNumber?: string;
  collaboratorName?: string;
  role?: Role;
  currentWeek: WeeklyTaskCompletion;
  selectedWeek: WeeklyTaskCompletion;
  annualScore: CollaboratorAnnualScore | null;
  workingCollaboratorsDaily?: WorkingCollaboratorDailyProgress[];
}

export interface CollaboratorTaskSummary {
  mecanographicNumber: string;
  name: string;
  role?: Role;
  totalTasks: number;
  completedTasks: number;
  notDoneTasks: number;
  pendingTasks: number;
  completionRate: number;
  weeklyCompletionRate?: number;
  weeklyCompletedTasks?: number;
  weeklyTotalTasks?: number;
  weeklyLabel?: string;
  annualScore?: CollaboratorAnnualScore;
}

export type ReportScope = 'STOCKS' | 'PDE' | 'TAREFAS' | 'TODOS';
export type ReportPeriod = 'DIA' | 'MES' | 'ANO';

export interface DailyReportSummary {
  reportDate: string;
  period?: ReportPeriod;
  reportScope?: ReportScope;
  periodLabel?: string;
  sectionName: string;
  generatedAt: string;
  filters: {
    articleQuery?: string;
    type?: string;
    status?: string;
    period?: ReportPeriod;
    reportScope?: ReportScope;
  };
  metrics: {
    excessCount: number;
    excessBoxesTotal: number;
    distinctArticlesExcess: number;
    ruptureCount: number;
    pendingTreatmentCount: number;
  };
  dayExcessRecords: StockRecord[];
  dayRuptureRecords: StockRecord[];
  previousPendingRecords: StockRecord[];
  previousPendingMetrics: {
    count: number;
    excessCount: number;
    excessBoxesTotal: number;
    ruptureCount: number;
  };
  // Dados de PDE no Relatório Diário
  pdeMetrics?: {
    totalCount: number;
    pendingCount: number;
    resolvedCount: number;
    notConsideredCount?: number;
  };
  pdeRecords?: PdeRequest[];
  // Desempenho de tarefas por colaborador
  collaboratorTasks?: CollaboratorTaskSummary[];
  tasksMetrics?: {
    totalTasks: number;
    completedTasks: number;
    notDoneTasks: number;
    pendingTasks: number;
    globalCompletionRate: number;
  };
}

export interface UserSession {
  token: string;
  user: Collaborator;
}

export interface DailyStatistic {
  id: string;
  date: string;
  totalTasks: number;
  completedTasks: number;
  notDoneTasks: number;
  pendingTasks: number;
  completionRate: number;
  totalExcessItems: number;
  totalExcessBoxes: number;
  totalRuptures: number;
  resolvedStocks: number;
  pendingStocks: number;
  activeCollaboratorsCount: number;
  updatedAt: string;
}

export type PdeStatus = 'PENDENTE' | 'RESOLVIDO' | 'NAO_CONSIDERADO';

export interface PdeRequest {
  id: string;
  articleId: string;
  sku: string;
  articleDescription: string;
  category?: string;
  unit?: string;
  quantityUnits?: number; // quantidade em unidades (inteiro > 0)
  batchNumber: string; // lote do artigo
  arrivalDate: string; // dia em que chegou (YYYY-MM-DD, estritamente do próprio dia)
  expirationDate: string; // validade do artigo (YYYY-MM-DD)
  defectReason: string; // motivo de qualidade
  notes?: string; // observações adicionais
  photos: string[]; // até 5 fotografias (apagadas quando dado como resolvido)
  submittedByNumber: string;
  submittedByName: string;
  submittedAt: string;
  status: PdeStatus;
  resolvedAt?: string;
  resolvedByNumber?: string;
  resolvedByName?: string;
  resolutionNotes?: string;
  resolutionAction?: string;
}

export type NotificationCategory = 'TAREFA' | 'STOCK' | 'PDE';

export interface InAppNotification {
  id: string;
  recipientNumber: string; // Número mecanográfico do colaborador destinatário
  recipientName?: string;
  senderNumber: string;
  senderName: string;
  category?: NotificationCategory;
  title: string;
  message: string;
  taskId?: string;
  stockId?: string;
  pdeId?: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO String
  read: boolean;
}



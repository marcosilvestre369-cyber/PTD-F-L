import {
  Collaborator,
  DailyTask,
  MealSchedule,
  Article,
  StockRecord,
  StockStatus,
  DailyReportSummary,
  ImportRecord,
  AuditLog,
  TaskStatus,
  ShiftStatusInfo,
  PdeRequest,
  PdeStatus,
  Role,
  DailyStatistic,
  ReportScope,
  ReportPeriod,
  InAppNotification,
  TaskPerformanceResponse,
  TaskIpaPoints,
} from '../types/index.ts';

const TOKEN_KEY = 'prp_app_session_token';
const DEFAULT_TIMEOUT_MS = 30_000;
const REPORT_TIMEOUT_MS = 50_000;
const HEAVY_TIMEOUT_MS = 95_000;

interface ApiRequestOptions extends RequestInit {
  dedupeKey?: string;
  timeoutMs?: number;
}

// Mapa de pedidos GET em curso por chave lógica para cancelar chamadas duplicadas no navegador
const inFlightControllers = new Map<string, AbortController>();

export const api = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { name?: string; code?: string };
    return e.name === 'AbortError' || e.code === 'ABORT_ERR';
  },

  async request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const {
      dedupeKey,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      signal: externalSignal,
      ...fetchOptions
    } = options;

    // Cancelar chamada duplicada anterior com a mesma dedupeKey
    if (dedupeKey) {
      const previous = inFlightControllers.get(dedupeKey);
      if (previous) {
        previous.abort();
      }
    }

    const controller = new AbortController();
    if (dedupeKey) {
      inFlightControllers.set(dedupeKey, controller);
    }

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    let timedOut = false;
    const timeoutId =
      timeoutMs > 0
        ? window.setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = data?.error || `Erro na operação (${response.status})`;
        const err: any = new Error(errorMessage);
        if (data && Array.isArray(data.detectedWeeks)) {
          err.detectedWeeks = data.detectedWeeks;
        }
        throw err;
      }

      return data as T;
    } catch (err) {
      if (timedOut) {
        throw new Error('O pedido excedeu o tempo limite do servidor. Tente novamente.');
      }
      throw err;
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      if (dedupeKey && inFlightControllers.get(dedupeKey) === controller) {
        inFlightControllers.delete(dedupeKey);
      }
    }
  },

  // Auth
  async login(mecanographicNumber: string) {
    const res = await this.request<{
      token?: string;
      user?: Collaborator;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mecanographicNumber }),
    });

    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST', timeoutMs: 10_000 });
    } finally {
      this.clearToken();
    }
  },

  async getMe(signal?: AbortSignal) {
    return this.request<{ user: Collaborator }>('/api/auth/me', {
      dedupeKey: 'auth-me',
      signal,
    });
  },

  // Weeks & Dates
  async getAvailableDates(signal?: AbortSignal): Promise<{ date: string; label: string; week: string }[]> {
    return this.request<{ date: string; label: string; week: string }[]>('/api/weeks/dates', {
      dedupeKey: 'available-dates',
      signal,
    });
  },

  async addNextWeek(weekLabel?: string): Promise<{ success: boolean; message: string; tasksCount: number; availableDates: { date: string; label: string; week: string }[] }> {
    return this.request('/api/weeks/add-next', {
      method: 'POST',
      body: JSON.stringify({ weekLabel }),
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  // Collaborators
  async getCollaborators(signal?: AbortSignal): Promise<Collaborator[]> {
    return this.request<Collaborator[]>('/api/collaborators', {
      dedupeKey: 'collaborators',
      signal,
    });
  },

  async addCollaborator(mecanographicNumber: string, name: string, role: Role) {
    return this.request<Collaborator>('/api/collaborators', {
      method: 'POST',
      body: JSON.stringify({ mecanographicNumber, name, role }),
    });
  },

  async updateCollaborator(
    id: string,
    payload: {
      mecanographicNumber: string;
      name: string;
      role: Role;
      status: 'ATIVO' | 'DESATIVADO';
    }
  ) {
    return this.request<Collaborator>(`/api/collaborators/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deactivateCollaborator(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/collaborators/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  async deleteCollaborator(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/collaborators/${id}`, {
      method: 'DELETE',
    });
  },

  async updateRole(id: string, role: Role) {
    return this.request<{ success: boolean; message: string }>(`/api/collaborators/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  // Tasks
  async getTasks(date: string, collaboratorNumber?: string, signal?: AbortSignal): Promise<DailyTask[]> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<DailyTask[]>(`/api/tasks?${params.toString()}`, {
      dedupeKey: 'tasks',
      signal,
    });
  },

  async addAdditionalTask(
    collaboratorNumber: string,
    date: string,
    description: string,
    time?: string,
    ipaPoints?: TaskIpaPoints
  ) {
    return this.request<DailyTask>('/api/tasks/additional', {
      method: 'POST',
      body: JSON.stringify({ collaboratorNumber, date, description, time, ipaPoints }),
    });
  },

  async updateTaskStatus(taskId: string, status: TaskStatus, observation?: string) {
    return this.request<DailyTask>(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, observation }),
    });
  },

  async updateTaskDetails(taskId: string, description: string, time?: string, ipaPoints?: TaskIpaPoints) {
    return this.request<DailyTask>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ description, time, ipaPoints }),
    });
  },

  async deleteTask(taskId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  async getTaskPerformance(date: string, collaboratorNumber?: string, signal?: AbortSignal): Promise<TaskPerformanceResponse> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<TaskPerformanceResponse>(`/api/tasks/performance?${params.toString()}`, {
      dedupeKey: 'tasks-performance',
      timeoutMs: REPORT_TIMEOUT_MS,
      signal,
    });
  },

  // Notificações
  async getNotifications(signal?: AbortSignal): Promise<InAppNotification[]> {
    return this.request<InAppNotification[]>('/api/notifications', {
      dedupeKey: 'notifications',
      signal,
    });
  },

  async markNotificationRead(id: string) {
    return this.request<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead() {
    return this.request<{ success: boolean }>('/api/notifications/mark-all-read', {
      method: 'POST',
    });
  },

  // Meals
  async getMeal(date: string, collaboratorNumber?: string, signal?: AbortSignal): Promise<MealSchedule | null> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<MealSchedule | null>(`/api/meals?${params.toString()}`, {
      dedupeKey: 'meals',
      signal,
    });
  },

  // Shifts / Presença & Escala Diária (Folga, Férias, Ausência, Trabalho)
  async getShiftStatus(date: string, collaboratorNumber?: string, signal?: AbortSignal): Promise<ShiftStatusInfo> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<ShiftStatusInfo>(`/api/shifts/status?${params.toString()}`, {
      dedupeKey: 'shift-status',
      signal,
    });
  },

  async getAllShiftsForDate(date: string, signal?: AbortSignal): Promise<ShiftStatusInfo[]> {
    const params = new URLSearchParams({ date });
    return this.request<ShiftStatusInfo[]>(`/api/shifts/all?${params.toString()}`, {
      dedupeKey: 'shifts-all',
      signal,
    });
  },

  // Articles
  async getArticles(all = false, signal?: AbortSignal): Promise<Article[]> {
    return this.request<Article[]>(`/api/articles?all=${all}`, {
      dedupeKey: all ? 'articles-all' : 'articles',
      signal,
    });
  },

  async addArticle(data: { sku: string; description: string; unit: string; barcode?: string; category: string }) {
    return this.request<Article>('/api/articles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateArticle(id: string, data: Partial<Article>) {
    return this.request<Article>(`/api/articles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Stocks
  async getStocks(
    filters?: { date?: string; type?: string; status?: string; articleQuery?: string },
    signal?: AbortSignal
  ): Promise<StockRecord[]> {
    const params = new URLSearchParams();
    if (filters?.date) params.append('date', filters.date);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.articleQuery) params.append('articleQuery', filters.articleQuery);
    return this.request<StockRecord[]>(`/api/stocks?${params.toString()}`, {
      dedupeKey: 'stocks',
      signal,
    });
  },

  async createStock(payload: {
    articleId: string;
    type: 'EXCESSO' | 'ROTURA';
    registrationDate: string;
    boxes?: number;
    dateType?: "R's" | "Validade";
    stockDate?: string;
    lot?: string;
    observation?: string;
    needsReview?: boolean;
  }) {
    return this.request<{ record: StockRecord; warning?: string }>('/api/stocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateStock(
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
    }
  ) {
    return this.request<StockRecord>(`/api/stocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Reports
  async getDailyReport(
    date: string,
    filters?: {
      articleQuery?: string;
      type?: string;
      status?: string;
      period?: ReportPeriod;
      reportScope?: ReportScope;
    },
    signal?: AbortSignal
  ): Promise<DailyReportSummary> {
    const params = new URLSearchParams({ date });
    if (filters?.articleQuery) params.append('articleQuery', filters.articleQuery);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.period) params.append('period', filters.period);
    if (filters?.reportScope) params.append('reportScope', filters.reportScope);
    return this.request<DailyReportSummary>(`/api/reports/daily?${params.toString()}`, {
      dedupeKey: 'daily-report',
      timeoutMs: REPORT_TIMEOUT_MS,
      signal,
    });
  },

  // Imports
  async getImports(signal?: AbortSignal): Promise<ImportRecord[]> {
    return this.request<ImportRecord[]>('/api/imports', {
      dedupeKey: 'imports',
      signal,
    });
  },

  async previewImport(sourceType: 'PTD' | 'PTS', week?: string) {
    return this.request<any>('/api/imports/preview', {
      method: 'POST',
      body: JSON.stringify({ sourceType, week }),
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  async publishImport(payload: { sourceType: 'PTD' | 'PTS'; week: string; fileName: string; fileHash: string }) {
    return this.request<any>('/api/imports/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  async revertImport(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/imports/${id}/revert`, {
      method: 'POST',
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  async deleteImport(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/imports/${id}`, {
      method: 'DELETE',
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  // Audits
  async getAudits(signal?: AbortSignal): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/api/audits', {
      dedupeKey: 'audits',
      signal,
    });
  },

  // Estatísticas & Histórico (Base de Dados Firestore)
  async getStatistics(signal?: AbortSignal): Promise<DailyStatistic[]> {
    return this.request<DailyStatistic[]>('/api/statistics', {
      dedupeKey: 'statistics',
      timeoutMs: REPORT_TIMEOUT_MS,
      signal,
    });
  },

  async getHistory(signal?: AbortSignal): Promise<{
    audits: AuditLog[];
    tasksAnswered: DailyTask[];
    stocksHistory: StockRecord[];
    totalRegisteredArticles: number;
    totalRegisteredTasks: number;
    databaseInfo: {
      provider: string;
      projectId: string;
      databaseId: string;
      status: string;
    };
  }> {
    return this.request('/api/history', {
      dedupeKey: 'history',
      timeoutMs: REPORT_TIMEOUT_MS,
      signal,
    });
  },

  async syncDatabase(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/database/sync', {
      method: 'POST',
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  // ---------------- PDE (Pedidos de Qualidade) ----------------
  async getPdes(
    params?: { status?: string; articleQuery?: string; date?: string; myOnly?: boolean },
    signal?: AbortSignal
  ): Promise<PdeRequest[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.articleQuery) query.set('articleQuery', params.articleQuery);
    if (params?.date) query.set('date', params.date);
    if (params?.myOnly) query.set('myOnly', 'true');
    const qs = query.toString();
    return this.request<PdeRequest[]>(`/api/pdes${qs ? `?${qs}` : ''}`, {
      dedupeKey: 'pdes',
      signal,
    });
  },

  async createPde(payload: {
    articleId: string;
    batchNumber: string;
    arrivalDate: string;
    expirationDate: string;
    defectReason: string;
    notes?: string;
    photos?: string[];
  }): Promise<PdeRequest> {
    return this.request<PdeRequest>('/api/pdes', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: REPORT_TIMEOUT_MS,
    });
  },

  async updatePdeStatus(
    id: string,
    payload: {
      status: PdeStatus;
      resolutionNotes?: string;
    }
  ): Promise<{ success: boolean; message: string; pde: PdeRequest }> {
    return this.request<{ success: boolean; message: string; pde: PdeRequest }>(`/api/pdes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deletePde(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/pdes/${id}`, {
      method: 'DELETE',
    });
  },

  // ---------------- Importação Excel (.xlsx) ----------------
  async previewExcelImport(payload: {
    fileBase64: string;
    fileName: string;
    sourceType: 'BOTH' | 'PTD' | 'PTS';
    week?: string;
    explicitWeekSelected?: boolean;
  }): Promise<any> {
    return this.request<any>('/api/imports/excel-csv/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },

  async publishExcelImport(payload: {
    fileBase64: string;
    fileName: string;
    sourceType: 'BOTH' | 'PTD' | 'PTS';
    week?: string;
    explicitWeekSelected?: boolean;
  }): Promise<any> {
    return this.request<any>('/api/imports/excel-csv/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: HEAVY_TIMEOUT_MS,
    });
  },
};

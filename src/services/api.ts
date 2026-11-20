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

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
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
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.clearToken();
    }
  },

  async getMe() {
    return this.request<{ user: Collaborator }>('/api/auth/me');
  },

  // Weeks & Dates
  async getAvailableDates(): Promise<{ date: string; label: string; week: string }[]> {
    return this.request<{ date: string; label: string; week: string }[]>('/api/weeks/dates');
  },

  async addNextWeek(weekLabel?: string): Promise<{ success: boolean; message: string; tasksCount: number; availableDates: { date: string; label: string; week: string }[] }> {
    return this.request('/api/weeks/add-next', {
      method: 'POST',
      body: JSON.stringify({ weekLabel }),
    });
  },

  // Collaborators
  async getCollaborators(): Promise<Collaborator[]> {
    return this.request<Collaborator[]>('/api/collaborators');
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
  async getTasks(date: string, collaboratorNumber?: string): Promise<DailyTask[]> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<DailyTask[]>(`/api/tasks?${params.toString()}`);
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

  async getTaskPerformance(date: string, collaboratorNumber?: string): Promise<TaskPerformanceResponse> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<TaskPerformanceResponse>(`/api/tasks/performance?${params.toString()}`);
  },

  // Notificações
  async getNotifications(): Promise<InAppNotification[]> {
    return this.request<InAppNotification[]>('/api/notifications');
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
  async getMeal(date: string, collaboratorNumber?: string): Promise<MealSchedule | null> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<MealSchedule | null>(`/api/meals?${params.toString()}`);
  },

  // Shifts / Presença & Escala Diária (Folga, Férias, Ausência, Trabalho)
  async getShiftStatus(date: string, collaboratorNumber?: string): Promise<ShiftStatusInfo> {
    const params = new URLSearchParams({ date });
    if (collaboratorNumber) params.append('collaboratorNumber', collaboratorNumber);
    return this.request<ShiftStatusInfo>(`/api/shifts/status?${params.toString()}`);
  },

  async getAllShiftsForDate(date: string): Promise<ShiftStatusInfo[]> {
    const params = new URLSearchParams({ date });
    return this.request<ShiftStatusInfo[]>(`/api/shifts/all?${params.toString()}`);
  },

  // Articles
  async getArticles(all = false): Promise<Article[]> {
    return this.request<Article[]>(`/api/articles?all=${all}`);
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
  async getStocks(filters?: { date?: string; type?: string; status?: string; articleQuery?: string }): Promise<StockRecord[]> {
    const params = new URLSearchParams();
    if (filters?.date) params.append('date', filters.date);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.articleQuery) params.append('articleQuery', filters.articleQuery);
    return this.request<StockRecord[]>(`/api/stocks?${params.toString()}`);
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
    }
  ): Promise<DailyReportSummary> {
    const params = new URLSearchParams({ date });
    if (filters?.articleQuery) params.append('articleQuery', filters.articleQuery);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.period) params.append('period', filters.period);
    if (filters?.reportScope) params.append('reportScope', filters.reportScope);
    return this.request<DailyReportSummary>(`/api/reports/daily?${params.toString()}`);
  },

  // Imports
  async getImports(): Promise<ImportRecord[]> {
    return this.request<ImportRecord[]>('/api/imports');
  },

  async previewImport(sourceType: 'PTD' | 'PTS', week?: string) {
    return this.request<any>('/api/imports/preview', {
      method: 'POST',
      body: JSON.stringify({ sourceType, week }),
    });
  },

  async publishImport(payload: { sourceType: 'PTD' | 'PTS'; week: string; fileName: string; fileHash: string }) {
    return this.request<any>('/api/imports/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async revertImport(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/imports/${id}/revert`, {
      method: 'POST',
    });
  },

  async deleteImport(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/imports/${id}`, {
      method: 'DELETE',
    });
  },

  // Audits
  async getAudits(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/api/audits');
  },

  // Estatísticas & Histórico (Base de Dados Firestore)
  async getStatistics(): Promise<DailyStatistic[]> {
    return this.request<DailyStatistic[]>('/api/statistics');
  },

  async getHistory(): Promise<{
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
    return this.request('/api/history');
  },

  async syncDatabase(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/database/sync', {
      method: 'POST',
    });
  },

  // ---------------- PDE (Pedidos de Qualidade) ----------------
  async getPdes(params?: { status?: string; articleQuery?: string; date?: string; myOnly?: boolean }): Promise<PdeRequest[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.articleQuery) query.set('articleQuery', params.articleQuery);
    if (params?.date) query.set('date', params.date);
    if (params?.myOnly) query.set('myOnly', 'true');
    const qs = query.toString();
    return this.request<PdeRequest[]>(`/api/pdes${qs ? `?${qs}` : ''}`);
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
    });
  },
};

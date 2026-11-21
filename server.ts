import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { storage, getLisbonDateTimeParts } from './server/storage.ts';
import { getFirebaseConfigInfo } from './server/firebaseSync.ts';
import { parseScheduleFile } from './server/pdfParser.ts';
import { parseScheduleWorkbook, generateScheduleTemplateBuffer, type ImportWorkbookScope } from './server/excelParser.ts';
import {
  runWithLimit,
  createRequestAbortController,
  getLimiterStats,
  DEFAULT_TASK_TIMEOUT_MS,
  HEAVY_TASK_TIMEOUT_MS,
  TaskTimeoutError,
  TaskQueueFullError,
  TaskAbortedError,
} from './server/taskLimiter.ts';
import type { Collaborator, Role } from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function determinePort(): number {
  // 1. Argumento de linha de comando: --port <número>
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Ambiente com NGINX ativo (ex: AI Studio Sandbox dev container onde NGINX_PORT=8080)
  // O servidor da aplicação deve escutar na porta 3000 (DEFAULT_APP_PORT)
  if (process.env.NGINX_PORT) {
    if (process.env.DEFAULT_APP_PORT) {
      const parsed = parseInt(process.env.DEFAULT_APP_PORT, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 3000;
  }

  // 3. Produção Cloud Run / Container autónomo (onde NGINX não está ativo):
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return 3000;
}

const PORT = determinePort();
const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Token/Session store simples no servidor
const sessions = new Map<string, { collaborator: Collaborator; expiresAt: number }>();

function generateToken(): string {
  return `sess_${crypto.randomBytes(24).toString('hex')}`;
}

// Middleware de autenticação
interface AuthenticatedRequest extends Request {
  user?: Collaborator;
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sessão não autenticada.' });
  }

  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sessão expirada. Inicie sessão novamente.' });
  }

  // Obter o colaborador atualizado da base de dados
  const freshUser = storage.getCollaboratorById(session.collaborator.id);
  if (!freshUser || freshUser.status === 'DESATIVADO') {
    sessions.delete(token);
    return res.status(403).json({ error: 'Conta de colaborador desativada ou inexistente.' });
  }

  req.user = freshUser;
  next();
}

function requireRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso restrito a administradores da secção.' });
    }
    next();
  };
}

function limited(
  handler: (req: AuthenticatedRequest, res: Response) => unknown | Promise<unknown>,
  options?: { timeoutMs?: number; label?: string }
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { signal, cleanup } = createRequestAbortController(req, res);
    const label = options?.label || `${req.method} ${req.path}`;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;

    try {
      await runWithLimit(
        async () => {
          if (signal.aborted || res.writableEnded) {
            return;
          }
          await handler(req, res);
        },
        { timeoutMs, label, signal }
      );
    } catch (error) {
      if (error instanceof TaskAbortedError || res.headersSent || res.writableEnded) {
        return;
      }
      next(error);
    } finally {
      cleanup();
    }
  };
}

// ---------------- API ROUTES ----------------

// 0. Health Check (Hostinger / Cloud monitoring)
app.get('/api/health', (_req: Request, res: Response) => {
  const fb = getFirebaseConfigInfo();
  return res.json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development',
    concurrency: getLimiterStats(),
    database: {
      provider: 'Firebase Firestore',
      connected: fb.connected,
      projectId: fb.projectId,
      databaseId: fb.databaseId,
    },
    timestamp: new Date().toISOString(),
  });
});

// Garantir que a hidratação inicial do Firestore terminou antes de responder às rotas de API
app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await storage.ready();
  } catch (err) {
    console.warn('[API] Aviso na hidratação inicial:', err);
  }
  next();
});

// 1. Autenticação e Acessos
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { mecanographicNumber } = req.body;
  if (!mecanographicNumber || !mecanographicNumber.toString().trim()) {
    return res.status(400).json({ error: 'Número mecanográfico obrigatório.' });
  }

  const num = mecanographicNumber.toString().trim();
  const colab = storage.getCollaboratorByNumber(num);
  if (!colab) {
    return res.status(404).json({ error: 'Número mecanográfico não reconhecido na secção.' });
  }

  if (colab.status === 'DESATIVADO') {
    return res.status(403).json({ error: 'Colaborador desativado. Contacte um administrador.' });
  }

  // Se estiver com status PENDENTE_ATIVACAO, ativar automaticamente
  if (colab.status === 'PENDENTE_ATIVACAO') {
    colab.status = 'ATIVO';
    storage.saveDirect();
  }

  storage.registerSuccessfulLogin(colab.mecanographicNumber);

  const token = generateToken();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  sessions.set(token, { collaborator: colab, expiresAt });

  return res.json({
    token,
    user: colab,
  });
});

// Acesso de demonstração rápida (autorizado pelo PRP para testes)
app.post('/api/auth/quick-switch', (req: Request, res: Response) => {
  const { mecanographicNumber } = req.body;
  if (!mecanographicNumber) {
    return res.status(400).json({ error: 'Número mecanográfico obrigatório.' });
  }

  const colab = storage.getCollaboratorByNumber(mecanographicNumber);
  if (!colab) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' });
  }
  if (colab.status === 'DESATIVADO') {
    return res.status(403).json({ error: 'Colaborador desativado.' });
  }

  const token = generateToken();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  sessions.set(token, { collaborator: colab, expiresAt });

  return res.json({
    token,
    user: colab,
  });
});

app.post('/api/auth/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    sessions.delete(token);
  }
  return res.json({ success: true, message: 'Sessão terminada.' });
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

// 2. Colaboradores (Gestão restrita a Administrador)
app.get('/api/collaborators', authenticateToken, limited((req, res) => {
  // Administradores podem ver todos (inclusive inativos); colaboradores regulares veem os ativos
  const isAdmin = req.user?.role === 'ADMIN';
  const list = storage.getCollaborators(isAdmin);
  return res.json(list);
}, { label: 'collaborators:list' }));

app.post('/api/collaborators', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { mecanographicNumber, name, role } = req.body;
  const result = storage.addCollaborator(mecanographicNumber, name, role || 'COLABORADOR', req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.collaborator);
}, { label: 'collaborators:create' }));

app.patch('/api/collaborators/:id', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { mecanographicNumber, name, role, status } = req.body;
  const result = storage.updateCollaborator(
    req.params.id,
    { mecanographicNumber, name, role, status },
    req.user!
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.collaborator);
}, { label: 'collaborators:update' }));

app.patch('/api/collaborators/:id/deactivate', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const result = storage.deactivateCollaborator(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Colaborador desativado.' });
}, { label: 'collaborators:deactivate' }));

app.patch('/api/collaborators/:id/role', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { role } = req.body;
  if (role !== 'ADMIN' && role !== 'ADMIN_2' && role !== 'COLABORADOR' && role !== 'GESTOR_STOCKS_PDE') {
    return res.status(400).json({ error: 'Perfil inválido.' });
  }
  const result = storage.updateCollaboratorRole(req.params.id, role, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Perfil atualizado.' });
}, { label: 'collaborators:role' }));

app.delete('/api/collaborators/:id', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const result = storage.deleteCollaborator(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Colaborador removido da secção.' });
}, { label: 'collaborators:delete' }));

// Datas Selecionáveis da Semana e Adição de Próxima Semana
app.get('/api/weeks/dates', authenticateToken, limited((req, res) => {
  const dates = storage.getAvailableDates(req.user);
  return res.json(dates);
}, { label: 'weeks:dates' }));

app.post('/api/weeks/add-next', authenticateToken, requireRole(['ADMIN']), limited(async (req, res) => {
  const { weekLabel } = req.body;
  const result = await storage.addNextWeek(weekLabel || 'Semana 16/11 a 22/11', req.user!);
  if (!result.success) {
    return res.status(400).json({ error: 'Erro ao adicionar tarefas da semana seguinte.' });
  }
  return res.json({
    success: true,
    message: 'Tarefas e horários da semana seguinte adicionados com sucesso.',
    tasksCount: result.tasksCount,
    availableDates: storage.getAvailableDates(req.user),
  });
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'weeks:add-next' }));

// 3. Tarefas do dia e Desempenho/Pontuação Anual
app.get('/api/tasks', authenticateToken, limited((req, res) => {
  const { date, collaboratorNumber } = req.query as { date?: string; collaboratorNumber?: string };
  const user = req.user!;
  const canViewAll = user.role === 'ADMIN' || user.role === 'ADMIN_2';

  if (!canViewAll && date && !storage.isDateVisibleForCollaborator(date)) {
    return res.status(403).json({
      error: 'Acesso restrito: colaboradores apenas podem consultar tarefas da semana a decorrer (e da semana anterior nas primeiras 3 horas da nova semana).',
    });
  }

  // Se não for admin / admin 2, consulta estritamente as suas próprias tarefas
  const targetNumber = canViewAll && collaboratorNumber ? collaboratorNumber : user.mecanographicNumber;

  const tasks = storage.getTasks({
    date,
    mecanographicNumber: canViewAll && !collaboratorNumber ? undefined : targetNumber,
  });

  return res.json(tasks);
}, { label: 'tasks:list' }));

app.get('/api/tasks/performance', authenticateToken, limited((req, res) => {
  const { date, collaboratorNumber } = req.query as { date?: string; collaboratorNumber?: string };
  const user = req.user!;
  const canViewAll = user.role === 'ADMIN' || user.role === 'ADMIN_2';
  const effectiveDate = date || getLisbonDateTimeParts().dateStr;

  if (!canViewAll && date && !storage.isDateVisibleForCollaborator(date)) {
    return res.status(403).json({
      error: 'Acesso restrito: colaboradores apenas podem consultar a semana a decorrer (e a anterior nas primeiras 3 horas da nova semana).',
    });
  }

  const targetNumber = canViewAll
    ? (collaboratorNumber && collaboratorNumber !== 'TODOS' ? collaboratorNumber : undefined)
    : user.mecanographicNumber;

  const perf = storage.getTaskPerformance(effectiveDate, targetNumber);
  return res.json(perf);
}, { label: 'tasks:performance' }));

app.post('/api/tasks/additional', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { collaboratorNumber, date, description, time, ipaPoints } = req.body;
  const result = storage.addAdditionalTask(collaboratorNumber, date, description, time, req.user!, ipaPoints);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.task);
}, { label: 'tasks:create-additional' }));

app.patch('/api/tasks/:id/status', authenticateToken, limited((req, res) => {
  const { status, observation } = req.body;
  if (!['POR_ASSINALAR', 'FEITA', 'NAO_FEITA'].includes(status)) {
    return res.status(400).json({ error: 'Estado de tarefa inválido.' });
  }

  const result = storage.updateTaskStatus(req.params.id, status, observation, req.user!);
  if (!result.success) {
    return res.status(403).json({ error: result.error });
  }
  return res.json(result.task);
}, { label: 'tasks:update-status' }));

app.patch('/api/tasks/:id', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { description, time, ipaPoints } = req.body;
  const result = storage.updateTaskDetails(req.params.id, { description, time, ipaPoints }, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.task);
}, { label: 'tasks:update' }));

app.delete('/api/tasks/:id', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const result = storage.deleteTask(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Tarefa removida com sucesso.' });
}, { label: 'tasks:delete' }));

// 3b. Notificações na App
app.get('/api/notifications', authenticateToken, limited((req, res) => {
  const list = storage.getNotifications(req.user!.mecanographicNumber);
  return res.json(list);
}, { label: 'notifications:list' }));

app.patch('/api/notifications/:id/read', authenticateToken, limited((req, res) => {
  const success = storage.markNotificationAsRead(req.params.id, req.user!.mecanographicNumber);
  if (!success) {
    return res.status(404).json({ error: 'Notificação não encontrada.' });
  }
  return res.json({ success: true });
}, { label: 'notifications:read' }));

app.post('/api/notifications/mark-all-read', authenticateToken, limited((req, res) => {
  storage.markAllNotificationsAsRead(req.user!.mecanographicNumber);
  return res.json({ success: true });
}, { label: 'notifications:mark-all-read' }));

// 4. Hora de refeição
app.get('/api/meals', authenticateToken, limited((req, res) => {
  const { date, collaboratorNumber } = req.query as { date?: string; collaboratorNumber?: string };
  if (!date) {
    return res.status(400).json({ error: 'Data obrigatória.' });
  }

  const user = req.user!;
  const canViewAll = user.role === 'ADMIN' || user.role === 'ADMIN_2';
  if (!canViewAll && !storage.isDateVisibleForCollaborator(date)) {
    return res.status(403).json({ error: 'Data fora da janela semanal visível para colaboradores.' });
  }

  const targetNumber = canViewAll && collaboratorNumber ? collaboratorNumber : user.mecanographicNumber;

  const meal = storage.getMealSchedule(date, targetNumber);
  return res.json(meal || null);
}, { label: 'meals:get' }));

// 4b. Situação Diária e Escala (Trabalho, Folga, Férias, Ausência)
app.get('/api/shifts/status', authenticateToken, limited((req, res) => {
  const { date, collaboratorNumber } = req.query as { date?: string; collaboratorNumber?: string };
  if (!date) {
    return res.status(400).json({ error: 'Data obrigatória.' });
  }

  const user = req.user!;
  const canViewAll = user.role === 'ADMIN' || user.role === 'ADMIN_2';
  if (!canViewAll && !storage.isDateVisibleForCollaborator(date)) {
    return res.status(403).json({ error: 'Data fora da janela semanal visível para colaboradores.' });
  }

  const targetNumber = canViewAll && collaboratorNumber ? collaboratorNumber : user.mecanographicNumber;

  const statusInfo = storage.getShiftStatus(date, targetNumber);
  return res.json(statusInfo);
}, { label: 'shifts:status' }));

app.get('/api/shifts/all', authenticateToken, limited((req, res) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    return res.status(400).json({ error: 'Data obrigatória.' });
  }

  const canViewAll = req.user!.role === 'ADMIN' || req.user!.role === 'ADMIN_2';
  if (!canViewAll && !storage.isDateVisibleForCollaborator(date)) {
    return res.status(403).json({ error: 'Data fora da janela semanal visível para colaboradores.' });
  }

  const list = storage.getAllShiftsForDate(date);
  return res.json(list);
}, { label: 'shifts:all' }));

// 5. Catálogo de artigos
app.get('/api/articles', authenticateToken, limited((req, res) => {
  const activeOnly = req.query.all !== 'true';
  const articles = storage.getArticles(activeOnly);
  return res.json(articles);
}, { label: 'articles:list' }));

app.post('/api/articles', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { sku, description, unit, barcode, category } = req.body;
  const result = storage.addArticle(sku, description, unit, barcode, category, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.article);
}, { label: 'articles:create' }));

app.patch('/api/articles/:id', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const result = storage.updateArticle(req.params.id, req.body, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.article);
}, { label: 'articles:update' }));

// 6. Aba stocks (Excessos e Roturas)
app.get('/api/stocks', authenticateToken, limited((req, res) => {
  const { date, type, status, articleQuery } = req.query as {
    date?: string;
    type?: string;
    status?: string;
    articleQuery?: string;
  };
  const list = storage.getStocks({ date, type, status, articleQuery });
  return res.json(list);
}, { label: 'stocks:list' }));

app.post('/api/stocks', authenticateToken, limited((req, res) => {
  const result = storage.createStockRecord(req.body, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json({ record: result.record, warning: result.warning });
}, { label: 'stocks:create' }));

app.patch('/api/stocks/:id', authenticateToken, limited((req, res) => {
  const result = storage.updateStockRecord(req.params.id, req.body, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.record);
}, { label: 'stocks:update' }));

// 7. Relatório diário (Acesso restrito a Administradores e Administrador 2)
app.get('/api/reports/daily', authenticateToken, requireRole(['ADMIN', 'ADMIN_2']), limited((req, res) => {
  const { date, articleQuery, type, status, period, reportScope } = req.query as {
    date?: string;
    articleQuery?: string;
    type?: string;
    status?: string;
    period?: any;
    reportScope?: any;
  };
  const reportDate = date || getLisbonDateTimeParts().dateStr;
  const summary = storage.getDailyReport(reportDate, {
    articleQuery,
    type,
    status,
    period,
    reportScope,
  });
  return res.json(summary);
}, { timeoutMs: 45_000, label: 'reports:daily' }));

// 8. Importações de PDF
app.get('/api/imports', authenticateToken, requireRole(['ADMIN']), limited((_req, res) => {
  return res.json(storage.getImports());
}, { label: 'imports:list' }));

app.post('/api/imports/preview', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { sourceType, week } = req.body;
  if (!sourceType || (sourceType !== 'PTD' && sourceType !== 'PTS')) {
    return res.status(400).json({ error: 'Tipo de fonte inválido (deve ser PTD ou PTS).' });
  }

  const collaborators = storage.getCollaborators(false);
  const result = parseScheduleFile(sourceType, week || 'Semana 9/11 a 15/11', collaborators);
  return res.json(result);
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:preview' }));

app.post('/api/imports/publish', authenticateToken, requireRole(['ADMIN']), limited(async (req, res) => {
  const { sourceType, week, fileName, fileHash } = req.body;
  const collaborators = storage.getCollaborators(false);
  const parsed = parseScheduleFile(sourceType, week || 'Semana 9/11 a 15/11', collaborators);

  const importRecord = {
    id: `imp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sourceType,
    week: week || 'Semana 9/11 a 15/11',
    fileName: fileName || `${sourceType.toLowerCase()}_app_oficial.pdf`,
    fileHash: fileHash || `hash-${Date.now()}`,
    version: storage.getImports().filter(i => i.sourceType === sourceType).length + 1,
    status: 'CARREGADO' as const,
    uploadedAt: new Date().toISOString(),
    uploadedBy: req.user!.name,
    rowCount: parsed.previewRows.length,
    warnings: parsed.warnings,
    rows: parsed.previewRows,
  };

  const publishResult = await storage.publishImport(
    importRecord,
    parsed.generatedTasks,
    parsed.generatedMeals,
    req.user!
  );

  if (!publishResult.success) {
    return res.status(400).json({ error: publishResult.error });
  }

  return res.json({
    success: true,
    message: `Importação ${sourceType} publicada com sucesso.`,
    tasksCount: parsed.generatedTasks.length,
    mealsCount: parsed.generatedMeals.length,
    warnings: parsed.warnings,
  });
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:publish' }));

app.post('/api/imports/:id/revert', authenticateToken, requireRole(['ADMIN']), limited(async (req, res) => {
  const result = await storage.revertImport(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Versão anulada com sucesso. Tarefas e refeições desta versão foram removidas.' });
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:revert' }));

app.delete('/api/imports/:id', authenticateToken, requireRole(['ADMIN']), limited(async (req, res) => {
  const result = await storage.deleteImportRecord(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Registo removido do histórico.' });
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:delete' }));

// 9. Auditoria
app.get('/api/audits', authenticateToken, requireRole(['ADMIN']), limited((_req, res) => {
  return res.json(storage.getAudits());
}, { label: 'audits:list' }));

// 10. Estatísticas e Histórico da Base de Dados (Firestore)
app.get('/api/statistics', authenticateToken, requireRole(['ADMIN']), limited((_req, res) => {
  const stats = storage.getStatistics();
  return res.json(stats);
}, { timeoutMs: 45_000, label: 'statistics:get' }));

app.get('/api/history', authenticateToken, requireRole(['ADMIN']), limited((_req, res) => {
  const records = storage.getHistoricalRecords();
  return res.json(records);
}, { timeoutMs: 45_000, label: 'history:get' }));

app.post('/api/database/sync', authenticateToken, requireRole(['ADMIN']), limited(async (_req, res) => {
  const result = await storage.forceDatabaseSync();
  return res.json(result);
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'database:sync' }));

// 11. PDE (Pedidos de Qualidade de Artigos)
app.get('/api/pdes', authenticateToken, limited((req, res) => {
  const { status, articleQuery, date, myOnly } = req.query as {
    status?: string;
    articleQuery?: string;
    date?: string;
    myOnly?: string;
  };

  const list = storage.getPdes({
    status,
    articleQuery,
    date,
    collaboratorNumber: myOnly === 'true' ? req.user!.mecanographicNumber : undefined,
  });

  return res.json(list);
}, { label: 'pdes:list' }));

app.post('/api/pdes', authenticateToken, limited((req, res) => {
  const { articleId, batchNumber, arrivalDate, expirationDate, defectReason, notes, photos } = req.body;

  const result = storage.createPde(
    {
      articleId,
      batchNumber,
      arrivalDate,
      expirationDate,
      defectReason,
      notes,
      photos,
    },
    req.user!
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.pde);
}, { label: 'pdes:create' }));

app.patch('/api/pdes/:id/status', authenticateToken, requireRole(['ADMIN', 'ADMIN_2', 'GESTOR_STOCKS_PDE']), limited((req, res) => {
  const { status, resolutionNotes } = req.body;
  if (!status || !['PENDENTE', 'RESOLVIDO', 'NAO_CONSIDERADO'].includes(status)) {
    return res.status(400).json({ error: 'Estado de PDE inválido. Utilize RESOLVIDO ou NAO_CONSIDERADO.' });
  }

  const result = storage.updatePdeStatus(
    req.params.id,
    { status, resolutionNotes },
    req.user!
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    success: true,
    message: status === 'RESOLVIDO'
      ? 'Processo de PDE concluído com sucesso. Fotografias removidas da base de dados.'
      : status === 'NAO_CONSIDERADO'
      ? 'Pedido de PDE assinalado como Não Considerado.'
      : 'Estado do PDE atualizado.',
    pde: result.pde,
  });
}, { label: 'pdes:status' }));

app.delete('/api/pdes/:id', authenticateToken, limited((req, res) => {
  const result = storage.deletePde(req.params.id, req.user!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Pedido de PDE removido.' });
}, { label: 'pdes:delete' }));

// 12. Importações em Excel (.xlsx) — Folha PTD (ptd app) e Folha PTS (pts app)
app.post('/api/imports/excel-csv/preview', authenticateToken, requireRole(['ADMIN']), limited((req, res) => {
  const { fileBase64, fileName, sourceType, week, explicitWeekSelected } = req.body as {
    fileBase64?: string;
    fileName?: string;
    sourceType?: ImportWorkbookScope;
    week?: string;
    explicitWeekSelected?: boolean;
  };
  if (!fileBase64) {
    return res.status(400).json({ error: 'Ficheiro Excel (.xlsx) obrigatório.' });
  }
  if (fileName && !/\.(xlsx|xls)$/i.test(fileName)) {
    return res.status(400).json({ error: 'Apenas são aceites ficheiros Excel (.xlsx).' });
  }

  try {
    const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const collaborators = storage.getCollaborators(false);
    const scope: ImportWorkbookScope = sourceType === 'PTD' || sourceType === 'PTS' ? sourceType : 'BOTH';
    const parsed = parseScheduleWorkbook(
      buffer,
      fileName || 'escala.xlsx',
      scope,
      week || 'Semana 09/11 a 15/11',
      collaborators,
      undefined,
      { explicitWeekSelected: Boolean(explicitWeekSelected) }
    );

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error, detectedWeeks: parsed.detectedWeeks || [] });
    }

    return res.json(parsed);
  } catch (err: any) {
    return res.status(400).json({ error: `Erro ao processar ficheiro .xlsx: ${err.message}` });
  }
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:excel-preview' }));

app.post('/api/imports/excel-csv/publish', authenticateToken, requireRole(['ADMIN']), limited(async (req, res) => {
  const { fileBase64, fileName, sourceType, week, explicitWeekSelected } = req.body as {
    fileBase64?: string;
    fileName?: string;
    sourceType?: ImportWorkbookScope;
    week?: string;
    explicitWeekSelected?: boolean;
  };
  if (!fileBase64) {
    return res.status(400).json({ error: 'Ficheiro Excel (.xlsx) obrigatório.' });
  }
  if (fileName && !/\.(xlsx|xls)$/i.test(fileName)) {
    return res.status(400).json({ error: 'Apenas são aceites ficheiros Excel (.xlsx).' });
  }

  try {
    const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const collaborators = storage.getCollaborators(false);
    const scope: ImportWorkbookScope = sourceType === 'PTD' || sourceType === 'PTS' ? sourceType : 'BOTH';
    const ptdImpId = `imp-ptd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const ptsImpId = `imp-pts-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const parsed = parseScheduleWorkbook(
      buffer,
      fileName || 'escala.xlsx',
      scope,
      week || 'Semana 09/11 a 15/11',
      collaborators,
      { ptdId: ptdImpId, ptsId: ptsImpId },
      { explicitWeekSelected: Boolean(explicitWeekSelected) }
    );

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error, detectedWeeks: parsed.detectedWeeks || [] });
    }

    const safeWeek = parsed.week || week || 'Semana 09/11 a 15/11';
    const safeFileName = fileName || 'escala_semanal.xlsx';
    let totalTasksPublished = 0;
    let totalMealsPublished = 0;

    // Publicar folha PTD (ptd app)
    if ((scope === 'BOTH' || scope === 'PTD') && parsed.hasPtdSheet) {
      const ptdTasks = parsed.generatedTasks.filter(t => t.source === 'PTD');
      const ptdMeals = parsed.generatedMeals;
      const ptdRows = parsed.previewRows.filter(r => r.taskType === 'PRINCIPAL');

      const nextPtdVersion =
        Math.max(
          0,
          ...storage
            .getImports()
            .filter(i => i.sourceType === 'PTD')
            .map(i => i.version || 0)
        ) + 1;

      const ptdRecord = {
        id: ptdImpId,
        sourceType: 'PTD' as const,
        week: safeWeek,
        fileName: safeFileName,
        fileHash: `hash-ptd-${Date.now()}`,
        version: nextPtdVersion,
        status: 'CARREGADO' as const,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user!.name,
        rowCount: ptdRows.length,
        warnings: parsed.warnings.filter(w => w.includes('PTD')),
        rows: ptdRows,
      };

      const pubPtd = await storage.publishSpreadsheetImport(ptdRecord, ptdTasks, ptdMeals, req.user!);
      if (!pubPtd.success) {
        return res.status(400).json({ error: pubPtd.error });
      }
      totalTasksPublished += ptdTasks.length;
      totalMealsPublished += ptdMeals.length;
    }

    // Publicar folha PTS (pts app)
    if ((scope === 'BOTH' || scope === 'PTS') && parsed.hasPtsSheet) {
      const ptsTasks = parsed.generatedTasks.filter(t => t.source === 'PTS');
      const ptsRows = parsed.previewRows.filter(r => r.taskType === 'SECUNDARIA');
      const nextPtsVersion =
        Math.max(
          0,
          ...storage
            .getImports()
            .filter(i => i.sourceType === 'PTS')
            .map(i => i.version || 0)
        ) + 1;

      const ptsRecord = {
        id: ptsImpId,
        sourceType: 'PTS' as const,
        week: safeWeek,
        fileName: safeFileName,
        fileHash: `hash-pts-${Date.now()}`,
        version: nextPtsVersion,
        status: 'CARREGADO' as const,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user!.name,
        rowCount: ptsRows.length,
        warnings: parsed.warnings.filter(w => w.includes('PTS')),
        rows: ptsRows,
      };

      const pubPts = await storage.publishSpreadsheetImport(ptsRecord, ptsTasks, [], req.user!);
      if (!pubPts.success) {
        return res.status(400).json({ error: pubPts.error });
      }
      totalTasksPublished += ptsTasks.length;
    }

    const importedDates = Array.from(
      new Set([
        ...parsed.generatedTasks.map(t => t.date),
        ...parsed.generatedMeals.map(m => m.date),
        ...parsed.previewRows.map(r => r.date).filter((d): d is string => Boolean(d)),
      ])
    ).sort();

    return res.json({
      success: true,
      message: `Ficheiro "${safeFileName}" (${safeWeek}) carregado com sucesso para a App (${parsed.ptdTasksCount} tarefas PTD, ${totalMealsPublished} refeições, ${parsed.ptsTasksCount} tarefas PTS).`,
      week: safeWeek,
      importedDates,
      availableDates: storage.getAvailableDates(req.user),
      tasksCount: totalTasksPublished,
      ptdTasksCount: parsed.ptdTasksCount,
      ptsTasksCount: parsed.ptsTasksCount,
      mealsCount: totalMealsPublished,
      sheetsFound: parsed.sheetsFound,
      warnings: parsed.warnings,
    });
  } catch (err: any) {
    return res.status(400).json({ error: `Erro ao publicar ficheiro .xlsx: ${err.message}` });
  }
}, { timeoutMs: HEAVY_TASK_TIMEOUT_MS, label: 'imports:excel-publish' }));

// Rota para descarregar Modelo Excel (.xlsx com folhas PTD e PTS)
app.get('/api/templates/schedule', authenticateToken, requireRole(['ADMIN']), limited((_req, res) => {
  const collaborators = storage.getCollaborators(false);
  const fileBuffer = generateScheduleTemplateBuffer(collaborators);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="Modelo_Escala_PTD_PTS.xlsx"');
  return res.send(fileBuffer);
}, { timeoutMs: 30_000, label: 'templates:schedule' }));

// Gestão centralizada de erros da API (timeouts, fila cheia, erros inesperados)
app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  if (err instanceof TaskTimeoutError) {
    return res.status(504).json({ error: err.message });
  }
  if (err instanceof TaskQueueFullError) {
    return res.status(503).json({ error: err.message });
  }
  if (err instanceof TaskAbortedError) {
    return;
  }
  const message = err instanceof Error ? err.message : 'Erro interno do servidor.';
  console.error('[API] Erro não tratado:', err);
  return res.status(500).json({ error: message });
});

// Servir estáticos de assets (como os PDFs originais)
const publicAssetsDir = fs.existsSync(path.resolve(process.cwd(), 'public/assets'))
  ? path.resolve(process.cwd(), 'public/assets')
  : path.join(__dirname, 'public/assets');

if (fs.existsSync(publicAssetsDir)) {
  app.use('/assets', express.static(publicAssetsDir));
}

// Configurar Vite dev server ou produção estática
async function startServer() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndexHtml = path.join(distDir, 'index.html');
  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(distIndexHtml);

  if (isProduction) {
    console.log(`Modo Produção: a servir ficheiros estáticos compilados de ${distDir}`);
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexHtml);
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
      const stats = getLimiterStats();
      console.log(
        `Servidor a correr na porta ${PORT} [http://0.0.0.0:${PORT}] (MAX_CONCURRENT_TASKS=${stats.maxConcurrentTasks})`
      );
    });
    server.requestTimeout = 115_000;
    server.headersTimeout = 60_000;
    server.keepAliveTimeout = 65_000;
    return;
  }

  console.log('Modo Desenvolvimento: a iniciar middleware Vite');

  let viteInstance: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | null = null;
  const viteReady = (async () => {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    viteInstance = vite;
    return vite;
  })();

  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    try {
      const vite = viteInstance || (await viteReady);
      return vite.middlewares(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const vite = viteInstance || (await viteReady);
      let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      viteInstance?.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    const stats = getLimiterStats();
    console.log(
      `Servidor a correr na porta ${PORT} [http://0.0.0.0:${PORT}] (MAX_CONCURRENT_TASKS=${stats.maxConcurrentTasks})`
    );
  });
  server.requestTimeout = 115_000;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;

  await viteReady;
}

startServer().catch(err => {
  console.error('Erro fatal ao iniciar o servidor:', err);
  process.exit(1);
});

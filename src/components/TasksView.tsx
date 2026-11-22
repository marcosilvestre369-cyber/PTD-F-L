import React, { useState, useEffect } from 'react';
import { Collaborator, DailyTask, MealSchedule, TaskStatus, ShiftStatusInfo, TaskPerformanceResponse } from '../types/index.ts';
import { api } from '../services/api.ts';
import { formatDatePt, isTaskStatusLockedForCollaborator } from '../utils/date.ts';
import {
  Utensils,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  MessageSquare,
  History,
  Calendar,
  Users,
  UserCheck,
  X,
  Coffee,
  Sun,
  CalendarOff,
  Pencil,
  Trash2,
  Lock,
} from 'lucide-react';

interface TasksViewProps {
  currentUser: Collaborator;
  selectedDate: string;
}

const IPA_POINT_OPTIONS: number[] = Array.from(
  { length: 21 },
  (_, i) => Math.round((-1 + i * 0.1) * 10) / 10
);

function formatIpaOption(val: number): string {
  const normalized = Object.is(val, -0) ? 0 : val;
  const formatted = normalized.toFixed(1).replace('.', ',');
  return normalized > 0 ? `+${formatted}` : formatted;
}

function formatIpaNumber(val: number): string {
  const normalized = Object.is(val, -0) ? 0 : val;
  return normalized.toFixed(1).replace('.', ',');
}

export const TasksView: React.FC<TasksViewProps> = ({ currentUser, selectedDate }) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const canViewAll = isAdmin || currentUser.role === 'ADMIN_2';
  const canAssignTasks = canViewAll;
  const canEditTasks = canViewAll;

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [meal, setMeal] = useState<MealSchedule | null>(null);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatusInfo | null>(null);
  const [allShifts, setAllShifts] = useState<ShiftStatusInfo[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  // Para administradores e Admin 2: 'TODOS' ou o número mecanográfico de um colaborador ativo
  const [selectedCollaboratorNumber, setSelectedCollaboratorNumber] = useState<string>(
    canViewAll ? 'TODOS' : currentUser.mecanographicNumber
  );

  const [isLoading, setIsLoading] = useState(true);
  const [performance, setPerformance] = useState<TaskPerformanceResponse | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState<Date>(() => new Date());

  // Modal de Tarefa Adicional
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addColabNumber, setAddColabNumber] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addTime, setAddTime] = useState('');
  const [addIpaPending, setAddIpaPending] = useState<number>(-0.3);
  const [addIpaDone, setAddIpaDone] = useState<number>(0.3);
  const [addIpaNotDone, setAddIpaNotDone] = useState<number>(-0.2);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal de Observação ao responder à tarefa
  const [observingTask, setObservingTask] = useState<DailyTask | null>(null);
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);
  const [observationText, setObservationText] = useState('');

  // Histórico modal
  const [historyTask, setHistoryTask] = useState<DailyTask | null>(null);

  // Modal de Edição de Tarefa
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editUseCustomIpa, setEditUseCustomIpa] = useState(false);
  const [editIpaPending, setEditIpaPending] = useState<number>(-0.3);
  const [editIpaDone, setEditIpaDone] = useState<number>(0.3);
  const [editIpaNotDone, setEditIpaNotDone] = useState<number>(-0.2);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal de Eliminação de Tarefa
  const [deletingTask, setDeletingTask] = useState<DailyTask | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filtrar apenas colaboradores de secção (Administradores, Administrador 2 e Gestores Stocks & PDE estão excluídos da lista de tarefas)
  const workerCollaborators = collaborators.filter(
    c => c.role !== 'ADMIN' && c.role !== 'ADMIN_2' && c.role !== 'GESTOR_STOCKS_PDE' && c.status === 'ATIVO'
  );

  useEffect(() => {
    if (!canViewAll) return;
    const controller = new AbortController();
    api.getCollaborators(controller.signal)
      .then(list => {
        const workers = list.filter(
          c => c.role !== 'ADMIN' && c.role !== 'ADMIN_2' && c.role !== 'GESTOR_STOCKS_PDE' && c.status === 'ATIVO'
        );
        setCollaborators(list);
        if (workers.length > 0 && !addColabNumber) {
          setAddColabNumber(workers[0].mecanographicNumber);
        }
      })
      .catch(err => {
        if (!api.isAbortError(err)) {
          console.error(err);
        }
      });
    return () => controller.abort();
  }, [canViewAll]);

  useEffect(() => {
    if (!canViewAll) {
      setSelectedCollaboratorNumber(currentUser.mecanographicNumber);
    }
  }, [currentUser, canViewAll]);

  const loadData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const isViewingAll = canViewAll && selectedCollaboratorNumber === 'TODOS';
      const targetColab = isViewingAll ? undefined : (canViewAll ? selectedCollaboratorNumber : currentUser.mecanographicNumber);

      if (isViewingAll) {
        const [fetchedTasks, fetchedShifts, fetchedPerf] = await Promise.all([
          api.getTasks(selectedDate, undefined, signal),
          api.getAllShiftsForDate(selectedDate, signal),
          api.getTaskPerformance(selectedDate, undefined, signal),
        ]);
        setTasks(fetchedTasks);
        setAllShifts(fetchedShifts);
        setMeal(null);
        setShiftStatus(null);
        setPerformance(fetchedPerf);
      } else if (targetColab) {
        const [fetchedTasks, fetchedMeal, fetchedShift, fetchedPerf] = await Promise.all([
          api.getTasks(selectedDate, targetColab, signal),
          api.getMeal(selectedDate, targetColab, signal),
          api.getShiftStatus(selectedDate, targetColab, signal),
          api.getTaskPerformance(selectedDate, targetColab, signal),
        ]);
        setTasks(fetchedTasks);
        setMeal(fetchedMeal);
        setShiftStatus(fetchedShift);
        setAllShifts([]);
        setPerformance(fetchedPerf);
      }
    } catch (err: any) {
      if (api.isAbortError(err)) return;
      setError(err.message || 'Erro ao carregar dados das tarefas.');
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [selectedDate, selectedCollaboratorNumber]);

  useEffect(() => {
    if (isAdmin) return;
    setClockNow(new Date());
    const timer = window.setInterval(() => {
      setClockNow(new Date());
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isAdmin, selectedDate]);

  const handleStatusClick = async (task: DailyTask, newStatus: TaskStatus) => {
    if (!isAdmin && isTaskStatusLockedForCollaborator(task.date, new Date())) {
      setClockNow(new Date());
      setSaveFeedback({
        id: task.id,
        success: false,
        msg: 'O prazo para alterar o estado das tarefas deste dia terminou às 02:00 do dia seguinte. Apenas o Administrador pode efetuar correções.',
      });
      return;
    }

    if (newStatus === 'NAO_FEITA') {
      setObservingTask(task);
      setPendingStatus('NAO_FEITA');
      setObservationText(task.observation || '');
      return;
    }

    await applyTaskStatus(task.id, newStatus, task.observation);
  };

  const applyTaskStatus = async (taskId: string, status: TaskStatus, observation?: string) => {
    setSavingTaskId(taskId);
    setSaveFeedback(null);
    try {
      const updated = await api.updateTaskStatus(taskId, status, observation);
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      const targetColab =
        canViewAll && selectedCollaboratorNumber !== 'TODOS'
          ? selectedCollaboratorNumber
          : canViewAll
          ? undefined
          : currentUser.mecanographicNumber;
      api.getTaskPerformance(selectedDate, targetColab).then(setPerformance).catch(console.warn);
      setSaveFeedback({ id: taskId, success: true, msg: 'Resposta gravada com sucesso.' });
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err: any) {
      setSaveFeedback({ id: taskId, success: false, msg: `Erro ao gravar: ${err.message}` });
    } finally {
      setSavingTaskId(null);
      setObservingTask(null);
      setPendingStatus(null);
    }
  };

  const handleCreateAdditional = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!addDescription.trim()) return;

    setAddLoading(true);
    try {
      const targetColab = addColabNumber || workerCollaborators[0]?.mecanographicNumber;
      if (!targetColab) {
        setAddError('Selecione um colaborador.');
        return;
      }

      await api.addAdditionalTask(
        targetColab,
        selectedDate,
        addDescription.trim(),
        addTime.trim() || undefined,
        {
          pending: addIpaPending,
          done: addIpaDone,
          notDone: addIpaNotDone,
        }
      );
      setIsAddModalOpen(false);
      setAddDescription('');
      setAddTime('');
      setAddIpaPending(-0.3);
      setAddIpaDone(0.3);
      setAddIpaNotDone(-0.2);
      await loadData();
    } catch (err: any) {
      setAddError(err.message || 'Erro ao criar tarefa adicional.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleOpenEdit = (task: DailyTask) => {
    setEditingTask(task);
    setEditDescription(task.description);
    setEditTime(task.time || '');
    const hasCustomIpa = task.type === 'ADICIONAL' || Boolean(task.ipaPoints);
    setEditUseCustomIpa(hasCustomIpa);
    setEditIpaPending(task.ipaPoints?.pending ?? -0.3);
    setEditIpaDone(task.ipaPoints?.done ?? 0.3);
    setEditIpaNotDone(task.ipaPoints?.notDone ?? -0.2);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editDescription.trim()) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const ipaPayload = editUseCustomIpa
        ? {
            pending: editIpaPending,
            done: editIpaDone,
            notDone: editIpaNotDone,
          }
        : undefined;
      const updated = await api.updateTaskDetails(
        editingTask.id,
        editDescription.trim(),
        editTime.trim() || undefined,
        ipaPayload
      );
      setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      setEditingTask(null);
      setSaveFeedback({ id: updated.id, success: true, msg: 'Tarefa editada e guardada com sucesso.' });
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err: any) {
      setEditError(err.message || 'Erro ao atualizar tarefa.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTask) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.deleteTask(deletingTask.id);
      setTasks(prev => prev.filter(t => t.id !== deletingTask.id));
      setDeletingTask(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao eliminar tarefa.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const isAllView = canViewAll && selectedCollaboratorNumber === 'TODOS';
  const isDayLocked = !isAdmin && isTaskStatusLockedForCollaborator(selectedDate, clockNow);

  const principalTasks = tasks.filter(t => t.type === 'PRINCIPAL');
  const secundaryTasks = tasks.filter(t => t.type === 'SECUNDARIA');
  const additionalTasks = tasks.filter(t => t.type === 'ADICIONAL');

  const completedCount = tasks.filter(t => t.status === 'FEITA').length;
  const notDoneCount = tasks.filter(t => t.status === 'NAO_FEITA').length;
  const pendingCount = tasks.filter(t => t.status === 'POR_ASSINALAR').length;

  const renderTaskCard = (task: DailyTask) => {
    const isSaving = savingTaskId === task.id;
    const feedback = saveFeedback?.id === task.id ? saveFeedback : null;
    const isTaskLocked = !isAdmin && isTaskStatusLockedForCollaborator(task.date, clockNow);
    const canAnswer =
      (canViewAll || task.mecanographicNumber === currentUser.mecanographicNumber) && !isTaskLocked;
    const canEdit = canEditTasks && !isTaskLocked; // Apenas Administrador pode corrigir/editar tarefas após o bloqueio das 02:00

    return (
      <div
        key={task.id}
        className={`rounded-2xl border p-4 shadow-xs transition-all ${
          task.status === 'FEITA'
            ? 'border-success-border bg-success-tint/60'
            : task.status === 'NAO_FEITA'
            ? 'border-danger-border bg-danger-tint/60'
            : 'border-line bg-surface-card'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  task.type === 'PRINCIPAL'
                    ? 'bg-surface-container text-on-surface border-line'
                    : task.type === 'SECUNDARIA'
                    ? 'bg-amber-tint text-amber-ink border-amber-border'
                    : 'bg-danger-tint text-danger-ink border-danger-border'
                }`}
              >
                {task.type}
              </span>

              {isAllView && (
                <span className="text-xs font-bold text-on-surface bg-surface-container border border-line px-2 py-0.5 rounded-md">
                  {task.collaboratorName} ({task.mecanographicNumber})
                </span>
              )}

              {task.time && (
                <span className="text-xs font-mono text-on-surface-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-ink" />
                  {task.time}
                </span>
              )}
            </div>

            <p className="text-sm font-semibold text-on-surface">{task.description}</p>

            {task.ipaPoints && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-on-surface-muted pt-0.5">
                <span className="font-sans font-bold text-amber-ink">IPA:</span>
                <span>Por assinalar {formatIpaOption(task.ipaPoints.pending)}</span>
                <span className="text-line">·</span>
                <span className="text-success-ink">Feita {formatIpaOption(task.ipaPoints.done)}</span>
                <span className="text-line">·</span>
                <span className="text-danger-ink">Não feita {formatIpaOption(task.ipaPoints.notDone)}</span>
              </div>
            )}

            {task.observation && (
              <div className="flex items-start gap-1.5 text-xs text-danger-ink bg-danger-tint p-2 rounded-xl border border-danger-border mt-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Motivo:</strong> {task.observation}
                </span>
              </div>
            )}
          </div>

          {/* Botões de Ação: Feita / Não feita / Por assinalar */}
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {canAnswer ? (
              <div className="inline-flex rounded-xl border border-line p-0.5 bg-surface-container text-xs">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleStatusClick(task, 'POR_ASSINALAR')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    task.status === 'POR_ASSINALAR'
                      ? 'bg-surface-card text-on-surface shadow-2xs font-bold'
                      : 'text-on-surface-muted hover:text-on-surface'
                  }`}
                >
                  Por assinalar
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleStatusClick(task, 'FEITA')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    task.status === 'FEITA'
                      ? 'bg-success text-on-success shadow-xs'
                      : 'text-on-surface-muted hover:text-success-ink hover:bg-success-tint/50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Feita</span>
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleStatusClick(task, 'NAO_FEITA')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    task.status === 'NAO_FEITA'
                      ? 'bg-danger text-on-danger shadow-xs'
                      : 'text-on-surface-muted hover:text-danger-ink hover:bg-danger-tint/60'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Não feita</span>
                </button>
              </div>
            ) : (
              <span
                title={
                  isTaskLocked
                    ? 'Estado bloqueado: o prazo terminou às 02:00 do dia seguinte.'
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  task.status === 'FEITA'
                    ? 'bg-success-tint text-success-ink border-success-border'
                    : task.status === 'NAO_FEITA'
                    ? 'bg-danger-tint text-danger-ink border-danger-border'
                    : 'bg-amber-tint text-amber-ink border-amber-border'
                }`}
              >
                {isTaskLocked && <Lock className="w-3 h-3 shrink-0 opacity-80" />}
                {task.status === 'FEITA'
                  ? 'Feita'
                  : task.status === 'NAO_FEITA'
                  ? 'Não feita'
                  : 'Por assinalar'}
              </span>
            )}

            {task.history.length > 0 && (
              <button
                onClick={() => setHistoryTask(task)}
                title="Ver histórico de respostas"
                className="p-1.5 text-on-surface-subtle hover:text-on-surface rounded-lg hover:bg-surface-container cursor-pointer"
              >
                <History className="w-4 h-4" />
              </button>
            )}

            {canEdit && (
              <div className="flex items-center gap-0.5 pl-1.5 border-l border-line">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(task)}
                  title="Editar tarefa"
                  className="p-1.5 text-on-surface-muted hover:text-on-surface rounded-lg hover:bg-surface-container cursor-pointer transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingTask(task)}
                  title="Eliminar tarefa"
                  className="p-1.5 text-danger hover:text-danger-ink rounded-lg hover:bg-danger-tint cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-2.5 text-[11px] p-2 rounded-lg flex items-center gap-1.5 ${
              feedback.success
                ? 'bg-success-tint text-success-ink border border-success-border'
                : 'bg-danger-tint text-danger-ink border border-danger-border'
            }`}
          >
            {feedback.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Cabeçalho da Vista de Tarefas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-on-surface tracking-tight">
              Tarefas e Refeições da Secção
            </h1>
            {shiftStatus && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                shiftStatus.shiftStatus === 'FÉRIAS'
                  ? 'bg-danger-tint text-danger-ink border-danger-border'
                  : shiftStatus.shiftStatus === 'FOLGA'
                  ? 'bg-surface-container text-on-surface border-line'
                  : shiftStatus.shiftStatus === 'AUSÊNCIA'
                  ? 'bg-amber-tint text-amber-ink border-amber-border'
                  : 'bg-amber-tint text-amber-ink border-amber-border'
              }`}>
                {shiftStatus.shiftStatus === 'FÉRIAS' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-danger shrink-0" />
                    <span>Em Férias</span>
                  </>
                ) : shiftStatus.shiftStatus === 'FOLGA' ? (
                  <>
                    <Coffee className="w-3.5 h-3.5 text-on-surface-muted shrink-0" />
                    <span>De Folga</span>
                  </>
                ) : shiftStatus.shiftStatus === 'AUSÊNCIA' ? (
                  <>
                    <CalendarOff className="w-3.5 h-3.5 text-amber-ink shrink-0" />
                    <span>Ausência</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-amber-ink shrink-0" />
                    <span>Em Turno ({shiftStatus.tasksCount} tarefas)</span>
                  </>
                )}
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-muted mt-0.5 break-words">
            Escala diária de trabalho para <span className="font-bold text-on-surface">{formatDatePt(selectedDate)}</span>
            {!isAllView && shiftStatus?.collaboratorName && (
              <span className="ml-1 text-on-surface-muted font-medium">
                — {shiftStatus.collaboratorName} ({shiftStatus.collaboratorNumber})
              </span>
            )}
          </p>
        </div>

        <div className="w-full md:w-auto min-w-0 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          {/* Seletor de Colaborador para Administrador e Administrador 2 (apenas trabalhadores de secção) */}
          {canViewAll && (
            <div className="w-full sm:w-auto min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs">
              <label htmlFor="admin-collab-select" className="font-bold text-on-surface-muted shrink-0">
                Visualizar:
              </label>
              <select
                id="admin-collab-select"
                value={selectedCollaboratorNumber}
                onChange={e => setSelectedCollaboratorNumber(e.target.value)}
                className="w-full sm:w-auto sm:max-w-[300px] min-w-0 max-w-full truncate min-h-[42px] sm:min-h-0 bg-surface-card border border-line rounded-xl px-3 py-2 sm:py-1.5 text-xs text-on-surface font-bold focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer shadow-2xs"
              >
                <option value="TODOS">Todos os Colaboradores (Visão Geral)</option>
                {workerCollaborators.map(c => (
                  <option key={c.id} value={c.mecanographicNumber}>
                    {c.mecanographicNumber} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Atribuir Tarefa (Administrador e Administrador 2) */}
          {canAssignTasks && (
            <button
              onClick={() => {
                if (!addColabNumber && workerCollaborators.length > 0) {
                  setAddColabNumber(workerCollaborators[0].mecanographicNumber);
                }
                setAddIpaPending(-0.3);
                setAddIpaDone(0.3);
                setAddIpaNotDone(-0.2);
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-primary hover:bg-primary-hover text-on-primary rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Atribuir Tarefa</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cartões Informativos: Resumo Geral e/ou Cartão de Hora de Refeição */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Cartão de Refeição (quando visualizando um colaborador individual) */}
        {!isAllView ? (
          <div className={`md:col-span-4 rounded-2xl border p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
            shiftStatus?.shiftStatus === 'FÉRIAS'
              ? 'bg-danger-tint/70 border-danger-border'
              : shiftStatus?.shiftStatus === 'FOLGA'
              ? 'bg-surface-container border-line'
              : shiftStatus?.shiftStatus === 'AUSÊNCIA'
              ? 'bg-amber-tint/70 border-amber-border'
              : 'bg-surface-card border-line'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                shiftStatus?.shiftStatus === 'FÉRIAS'
                  ? 'bg-danger-tint text-danger-ink border-danger-border'
                  : shiftStatus?.shiftStatus === 'FOLGA'
                  ? 'bg-surface-card text-on-surface border-line'
                  : shiftStatus?.shiftStatus === 'AUSÊNCIA'
                  ? 'bg-amber-tint text-amber-ink border-amber-border'
                  : 'bg-amber-tint text-amber-ink border-amber-border'
              }`}>
                {shiftStatus?.shiftStatus === 'FÉRIAS' ? (
                  <Sun className="w-5 h-5 text-danger" />
                ) : shiftStatus?.shiftStatus === 'FOLGA' ? (
                  <Coffee className="w-5 h-5 text-on-surface-muted" />
                ) : shiftStatus?.shiftStatus === 'AUSÊNCIA' ? (
                  <CalendarOff className="w-5 h-5 text-amber-ink" />
                ) : (
                  <Utensils className="w-5 h-5 text-amber-ink" />
                )}
              </div>
              <div>
                <div className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider flex items-center gap-2">
                  <span>Hora de Refeição</span>
                  {shiftStatus && shiftStatus.shiftStatus !== 'TRABALHO' && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      shiftStatus.shiftStatus === 'FÉRIAS'
                        ? 'bg-danger-tint text-danger-ink border-danger-border'
                        : shiftStatus.shiftStatus === 'FOLGA'
                        ? 'bg-surface-container text-on-surface border-line'
                        : 'bg-amber-tint text-amber-ink border-amber-border'
                    }`}>
                      {shiftStatus.shiftStatus === 'FÉRIAS' ? 'Férias' : shiftStatus.shiftStatus === 'FOLGA' ? 'Folga' : 'Ausência'}
                    </span>
                  )}
                </div>
                <div className="text-sm sm:text-base font-bold text-on-surface flex flex-wrap items-center gap-2 mt-0.5">
                  {meal ? (
                    <span className="font-mono text-on-surface bg-surface-container px-2.5 py-0.5 rounded-lg text-sm font-bold border border-line">
                      {meal.time}
                    </span>
                  ) : shiftStatus?.shiftStatus === 'FÉRIAS' ? (
                    <span className="text-danger-ink text-xs sm:text-sm font-bold flex items-center gap-1.5">
                      Colaborador em Férias — Sem horário de refeição escalado
                    </span>
                  ) : shiftStatus?.shiftStatus === 'FOLGA' ? (
                    <span className="text-on-surface text-xs sm:text-sm font-bold flex items-center gap-1.5">
                      Colaborador de Folga — Sem horário de refeição escalado
                    </span>
                  ) : shiftStatus?.shiftStatus === 'AUSÊNCIA' ? (
                    <span className="text-amber-ink text-xs sm:text-sm font-bold flex items-center gap-1.5">
                      Sem turno escalado (Ausência) — Sem horário de refeição
                    </span>
                  ) : (
                    <span className="text-on-surface-subtle text-xs italic">
                      Sem horário de refeição escalado para esta data
                    </span>
                  )}
                </div>
              </div>
            </div>

            {meal?.hasConflict && (
              <div className="px-3 py-1.5 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink flex items-center gap-1.5 shrink-0">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span>Horários discordantes entre ptd e pts em revisão</span>
              </div>
            )}
          </div>
        ) : (
          /* Cartões de Indicadores da Secção para Administradores */
          <>
            <div className="bg-surface-card rounded-2xl border border-line p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">Total de Tarefas</div>
              <div className="text-2xl font-black text-on-surface mt-1 font-mono">{tasks.length}</div>
              <div className="text-[11px] text-on-surface-subtle mt-0.5">Escaladas na secção</div>
            </div>
            <div className="bg-surface-card rounded-2xl border border-success-border p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-success-ink">Tarefas Feitas</div>
              <div className="text-2xl font-black text-success-ink mt-1 font-mono">{completedCount}</div>
              <div className="text-[11px] text-on-surface-subtle mt-0.5">Concluídas hoje</div>
            </div>
            <div className="bg-surface-card rounded-2xl border border-danger-border p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-danger-ink">Não Feitas</div>
              <div className="text-2xl font-black text-danger-ink mt-1 font-mono">{notDoneCount}</div>
              <div className="text-[11px] text-on-surface-subtle mt-0.5">Com observação</div>
            </div>
            <div className="bg-surface-card rounded-2xl border border-amber-border p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-ink">Por Assinalar</div>
              <div className="text-2xl font-black text-amber-ink mt-1 font-mono">{pendingCount}</div>
              <div className="text-[11px] text-on-surface-subtle mt-0.5">A aguardar resposta</div>
            </div>
          </>
        )}
      </div>

      {/* Indicadores de Cumprimento Semanal (Semana em Vigor) e IPA */}
      {performance && (
        <div className="grid grid-cols-12 gap-2.5 sm:gap-4 items-stretch min-w-0">
          {/* Cumprimento na Semana em Vigor */}
          <div
            className={`${
              performance.annualScore?.eligible ? 'col-span-8' : 'col-span-12'
            } min-w-0 bg-surface-card rounded-2xl border border-line p-3.5 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 sm:gap-4`}
          >
            <div className="flex items-start sm:items-baseline justify-between gap-2 sm:gap-4 min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-on-surface-muted leading-tight min-w-0">
                Cumprimento na Semana em Vigor
              </span>
              <span className="text-xl sm:text-3xl font-bold text-on-surface font-mono tabular-nums tracking-tight leading-none shrink-0">
                {performance.currentWeek.completionRate}%
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuenow={performance.currentWeek.completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Cumprimento na Semana em Vigor"
              className="relative w-full h-3 sm:h-3.5 bg-surface-container rounded-full overflow-hidden ring-1 ring-inset ring-line"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${
                  performance.currentWeek.completionRate >= 80
                    ? 'bg-success'
                    : performance.currentWeek.completionRate >= 50
                    ? 'bg-amber-brand'
                    : 'bg-danger'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, performance.currentWeek.completionRate))}%` }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid grid-cols-4 divide-x divide-surface-card/35"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          {/* IPA (apenas para COLABORADOR; Admins, Admin 2 e Gestores estão isentos) */}
          {performance.annualScore?.eligible && (
            <div
              title={`IPA ${performance.annualScore.year}: Tarefas (${formatIpaNumber(performance.annualScore.tasksNetPoints)}) · Stocks (${formatIpaNumber(performance.annualScore.stockNetPoints)}) · PDE (${formatIpaNumber(performance.annualScore.pdeNetPoints)})`}
              className="col-span-4 min-w-0 bg-surface-container text-on-surface rounded-2xl border border-amber-border/70 p-3.5 sm:p-5 shadow-2xs flex flex-col justify-between gap-2.5 sm:gap-3"
            >
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-amber-ink leading-tight">
                IPA
              </span>
              <div className="flex items-baseline gap-1 sm:gap-1.5 min-w-0 flex-wrap">
                <span className="text-xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight text-on-surface leading-none">
                  {formatIpaNumber(performance.annualScore.totalPoints)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visão Geral da Escala da Equipa para Administradores */}
      {isAllView && allShifts.length > 0 && (
        <div className="bg-surface-card rounded-2xl border border-line p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-line-subtle">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-ink" />
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                Escala e Situação Diária da Secção ({formatDatePt(selectedDate)})
              </span>
            </div>
            <span className="text-[11px] text-on-surface-subtle font-medium">
              Clique no colaborador para consultar detalhe individual
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. Em Trabalho */}
            <div className="bg-success-tint/60 border border-success-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between font-bold text-on-surface">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-success" />
                  Em Trabalho
                </span>
                <span className="bg-success-tint text-success-ink border border-success-border px-2 py-0.5 rounded-full text-[11px] font-black">
                  {allShifts.filter(s => s.shiftStatus === 'TRABALHO').length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allShifts.filter(s => s.shiftStatus === 'TRABALHO').map(s => (
                  <button
                    key={s.collaboratorNumber}
                    onClick={() => setSelectedCollaboratorNumber(s.collaboratorNumber)}
                    className="px-2 py-1 bg-surface-card hover:bg-surface-container border border-line text-on-surface rounded-lg text-[11px] font-medium transition-colors cursor-pointer text-left flex items-center gap-1 shadow-2xs"
                    title={`Refeição: ${s.mealTime || 'Não indicada'} · Tarefas: ${s.tasksCount}`}
                  >
                    <span className="font-bold">{s.collaboratorName.split(' ')[0]}</span>
                    {s.mealTime && (
                      <span className="text-[10px] text-amber-ink font-mono">({s.mealTime})</span>
                    )}
                  </button>
                ))}
                {allShifts.filter(s => s.shiftStatus === 'TRABALHO').length === 0 && (
                  <span className="text-on-surface-subtle italic text-[11px]">Nenhum colaborador</span>
                )}
              </div>
            </div>

            {/* 2. De Folga */}
            <div className="bg-surface-container border border-line rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between font-bold text-on-surface">
                <span className="flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-on-surface-muted" />
                  De Folga
                </span>
                <span className="bg-surface-card text-on-surface border border-line px-2 py-0.5 rounded-full text-[11px] font-black">
                  {allShifts.filter(s => s.shiftStatus === 'FOLGA').length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allShifts.filter(s => s.shiftStatus === 'FOLGA').map(s => (
                  <button
                    key={s.collaboratorNumber}
                    onClick={() => setSelectedCollaboratorNumber(s.collaboratorNumber)}
                    className="px-2 py-1 bg-surface-card hover:bg-surface-hover border border-line text-on-surface rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  >
                    {s.collaboratorName.split(' ')[0]}
                  </button>
                ))}
                {allShifts.filter(s => s.shiftStatus === 'FOLGA').length === 0 && (
                  <span className="text-on-surface-subtle italic text-[11px]">Nenhum colaborador</span>
                )}
              </div>
            </div>

            {/* 3. Em Férias */}
            <div className="bg-danger-tint/60 border border-danger-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between font-bold text-danger-ink">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-danger" />
                  Em Férias
                </span>
                <span className="bg-danger-tint text-danger-ink border border-danger-border px-2 py-0.5 rounded-full text-[11px] font-black">
                  {allShifts.filter(s => s.shiftStatus === 'FÉRIAS').length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allShifts.filter(s => s.shiftStatus === 'FÉRIAS').map(s => (
                  <button
                    key={s.collaboratorNumber}
                    onClick={() => setSelectedCollaboratorNumber(s.collaboratorNumber)}
                    className="px-2 py-1 bg-surface-card hover:bg-danger-tint border border-danger-border text-danger-ink rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  >
                    {s.collaboratorName.split(' ')[0]}
                  </button>
                ))}
                {allShifts.filter(s => s.shiftStatus === 'FÉRIAS').length === 0 && (
                  <span className="text-on-surface-subtle italic text-[11px]">Nenhum colaborador</span>
                )}
              </div>
            </div>

            {/* 4. Ausência */}
            <div className="bg-amber-tint/60 border border-amber-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between font-bold text-amber-ink">
                <span className="flex items-center gap-1.5">
                  <CalendarOff className="w-3.5 h-3.5 text-amber-ink" />
                  Ausência / Sem Escala
                </span>
                <span className="bg-amber-tint text-amber-ink border border-amber-border px-2 py-0.5 rounded-full text-[11px] font-black">
                  {allShifts.filter(s => s.shiftStatus === 'AUSÊNCIA').length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allShifts.filter(s => s.shiftStatus === 'AUSÊNCIA').map(s => (
                  <button
                    key={s.collaboratorNumber}
                    onClick={() => setSelectedCollaboratorNumber(s.collaboratorNumber)}
                    className="px-2 py-1 bg-surface-card hover:bg-amber-tint border border-amber-border text-amber-ink rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  >
                    {s.collaboratorName.split(' ')[0]}
                  </button>
                ))}
                {allShifts.filter(s => s.shiftStatus === 'AUSÊNCIA').length === 0 && (
                  <span className="text-on-surface-subtle italic text-[11px]">Nenhum colaborador</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo das Tarefas */}
      {isLoading ? (
        <div className="py-12 text-center text-on-surface-muted text-sm font-medium">
          A carregar tarefas da secção...
        </div>
      ) : tasks.length === 0 ? (
        shiftStatus?.shiftStatus === 'FÉRIAS' ? (
          <div className="bg-danger-tint/60 rounded-2xl border border-danger-border p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-danger-tint border border-danger-border text-danger flex items-center justify-center mx-auto shadow-xs">
              <Sun className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger-tint text-danger-ink text-xs font-black tracking-wide uppercase border border-danger-border">
                Colaborador em Férias
              </div>
              <h3 className="text-lg sm:text-xl font-black text-on-surface pt-1">
                {shiftStatus.collaboratorName} está em período de Férias
              </h3>
              <p className="text-xs sm:text-sm text-on-surface-muted max-w-lg mx-auto">
                Período de férias regulamentar registado na escala de serviço oficial da secção para o dia <strong className="text-on-surface">{formatDatePt(selectedDate)}</strong>.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center items-center gap-2 text-xs text-danger-ink font-medium">
              <span className="bg-surface-card border border-danger-border px-3 py-1 rounded-lg shadow-2xs">Sem tarefas planeadas</span>
              <span className="bg-surface-card border border-danger-border px-3 py-1 rounded-lg shadow-2xs">Sem horário de refeição</span>
            </div>
          </div>
        ) : shiftStatus?.shiftStatus === 'FOLGA' ? (
          <div className="bg-surface-container rounded-2xl border border-line p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-surface-card border border-line text-on-surface-muted flex items-center justify-center mx-auto shadow-xs">
              <Coffee className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-card text-on-surface text-xs font-black tracking-wide uppercase border border-line">
                Colaborador de Folga
              </div>
              <h3 className="text-lg sm:text-xl font-black text-on-surface pt-1">
                {shiftStatus.collaboratorName} está de Folga
              </h3>
              <p className="text-xs sm:text-sm text-on-surface-muted max-w-lg mx-auto">
                Dia de descanso semanal (folga) programado na escala oficial de serviço para o dia <strong className="text-on-surface">{formatDatePt(selectedDate)}</strong>.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center items-center gap-2 text-xs text-on-surface font-medium">
              <span className="bg-surface-card border border-line px-3 py-1 rounded-lg shadow-2xs">Descanso semanal</span>
              <span className="bg-surface-card border border-line px-3 py-1 rounded-lg shadow-2xs">Sem tarefas atribuídas</span>
            </div>
          </div>
        ) : shiftStatus?.shiftStatus === 'AUSÊNCIA' ? (
          <div className="bg-amber-tint/60 rounded-2xl border border-amber-border p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-amber-tint border border-amber-border text-amber-ink flex items-center justify-center mx-auto shadow-xs">
              <CalendarOff className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-tint text-amber-ink text-xs font-black tracking-wide uppercase border border-amber-border">
                Colaborador em Ausência
              </div>
              <h3 className="text-lg sm:text-xl font-black text-on-surface pt-1">
                {shiftStatus.collaboratorName} — Ausência / Não Escalado
              </h3>
              <p className="text-xs sm:text-sm text-on-surface-muted max-w-lg mx-auto">
                Sem turno escalado na rotação oficial da secção para o dia <strong className="text-on-surface">{formatDatePt(selectedDate)}</strong>.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center items-center gap-2 text-xs text-amber-ink font-medium">
              <span className="bg-surface-card border border-amber-border px-3 py-1 rounded-lg shadow-2xs">Sem turno atribuído</span>
              <span className="bg-surface-card border border-amber-border px-3 py-1 rounded-lg shadow-2xs">Sem horário de refeição</span>
            </div>
          </div>
        ) : (
          <div className="bg-surface-card rounded-2xl border border-line p-10 text-center space-y-3 shadow-xs">
            <Calendar className="w-10 h-10 text-amber-brand mx-auto" />
            <h3 className="text-sm font-bold text-on-surface">
              Sem tarefas planeadas para esta data
            </h3>
            <p className="text-xs text-on-surface-muted max-w-md mx-auto">
              Não existem tarefas importadas dos ficheiros ptd/pts nem tarefas adicionais atribuídas para este colaborador em {formatDatePt(selectedDate)}.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {isDayLocked && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-tint/70 border border-amber-border text-xs text-amber-ink">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Alteração bloqueada:</strong> o estado das tarefas de{' '}
                <strong>{formatDatePt(selectedDate)}</strong> só podia ser alterado até às{' '}
                <strong>02:00 do dia seguinte</strong>. Apenas o perfil de <strong>Administrador</strong> pode efetuar correções.
              </span>
            </div>
          )}

          {/* 1. TAREFAS PRINCIPAIS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                Tarefas Principais
              </span>
              <span className="text-xs font-bold text-on-surface-muted font-mono">
                {principalTasks.length} {principalTasks.length === 1 ? 'tarefa' : 'tarefas'}
              </span>
            </div>

            {principalTasks.length === 0 ? (
              <p className="text-xs text-on-surface-subtle italic py-2">
                Nenhuma tarefa principal atribuída para este dia.
              </p>
            ) : (
              <div className="grid gap-3">
                {principalTasks.map(task => renderTaskCard(task))}
              </div>
            )}
          </section>

          {/* 2. TAREFAS SECUNDÁRIAS */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                Tarefas Secundárias
              </span>
              <span className="text-xs font-bold text-on-surface-muted font-mono">
                {secundaryTasks.length} {secundaryTasks.length === 1 ? 'tarefa' : 'tarefas'}
              </span>
            </div>

            {secundaryTasks.length === 0 ? (
              <p className="text-xs text-on-surface-subtle italic py-2">
                Nenhuma tarefa secundária atribuída para este dia.
              </p>
            ) : (
              <div className="grid gap-3">
                {secundaryTasks.map(task => renderTaskCard(task))}
              </div>
            )}
          </section>

          {/* 3. TAREFAS ADICIONAIS */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                  Tarefas Adicionais da Secção
                </span>
                <span className="text-[11px] text-on-surface-subtle font-medium">
                  · Atribuídas pela chefia
                </span>
              </div>
              <span className="text-xs font-bold text-on-surface-muted font-mono">
                {additionalTasks.length} {additionalTasks.length === 1 ? 'tarefa' : 'tarefas'}
              </span>
            </div>

            {additionalTasks.length === 0 ? (
              <p className="text-xs text-on-surface-subtle italic py-2">
                Nenhuma tarefa adicional registada para este dia.
              </p>
            ) : (
              <div className="grid gap-3">
                {additionalTasks.map(task => renderTaskCard(task))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= MODAL ATRIBUIR / ADICIONAR TAREFA ================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-ink" />
                <span>Atribuir Nova Tarefa</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-on-surface-subtle hover:text-on-surface p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-2.5 bg-danger-tint border border-danger-border rounded-lg text-xs text-danger-ink flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAdditional} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Colaborador Destinatário *</label>
                <select
                  value={addColabNumber}
                  onChange={e => setAddColabNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-semibold text-on-surface"
                >
                  {workerCollaborators.map(c => (
                    <option key={c.id} value={c.mecanographicNumber}>
                      {c.mecanographicNumber} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Descrição da Tarefa *</label>
                <textarea
                  required
                  rows={3}
                  value={addDescription}
                  onChange={e => setAddDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand text-on-surface"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Hora Prevista (Opcional)</label>
                <input
                  type="text"
                  value={addTime}
                  onChange={e => setAddTime(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono text-on-surface"
                />
              </div>

              <div className="p-3 bg-surface-container border border-line rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-on-surface uppercase tracking-wider text-[11px]">
                    Escala IPA da Tarefa
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-muted">-1,0 a +1,0 (passo 0,1)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-ink mb-1">Por Assinalar</label>
                    <select
                      value={addIpaPending}
                      onChange={e => setAddIpaPending(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                    >
                      {IPA_POINT_OPTIONS.map(opt => (
                        <option key={`add-p-${opt}`} value={opt}>
                          {formatIpaOption(opt)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-success-ink mb-1">Feita</label>
                    <select
                      value={addIpaDone}
                      onChange={e => setAddIpaDone(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                    >
                      {IPA_POINT_OPTIONS.map(opt => (
                        <option key={`add-d-${opt}`} value={opt}>
                          {formatIpaOption(opt)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-danger-ink mb-1">Não Feita</label>
                    <select
                      value={addIpaNotDone}
                      onChange={e => setAddIpaNotDone(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                    >
                      {IPA_POINT_OPTIONS.map(opt => (
                        <option key={`add-n-${opt}`} value={opt}>
                          {formatIpaOption(opt)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addLoading || !addDescription.trim()}
                  className="px-4 py-2 text-xs font-bold text-on-primary bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  {addLoading ? 'A gravar...' : 'Gravar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL DE EDIÇÃO DE TAREFA ================= */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-ink" />
                <span>Editar Tarefa</span>
              </h3>
              <button
                onClick={() => setEditingTask(null)}
                className="text-on-surface-subtle hover:text-on-surface p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-2.5 bg-danger-tint border border-danger-border rounded-lg text-xs text-danger-ink flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="p-2.5 bg-surface-container border border-line rounded-xl text-on-surface flex justify-between items-center">
                <span><strong>Colaborador:</strong> {editingTask.collaboratorName}</span>
                <span className="font-mono text-[11px] text-on-surface-muted">Nº {editingTask.mecanographicNumber}</span>
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Descrição da Tarefa *</label>
                <textarea
                  required
                  rows={3}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand text-on-surface"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Hora Prevista (Opcional)</label>
                <input
                  type="text"
                  value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono text-on-surface"
                />
              </div>

              <div className="p-3 bg-surface-container border border-line rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-bold text-on-surface text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUseCustomIpa}
                      onChange={e => setEditUseCustomIpa(e.target.checked)}
                      className="rounded accent-amber-brand cursor-pointer"
                    />
                    <span className="uppercase tracking-wider">Definir Pontos IPA (-1,0 a +1,0)</span>
                  </label>
                  <span className="text-[10px] font-mono text-on-surface-muted">passo 0,1</span>
                </div>

                {editUseCustomIpa && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-amber-ink mb-1">Por Assinalar</label>
                      <select
                        value={editIpaPending}
                        onChange={e => setEditIpaPending(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                      >
                        {IPA_POINT_OPTIONS.map(opt => (
                          <option key={`edit-p-${opt}`} value={opt}>
                            {formatIpaOption(opt)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-success-ink mb-1">Feita</label>
                      <select
                        value={editIpaDone}
                        onChange={e => setEditIpaDone(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                      >
                        {IPA_POINT_OPTIONS.map(opt => (
                          <option key={`edit-d-${opt}`} value={opt}>
                            {formatIpaOption(opt)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-danger-ink mb-1">Não Feita</label>
                      <select
                        value={editIpaNotDone}
                        onChange={e => setEditIpaNotDone(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-surface-card border border-line rounded-lg font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
                      >
                        {IPA_POINT_OPTIONS.map(opt => (
                          <option key={`edit-n-${opt}`} value={opt}>
                            {formatIpaOption(opt)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading || !editDescription.trim()}
                  className="px-4 py-2 text-xs font-bold text-on-primary bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  {editLoading ? 'A guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIRMAÇÃO DE ELIMINAÇÃO ================= */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-danger-border space-y-4">
            <div className="flex items-center gap-2 text-danger-ink font-bold text-sm">
              <Trash2 className="w-5 h-5 shrink-0 text-danger" />
              <span>Confirmar Eliminação</span>
            </div>

            <p className="text-xs text-on-surface-muted">
              Tem a certeza de que pretende eliminar permanentemente a tarefa:
              <br />
              <strong className="text-on-surface mt-1 block">"{deletingTask.description}"</strong>
            </p>

            {deleteError && (
              <div className="p-2 bg-danger-tint border border-danger-border rounded-lg text-xs text-danger-ink">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setDeletingTask(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 text-xs font-bold text-on-danger bg-danger hover:bg-danger-hover disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                {deleteLoading ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE OBSERVAÇÃO (NÃO FEITA) ================= */}
      {observingTask && pendingStatus === 'NAO_FEITA' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line space-y-4">
            <div>
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <XCircle className="w-4 h-4 text-danger" />
                <span>Indicar Motivo da Tarefa Não Feita</span>
              </h3>
              <p className="text-xs text-on-surface-muted mt-1">
                Tarefa: <strong className="text-on-surface">{observingTask.description}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-muted mb-1">
                Motivo / Justificação *
              </label>
              <textarea
                required
                rows={3}
                value={observationText}
                onChange={e => setObservationText(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container border border-line rounded-lg text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-danger"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setObservingTask(null);
                  setPendingStatus(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!observationText.trim()}
                onClick={() => applyTaskStatus(observingTask.id, 'NAO_FEITA', observationText.trim())}
                className="px-4 py-2 text-xs font-bold text-on-danger bg-danger hover:bg-danger-hover disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Gravar Não Feita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL HISTÓRICO DE RESPOSTAS ================= */}
      {historyTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <History className="w-4 h-4 text-amber-ink" />
                <span>Histórico de Respostas da Tarefa</span>
              </h3>
              <button
                onClick={() => setHistoryTask(null)}
                className="text-on-surface-subtle hover:text-on-surface p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
              {historyTask.history.map((h, i) => (
                <div key={i} className="p-2.5 bg-surface-container border border-line rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-on-surface-subtle text-[11px]">
                    <span className="font-semibold text-on-surface">{h.answeredBy}</span>
                    <span className="font-mono">{new Date(h.answeredAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="font-bold text-on-surface">Estado: {h.status}</div>
                  {h.observation && (
                    <div className="text-on-surface-muted text-[11px] italic">Obs: {h.observation}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <button
                onClick={() => setHistoryTask(null)}
                className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

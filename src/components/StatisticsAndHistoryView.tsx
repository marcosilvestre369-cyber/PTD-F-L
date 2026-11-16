import React, { useState, useEffect } from 'react';
import { DailyStatistic, AuditLog, DailyTask, StockRecord } from '../types/index.ts';
import { api } from '../services/api.ts';
import { formatDatePt, formatDateTimePt } from '../utils/date.ts';
import {
  Database,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  History,
  CheckCircle2,
  Search,
} from 'lucide-react';

export const StatisticsAndHistoryView: React.FC = () => {
  const [statistics, setStatistics] = useState<DailyStatistic[]>([]);
  const [historyData, setHistoryData] = useState<{
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
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ success: boolean; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtro do histórico
  const [historyTab, setHistoryTab] = useState<'audits' | 'tasks' | 'stocks'>('tasks');
  const [historySearch, setHistorySearch] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stats, history] = await Promise.all([
        api.getStatistics(),
        api.getHistory(),
      ]);
      setStatistics(stats);
      setHistoryData(history);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar estatísticas da base de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await api.syncDatabase();
      setSyncFeedback({ success: res.success, msg: res.message });
      await loadData();
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      setSyncFeedback({ success: false, msg: err.message || 'Erro ao sincronizar com Firestore.' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Cálculos globais agregados
  const totalCompleted = statistics.reduce((acc, s) => acc + s.completedTasks, 0);
  const totalTasksAll = statistics.reduce((acc, s) => acc + s.totalTasks, 0);
  const averageRate = totalTasksAll > 0 ? Math.round((totalCompleted / totalTasksAll) * 100) : 0;
  const totalExcessBoxesAll = statistics.reduce((acc, s) => acc + s.totalExcessBoxes, 0);
  const totalRupturesAll = statistics.reduce((acc, s) => acc + s.totalRuptures, 0);

  // Filtragem de histórico de auditoria
  const filteredAudits = (historyData?.audits || []).filter(a => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      a.authorName.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q) ||
      a.details.toLowerCase().includes(q) ||
      a.entity.toLowerCase().includes(q)
    );
  });

  // Filtragem de histórico de tarefas respondidas
  const filteredTasks = (historyData?.tasksAnswered || []).filter(t => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      t.collaboratorName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.observation && t.observation.toLowerCase().includes(q))
    );
  });

  // Filtragem de histórico de stocks
  const filteredStocks = (historyData?.stocksHistory || []).filter(s => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      s.articleDescription.toLowerCase().includes(q) ||
      s.articleSku.toLowerCase().includes(q) ||
      s.authorName.toLowerCase().includes(q) ||
      (s.resolutionNote && s.resolutionNote.toLowerCase().includes(q))
    );
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center text-on-surface-muted text-sm font-medium">
        A carregar estatísticas e histórico da base de dados...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Cartão de Estado da Base de Dados Firestore */}
      <div className="bg-hero-bg rounded-2xl p-5 text-hero-fg shadow-md border border-amber-brand/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-brand/20 border border-amber-brand/40 flex items-center justify-center text-amber-brand shrink-0 shadow-inner">
            <Database className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold tracking-tight text-hero-fg">
                Base de Dados na Nuvem (Firebase Firestore)
              </span>
              {historyData?.databaseInfo?.status === 'CONNECTED' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-brand/20 text-amber-brand border border-amber-brand/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-brand animate-pulse"></span>
                  Ativa & Sincronizada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-danger-tint text-danger-ink border border-danger-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>
                  Apenas Local (Firestore Inativo)
                </span>
              )}
            </div>
            <div className="text-xs text-hero-muted flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <span>Projeto: <strong className="text-hero-fg">{historyData?.databaseInfo?.projectId || 'Firestore'}</strong></span>
              <span>·</span>
              <span>Coleções: <strong className="text-hero-fg">collaborators, tasks, meals, imports, articles, stocks, pdes, notifications, audits, statistics</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-brand hover:opacity-90 text-on-secondary rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs hover:shadow"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'A Sincronizar...' : 'Sincronizar Nuvem'}</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center gap-2 ${
            syncFeedback.success
              ? 'bg-success-tint border-success-border text-success-ink'
              : 'bg-danger-tint border-danger-border text-danger-ink'
          }`}
        >
          {syncFeedback.success ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          )}
          <span>{syncFeedback.msg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-danger-tint border border-danger-border rounded-2xl text-xs text-danger-ink font-medium">
          {error}
        </div>
      )}

      {/* 2. KPIs Globais de Desempenho e Histórico */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface-card rounded-2xl border border-line p-4 shadow-xs">
          <div className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
            Cumprimento de Tarefas
          </div>
          <div className="text-2xl font-black text-on-surface mt-1 flex items-baseline gap-1.5 font-mono">
            {averageRate}%
            <span className="text-xs font-normal text-on-surface-subtle font-sans">média</span>
          </div>
          <div className="text-[11px] text-on-surface-subtle mt-0.5">
            {totalCompleted} concluídas de {totalTasksAll} planeadas
          </div>
        </div>

        <div className="bg-surface-card rounded-2xl border border-line p-4 shadow-xs">
          <div className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
            Tarefas Registadas
          </div>
          <div className="text-2xl font-black text-on-surface mt-1 font-mono">
            {historyData?.totalRegisteredTasks || 0}
          </div>
          <div className="text-[11px] text-on-surface-subtle mt-0.5">
            Total na base de dados
          </div>
        </div>

        <div className="bg-surface-card rounded-2xl border border-amber-border p-4 shadow-xs">
          <div className="text-[11px] font-bold text-amber-ink uppercase tracking-wider">
            Volume de Excesso
          </div>
          <div className="text-2xl font-black text-on-surface mt-1 font-mono">
            {totalExcessBoxesAll} <span className="text-xs font-bold text-on-surface-muted font-sans">cx</span>
          </div>
          <div className="text-[11px] text-on-surface-muted mt-0.5">
            Registadas na secção
          </div>
        </div>

        <div className="bg-surface-card rounded-2xl border border-danger-border p-4 shadow-xs">
          <div className="text-[11px] font-bold text-danger-ink uppercase tracking-wider">
            Roturas Identificadas
          </div>
          <div className="text-2xl font-black text-danger-ink mt-1 font-mono">
            {totalRupturesAll}
          </div>
          <div className="text-[11px] text-danger-ink/80 mt-0.5">
            Para revisão de parâmetros
          </div>
        </div>
      </div>

      {/* 3. Tabela de Estatísticas Diárias */}
      <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden space-y-3 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-line-subtle">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-ink" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              Evolução Diária de Tarefas e Stocks na Secção
            </h3>
          </div>
          <span className="text-[11px] text-on-surface-muted font-medium">
            Métricas consolidadas na base de dados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container border-b border-line text-on-surface-muted font-bold uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5">Data</th>
                <th className="py-2.5 px-3.5 text-center">Total Tarefas</th>
                <th className="py-2.5 px-3.5 text-center">Feitas</th>
                <th className="py-2.5 px-3.5 text-center">Não Feitas</th>
                <th className="py-2.5 px-3.5 text-center">Por Assinalar</th>
                <th className="py-2.5 px-3.5">Taxa de Cumprimento</th>
                <th className="py-2.5 px-3.5 text-right">Excessos (cx)</th>
                <th className="py-2.5 px-3.5 text-right">Roturas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {statistics.map(stat => (
                <tr key={stat.id} className="hover:bg-surface-container/60 transition-colors">
                  <td className="py-2.5 px-3.5 font-bold text-on-surface whitespace-nowrap">
                    {formatDatePt(stat.date)}
                  </td>
                  <td className="py-2.5 px-3.5 text-center font-mono font-bold text-on-surface">
                    {stat.totalTasks}
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full font-mono font-bold bg-success-tint text-success-ink border border-success-border">
                      {stat.completedTasks}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full font-mono font-bold bg-danger-tint text-danger-ink border border-danger-border">
                      {stat.notDoneTasks}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-amber-ink bg-amber-tint border border-amber-border">
                      {stat.pendingTasks}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-container rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            stat.completionRate >= 80
                              ? 'bg-success'
                              : stat.completionRate >= 50
                              ? 'bg-amber-brand'
                              : 'bg-danger'
                          }`}
                          style={{ width: `${stat.completionRate}%` }}
                        ></div>
                      </div>
                      <span className="font-mono font-bold text-on-surface w-9 text-right">
                        {stat.completionRate}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-bold text-on-surface whitespace-nowrap">
                    {stat.totalExcessBoxes} cx
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-bold text-danger-ink">
                    {stat.totalRuptures}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Histórico Detalhado de Registos e Auditoria */}
      <div className="bg-surface-card rounded-2xl border border-line shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-ink" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              Histórico Operacional Detalhado
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-line p-0.5 bg-surface-container text-xs font-bold">
              <button
                onClick={() => setHistoryTab('tasks')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  historyTab === 'tasks'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                Tarefas Assinaladas ({historyData?.tasksAnswered.length || 0})
              </button>
              <button
                onClick={() => setHistoryTab('stocks')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  historyTab === 'stocks'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                Stocks ({historyData?.stocksHistory.length || 0})
              </button>
              <button
                onClick={() => setHistoryTab('audits')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  historyTab === 'audits'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                Auditoria ({historyData?.audits.length || 0})
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-on-surface-subtle absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Pesquisar histórico..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-surface-container border border-line rounded-xl text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand w-44"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo da aba selecionada */}
        {historyTab === 'tasks' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                <tr>
                  <th className="py-2.5 px-3.5">Data</th>
                  <th className="py-2.5 px-3.5">Colaborador</th>
                  <th className="py-2.5 px-3.5">Tarefa</th>
                  <th className="py-2.5 px-3.5">Estado</th>
                  <th className="py-2.5 px-3.5">Observação / Motivo</th>
                  <th className="py-2.5 px-3.5">Registado Em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-on-surface-subtle italic">
                      Nenhuma tarefa respondida encontrada no histórico.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map(t => (
                    <tr key={t.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono text-on-surface-muted whitespace-nowrap">
                        {formatDatePt(t.date)}
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-on-surface whitespace-nowrap">
                        {t.collaboratorName}
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface font-medium">
                        {t.description}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            t.status === 'FEITA'
                              ? 'bg-success-tint text-success-ink border-success-border'
                              : t.status === 'NAO_FEITA'
                              ? 'bg-danger-tint text-danger-ink border-danger-border'
                              : 'bg-amber-tint text-amber-ink border-amber-border'
                          }`}
                        >
                          {t.status === 'FEITA' ? 'Feita' : t.status === 'NAO_FEITA' ? 'Não Feita' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface-muted italic">
                        {t.observation || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface-subtle font-mono text-[11px] whitespace-nowrap">
                        {t.answeredAt ? formatDateTimePt(t.answeredAt) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {historyTab === 'stocks' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                <tr>
                  <th className="py-2.5 px-3.5">Tipo</th>
                  <th className="py-2.5 px-3.5">Artigo</th>
                  <th className="py-2.5 px-3.5">Detalhe</th>
                  <th className="py-2.5 px-3.5">Estado</th>
                  <th className="py-2.5 px-3.5">Autor</th>
                  <th className="py-2.5 px-3.5">Registo</th>
                  <th className="py-2.5 px-3.5">Resolução</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-on-surface-subtle italic">
                      Nenhum registo de stock encontrado no histórico.
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map(s => (
                    <tr key={s.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            s.type === 'EXCESSO'
                              ? 'bg-amber-tint text-amber-ink border-amber-border'
                              : 'bg-danger-tint text-danger-ink border-danger-border'
                          }`}
                        >
                          {s.type === 'EXCESSO' ? 'Excesso' : 'Rotura'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                        {s.articleDescription}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {s.type === 'EXCESSO' ? (
                          <span className="font-bold text-on-surface">
                            {s.boxes} cx · {s.dateType}
                          </span>
                        ) : (
                          <span className="text-danger-ink font-bold">Revisão Parâmetros</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            s.status === 'TRATADO'
                              ? 'bg-success-tint text-success-ink border-success-border'
                              : s.status === 'NAO_CONSIDERADO'
                              ? 'bg-surface-container text-on-surface-muted border-line'
                              : 'bg-danger-tint text-danger-ink border-danger-border font-bold'
                          }`}
                        >
                          {s.status === 'TRATADO'
                            ? 'Tratado'
                            : s.status === 'NAO_CONSIDERADO'
                            ? 'Não considerado'
                            : 'Por tratar'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface whitespace-nowrap">
                        {s.authorName}
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface-subtle font-mono text-[11px] whitespace-nowrap">
                        {formatDatePt(s.registrationDate)}
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface-muted italic">
                        {s.resolutionNote || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {historyTab === 'audits' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                <tr>
                  <th className="py-2.5 px-3.5">Data / Hora</th>
                  <th className="py-2.5 px-3.5">Autor</th>
                  <th className="py-2.5 px-3.5">Ação</th>
                  <th className="py-2.5 px-3.5">Entidade</th>
                  <th className="py-2.5 px-3.5">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-on-surface-subtle italic">
                      Nenhum registo de auditoria encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredAudits.map(a => (
                    <tr key={a.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono text-on-surface-subtle text-[11px] whitespace-nowrap">
                        {formatDateTimePt(a.timestamp)}
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-on-surface whitespace-nowrap">
                        {a.authorName}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-tint text-amber-ink border border-amber-border">
                          {a.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface-muted font-medium whitespace-nowrap">
                        {a.entity}
                      </td>
                      <td className="py-2.5 px-3.5 text-on-surface">
                        {a.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { DailyReportSummary, Collaborator, ReportScope, ReportPeriod } from '../types/index.ts';
import { api } from '../services/api.ts';
import { formatDatePt, isDateInPast } from '../utils/date.ts';
import { exportDailyReportPdf, exportSinglePdeA4Pdf } from '../utils/pdfExport.ts';
import {
  FileText,
  Download,
  Package,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Users,
  Camera,
  Printer,
  Calendar,
} from 'lucide-react';

interface DailyReportViewProps {
  currentUser: Collaborator;
  selectedDate: string;
}

function formatStockStatusLabel(status: string): string {
  if (status === 'TRATADO' || status === 'RESOLVIDO') return 'Tratado';
  if (status === 'NAO_CONSIDERADO') return 'Não considerado';
  return 'Por tratar';
}

function getStockStatusBadgeClass(status: string): string {
  if (status === 'TRATADO' || status === 'RESOLVIDO') {
    return 'bg-success-tint text-success-ink border border-success-border';
  }
  if (status === 'NAO_CONSIDERADO') {
    return 'bg-surface-container text-on-surface-muted border border-line';
  }
  return 'bg-danger-tint text-danger-ink border border-danger-border font-bold';
}

export const DailyReportView: React.FC<DailyReportViewProps> = ({ selectedDate }) => {
  // 1- Opção de escolher entre 4 tipos de relatório em 3 períodos temporais
  const [reportScope, setReportScope] = useState<ReportScope>('TODOS');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('DIA');

  // Seletores de data de acordo com o período
  const [dayDate, setDayDate] = useState<string>(selectedDate);
  const [monthDate, setMonthDate] = useState<string>(selectedDate.slice(0, 7)); // YYYY-MM
  const [yearDate, setYearDate] = useState<string>(selectedDate.slice(0, 4)); // YYYY

  const [report, setReport] = useState<DailyReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locais do relatório
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Sincronizar dayDate se selectedDate mudar
  useEffect(() => {
    setDayDate(selectedDate);
    setMonthDate(selectedDate.slice(0, 7));
    setYearDate(selectedDate.slice(0, 4));
  }, [selectedDate]);

  // Determinar o parâmetro de data efetivo enviado à API
  const effectiveDate =
    reportPeriod === 'DIA' ? dayDate : reportPeriod === 'MES' ? monthDate : yearDate;

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getDailyReport(effectiveDate, {
        period: reportPeriod,
        reportScope,
        articleQuery: searchQuery || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar relatório operacional.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [effectiveDate, reportPeriod, reportScope, searchQuery, typeFilter, statusFilter]);

  const handleExportPdf = () => {
    if (!report) return;
    exportDailyReportPdf(report);
  };

  // Anos disponíveis para seleção
  const maxYear = Math.max(Number(selectedDate.slice(0, 4)) || 2026, new Date().getFullYear(), 2026);
  const availableYears = Array.from({ length: Math.max(1, maxYear - 2022) }, (_, i) => String(maxYear - i));

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* 1. SELEÇÃO DE TIPO DE RELATÓRIO E PERÍODO TEMPORAL */}
      <div className="bg-surface-card/90 backdrop-blur-md rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-3">
        {/* Linha 1: 4 Tipos de Relatório */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
            Tipo de Relatório
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'TODOS', label: 'Todos (Consolidado)', icon: Layers },
                { id: 'STOCKS', label: 'Stocks (Excesso/Rotura)', icon: Package },
                { id: 'PDE', label: 'PDE (Qualidade)', icon: FileText },
                { id: 'TAREFAS', label: 'Tarefas (Desempenho)', icon: Users },
              ] as const
            ).map(opt => {
              const Icon = opt.icon;
              const isSelected = reportScope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReportScope(opt.id)}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-on-primary border-primary shadow-xs'
                      : 'bg-surface-container text-on-surface-muted border-line hover:bg-surface-hover hover:text-on-surface'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-brand' : ''}`} />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Linha 2: 3 Períodos Temporais + Seletor de Data */}
        <div className="pt-2 border-t border-line-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider mr-1">
              Período:
            </span>
            {(['DIA', 'MES', 'ANO'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setReportPeriod(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer border ${
                  reportPeriod === p
                    ? 'bg-primary text-on-primary border-primary shadow-2xs'
                    : 'bg-surface-container text-on-surface-muted border-line hover:bg-surface-hover hover:text-on-surface'
                }`}
              >
                {p === 'DIA' ? 'Dia' : p === 'MES' ? 'Mês' : 'Ano'}
              </button>
            ))}
          </div>

          {/* Seletor dinâmico de Dia, Mês ou Ano */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-ink shrink-0" />
            {reportPeriod === 'DIA' && (
              <input
                type="date"
                value={dayDate}
                onChange={e => setDayDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-surface-container border border-line rounded-xl text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
              />
            )}

            {reportPeriod === 'MES' && (
              <input
                type="month"
                value={monthDate}
                onChange={e => setMonthDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-surface-container border border-line rounded-xl text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
              />
            )}

            {reportPeriod === 'ANO' && (
              <select
                value={yearDate}
                onChange={e => setYearDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-surface-container border border-line rounded-xl text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand cursor-pointer"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr} className="bg-surface-card text-on-surface">
                    Ano {yr}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleExportPdf}
              disabled={!report || isLoading}
              className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-amber-brand hover:opacity-90 text-on-secondary rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50 shrink-0 ml-auto sm:ml-0"
              title="Exportar Relatório em PDF A4"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF A4</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE PESQUISA E FILTROS */}
      <div className="bg-surface-card/90 backdrop-blur-md rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-2.5">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-on-surface-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-container border border-line rounded-xl text-xs text-on-surface font-medium focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-surface-container border border-line rounded-xl px-2.5 py-1.5">
            <span className="text-on-surface-muted font-semibold text-xs whitespace-nowrap">Tipo:</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-transparent text-xs text-on-surface focus:outline-none font-bold cursor-pointer"
            >
              <option value="" className="bg-surface-card text-on-surface">Todos</option>
              <option value="EXCESSO" className="bg-surface-card text-on-surface">Excesso de Stock</option>
              <option value="ROTURA" className="bg-surface-card text-on-surface">Rotura Frequente</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-container border border-line rounded-xl px-2.5 py-1.5">
            <span className="text-on-surface-muted font-semibold text-xs whitespace-nowrap">Estado:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-on-surface focus:outline-none font-bold cursor-pointer"
            >
              <option value="" className="bg-surface-card text-on-surface">Todos</option>
              <option value="POR_TRATAR" className="bg-surface-card text-on-surface">Por tratar</option>
              <option value="TRATADO" className="bg-surface-card text-on-surface">Tratado</option>
              <option value="NAO_CONSIDERADO" className="bg-surface-card text-on-surface">Não considerado</option>
            </select>
          </div>

          {report?.periodLabel && (
            <div className="ml-auto text-[11px] text-on-surface-muted font-medium hidden md:block">
              Período selecionado: <strong className="text-on-surface">{report.periodLabel}</strong>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink font-medium">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* CARTÕES DE RESUMO (KPIs) */}
          {(reportScope === 'STOCKS' || reportScope === 'TODOS') && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-surface-card rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[10px] sm:text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
                  Excesso de Stock
                </div>
                <div className="text-lg sm:text-2xl font-bold text-on-surface font-mono">
                  {report.metrics.excessCount}{' '}
                  <span className="text-xs font-normal text-on-surface-subtle font-sans">
                    ({report.metrics.excessBoxesTotal} cx)
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-on-surface-subtle truncate">
                  {report.metrics.distinctArticlesExcess} artigos distintos
                </div>
              </div>

              <div className="bg-surface-card rounded-2xl border border-danger-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[10px] sm:text-[11px] font-bold text-danger-ink uppercase tracking-wider">
                  Roturas / Revisão
                </div>
                <div className="text-lg sm:text-2xl font-bold text-danger-ink font-mono">
                  {report.metrics.ruptureCount}{' '}
                  <span className="text-xs font-normal text-on-surface-subtle font-sans">reg.</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-danger-ink/80 truncate">
                  Necessidade de rever parâmetros
                </div>
              </div>

              <div className="bg-surface-card rounded-2xl border border-danger-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[10px] sm:text-[11px] font-bold text-danger-ink uppercase tracking-wider">
                  Por Tratar
                </div>
                <div className="text-lg sm:text-2xl font-bold text-danger-ink font-mono">
                  {report.metrics.pendingTreatmentCount}{' '}
                  <span className="text-xs font-normal text-on-surface-subtle font-sans">pendentes</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-danger-ink/80 truncate">
                  A aguardar resolução operacional
                </div>
              </div>

              <div className="bg-amber-tint/70 rounded-2xl border border-amber-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[10px] sm:text-[11px] font-bold text-amber-ink uppercase tracking-wider">
                  Pendências Anteriores
                </div>
                <div className="text-lg sm:text-2xl font-bold text-on-surface font-mono">
                  {report.previousPendingMetrics.count}{' '}
                  <span className="text-xs font-normal text-on-surface-muted font-sans">
                    ({report.previousPendingMetrics.excessBoxesTotal} cx)
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-amber-ink truncate">
                  Abertas antes deste período
                </div>
              </div>
            </div>
          )}

          {/* KPIs específicos de PDE */}
          {reportScope === 'PDE' && report.pdeMetrics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="bg-surface-card rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
                  Total Pedidos PDE
                </div>
                <div className="text-2xl font-bold text-on-surface font-mono">
                  {report.pdeMetrics.totalCount}
                </div>
                <div className="text-[11px] text-on-surface-subtle">
                  Registados no período selecionado
                </div>
              </div>

              <div className="bg-danger-tint/70 rounded-2xl border border-danger-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-danger-ink uppercase tracking-wider">
                  PDE Pendentes
                </div>
                <div className="text-2xl font-bold text-danger-ink font-mono">
                  {report.pdeMetrics.pendingCount}
                </div>
                <div className="text-[11px] text-danger-ink/80">A aguardar decisão administrativa</div>
              </div>

              <div className="bg-success-tint/70 rounded-2xl border border-success-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-success-ink uppercase tracking-wider">
                  PDE Resolvidos
                </div>
                <div className="text-2xl font-bold text-success-ink font-mono">
                  {report.pdeMetrics.resolvedCount}
                </div>
                <div className="text-[11px] text-success-ink/80">Concluídos com ação tomada</div>
              </div>
            </div>
          )}

          {/* KPIs específicos de TAREFAS */}
          {reportScope === 'TAREFAS' && report.tasksMetrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-surface-card rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wider">
                  Total de Tarefas
                </div>
                <div className="text-xl sm:text-2xl font-bold text-on-surface font-mono">
                  {report.tasksMetrics.totalTasks}
                </div>
                <div className="text-[11px] text-on-surface-subtle">Distribuídas aos colaboradores</div>
              </div>

              <div className="bg-success-tint/70 rounded-2xl border border-success-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-success-ink uppercase tracking-wider">
                  Concluídas
                </div>
                <div className="text-xl sm:text-2xl font-bold text-success-ink font-mono">
                  {report.tasksMetrics.completedTasks}
                </div>
                <div className="text-[11px] text-success-ink/80">Executadas com sucesso</div>
              </div>

              <div className="bg-danger-tint/70 rounded-2xl border border-danger-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-danger-ink uppercase tracking-wider">
                  Não Feitas
                </div>
                <div className="text-xl sm:text-2xl font-bold text-danger-ink font-mono">
                  {report.tasksMetrics.notDoneTasks}
                </div>
                <div className="text-[11px] text-danger-ink/80">Com anomalia ou não executadas</div>
              </div>

              <div className="bg-amber-tint/70 rounded-2xl border border-amber-border p-3 sm:p-4 shadow-2xs space-y-1">
                <div className="text-[11px] font-bold text-amber-ink uppercase tracking-wider">
                  Taxa de Cumprimento
                </div>
                <div className="text-xl sm:text-2xl font-bold text-on-surface font-mono">
                  {report.tasksMetrics.globalCompletionRate}%
                </div>
                <div className="text-[11px] text-amber-ink">Média geral no período</div>
              </div>
            </div>
          )}

          {/* 1. SECÇÃO: EXCESSO DE STOCK */}
          {(reportScope === 'STOCKS' || reportScope === 'TODOS') && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-line">
                <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">
                  1. Excesso de Stock no Período ({report.dayExcessRecords.length})
                </h2>
                <span className="text-xs font-mono text-on-surface-muted">
                  Total caixas: {report.metrics.excessBoxesTotal} cx
                </span>
              </div>

              {report.dayExcessRecords.length === 0 ? (
                <div className="p-4 bg-surface-container rounded-xl text-xs text-on-surface-muted italic border border-line">
                  Nenhum registo de excesso de stock para os filtros e período selecionados.
                </div>
              ) : (
                <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
                  <div className="overflow-x-auto w-full max-w-full">
                    <table className="w-full text-left text-xs min-w-[720px]">
                      <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                        <tr>
                          <th className="py-2.5 px-3.5">SKU</th>
                          <th className="py-2.5 px-3.5">Artigo</th>
                          <th className="py-2.5 px-3.5 text-right">Caixas</th>
                          <th className="py-2.5 px-3.5">Tipo Data</th>
                          <th className="py-2.5 px-3.5">Data</th>
                          <th className="py-2.5 px-3.5">Lote</th>
                          <th className="py-2.5 px-3.5">Autor</th>
                          <th className="py-2.5 px-3.5">Tratamento</th>
                          <th className="py-2.5 px-3.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {report.dayExcessRecords.map(r => {
                          const isExpired = r.dateType === 'Validade' && isDateInPast(r.stockDate);

                          return (
                            <tr key={r.id} className="hover:bg-surface-container/60 transition-colors">
                              <td className="py-2.5 px-3.5 font-mono font-medium text-on-surface-muted whitespace-nowrap">
                                {r.articleSku}
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                                {r.articleDescription}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold text-on-surface whitespace-nowrap">
                                {r.boxes} cx
                              </td>
                              <td className="py-2.5 px-3.5 font-medium text-on-surface-muted whitespace-nowrap">
                                {r.dateType}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <span className={isExpired ? 'text-danger-ink font-bold' : 'text-on-surface-muted font-mono'}>
                                  {formatDatePt(r.stockDate)}
                                </span>
                                {isExpired && (
                                  <span className="ml-1 text-[10px] bg-danger-tint text-danger-ink px-1.5 py-0.5 rounded-full font-bold border border-danger-border">
                                    VENCIDA
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-on-surface-subtle whitespace-nowrap">
                                {r.lot || '—'}
                              </td>
                              <td className="py-2.5 px-3.5 text-on-surface whitespace-nowrap">
                                {r.authorName}
                              </td>
                              <td className="py-2.5 px-3.5 text-on-surface-muted font-mono whitespace-nowrap">
                                {formatDatePt(r.treatmentDate)}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <span
                                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getStockStatusBadgeClass(r.status)}`}
                                >
                                  {formatStockStatusLabel(r.status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. SECÇÃO: ROTURA FREQUENTE */}
          {(reportScope === 'STOCKS' || reportScope === 'TODOS') && (
            <div className="space-y-3 pt-3">
              <div className="flex items-center justify-between pb-1 border-b border-line">
                <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">
                  2. Rotura Frequente e Revisão de Parâmetros ({report.dayRuptureRecords.length})
                </h2>
              </div>

              {report.dayRuptureRecords.length === 0 ? (
                <div className="p-4 bg-surface-container rounded-xl text-xs text-on-surface-muted italic border border-line">
                  Nenhum registo de rotura frequente para os filtros e período selecionados.
                </div>
              ) : (
                <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
                  <div className="overflow-x-auto w-full max-w-full">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                        <tr>
                          <th className="py-2.5 px-3.5">SKU</th>
                          <th className="py-2.5 px-3.5">Artigo</th>
                          <th className="py-2.5 px-3.5">Indicação</th>
                          <th className="py-2.5 px-3.5">Contexto / Observação</th>
                          <th className="py-2.5 px-3.5">Autor</th>
                          <th className="py-2.5 px-3.5">Data Tratamento</th>
                          <th className="py-2.5 px-3.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {report.dayRuptureRecords.map(r => (
                          <tr key={r.id} className="hover:bg-surface-container/60 transition-colors">
                            <td className="py-2.5 px-3.5 font-mono font-medium text-on-surface-muted whitespace-nowrap">
                              {r.articleSku}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                              {r.articleDescription}
                            </td>
                            <td className="py-2.5 px-3.5 text-danger-ink font-bold whitespace-nowrap">
                              Revisão Requerida
                            </td>
                            <td className="py-2.5 px-3.5 text-on-surface-muted italic">
                              {r.observation || 'Sem observações adicionais'}
                            </td>
                            <td className="py-2.5 px-3.5 text-on-surface whitespace-nowrap">
                              {r.authorName}
                            </td>
                            <td className="py-2.5 px-3.5 text-on-surface-muted font-mono whitespace-nowrap">
                              {formatDatePt(r.treatmentDate)}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getStockStatusBadgeClass(r.status)}`}
                              >
                                {formatStockStatusLabel(r.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. SECÇÃO: PENDÊNCIAS ANTERIORES */}
          {(reportScope === 'STOCKS' || reportScope === 'TODOS') && report.previousPendingRecords.length > 0 && (
            <div className="space-y-3 pt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-danger-border">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <h2 className="text-sm font-bold text-danger-ink uppercase tracking-wide">
                    3. Pendências Anteriores por Tratar ({report.previousPendingRecords.length})
                  </h2>
                  <span className="text-[10px] sm:text-[11px] text-danger-ink bg-danger-tint px-2.5 py-0.5 rounded-full border border-danger-border font-semibold break-words">
                    Abertas antes de {formatDatePt(effectiveDate)}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-danger-ink shrink-0 self-start sm:self-auto">
                  Subtotal: {report.previousPendingMetrics.excessBoxesTotal} cx
                </span>
              </div>

              <div className="bg-surface-card rounded-2xl border border-danger-border shadow-xs overflow-hidden">
                <div className="overflow-x-auto w-full max-w-full">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead className="bg-danger-tint border-b border-danger-border text-danger-ink font-semibold">
                      <tr>
                        <th className="py-2.5 px-3.5">Tipo</th>
                        <th className="py-2.5 px-3.5">SKU</th>
                        <th className="py-2.5 px-3.5">Artigo</th>
                        <th className="py-2.5 px-3.5">Detalhe Operacional</th>
                        <th className="py-2.5 px-3.5">Data Registo</th>
                        <th className="py-2.5 px-3.5">Data Tratamento</th>
                        <th className="py-2.5 px-3.5">Autor</th>
                        <th className="py-2.5 px-3.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {report.previousPendingRecords.map(r => (
                        <tr key={r.id} className="hover:bg-surface-container/60 transition-colors">
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                r.type === 'EXCESSO'
                                  ? 'bg-amber-tint text-amber-ink border-amber-border'
                                  : 'bg-danger-tint text-danger-ink border-danger-border'
                              }`}
                            >
                              {r.type === 'EXCESSO' ? 'Excesso' : 'Rotura'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-medium text-on-surface-muted whitespace-nowrap">
                            {r.articleSku}
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                            {r.articleDescription}
                          </td>
                          <td className="py-2.5 px-3.5">
                            {r.type === 'EXCESSO' ? (
                              <span className="font-semibold text-on-surface-muted">
                                <span className="font-mono text-on-surface font-bold">{r.boxes}</span> cx
                                <span className="text-on-surface-subtle mx-1">·</span>
                                <span>{r.dateType} {formatDatePt(r.stockDate)}</span>
                              </span>
                            ) : (
                              <span className="text-danger-ink font-bold">Revisão Parâmetros</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-on-surface-subtle whitespace-nowrap">
                            {formatDatePt(r.registrationDate)}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-danger-ink font-bold whitespace-nowrap">
                            {formatDatePt(r.treatmentDate)}
                          </td>
                          <td className="py-2.5 px-3.5 text-on-surface whitespace-nowrap">
                            {r.authorName}
                          </td>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getStockStatusBadgeClass(r.status)}`}>
                              {formatStockStatusLabel(r.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. SECÇÃO: PEDIDOS DE QUALIDADE PDE */}
          {(reportScope === 'PDE' || reportScope === 'TODOS') && (
            <div className="space-y-3 pt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-line">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">
                    4. Pedidos de Qualidade (PDE) ({report.pdeRecords?.length || 0})
                  </h2>
                  <span className="text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded-full border border-line font-semibold">
                    {report.periodLabel || formatDatePt(effectiveDate)}
                  </span>
                </div>
                {report.pdeMetrics && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-danger-tint text-danger-ink border border-danger-border rounded-lg font-bold">
                      {report.pdeMetrics.pendingCount} Pendentes
                    </span>
                    <span className="px-2 py-0.5 bg-success-tint text-success-ink border border-success-border rounded-lg font-bold">
                      {report.pdeMetrics.resolvedCount} Resolvidos
                    </span>
                    {(report.pdeMetrics.notConsideredCount || 0) > 0 && (
                      <span className="px-2 py-0.5 bg-surface-container text-on-surface-muted border border-line rounded-lg font-bold">
                        {report.pdeMetrics.notConsideredCount} Não considerados
                      </span>
                    )}
                  </div>
                )}
              </div>

              {(!report.pdeRecords || report.pdeRecords.length === 0) ? (
                <div className="p-4 bg-surface-container rounded-xl text-xs text-on-surface-muted italic border border-line">
                  Nenhum pedido de PDE de qualidade registado para este período.
                </div>
              ) : (
                <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
                  <div className="overflow-x-auto w-full max-w-full">
                    <table className="w-full text-left text-xs min-w-[760px]">
                      <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                        <tr>
                          <th className="py-2.5 px-3.5">SKU</th>
                          <th className="py-2.5 px-3.5">Artigo</th>
                          <th className="py-2.5 px-3.5">Lote</th>
                          <th className="py-2.5 px-3.5">Validade</th>
                          <th className="py-2.5 px-3.5">Motivo de Qualidade</th>
                          <th className="py-2.5 px-3.5">Colaborador</th>
                          <th className="py-2.5 px-3.5 text-center">Fotos</th>
                          <th className="py-2.5 px-3.5">Estado</th>
                          <th className="py-2.5 px-3.5 text-right">Ação A4</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {report.pdeRecords.map(p => (
                          <tr key={p.id} className="hover:bg-surface-container/60 transition-colors">
                            <td className="py-2.5 px-3.5 font-mono font-medium text-on-surface-muted whitespace-nowrap">
                              {p.sku}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                              {p.articleDescription}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-on-surface-muted whitespace-nowrap">
                              {p.batchNumber}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-on-surface-muted whitespace-nowrap">
                              {formatDatePt(p.expirationDate)}
                            </td>
                            <td className="py-2.5 px-3.5 text-danger-ink font-medium">
                              {p.defectReason}
                            </td>
                            <td className="py-2.5 px-3.5 text-on-surface whitespace-nowrap">
                              {p.submittedByName}
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-mono text-on-surface-muted bg-surface-container px-2 py-0.5 rounded-full border border-line">
                                <Camera className="w-3 h-3 text-amber-ink" />
                                <span>{p.photos?.length || 0}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  p.status === 'RESOLVIDO'
                                    ? 'bg-success-tint text-success-ink border-success-border'
                                    : p.status === 'NAO_CONSIDERADO'
                                    ? 'bg-surface-container text-on-surface-muted border-line'
                                    : 'bg-danger-tint text-danger-ink border-danger-border'
                                }`}
                              >
                                {p.status === 'RESOLVIDO'
                                  ? 'Resolvido'
                                  : p.status === 'NAO_CONSIDERADO'
                                  ? 'Não considerado'
                                  : 'Pendente'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => exportSinglePdeA4Pdf(p)}
                                title="Gerar e imprimir Ficha PDE em formato A4"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-ink bg-amber-tint hover:bg-amber-brand/25 border border-amber-border transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Ficha A4</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. SECÇÃO: DESEMPENHO E CONCLUSÃO DE TAREFAS POR COLABORADOR */}
          {(reportScope === 'TAREFAS' || reportScope === 'TODOS') && (
            <div className="space-y-3 pt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-line">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-ink" />
                  <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">
                    5. Conclusão de Tarefas por Colaborador ({report.collaboratorTasks?.length || 0})
                  </h2>
                </div>
                <span className="text-xs text-on-surface-muted font-medium">
                  {report.periodLabel || formatDatePt(effectiveDate)}
                </span>
              </div>

              <div className="bg-surface-container border border-line rounded-xl px-3 py-2 text-[11px] text-on-surface-muted flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-on-surface">IPA ({effectiveDate.slice(0, 4)}):</strong> Tarefas (+5 concluída, -2 não feita, -3 por assinalar após domingo) · Dia 100% (+8) · Semana &gt;90% (+5 após domingo) · Stocks Excesso/Rotura (+1 registo, +6 tratado) · PDE (+4 registo, +9 resolvido)
                </span>
                <span className="text-on-surface-subtle font-medium">
                  Administradores e Gestores de Stocks & PDE não estão sujeitos a IPA · Reinicia anualmente
                </span>
              </div>

              {(!report.collaboratorTasks || report.collaboratorTasks.length === 0) ? (
                <div className="p-4 bg-surface-container rounded-xl text-xs text-on-surface-muted italic border border-line">
                  Nenhum colaborador com tarefas registadas para este período.
                </div>
              ) : (
                <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
                  <div className="overflow-x-auto w-full max-w-full">
                    <table className="w-full text-left text-xs min-w-[920px]">
                      <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                        <tr>
                          <th className="py-2.5 px-3.5">Nº Mec.</th>
                          <th className="py-2.5 px-3.5">Colaborador</th>
                          <th className="py-2.5 px-3.5 text-center">Total Tarefas</th>
                          <th className="py-2.5 px-3.5 text-center">Concluídas</th>
                          <th className="py-2.5 px-3.5 text-center">Não Feitas</th>
                          <th className="py-2.5 px-3.5 text-center">Por Assinalar</th>
                          <th className="py-2.5 px-3.5">
                            Taxa de Cumprimento ({reportPeriod === 'MES' ? 'Mês' : reportPeriod === 'ANO' ? 'Ano' : 'Dia'})
                          </th>
                          <th className="py-2.5 px-3.5">Taxa de Cumprimento Tarefas (Semana)</th>
                          <th className="py-2.5 px-3.5 text-right">IPA ({effectiveDate.slice(0, 4)})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {report.collaboratorTasks.map(c => {
                          const weeklyRate = c.weeklyCompletionRate ?? 0;
                          return (
                            <tr key={c.mecanographicNumber} className="hover:bg-surface-container/60 transition-colors">
                              <td className="py-2.5 px-3.5 font-mono font-bold text-on-surface-muted whitespace-nowrap">
                                {c.mecanographicNumber}
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                                {c.name}
                              </td>
                              <td className="py-2.5 px-3.5 text-center font-mono tabular-nums font-bold text-on-surface">
                                {c.totalTasks}
                              </td>
                              <td className="py-2.5 px-3.5 text-center font-mono tabular-nums font-bold text-success-ink">
                                <span className="inline-flex items-center gap-1 bg-success-tint text-success-ink px-2 py-0.5 rounded-full border border-success-border">
                                  <CheckCircle2 className="w-3 h-3 text-success" />
                                  {c.completedTasks}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-center font-mono tabular-nums font-bold text-danger-ink">
                                <span className="inline-flex items-center gap-1 bg-danger-tint text-danger-ink px-2 py-0.5 rounded-full border border-danger-border">
                                  <XCircle className="w-3 h-3 text-danger" />
                                  {c.notDoneTasks}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-center font-mono tabular-nums text-amber-ink">
                                <span className="inline-flex items-center gap-1 bg-amber-tint text-amber-ink px-2 py-0.5 rounded-full border border-amber-border">
                                  <Clock className="w-3 h-3 text-amber-ink" />
                                  {c.pendingTasks}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-surface-container rounded-full h-2 overflow-hidden border border-line-subtle">
                                    <div
                                      className={`h-full transition-all rounded-full ${
                                        c.completionRate >= 80
                                          ? 'bg-success'
                                          : c.completionRate >= 50
                                          ? 'bg-amber-brand'
                                          : 'bg-danger'
                                      }`}
                                      style={{ width: `${c.completionRate}%` }}
                                    />
                                  </div>
                                  <span className="font-mono tabular-nums font-bold text-xs text-on-surface">
                                    {c.completionRate}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-surface-container rounded-full h-2 overflow-hidden border border-line-subtle">
                                    <div
                                      className={`h-full transition-all rounded-full ${
                                        weeklyRate >= 80
                                          ? 'bg-success'
                                          : weeklyRate >= 50
                                          ? 'bg-amber-brand'
                                          : 'bg-danger'
                                      }`}
                                      style={{ width: `${weeklyRate}%` }}
                                    />
                                  </div>
                                  <span className="font-mono tabular-nums font-bold text-xs text-on-surface">
                                    {weeklyRate}%
                                  </span>
                                </div>
                              </td>
                              {c.annualScore?.eligible ? (
                                <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-black text-amber-ink whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-amber-tint border border-amber-border">
                                    {c.annualScore.totalPoints}
                                  </span>
                                </td>
                              ) : (
                                <td className="py-2.5 px-3.5 text-right text-[11px] font-semibold text-on-surface-subtle italic whitespace-nowrap">
                                  Isento
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

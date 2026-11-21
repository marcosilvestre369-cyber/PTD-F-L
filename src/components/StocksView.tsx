import React, { useState, useEffect } from 'react';
import { Collaborator, Article, StockRecord, StockType, StockStatus, StockDateType } from '../types/index.ts';
import { api } from '../services/api.ts';
import { formatDatePt, isDateInPast } from '../utils/date.ts';
import {
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  Search,
  Layers,
  Edit2,
  History,
  AlertCircle,
} from 'lucide-react';

interface StocksViewProps {
  currentUser: Collaborator;
  selectedDate: string;
}

export const StocksView: React.FC<StocksViewProps> = ({ currentUser, selectedDate }) => {
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [debouncedFilterSearch, setDebouncedFilterSearch] = useState<string>('');

  // Modal de Criação de Registo
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [recordType, setRecordType] = useState<StockType>('EXCESSO');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [articleSearchQuery, setArticleSearchQuery] = useState('');
  const [registrationDate, setRegistrationDate] = useState(selectedDate);
  const [boxes, setBoxes] = useState<number | ''>(1);
  const [dateType, setDateType] = useState<StockDateType>("R's");
  const [stockDate, setStockDate] = useState(selectedDate);
  const [lot, setLot] = useState('');
  const [observation, setObservation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Modal de Edição / Tratamento
  const [editingRecord, setEditingRecord] = useState<StockRecord | null>(null);
  const [editStatus, setEditStatus] = useState<StockStatus>('POR_TRATAR');
  const [editTreatmentDate, setEditTreatmentDate] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editResolutionNote, setEditResolutionNote] = useState('');
  const [editBoxes, setEditBoxes] = useState<number | ''>('');
  const [editDateType, setEditDateType] = useState<StockDateType>("R's");
  const [editStockDate, setEditStockDate] = useState('');
  const [editLot, setEditLot] = useState('');
  const [editObservation, setEditObservation] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Histórico modal
  const [historyRecord, setHistoryRecord] = useState<StockRecord | null>(null);

  const isAdmin = currentUser.role === 'ADMIN';
  const canManage = isAdmin || currentUser.role === 'ADMIN_2' || currentUser.role === 'GESTOR_STOCKS_PDE';

  useEffect(() => {
    setRegistrationDate(selectedDate);
    setStockDate(selectedDate);
  }, [selectedDate]);

  // Debounce da pesquisa de stocks para evitar pedidos excessivos a cada tecla
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedFilterSearch(filterSearch.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filterSearch]);

  // Carregar catálogo de artigos e colaboradores apenas uma vez ao montar
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.getArticles(true, controller.signal),
      api.getCollaborators(controller.signal),
    ])
      .then(([fetchedArticles, fetchedColabs]) => {
        setArticles(fetchedArticles);
        setCollaborators(fetchedColabs);
      })
      .catch(err => {
        if (!api.isAbortError(err)) {
          setError(err.message || 'Erro ao carregar catálogo e colaboradores.');
        }
      });
    return () => controller.abort();
  }, []);

  const loadStocks = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedStocks = await api.getStocks(
        {
          type: filterType || undefined,
          status: filterStatus || undefined,
          articleQuery: debouncedFilterSearch || undefined,
        },
        signal
      );
      setStocks(fetchedStocks);
    } catch (err: any) {
      if (api.isAbortError(err)) return;
      setError(err.message || 'Erro ao carregar dados de stock.');
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadStocks(controller.signal);
    return () => controller.abort();
  }, [filterType, filterStatus, debouncedFilterSearch]);

  const handleOpenCreate = (type: StockType) => {
    setRecordType(type);
    setRegistrationDate(selectedDate);
    setStockDate(selectedDate);
    setSelectedArticleId('');
    setArticleSearchQuery('');
    setBoxes(1);
    setDateType("R's");
    setLot('');
    setObservation('');
    setError(null);
    setFormWarning(null);
    setFormSuccess(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormWarning(null);
    setError(null);

    if (!selectedArticleId) {
      setError('Por favor selecione um artigo do catálogo.');
      return;
    }

    if (recordType === 'EXCESSO') {
      const numBoxes = Number(boxes);
      if (!Number.isInteger(numBoxes) || numBoxes <= 0) {
        setError('A quantidade em caixas deve ser um número inteiro superior a zero.');
        return;
      }
      if (!stockDate) {
        setError(`A data de ${dateType} é obrigatória.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await api.createStock({
        articleId: selectedArticleId,
        type: recordType,
        registrationDate,
        boxes: recordType === 'EXCESSO' ? Number(boxes) : undefined,
        dateType: recordType === 'EXCESSO' ? dateType : undefined,
        stockDate: recordType === 'EXCESSO' ? stockDate : undefined,
        lot: lot.trim() || undefined,
        observation: observation.trim() || undefined,
        needsReview: recordType === 'ROTURA' ? true : undefined,
      });

      if (res.warning) {
        setFormWarning(res.warning);
      }
      setFormSuccess('Registo gravado com sucesso no servidor!');
      await loadStocks();
      setTimeout(() => {
        setIsCreateModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar registo de stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const managerCollaborators = collaborators.filter(
    c => c.status === 'ATIVO' && (c.role === 'ADMIN' || c.role === 'ADMIN_2' || c.role === 'GESTOR_STOCKS_PDE')
  );

  const formatStockStatus = (status: string) => {
    if (status === 'TRATADO' || status === 'RESOLVIDO') return 'Tratado';
    if (status === 'NAO_CONSIDERADO') return 'Não considerado';
    return 'Por tratar';
  };

  const handleOpenEdit = (rec: StockRecord) => {
    setEditingRecord(rec);
    const normalizedStatus: StockStatus =
      (rec.status as string) === 'TRATADO' || (rec.status as string) === 'RESOLVIDO'
        ? 'TRATADO'
        : (rec.status as string) === 'NAO_CONSIDERADO'
        ? 'NAO_CONSIDERADO'
        : 'POR_TRATAR';
    setEditStatus(normalizedStatus);
    setEditTreatmentDate(rec.treatmentDate);
    setEditAssignedTo(rec.assignedTo || '');
    setEditResolutionNote(rec.resolutionNote || '');
    setEditBoxes(rec.boxes ?? '');
    setEditDateType(rec.dateType || "R's");
    setEditStockDate(rec.stockDate || '');
    setEditLot(rec.lot || '');
    setEditObservation(rec.observation || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setEditError(null);

    if (canManage && !editAssignedTo.trim()) {
      setEditError('A seleção do responsável atribuído é obrigatória para registar o tratamento.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await api.updateStock(editingRecord.id, {
        status: editStatus,
        treatmentDate: editTreatmentDate,
        assignedTo: editAssignedTo.trim(),
        resolutionNote: editResolutionNote,
        boxes: editingRecord.type === 'EXCESSO' && editBoxes !== '' ? Number(editBoxes) : undefined,
        dateType: editingRecord.type === 'EXCESSO' ? editDateType : undefined,
        stockDate: editingRecord.type === 'EXCESSO' ? editStockDate : undefined,
        lot: editLot,
        observation: editObservation,
      });
      setEditingRecord(null);
      await loadStocks();
    } catch (err: any) {
      setEditError(`Erro ao atualizar: ${err.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const dayRecords = stocks.filter(
    s => s.registrationDate === selectedDate || s.treatmentDate === selectedDate
  );

  const previousPending = stocks.filter(
    s => s.status === 'POR_TRATAR' && s.treatmentDate < selectedDate && s.registrationDate < selectedDate
  );

  const normalizeSearch = (val: string) =>
    val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const filteredArticles = articles.filter(a => {
    const q = normalizeSearch(articleSearchQuery.trim());
    if (!q) return true;
    return (
      normalizeSearch(a.description).includes(q) ||
      normalizeSearch(a.sku).includes(q) ||
      normalizeSearch(a.category || '').includes(q) ||
      (a.barcode ? normalizeSearch(a.barcode).includes(q) : false)
    );
  });

  const selectedArticle = articles.find(a => a.id === selectedArticleId) || null;

  const renderStockRow = (rec: StockRecord, isPrevious = false) => {
    const isOwner = rec.authorNumber === currentUser.mecanographicNumber;
    const canEdit = isOwner || canManage;
    const isExpired = rec.type === 'EXCESSO' && rec.dateType === 'Validade' && isDateInPast(rec.stockDate);

    return (
      <tr key={rec.id} className="hover:bg-surface-container/60 transition-colors">
        <td className="py-3 px-3.5 whitespace-nowrap">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              rec.type === 'EXCESSO'
                ? 'bg-amber-tint text-amber-ink border-amber-border'
                : 'bg-danger-tint text-danger-ink border-danger-border'
            }`}
          >
            {rec.type === 'EXCESSO' ? 'Excesso' : 'Rotura/Revisão'}
          </span>
        </td>

        <td className="py-3 px-3.5">
          <div className="font-bold text-on-surface leading-tight">
            {rec.articleDescription}
          </div>
          <div className="text-[11px] text-on-surface-muted font-mono">
            SKU: {rec.articleSku}
          </div>
        </td>

        <td className="py-3 px-3.5">
          {rec.type === 'EXCESSO' ? (
            <div className="space-y-0.5">
              <div className="font-semibold text-on-surface">
                <span className="font-mono text-on-surface font-bold">{rec.boxes}</span> cx
                <span className="text-on-surface-subtle mx-1">·</span>
                <span className={isExpired ? 'text-danger-ink font-bold' : 'text-on-surface-muted'}>
                  {rec.dateType} {formatDatePt(rec.stockDate)}
                </span>
                {isExpired && (
                  <span className="ml-1 text-[10px] bg-danger-tint text-danger-ink px-1.5 py-0.5 rounded-full font-bold border border-danger-border">
                    VENCIDA
                  </span>
                )}
              </div>
              {rec.lot && (
                <div className="text-[11px] text-on-surface-muted">
                  Lote: <span className="font-mono">{rec.lot}</span>
                </div>
              )}
              {rec.observation && (
                <div className="text-[11px] text-on-surface-subtle italic">
                  "{rec.observation}"
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="font-semibold text-danger-ink">
                Revisão de Parâmetros Necessária
              </div>
              {rec.observation && (
                <div className="text-[11px] text-on-surface-subtle italic">
                  "{rec.observation}"
                </div>
              )}
            </div>
          )}
        </td>

        {isPrevious && (
          <td className="py-3 px-3.5 whitespace-nowrap text-on-surface-muted font-mono text-[11px]">
            {formatDatePt(rec.registrationDate)}
          </td>
        )}

        {isPrevious && (
          <td className="py-3 px-3.5 whitespace-nowrap text-on-surface-muted font-mono text-[11px]">
            {formatDatePt(rec.treatmentDate)}
          </td>
        )}

        <td className="py-3 px-3.5 whitespace-nowrap">
          <div className="text-on-surface font-medium">{rec.authorName}</div>
          <div className="text-[10px] text-on-surface-subtle font-mono">
            {new Date(rec.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </td>

        {!isPrevious && (
          <td className="py-3 px-3.5 whitespace-nowrap">
            <div className="font-mono text-[11px] text-on-surface font-medium">
              {formatDatePt(rec.treatmentDate)}
            </div>
            {rec.assignedTo && (
              <div className="text-[10px] text-on-surface-muted">Resp: {rec.assignedTo}</div>
            )}
          </td>
        )}

        <td className="py-3 px-3.5 whitespace-nowrap">
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
              (rec.status as string) === 'TRATADO' || (rec.status as string) === 'RESOLVIDO'
                ? 'bg-success-tint text-success-ink border-success-border'
                : (rec.status as string) === 'NAO_CONSIDERADO'
                ? 'bg-surface-container text-on-surface-muted border-line'
                : 'bg-danger-tint text-danger-ink border-danger-border font-bold'
            }`}
          >
            {formatStockStatus(rec.status)}
          </span>
        </td>

        <td className="py-3 px-3.5 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            {canEdit && (
              <button
                onClick={() => handleOpenEdit(rec)}
                title={canManage ? 'Gerir / Tratar registo' : 'Corrigir o meu registo'}
                className="p-1.5 text-on-surface-muted hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {rec.history.length > 0 && (
              <button
                onClick={() => setHistoryRecord(rec)}
                title="Ver histórico de auditoria do registo"
                className="p-1.5 text-on-surface-subtle hover:text-on-surface rounded-lg hover:bg-surface-container cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-on-surface tracking-tight uppercase">
              STOCKS
            </h1>
            <span className="text-xs text-amber-ink font-mono font-semibold">
              · Frutas e Legumes
            </span>
          </div>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Registo operacional de excessos, roturas frequentes e ciclo de tratamento.
          </p>
        </div>

        {/* Botões de Ação para registar novo stock */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCreate('EXCESSO')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <PackagePlus className="w-4 h-4 text-amber-brand" />
            <span>+ Excesso de Stock</span>
          </button>

          <button
            onClick={() => handleOpenCreate('ROTURA')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-danger-tint hover:bg-danger-border/40 text-danger-ink border border-danger-border rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span>+ Rotura / Revisão</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa Integrada */}
      <div className="bg-surface-card/90 backdrop-blur-md rounded-2xl border border-line p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Caixa de Pesquisa */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-on-surface-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface-container border border-line rounded-xl text-xs text-on-surface font-medium focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
            />
          </div>

          {/* Filtros de Tipo e Estado */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
            <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-surface-container border border-line rounded-xl px-2.5 py-1.5">
              <span className="text-[11px] sm:text-xs text-on-surface-muted font-semibold whitespace-nowrap">Tipo:</span>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full sm:w-auto bg-transparent border-none text-[11px] sm:text-xs text-on-surface font-bold focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-surface-card text-on-surface">Todos</option>
                <option value="EXCESSO" className="bg-surface-card text-on-surface">Excesso de Stock</option>
                <option value="ROTURA" className="bg-surface-card text-on-surface">Rotura Frequente</option>
              </select>
            </div>

            <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-surface-container border border-line rounded-xl px-2.5 py-1.5">
              <span className="text-[11px] sm:text-xs text-on-surface-muted font-semibold whitespace-nowrap">Estado:</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full sm:w-auto bg-transparent border-none text-[11px] sm:text-xs text-on-surface font-bold focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-surface-card text-on-surface">Todos</option>
                <option value="POR_TRATAR" className="bg-surface-card text-on-surface">Por tratar</option>
                <option value="TRATADO" className="bg-surface-card text-on-surface">Tratado</option>
                <option value="NAO_CONSIDERADO" className="bg-surface-card text-on-surface">Não considerado</option>
              </select>
            </div>

            {(filterType || filterStatus || filterSearch) && (
              <button
                onClick={() => {
                  setFilterType('');
                  setFilterStatus('');
                  setFilterSearch('');
                }}
                className="text-xs text-amber-ink hover:text-on-surface font-bold underline cursor-pointer px-2 py-1"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1. OCORRÊNCIAS DO DIA SELECIONADO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
              Ocorrências do Dia ({formatDatePt(selectedDate)})
            </span>
            <span className="text-[11px] text-on-surface-subtle">
              · Adicionadas ou a tratar nesta data
            </span>
          </div>
          <span className="text-xs font-mono text-on-surface-muted">
            {dayRecords.length} registos
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-on-surface-muted">
            A carregar registos de stock...
          </div>
        ) : dayRecords.length === 0 ? (
          <div className="bg-surface-card rounded-2xl border border-line p-8 text-center space-y-2 shadow-xs">
            <Layers className="w-8 h-8 text-amber-brand mx-auto" />
            <div className="text-xs font-bold text-on-surface">
              Sem ocorrências de stock registadas para {formatDatePt(selectedDate)}
            </div>
            <p className="text-[11px] text-on-surface-muted max-w-sm mx-auto">
              Utilize os botões acima para registar excesso de stock em caixas ou sinalizar artigos em rotura frequente.
            </p>
          </div>
        ) : (
          <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                  <tr>
                    <th className="py-2.5 px-3.5">Tipo</th>
                    <th className="py-2.5 px-3.5">Artigo</th>
                    <th className="py-2.5 px-3.5">Detalhe Operacional</th>
                    <th className="py-2.5 px-3.5">Autor</th>
                    <th className="py-2.5 px-3.5">Tratamento</th>
                    <th className="py-2.5 px-3.5">Estado</th>
                    <th className="py-2.5 px-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {dayRecords.map(rec => renderStockRow(rec))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. PENDÊNCIAS ANTERIORES */}
      {previousPending.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-danger-border">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-danger-ink">
                Pendências Anteriores
              </span>
              <span className="text-[10px] sm:text-[11px] text-danger-ink bg-danger-tint px-2.5 py-0.5 rounded-full border border-danger-border font-semibold break-words">
                Abertas antes de {formatDatePt(selectedDate)}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-danger-ink shrink-0 self-start sm:self-auto">
              {previousPending.length} pendentes
            </span>
          </div>

          <div className="bg-surface-card rounded-2xl border border-danger-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left text-xs min-w-[780px]">
                <thead className="bg-danger-tint border-b border-danger-border text-danger-ink font-semibold">
                  <tr>
                    <th className="py-2.5 px-3.5">Tipo</th>
                    <th className="py-2.5 px-3.5">Artigo</th>
                    <th className="py-2.5 px-3.5">Detalhe Operacional</th>
                    <th className="py-2.5 px-3.5">Data Registo</th>
                    <th className="py-2.5 px-3.5">Data Tratamento</th>
                    <th className="py-2.5 px-3.5">Autor</th>
                    <th className="py-2.5 px-3.5">Estado</th>
                    <th className="py-2.5 px-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {previousPending.map(rec => renderStockRow(rec, true))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Registo de Stock */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-2xl shadow-xl border border-line max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-amber-brand flex items-center justify-between bg-hero-bg text-hero-fg">
              <div>
                <h2 className="text-base font-bold text-hero-fg tracking-tight">
                  {recordType === 'EXCESSO' ? 'Registar Excesso de Stock' : 'Sinalizar Rotura Frequente'}
                </h2>
                <p className="text-xs text-hero-muted">
                  {recordType === 'EXCESSO'
                    ? 'Registo diário de caixas em excesso com data R\'s ou Validade.'
                    : 'Registo de artigos em rotura que exigem revisão de parâmetros de encomenda.'}
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-hero-muted hover:text-hero-fg text-base cursor-pointer px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {formWarning && (
                <div className="p-3 bg-amber-tint border border-amber-border rounded-xl text-xs text-amber-ink flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-ink shrink-0" />
                  <span>{formWarning}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-success-tint border border-success-border rounded-xl text-xs text-success-ink flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Seletor de Tipo */}
              <div className="flex gap-1.5 p-1 bg-surface-container rounded-xl text-xs font-bold border border-line">
                <button
                  type="button"
                  onClick={() => setRecordType('EXCESSO')}
                  className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
                    recordType === 'EXCESSO'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-muted hover:text-on-surface'
                  }`}
                >
                  Excesso de Stock
                </button>
                <button
                  type="button"
                  onClick={() => setRecordType('ROTURA')}
                  className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
                    recordType === 'ROTURA'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-muted hover:text-on-surface'
                  }`}
                >
                  Rotura Frequente / Revisão
                </button>
              </div>

              {/* 5.1 Seleção do Artigo do Catálogo Comum */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-on-surface">
                  Artigo da Secção (Catálogo Oficial) *
                </label>

                {selectedArticle ? (
                  <div className="p-3 bg-surface-container border border-amber-border rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-amber-ink bg-amber-tint px-1.5 py-0.5 rounded border border-amber-border shrink-0">
                          SKU {selectedArticle.sku}
                        </span>
                        <strong className="text-xs sm:text-sm text-on-surface truncate">
                          {selectedArticle.description}
                        </strong>
                      </div>
                      <span className="text-[11px] text-on-surface-muted block mt-0.5">
                        {selectedArticle.category || 'Geral'} · Unidade: {selectedArticle.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArticleId('');
                        setError(null);
                      }}
                      className="text-xs font-bold text-danger-ink bg-danger-tint hover:bg-danger-border/40 border border-danger-border px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-on-surface-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Pesquisar por SKU, nome ou categoria..."
                        value={articleSearchQuery}
                        onChange={e => setArticleSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container border border-line rounded-xl text-xs text-on-surface font-medium focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-line-subtle border border-line rounded-xl bg-surface-card shadow-2xs">
                      {filteredArticles.length === 0 ? (
                        <div className="p-4 text-center text-xs text-on-surface-muted italic">
                          Nenhum artigo encontrado para "{articleSearchQuery}".
                        </div>
                      ) : (
                        filteredArticles.slice(0, 100).map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSelectedArticleId(a.id);
                              setArticleSearchQuery('');
                              setError(null);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-amber-tint/50 active:bg-amber-tint transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-amber-ink mr-2">[{a.sku}]</span>
                              <span className="font-semibold text-on-surface">{a.description}</span>
                              <span className="text-[11px] text-on-surface-muted ml-1.5">({a.unit})</span>
                            </div>
                            <span className="text-[10px] text-on-surface-muted bg-surface-container px-1.5 py-0.5 rounded border border-line shrink-0">
                              {a.category || 'Geral'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-on-surface-muted">
                      <span>
                        Toque num artigo para selecionar ({articles.length} no catálogo).
                      </span>
                      {filteredArticles.length > 100 && (
                        <span className="text-amber-ink font-medium">
                          A mostrar 100 de {filteredArticles.length}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Data do Registo Operacional */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  Data do Registo Operacional *
                </label>
                <input
                  type="date"
                  required
                  value={registrationDate}
                  onChange={e => setRegistrationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-medium"
                />
              </div>

              {/* Campos específicos de Excesso de Stock */}
              {recordType === 'EXCESSO' && (
                <div className="space-y-3 p-3.5 bg-surface-container rounded-xl border border-line">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface mb-1">
                        Quantidade em Caixas *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={boxes}
                        onChange={e => setBoxes(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full px-3 py-2 bg-surface-card border border-line rounded-xl text-xs text-on-surface font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      />
                      <p className="text-[10px] text-on-surface-muted mt-0.5">Número inteiro &gt; 0</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-on-surface mb-1">
                        Tipo de Data *
                      </label>
                      <select
                        value={dateType}
                        onChange={e => setDateType(e.target.value as StockDateType)}
                        className="w-full px-3 py-2 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand font-semibold"
                      >
                        <option value="R's">R's (Rótulo literal)</option>
                        <option value="Validade">Validade</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1">
                      Data {dateType === "R's" ? "de R's" : 'de Validade'} *
                    </label>
                    <input
                      type="date"
                      required
                      value={stockDate}
                      onChange={e => setStockDate(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1">
                      Lote (Facultativo)
                    </label>
                    <input
                      type="text"
                      value={lot}
                      onChange={e => setLot(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Campos específicos de Rotura / Revisão */}
              {recordType === 'ROTURA' && (
                <div className="p-3.5 bg-danger-tint rounded-xl border border-danger-border text-xs text-danger-ink space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-danger shrink-0" />
                    <span>Revisão de Parâmetros Necessária</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    O registo sinaliza a necessidade de revisão de encomenda. Não exige caixas nem data de validade.
                  </p>
                </div>
              )}

              {/* Observação Geral */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  Observação / Contexto (Facultativo)
                </label>
                <textarea
                  rows={2}
                  value={observation}
                  onChange={e => setObservation(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
                />
              </div>

              {/* Autor */}
              <div className="text-[11px] text-on-surface-muted bg-surface-container p-2.5 rounded-xl border border-line flex items-center justify-between">
                <div>
                  <span>Autor: </span>
                  <span className="font-bold text-on-surface">{currentUser.name}</span>
                </div>
                <span className="font-mono text-on-surface-subtle">Nº {currentUser.mecanographicNumber}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-on-surface-muted hover:bg-surface-container rounded-xl cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'A gravar...' : 'Gravar Registo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição e Tratamento de Stock */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-2xl shadow-xl border border-line max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-amber-brand flex items-center justify-between bg-hero-bg text-hero-fg">
              <div>
                <h2 className="text-base font-bold text-hero-fg tracking-tight">
                  {canManage ? 'Gerir e Tratar Registo de Stock' : 'Corrigir o Meu Registo'}
                </h2>
                <p className="text-xs text-hero-muted">
                  [{editingRecord.articleSku}] {editingRecord.articleDescription}
                </p>
              </div>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-hero-muted hover:text-hero-fg text-base cursor-pointer px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {canManage && (
                <div className="p-3.5 bg-surface-container rounded-xl border border-line space-y-3">
                  <div className="font-bold text-amber-ink uppercase tracking-wider text-[11px]">
                    Gestão Operacional (Privilégio de Decisão)
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-muted mb-1">
                        Estado Operacional
                      </label>
                      <select
                        value={editStatus}
                        onChange={e => setEditStatus(e.target.value as StockStatus)}
                        className="w-full px-2.5 py-1.5 bg-surface-card border border-line rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      >
                        <option value="POR_TRATAR">Por tratar</option>
                        <option value="TRATADO">Tratado</option>
                        <option value="NAO_CONSIDERADO">Não considerado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-muted mb-1">
                        Data de Tratamento
                      </label>
                      <input
                        type="date"
                        value={editTreatmentDate}
                        onChange={e => setEditTreatmentDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-muted mb-1">
                      Responsável Atribuído *
                    </label>
                    <select
                      required
                      value={editAssignedTo}
                      onChange={e => setEditAssignedTo(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface-card border border-line rounded-xl text-xs text-on-surface font-semibold focus:outline-none focus:ring-2 focus:ring-amber-brand"
                    >
                      <option value="" disabled>Selecione Administrador ou Gestor Stocks & PDE...</option>
                      {managerCollaborators.map(c => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.mecanographicNumber}) — {c.role === 'ADMIN' ? 'Admin' : c.role === 'ADMIN_2' ? 'Admin 2' : 'Gestor Stocks & PDE'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-muted mb-1">
                      Nota de Resolução
                    </label>
                    <input
                      type="text"
                      value={editResolutionNote}
                      onChange={e => setEditResolutionNote(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
                    />
                  </div>
                </div>
              )}

              {editingRecord.type === 'EXCESSO' && (
                <div className="space-y-3 p-3.5 bg-surface-container rounded-xl border border-line">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-muted mb-1">
                        Caixas (inteiro &gt; 0)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editBoxes}
                        onChange={e => setEditBoxes(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full px-3 py-1.5 bg-surface-card border border-line rounded-xl text-xs font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-on-surface-muted mb-1">
                        Tipo de Data
                      </label>
                      <select
                        value={editDateType}
                        onChange={e => setEditDateType(e.target.value as StockDateType)}
                        className="w-full px-3 py-1.5 bg-surface-card border border-line rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      >
                        <option value="R's">R's</option>
                        <option value="Validade">Validade</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-muted mb-1">
                        Data
                      </label>
                      <input
                        type="date"
                        value={editStockDate}
                        onChange={e => setEditStockDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-surface-card border border-line rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-on-surface-muted mb-1">
                        Lote
                      </label>
                      <input
                        type="text"
                        value={editLot}
                        onChange={e => setEditLot(e.target.value)}
                        className="w-full px-3 py-1.5 bg-surface-card border border-line rounded-xl text-xs font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-brand"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  Observação
                </label>
                <textarea
                  rows={2}
                  value={editObservation}
                  onChange={e => setEditObservation(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-container border border-line rounded-xl text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
                />
              </div>

              {editError && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink font-semibold">
                  {editError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-on-surface-muted hover:bg-surface-container rounded-xl cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? 'A gravar...' : 'Gravar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Auditoria */}
      {historyRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-2xl shadow-xl border border-line max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h2 className="text-base font-bold text-on-surface">
                Histórico de Alterações do Registo
              </h2>
              <button
                onClick={() => setHistoryRecord(null)}
                className="text-xs text-on-surface-muted hover:text-on-surface cursor-pointer font-bold px-2 py-1"
              >
                Fechar
              </button>
            </div>

            <p className="text-xs text-on-surface font-semibold bg-surface-container p-2.5 rounded-xl border border-line">
              [{historyRecord.articleSku}] {historyRecord.articleDescription}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {historyRecord.history.map((h, i) => (
                <div key={i} className="text-xs p-3 bg-surface-container rounded-xl border border-line">
                  <div className="flex justify-between font-bold text-on-surface">
                    <span>{h.action}</span>
                    <span className="font-mono text-[11px] text-on-surface-muted">
                      {new Date(h.timestamp).toLocaleString('pt-PT')}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-muted mt-0.5">Por: {h.authorName}</div>
                  <div className="text-[11px] text-on-surface mt-1 italic">{h.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Collaborator, Article, PdeRequest, PdeStatus } from '../types/index.ts';
import { api } from '../services/api.ts';
import { getTodayDateString } from '../utils/date.ts';
import { exportSinglePdeA4Pdf } from '../utils/pdfExport.ts';
import {
  FileText,
  Plus,
  Search,
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Trash2,
  Layers,
  Info,
  Download,
  Printer,
} from 'lucide-react';

interface PdeViewProps {
  currentUser: Collaborator;
  selectedDate: string;
}

const DEFECT_REASONS = [
  'Bolor / Podridão ativa',
  'Peso não conforme com ficha técnica',
  'Amadurecimento excessivo / Fruta passada',
  'Danos mecânicos / Esmagamento no transporte',
  'Presença de pragas / Insetos',
  'Temperatura de transporte inadequada',
  'Falta de frescura / Desidratação severa',
  'Outro defeito de qualidade',
];

export const PdeView: React.FC<PdeViewProps> = ({ currentUser }) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const canDecide = isAdmin || currentUser.role === 'GESTOR_STOCKS_PDE';

  const [pdes, setPdes] = useState<PdeRequest[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [myOnlyFilter, setMyOnlyFilter] = useState(false);

  // Modal Novo PDE
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [batchNumber, setBatchNumber] = useState('');

  // Data de hoje em formato YYYY-MM-DD (Lisboa)
  const todayStr = getTodayDateString();
  const [arrivalDate, setArrivalDate] = useState(todayStr);
  const [expirationDate, setExpirationDate] = useState('');
  const [defectReason, setDefectReason] = useState(DEFECT_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal de Resolução (Admin / Gestor)
  const [resolvingPde, setResolvingPde] = useState<PdeRequest | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<PdeStatus>('RESOLVIDO');
  const [decidedByNumber, setDecidedByNumber] = useState(currentUser.mecanographicNumber);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolvingLoading, setResolvingLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Modal Seguro de Confirmação de Eliminação
  const [deleteTargetPde, setDeleteTargetPde] = useState<PdeRequest | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Modal Visualização de Foto
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Refs de câmara e ficheiro
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [statusFilter, myOnlyFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pdeList, articleList, colabList] = await Promise.all([
        api.getPdes({
          status: statusFilter !== 'TODOS' ? statusFilter : undefined,
          myOnly: myOnlyFilter,
        }),
        api.getArticles(),
        api.getCollaborators(),
      ]);
      setPdes(pdeList);
      setArticles(articleList);
      setCollaborators(colabList);
    } catch (err) {
      console.error('Erro ao carregar PDEs:', err);
    } finally {
      setLoading(false);
    }
  };

  const decisionMakers = (() => {
    const managers = collaborators.filter(
      c => c.status === 'ATIVO' && (c.role === 'ADMIN' || c.role === 'GESTOR_STOCKS_PDE')
    );
    if (canDecide && !managers.some(c => c.mecanographicNumber === currentUser.mecanographicNumber)) {
      return [currentUser, ...managers];
    }
    return managers;
  })();

  // Filtragem de artigos para seleção no formulário
  const filteredArticles = articleSearch.trim()
    ? articles
        .filter(
          a =>
            a.sku.toLowerCase().includes(articleSearch.toLowerCase()) ||
            a.description.toLowerCase().includes(articleSearch.toLowerCase()) ||
            (a.category && a.category.toLowerCase().includes(articleSearch.toLowerCase()))
        )
        .slice(0, 15)
    : articles.slice(0, 12);

  // Tratamento de conversão de imagem para base64
  const handlePhotoFiles = (files: FileList | null) => {
    if (!files) return;
    const remainingSlots = 5 - photos.length;
    if (remainingSlots <= 0) {
      setFormError('Limite máximo de 5 fotografias atingido.');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result as string;
        if (result) {
          setPhotos(prev => {
            if (prev.length >= 5) return prev;
            return [...prev, result];
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Descarregar fotografia do PDE
  const handleDownloadPhoto = (photoDataUrl: string, filename?: string) => {
    try {
      const link = document.createElement('a');
      link.href = photoDataUrl;
      link.download = filename || `PDE_foto_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao descarregar fotografia:', err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedArticle) {
      setFormError('Selecione um artigo do catálogo da secção.');
      return;
    }

    if (!batchNumber.trim()) {
      setFormError('Indique o número do lote do artigo.');
      return;
    }

    if (arrivalDate !== todayStr) {
      setFormError(
        `O pedido de PDE só é válido se o artigo tiver chegado no próprio dia (${todayStr}). A data indicada (${arrivalDate}) não corresponde ao dia de hoje.`
      );
      return;
    }

    if (!expirationDate) {
      setFormError('Indique a data de validade do artigo.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createPde({
        articleId: selectedArticle.id,
        batchNumber: batchNumber.trim().toUpperCase(),
        arrivalDate,
        expirationDate,
        defectReason,
        notes: notes.trim() || undefined,
        photos,
      });

      setShowCreateModal(false);
      setSelectedArticle(null);
      setArticleSearch('');
      setBatchNumber('');
      setArrivalDate(todayStr);
      setExpirationDate('');
      setNotes('');
      setPhotos([]);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao submeter pedido de PDE.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveSubmit = async () => {
    if (!resolvingPde) return;
    if (!decidedByNumber.trim()) {
      setResolveError('Indique quem tomou a decisão.');
      return;
    }
    setResolvingLoading(true);
    setResolveError(null);
    try {
      await api.updatePdeStatus(resolvingPde.id, {
        status: resolutionStatus,
        decidedByNumber: decidedByNumber.trim(),
        resolutionNotes: resolutionNotes.trim() || undefined,
      });
      setResolvingPde(null);
      setResolutionNotes('');
      await loadData();
    } catch (err: any) {
      setResolveError(err.message || 'Erro ao atualizar estado do PDE.');
    } finally {
      setResolvingLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetPde) return;
    setDeleteLoading(true);
    try {
      await api.deletePde(deleteTargetPde.id);
      setDeleteTargetPde(null);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao apagar registo de PDE.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtragem local por texto de pesquisa
  const displayPdes = pdes.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.sku.toLowerCase().includes(q) ||
      p.articleDescription.toLowerCase().includes(q) ||
      p.batchNumber.toLowerCase().includes(q) ||
      p.submittedByName.toLowerCase().includes(q)
    );
  });

  // Métricas
  const totalCount = pdes.length;
  const pendingCount = pdes.filter(p => p.status === 'PENDENTE').length;
  const resolvedCount = pdes.filter(p => p.status === 'RESOLVIDO').length;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Cabeçalho da Aba PDE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary text-on-primary shadow-xs ring-1 ring-amber-brand/40">
              <FileText className="w-5 h-5 text-amber-brand" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-on-surface uppercase tracking-wide">
              PDE · PEDIDOS DE QUALIDADE
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-muted mt-1">
            Controlo de anomalias na receção de mercadoria. Válido apenas para artigos chegados no próprio dia.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateModal(true);
            setArrivalDate(todayStr);
            setFormError(null);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-on-primary bg-primary hover:bg-primary-hover active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 text-amber-brand" />
          <span>+ NOVO PEDIDO DE PDE</span>
        </button>
      </div>

      {/* KPI Cards Simplificados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface-card border border-line rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-on-surface-muted font-semibold mb-1">
            <span>Total de Pedidos</span>
            <Layers className="w-4 h-4 text-amber-ink" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-on-surface tabular-nums font-mono">
            {totalCount}
          </div>
          <span className="text-[11px] text-on-surface-subtle font-medium">Histórico acumulado</span>
        </div>

        <div className="bg-danger-tint/70 border border-danger-border rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-danger-ink font-semibold mb-1">
            <span>Pendentes</span>
            <AlertTriangle className="w-4 h-4 text-danger" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-danger-ink tabular-nums font-mono">
            {pendingCount}
          </div>
          <span className="text-[11px] text-danger-ink/80 font-medium">A aguardar decisão</span>
        </div>

        <div className="bg-success-tint/70 border border-success-border rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-success-ink font-semibold mb-1">
            <span>Resolvidos</span>
            <CheckCircle2 className="w-4 h-4 text-success" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-success-ink tabular-nums font-mono">
            {resolvedCount}
          </div>
          <span className="text-[11px] text-success-ink/80 font-medium">Fotos apagadas da BD</span>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="bg-surface-card/90 backdrop-blur-md border border-line rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Chips de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs no-scrollbar">
          {(['TODOS', 'PENDENTE', 'RESOLVIDO', 'NAO_CONSIDERADO'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
                statusFilter === st
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
              }`}
            >
              {st === 'TODOS'
                ? 'TODOS'
                : st === 'PENDENTE'
                ? 'PENDENTES'
                : st === 'RESOLVIDO'
                ? 'RESOLVIDOS'
                : 'NÃO CONSIDERADOS'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-on-surface-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-medium focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-on-surface font-semibold cursor-pointer whitespace-nowrap bg-surface-container px-2.5 py-1.5 rounded-xl border border-line">
            <input
              type="checkbox"
              checked={myOnlyFilter}
              onChange={e => setMyOnlyFilter(e.target.checked)}
              className="rounded accent-amber-brand cursor-pointer"
            />
            <span>Apenas Meus</span>
          </label>
        </div>
      </div>

      {/* Lista / Tabela de Pedidos de PDE */}
      <div className="bg-surface-card border border-line rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs font-semibold text-on-surface-muted">
            A carregar pedidos de PDE...
          </div>
        ) : displayPdes.length === 0 ? (
          <div className="py-16 text-center text-on-surface-muted space-y-2">
            <FileText className="w-10 h-10 text-amber-brand mx-auto" />
            <p className="text-sm font-bold text-on-surface">Nenhum pedido de PDE encontrado</p>
            <p className="text-xs text-on-surface-subtle">
              Clique em "+ NOVO PEDIDO DE PDE" para registar uma anomalia de qualidade.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {displayPdes.map(pde => {
              const isResolved = pde.status === 'RESOLVIDO';
              const isPending = pde.status === 'PENDENTE';
              const isNotConsidered = pde.status === 'NAO_CONSIDERADO';

              return (
                <div
                  key={pde.id}
                  className="p-4 sm:p-5 hover:bg-surface-container/50 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-on-surface bg-surface-container px-2 py-0.5 rounded-md border border-line">
                        SKU {pde.sku}
                      </span>
                      <span className="text-sm font-bold text-on-surface truncate">
                        {pde.articleDescription}
                      </span>
                      {pde.category && (
                        <span className="text-[11px] font-semibold text-amber-ink bg-amber-tint border border-amber-border px-2 py-0.5 rounded-md">
                          {pde.category}
                        </span>
                      )}

                      {/* Badge de Estado */}
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          isResolved
                            ? 'bg-success-tint text-success-ink border-success-border'
                            : isPending
                            ? 'bg-danger-tint text-danger-ink border-danger-border'
                            : isNotConsidered
                            ? 'bg-surface-container text-on-surface-muted border-line'
                            : 'bg-surface-container text-on-surface border-line'
                        }`}
                      >
                        {isNotConsidered ? 'NÃO CONSIDERADO' : pde.status}
                      </span>
                    </div>

                    {/* Dados de lote e datas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-surface-container p-2 rounded-lg border border-line">
                        <span className="block text-[10px] text-on-surface-muted font-semibold">LOTE</span>
                        <span className="font-mono font-bold text-on-surface">{pde.batchNumber}</span>
                      </div>
                      <div className="bg-surface-container p-2 rounded-lg border border-line">
                        <span className="block text-[10px] text-on-surface-muted font-semibold">CHEGADA</span>
                        <span className="font-bold text-on-surface">{pde.arrivalDate}</span>
                      </div>
                      <div className="bg-surface-container p-2 rounded-lg border border-line">
                        <span className="block text-[10px] text-on-surface-muted font-semibold">VALIDADE</span>
                        <span className="font-bold text-on-surface">{pde.expirationDate}</span>
                      </div>
                      <div className="bg-surface-container p-2 rounded-lg border border-line">
                        <span className="block text-[10px] text-on-surface-muted font-semibold">MOTIVO</span>
                        <span className="font-bold text-on-surface truncate block">{pde.defectReason}</span>
                      </div>
                    </div>

                    {pde.notes && (
                      <p className="text-xs text-on-surface-muted bg-surface-container p-2.5 rounded-lg border border-line">
                        <strong className="text-on-surface">Observações:</strong> {pde.notes}
                      </p>
                    )}

                    {/* Fotografias */}
                    {pde.photos && pde.photos.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-on-surface-muted font-semibold">
                            <Camera className="w-3.5 h-3.5 text-amber-ink" />
                            <span>Fotografias do Artigo ({pde.photos.length}/5)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              pde.photos.forEach((ph, idx) => {
                                setTimeout(() => {
                                  handleDownloadPhoto(ph, `PDE_${pde.sku}_${pde.batchNumber}_foto_${idx + 1}.jpg`);
                                }, idx * 250);
                              });
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold text-on-surface hover:bg-surface-hover bg-surface-container px-2.5 py-1 rounded-lg border border-line transition-colors cursor-pointer"
                            title="Descarregar todas as fotos deste pedido"
                          >
                            <Download className="w-3 h-3 text-amber-ink" />
                            <span>Descarregar Fotos ({pde.photos.length})</span>
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pde.photos.map((photo, idx) => (
                            <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-line shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setLightboxPhoto(photo)}
                                className="w-full h-full cursor-pointer block"
                                title="Ver foto ampliada"
                              >
                                <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Eye className="w-4 h-4 text-white" />
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadPhoto(photo, `PDE_${pde.sku}_${pde.batchNumber}_foto_${idx + 1}.jpg`);
                                }}
                                title="Descarregar foto"
                                className="absolute bottom-0.5 right-0.5 p-1 bg-black/70 hover:bg-amber-brand hover:text-on-secondary text-white rounded transition-colors cursor-pointer opacity-90 group-hover:opacity-100 shadow-xs"
                              >
                                <Download className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : isResolved ? (
                      <div className="text-[11px] text-success-ink italic bg-success-tint/60 p-2 rounded-lg border border-success-border flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                        <span>Processo resolvido pela administração: as fotografias foram apagadas da base de dados conforme as diretrizes de armazenamento.</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-on-surface-subtle italic">Sem fotografias anexadas.</span>
                    )}

                    {/* Resolução do Administrador / Gestor */}
                    {pde.resolvedAt && (
                      <div className="bg-amber-tint/70 border border-amber-border p-2.5 rounded-xl text-xs space-y-1 mt-2">
                        <div className="flex items-center justify-between font-bold text-on-surface">
                          <span>
                            Decisão: {isResolved ? 'Resolvido' : isNotConsidered ? 'Não Considerado' : pde.status}
                          </span>
                          <span className="text-[11px] font-normal text-on-surface-muted">
                            {new Date(pde.resolvedAt).toLocaleDateString('pt-PT')}
                          </span>
                        </div>
                        {pde.resolutionNotes && (
                          <p className="text-on-surface-muted font-medium">{pde.resolutionNotes}</p>
                        )}
                        <span className="text-[10px] text-on-surface-subtle block">
                          Decidido por: <strong className="text-on-surface-muted">{pde.resolvedByName}</strong> ({pde.resolvedByNumber})
                        </span>
                      </div>
                    )}

                    <div className="text-[10px] text-on-surface-subtle pt-1">
                      Submetido por: <strong className="text-on-surface-muted">{pde.submittedByName}</strong> ({pde.submittedByNumber}) em{' '}
                      {new Date(pde.submittedAt).toLocaleString('pt-PT')}
                    </div>
                  </div>

                  {/* Ações: Gerar PDE A4, Gestor/Admin decide, Utilizador/Admin apaga */}
                  <div className="flex flex-wrap sm:flex-col items-center gap-2 shrink-0 pt-2 md:pt-0">
                    <button
                      type="button"
                      onClick={() => exportSinglePdeA4Pdf(pde)}
                      title="Gerar e imprimir Ficha PDE em formato A4"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-ink bg-amber-tint hover:bg-amber-brand/25 border border-amber-border transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ficha PDE (A4)</span>
                    </button>

                    {canDecide && (
                      <button
                        onClick={() => {
                          setResolvingPde(pde);
                          setResolutionStatus(pde.status === 'NAO_CONSIDERADO' ? 'NAO_CONSIDERADO' : 'RESOLVIDO');
                          setDecidedByNumber(pde.resolvedByNumber || currentUser.mecanographicNumber);
                          setResolutionNotes(pde.resolutionNotes || '');
                          setResolveError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-on-primary bg-primary hover:bg-primary-hover transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Gerir / Decidir
                      </button>
                    )}

                    {(canDecide || pde.submittedByNumber === currentUser.mecanographicNumber) && (
                      <button
                        onClick={() => setDeleteTargetPde(pde)}
                        title={canDecide ? "Apagar registo de PDE" : "Apagar o meu pedido de PDE"}
                        className="p-1.5 rounded-lg text-danger-ink hover:bg-danger-tint border border-danger-border transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold sm:hidden">Apagar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Novo Pedido de PDE */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-surface-card rounded-3xl border border-line shadow-xl w-full max-w-2xl my-6 overflow-hidden">
            <div className="p-4 sm:p-6 bg-hero-bg text-hero-fg border-b-2 border-amber-brand flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-wide text-hero-fg">
                  NOVO PEDIDO DE PDE (QUALIDADE)
                </h3>
                <p className="text-xs text-hero-muted mt-0.5">
                  Registo oficial de anomalia de receção por artigo
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-hero-muted hover:text-hero-fg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs font-semibold text-danger-ink flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Seleção do Artigo do Catálogo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Artigo da Secção *
                </label>
                {selectedArticle ? (
                  <div className="p-3 bg-surface-container border border-amber-border rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-black text-amber-ink mr-2 bg-amber-tint px-1.5 py-0.5 rounded border border-amber-border">
                        SKU {selectedArticle.sku}
                      </span>
                      <strong className="text-sm text-on-surface">{selectedArticle.description}</strong>
                      <span className="text-xs text-on-surface-muted block mt-0.5">
                        {selectedArticle.category || 'Geral'} · Unidade: {selectedArticle.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedArticle(null)}
                      className="text-xs font-bold text-danger-ink bg-danger-tint hover:bg-danger-border/40 border border-danger-border px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
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
                        value={articleSearch}
                        onChange={e => setArticleSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-medium focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-line-subtle border border-line rounded-xl bg-surface-card shadow-2xs">
                      {filteredArticles.map(art => (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => {
                            setSelectedArticle(art);
                            setArticleSearch('');
                          }}
                          className="w-full text-left p-2.5 hover:bg-surface-container transition-colors flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div>
                            <span className="font-mono font-bold text-on-surface mr-2">{art.sku}</span>
                            <span className="font-semibold text-on-surface">{art.description}</span>
                          </div>
                          <span className="text-[10px] text-on-surface-muted bg-surface-container px-1.5 py-0.5 rounded border border-line">
                            {art.category || 'Geral'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Lote e Validade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                    Lote do Artigo *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchNumber}
                    onChange={e => setBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-mono font-bold focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                    Validade do Artigo *
                  </label>
                  <input
                    type="date"
                    required
                    value={expirationDate}
                    onChange={e => setExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-bold focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
                  />
                </div>
              </div>

              {/* 3. Dia em que Chegou */}
              <div className="space-y-1.5 bg-surface-container border border-line p-3 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                    Dia em que Chegou (Data de Receção) *
                  </label>
                  <span className="text-[10px] font-bold text-amber-ink bg-amber-tint border border-amber-border px-2 py-0.5 rounded-full">
                    Hoje: {todayStr}
                  </span>
                </div>
                <input
                  type="date"
                  required
                  value={arrivalDate}
                  onChange={e => setArrivalDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-card border border-line rounded-xl text-on-surface font-bold focus:ring-2 focus:ring-amber-brand focus:outline-none"
                />

                {arrivalDate === todayStr ? (
                  <p className="text-[11px] text-success-ink font-medium flex items-center gap-1.5 pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                    <span>Conforme as regras da secção: o artigo chegou no próprio dia ({todayStr}).</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-danger-ink font-bold flex items-center gap-1.5 pt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                    <span>Atenção: O PDE só é válido para artigos chegados no próprio dia ({todayStr}).</span>
                  </p>
                )}
              </div>

              {/* 4. Motivo do PDE de Qualidade */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Motivo de Qualidade *
                </label>
                <select
                  value={defectReason}
                  onChange={e => setDefectReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-semibold focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none cursor-pointer"
                >
                  {DEFECT_REASONS.map(reason => (
                    <option key={reason} value={reason} className="bg-surface-card text-on-surface">
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Observações */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Observações Adicionais
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-medium focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
                />
              </div>

              {/* 6. Fotografias */}
              <div className="space-y-2 pt-1 border-t border-line">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                    Fotografias de Evidência ({photos.length} / 5)
                  </label>
                  <span className="text-[10px] text-on-surface-muted font-medium">Máximo: 5 fotos</span>
                </div>

                {photos.length < 5 && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-line bg-surface-container hover:bg-surface-hover transition-colors text-xs font-bold text-on-surface cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-amber-ink" />
                      <span>Tirar Foto Agora</span>
                    </button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => handlePhotoFiles(e.target.files)}
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-line bg-surface-container hover:bg-surface-hover transition-colors text-xs font-bold text-on-surface cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-amber-ink" />
                      <span>Carregar Ficheiro</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handlePhotoFiles(e.target.files)}
                    />
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-line shadow-2xs group">
                        <img src={photo} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 p-1 bg-black/70 rounded-full text-white hover:bg-danger transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-surface-container p-2.5 rounded-xl border border-line text-[11px] text-on-surface-muted space-y-0.5">
                  <p className="font-semibold text-on-surface flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-amber-ink" />
                    <span>Privacidade & Armazenamento:</span>
                  </p>
                  <p>
                    As fotografias são guardadas na base de dados para análise da equipa de qualidade e administração, e são <strong>automaticamente apagadas</strong> assim que o pedido for concluído pelos administradores.
                  </p>
                </div>
              </div>

              {/* Botões do Rodapé do Formulário */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-muted hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || arrivalDate !== todayStr || !selectedArticle}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-on-primary bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                >
                  {submitting ? 'A submeter...' : 'Submeter Pedido de PDE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Decisão e Resolução (Administrador / Gestor) */}
      {resolvingPde && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface-card rounded-3xl border border-line shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 sm:p-6 bg-hero-bg text-hero-fg border-b-2 border-amber-brand flex items-center justify-between">
              <div>
                <h3 className="text-base font-black uppercase tracking-wide text-hero-fg">
                  DECISÃO DO PEDIDO DE PDE
                </h3>
                <p className="text-xs text-hero-muted mt-0.5 font-mono">
                  SKU {resolvingPde.sku} · Lote: {resolvingPde.batchNumber}
                </p>
              </div>
              <button
                onClick={() => setResolvingPde(null)}
                className="p-1.5 rounded-lg text-hero-muted hover:text-hero-fg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Decisão de Estado *
                </label>
                <select
                  value={resolutionStatus}
                  onChange={e => setResolutionStatus(e.target.value as PdeStatus)}
                  className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-bold focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none cursor-pointer"
                >
                  <option value="RESOLVIDO">RESOLVIDO (Concluir processo e apagar fotos)</option>
                  <option value="NAO_CONSIDERADO">NÃO CONSIDERADO</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Quem Tomou a Decisão *
                </label>
                <select
                  required
                  value={decidedByNumber}
                  onChange={e => setDecidedByNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-semibold focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>
                    Selecione Administrador ou Gestor Stocks & PDE...
                  </option>
                  {decisionMakers.map(c => (
                    <option key={c.id} value={c.mecanographicNumber}>
                      {c.name} ({c.mecanographicNumber}) — {c.role === 'ADMIN' ? 'Admin' : 'Gestor Stocks & PDE'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">
                  Notas de Resolução / Crédito Fornecedor
                </label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-container border border-line rounded-xl text-on-surface font-medium focus:bg-surface-card focus:ring-2 focus:ring-amber-brand focus:outline-none"
                />
              </div>

              {resolutionStatus === 'RESOLVIDO' && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink space-y-1">
                  <strong className="block font-bold">Aviso de Eliminação de Fotografias:</strong>
                  <p>
                    Ao marcar este pedido como <strong>RESOLVIDO</strong>, todas as fotografias associadas serão <strong>imediatamente apagadas da base de dados</strong>, preservando o registo histórico e a decisão administrativa.
                  </p>
                </div>
              )}

              {resolveError && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl text-xs text-danger-ink font-semibold">
                  {resolveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => {
                    setResolvingPde(null);
                    setResolveError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-muted hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={resolvingLoading}
                  onClick={handleResolveSubmit}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-on-primary bg-primary hover:bg-primary-hover disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {resolvingLoading ? 'A registar decisão...' : 'Confirmar Decisão'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Confirmação de Eliminação de PDE */}
      {deleteTargetPde && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-danger-border space-y-4">
            <div className="flex items-center gap-2 text-danger-ink">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              <h3 className="font-bold text-base">Apagar Pedido de PDE</h3>
            </div>
            <p className="text-xs text-on-surface-muted leading-relaxed">
              Tem a certeza de que pretende eliminar permanentemente o pedido de PDE para o artigo{' '}
              <strong className="text-on-surface">{deleteTargetPde.articleDescription}</strong> (Lote: <span className="font-mono">{deleteTargetPde.batchNumber}</span>)?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteTargetPde(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-muted hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-danger bg-danger hover:bg-danger-hover transition-colors shadow-xs cursor-pointer"
              >
                {deleteLoading ? 'A apagar...' : 'Apagar Definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox para Fotografias */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <img src={lightboxPhoto} alt="Visualização PDE" className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-2xl" />
            <div className="absolute -top-3 -right-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadPhoto(lightboxPhoto, `PDE_foto_${Date.now()}.jpg`)}
                title="Descarregar fotografia"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-brand text-on-secondary rounded-full shadow-lg hover:opacity-90 transition-opacity cursor-pointer text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Descarregar</span>
              </button>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="p-2 bg-surface-card text-on-surface border border-line rounded-full shadow-lg hover:bg-surface-container transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Collaborator, Article, ImportRecord, AuditLog, Role } from '../types/index.ts';
import { api } from '../services/api.ts';
import { formatDatePt, formatDateTimePt } from '../utils/date.ts';
import {
  Users,
  BookOpen,
  FileSpreadsheet,
  ScrollText,
  UserPlus,
  Plus,
  Trash2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Search,
  AlertTriangle,
  UserX,
  Download,
  Upload,
  Package,
  History,
  Pencil,
  X,
} from 'lucide-react';

interface AdminViewProps {
  currentUser: Collaborator;
  selectedDate: string;
  onWeekAdded?: (preferredDate?: string) => void;
}

interface ConfirmModalState {
  title: string;
  message: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => Promise<void> | void;
}

export const AdminView: React.FC<AdminViewProps> = ({ onWeekAdded }) => {
  const [subTab, setSubTab] = useState<'colaboradores' | 'catalogo' | 'importacao' | 'auditoria'>('colaboradores');

  // Modal de Confirmação Seguro
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Colaboradores
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('COLABORADOR');
  const [colabLoading, setColabLoading] = useState(false);
  const [colabError, setColabError] = useState<string | null>(null);
  const [colabSuccess, setColabSuccess] = useState<string | null>(null);
  const [editingColab, setEditingColab] = useState<{
    id: string;
    mecanographicNumber: string;
    name: string;
    role: Role;
    status: 'ATIVO' | 'DESATIVADO';
  } | null>(null);
  const [editColabLoading, setEditColabLoading] = useState(false);
  const [editColabError, setEditColabError] = useState<string | null>(null);

  // Catálogo
  const [articles, setArticles] = useState<Article[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('TODAS');
  const [newSku, setNewSku] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUnit, setNewUnit] = useState('KG');
  const [newBarcode, setNewBarcode] = useState('');
  const [newCategory, setNewCategory] = useState('Frutas');
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [articleSuccess, setArticleSuccess] = useState<string | null>(null);

  // Importação de Folhas de Cálculo (Excel .xlsx com folhas PTD e PTS)
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [importSourceType, setImportSourceType] = useState<'BOTH' | 'PTD' | 'PTS'>('BOTH');
  const [importWeek, setImportWeek] = useState('Semana 09/11 a 15/11');
  const [explicitWeekSelected, setExplicitWeekSelected] = useState(false);
  const [spreadsheetFile, setSpreadsheetFile] = useState<{ name: string; base64: string; size: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [detectedWeeks, setDetectedWeeks] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Auditoria
  const [audits, setAudits] = useState<AuditLog[]>([]);

  useEffect(() => {
    loadAll();
  }, [subTab]);

  const loadAll = async () => {
    try {
      if (subTab === 'colaboradores') {
        const colabs = await api.getCollaborators();
        setCollaborators(colabs);
      } else if (subTab === 'catalogo') {
        const arts = await api.getArticles(false);
        setArticles(arts);
      } else if (subTab === 'importacao') {
        const imps = await api.getImports();
        setImports(imps);
      } else if (subTab === 'auditoria') {
        const auds = await api.getAudits();
        setAudits(auds);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // --- Handlers de Colaborador ---
  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    setColabError(null);
    setColabSuccess(null);
    setColabLoading(true);

    try {
      await api.addCollaborator(newNumber.trim(), newName.trim(), newRole);
      setColabSuccess(`Colaborador ${newName.toUpperCase()} (${newNumber.trim()}) adicionado com sucesso.`);
      setNewNumber('');
      setNewName('');
      setNewRole('COLABORADOR');
      const updated = await api.getCollaborators();
      setCollaborators(updated);
    } catch (err: any) {
      setColabError(err.message || 'Erro ao adicionar colaborador.');
    } finally {
      setColabLoading(false);
    }
  };

  const handleChangeRoleClick = (c: Collaborator, targetRole: Role) => {
    if (c.role === targetRole) return;
    const roleLabels: Record<Role, string> = {
      ADMIN: 'Administrador (Gestão Global)',
      GESTOR_STOCKS_PDE: 'Gestor Stocks & PDE (Exclusivo Stocks e PDE)',
      COLABORADOR: 'Colaborador (Tarefas, Stocks e PDE)',
    };

    setConfirmModal({
      title: 'Alterar Perfil de Acesso',
      message: `Tem a certeza de que pretende alterar o perfil de ${c.name} (Nº ${c.mecanographicNumber}) para "${roleLabels[targetRole]}"? Esta ação será registada em auditoria.`,
      confirmLabel: 'Confirmar Alteração',
      isDanger: targetRole !== 'ADMIN',
      onConfirm: async () => {
        setColabError(null);
        setColabSuccess(null);
        try {
          await api.updateRole(c.id, targetRole);
          setColabSuccess(`Perfil de ${c.name} atualizado para ${roleLabels[targetRole]}.`);
          const updated = await api.getCollaborators();
          setCollaborators(updated);
        } catch (err: any) {
          setColabError(err.message || 'Erro ao alterar perfil.');
        }
      },
    });
  };

  const handleDeleteClick = (c: Collaborator) => {
    setConfirmModal({
      title: 'Apagar Colaborador',
      message: `Tem a certeza de que pretende remover permanentemente ${c.name} (Nº ${c.mecanographicNumber}) da lista de colaboradores da secção?`,
      confirmLabel: 'Apagar Definitivamente',
      isDanger: true,
      onConfirm: async () => {
        setColabError(null);
        setColabSuccess(null);
        try {
          await api.deleteCollaborator(c.id);
          setColabSuccess(`Colaborador ${c.name} removido da secção.`);
          const updated = await api.getCollaborators();
          setCollaborators(updated);
        } catch (err: any) {
          setColabError(err.message || 'Erro ao apagar colaborador.');
        }
      },
    });
  };

  const handleDeactivateClick = (c: Collaborator) => {
    setConfirmModal({
      title: 'Desativar Colaborador',
      message: `Pretende desativar o colaborador ${c.name} (Nº ${c.mecanographicNumber})? O acesso será bloqueado, mas todo o histórico de tarefas e registos de stocks será preservado.`,
      confirmLabel: 'Desativar Acesso',
      isDanger: true,
      onConfirm: async () => {
        setColabError(null);
        setColabSuccess(null);
        try {
          await api.deactivateCollaborator(c.id);
          setColabSuccess(`Colaborador ${c.name} desativado.`);
          const updated = await api.getCollaborators();
          setCollaborators(updated);
        } catch (err: any) {
          setColabError(err.message || 'Erro ao desativar colaborador.');
        }
      },
    });
  };

  const handleOpenEditColab = (c: Collaborator) => {
    setEditColabError(null);
    setEditingColab({
      id: c.id,
      mecanographicNumber: c.mecanographicNumber,
      name: c.name,
      role: c.role,
      status: c.status === 'DESATIVADO' ? 'DESATIVADO' : 'ATIVO',
    });
  };

  const handleSaveEditColab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColab) return;
    setEditColabError(null);
    setColabError(null);
    setColabSuccess(null);
    setEditColabLoading(true);

    try {
      const updatedColab = await api.updateCollaborator(editingColab.id, {
        mecanographicNumber: editingColab.mecanographicNumber.trim(),
        name: editingColab.name.trim(),
        role: editingColab.role,
        status: editingColab.status,
      });
      setColabSuccess(`Colaborador ${updatedColab.name} (Nº ${updatedColab.mecanographicNumber}) atualizado com sucesso.`);
      setEditingColab(null);
      const updated = await api.getCollaborators();
      setCollaborators(updated);
    } catch (err: any) {
      setEditColabError(err.message || 'Erro ao atualizar colaborador.');
    } finally {
      setEditColabLoading(false);
    }
  };

  // --- Handlers de Catálogo ---
  const handleAddArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setArticleError(null);
    setArticleSuccess(null);
    setArticleLoading(true);

    try {
      await api.addArticle({
        sku: newSku.trim(),
        description: newDescription.trim(),
        unit: newUnit,
        barcode: newBarcode.trim() || undefined,
        category: newCategory,
      });
      setArticleSuccess(`Artigo [${newSku.trim()}] adicionado com sucesso ao catálogo.`);
      setNewSku('');
      setNewDescription('');
      setNewBarcode('');
      const updated = await api.getArticles(false);
      setArticles(updated);
    } catch (err: any) {
      setArticleError(err.message || 'Erro ao adicionar artigo.');
    } finally {
      setArticleLoading(false);
    }
  };

  const handleToggleArticleActive = async (a: Article) => {
    try {
      await api.updateArticle(a.id, { active: !a.active });
      const updated = await api.getArticles(false);
      setArticles(updated);
    } catch (err: any) {
      setArticleError(err.message || 'Erro ao atualizar artigo.');
    }
  };

  // --- Handlers de Importação de Excel (.xlsx com folhas PTD e PTS) ---
  const handleSpreadsheetSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setImportMsg({
        success: false,
        text: `Formato inválido ("${file.name}"). Por favor carregue um ficheiro Excel (.xlsx) contendo as folhas PTD e/ou PTS.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target?.result as string;
      setSpreadsheetFile({
        name: file.name,
        base64,
        size: file.size,
      });
      setPreviewData(null);
      setDetectedWeeks([]);
      setImportMsg({
        success: true,
        text: `Ficheiro "${file.name}" carregado. Escolha a semana pretendida e clique em "Pré-visualizar Mapeamento" ou "Carregar para a App".`,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadTemplate = () => {
    const url = '/api/templates/schedule';
    const token = api.getToken();
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Falha ao transferir modelo');
        return res.blob();
      })
      .then(blob => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = 'Modelo_Escala_PTD_PTS.xlsx';
        link.click();
      })
      .catch(err => setImportMsg({ success: false, text: 'Erro ao descarregar modelo: ' + err.message }));
  };

  const handlePreviewExcel = async () => {
    if (!spreadsheetFile) {
      setImportMsg({ success: false, text: 'Selecione primeiro um ficheiro .xlsx com as folhas PTD / PTS.' });
      return;
    }
    setImportLoading(true);
    setImportMsg(null);
    try {
      const res = await api.previewExcelImport({
        fileBase64: spreadsheetFile.base64,
        fileName: spreadsheetFile.name,
        sourceType: importSourceType,
        week: importWeek,
        explicitWeekSelected,
      });
      setPreviewData(res);
      if (res.week && !explicitWeekSelected) {
        setImportWeek(res.week);
      }
      if (Array.isArray(res.detectedWeeks) && res.detectedWeeks.length > 0) {
        setDetectedWeeks(res.detectedWeeks);
      }
    } catch (err: any) {
      if (Array.isArray(err?.detectedWeeks) && err.detectedWeeks.length > 0) {
        setDetectedWeeks(err.detectedWeeks);
      }
      setImportMsg({ success: false, text: err.message || 'Erro ao pré-visualizar ficheiro .xlsx.' });
    } finally {
      setImportLoading(false);
    }
  };

  const handlePublishExcel = async () => {
    if (!previewData || !spreadsheetFile) return;
    setImportLoading(true);
    setImportMsg(null);

    try {
      const res = await api.publishExcelImport({
        fileBase64: spreadsheetFile.base64,
        fileName: spreadsheetFile.name,
        sourceType: importSourceType,
        week: importWeek,
        explicitWeekSelected,
      });
      setImportMsg({ success: true, text: res.message || 'Ficheiro .xlsx publicado com sucesso!' });
      setPreviewData(null);
      setSpreadsheetFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const updated = await api.getImports();
      setImports(updated);
      onWeekAdded?.(Array.isArray(res.importedDates) ? res.importedDates[0] : undefined);
    } catch (err: any) {
      setImportMsg({ success: false, text: err.message || 'Erro ao publicar ficheiro .xlsx.' });
    } finally {
      setImportLoading(false);
    }
  };

  const handleRevertImportClick = (id: string) => {
    setConfirmModal({
      title: 'Anular Versão Publicada',
      message: 'Tem a certeza de que pretende anular esta versão publicada? As tarefas e horários criados por esta versão serão revertidos.',
      confirmLabel: 'Anular Versão',
      isDanger: true,
      onConfirm: async () => {
        try {
          await api.revertImport(id);
          const updated = await api.getImports();
          setImports(updated);
          onWeekAdded?.();
        } catch (err: any) {
          setImportMsg({ success: false, text: `Erro ao anular importação: ${err.message}` });
        }
      },
    });
  };

  const handleUploadToApp = async () => {
    if (!spreadsheetFile) {
      setImportMsg({ success: false, text: 'Por favor, selecione primeiro um ficheiro Excel (.xlsx) para carregar.' });
      return;
    }
    setImportLoading(true);
    setImportMsg(null);
    try {
      const res = await api.publishExcelImport({
        fileBase64: spreadsheetFile.base64,
        fileName: spreadsheetFile.name,
        sourceType: importSourceType,
        week: importWeek,
        explicitWeekSelected,
      });
      setImportMsg({
        success: true,
        text: res.message || `Ficheiro "${spreadsheetFile.name}" carregado com sucesso (${res.tasksCount} tarefas e ${res.mealsCount} refeições).`,
      });
      setSpreadsheetFile(null);
      setPreviewData(null);
      setDetectedWeeks([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const updated = await api.getImports();
      setImports(updated);
      onWeekAdded?.(Array.isArray(res.importedDates) ? res.importedDates[0] : undefined);
    } catch (err: any) {
      if (Array.isArray(err?.detectedWeeks) && err.detectedWeeks.length > 0) {
        setDetectedWeeks(err.detectedWeeks);
      }
      setImportMsg({ success: false, text: err.message || 'Erro ao carregar ficheiro .xlsx para a app.' });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Cabeçalho da Administração */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-on-surface tracking-tight uppercase">
              ADMINISTRAÇÃO
            </h1>
            <span className="text-xs text-amber-ink bg-amber-tint px-2.5 py-0.5 rounded-full font-bold border border-amber-border">
              Acesso Restrito
            </span>
          </div>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Gestão de colaboradores, catálogo da secção, importação de tarefas (ptd / pts) e auditoria.
          </p>
        </div>
      </div>

      {/* Sub-navegação */}
      <div className="inline-flex flex-wrap items-center p-1 bg-surface-container rounded-xl text-xs font-bold border border-line gap-1">
        <button
          onClick={() => setSubTab('colaboradores')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            subTab === 'colaboradores' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-muted hover:text-on-surface'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Colaboradores</span>
        </button>

        <button
          onClick={() => setSubTab('catalogo')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            subTab === 'catalogo' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-muted hover:text-on-surface'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Catálogo da Secção</span>
        </button>

        <button
          onClick={() => setSubTab('importacao')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            subTab === 'importacao' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-muted hover:text-on-surface'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Importação (ptd / pts)</span>
        </button>

        <button
          onClick={() => setSubTab('auditoria')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            subTab === 'auditoria' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-muted hover:text-on-surface'
          }`}
        >
          <ScrollText className="w-3.5 h-3.5" />
          <span>Auditoria</span>
        </button>
      </div>

      {/* ================= 1. SUB-ABA: COLABORADORES ================= */}
      {subTab === 'colaboradores' && (
        <div className="space-y-6">
          {colabError && (
            <div className="p-3 bg-danger-tint border border-danger-border rounded-xl flex items-center gap-2 text-xs text-danger-ink font-medium">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{colabError}</span>
            </div>
          )}

          {colabSuccess && (
            <div className="p-3 bg-success-tint border border-success-border rounded-xl flex items-center gap-2 text-xs text-success-ink font-medium">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <span>{colabSuccess}</span>
            </div>
          )}

          {/* Adicionar Colaborador */}
          <div className="bg-surface-card rounded-2xl border border-line p-5 shadow-xs">
            <h2 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-ink" />
              <span>Adicionar Novo Colaborador à Secção</span>
            </h2>

            <form onSubmit={handleAddCollaborator} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-muted mb-1">
                  Nº Mecanográfico *
                </label>
                <input
                  type="text"
                  required
                  value={newNumber}
                  onChange={e => setNewNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand uppercase font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">
                  Perfil de Acesso
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as Role)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-semibold"
                >
                  <option value="COLABORADOR">Colaborador (Tarefas, Stocks e PDE)</option>
                  <option value="GESTOR_STOCKS_PDE">Gestor Stocks & PDE (Exclusivo Stocks e PDE com decisão)</option>
                  <option value="ADMIN">Administrador (Gestão Global)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={colabLoading || !newNumber.trim() || !newName.trim()}
                  className="w-full py-2 bg-primary hover:bg-primary-hover disabled:bg-surface-container disabled:text-on-surface-subtle disabled:cursor-not-allowed text-on-primary font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {colabLoading ? 'A registar...' : 'Criar Colaborador'}
                </button>
              </div>
            </form>
          </div>

          {/* Tabela de Colaboradores */}
          <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                  Colaboradores Registados ({collaborators.length})
                </h3>
                <p className="text-[11px] text-on-surface-muted">
                  Administrador da secção: 56359 MARCO SILVESTRE.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                  <tr>
                    <th className="py-2.5 px-3.5">Nº Mecanográfico</th>
                    <th className="py-2.5 px-3.5">Colaborador</th>
                    <th className="py-2.5 px-3.5">Perfil</th>
                    <th className="py-2.5 px-3.5">Estado</th>
                    <th className="py-2.5 px-3.5 text-right">Ações de Gestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {collaborators.map(c => {
                    const isDeactivated = c.status === 'DESATIVADO';

                    return (
                      <tr key={c.id} className={`hover:bg-surface-container/60 transition-colors ${isDeactivated ? 'opacity-60' : ''}`}>
                        <td className="py-2.5 px-3.5 font-mono font-bold text-on-surface">
                          {c.mecanographicNumber}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-on-surface">
                          {c.name}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              c.role === 'ADMIN'
                                ? 'bg-amber-tint text-amber-ink border-amber-border'
                                : c.role === 'GESTOR_STOCKS_PDE'
                                ? 'bg-surface-container text-on-surface border-line'
                                : 'bg-surface-container text-on-surface-muted border-line'
                            }`}
                          >
                            {c.role === 'ADMIN' && <Shield className="w-3 h-3 text-amber-ink" />}
                            {c.role === 'GESTOR_STOCKS_PDE' && <Package className="w-3 h-3 text-amber-ink" />}
                            <span>
                              {c.role === 'ADMIN'
                                ? 'ADMINISTRADOR'
                                : c.role === 'GESTOR_STOCKS_PDE'
                                ? 'GESTOR STOCKS & PDE'
                                : 'COLABORADOR'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isDeactivated
                                ? 'bg-danger-tint text-danger-ink border-danger-border'
                                : 'bg-success-tint text-success-ink border-success-border'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {!isDeactivated && (
                            <select
                              value={c.role}
                              onChange={e => handleChangeRoleClick(c, e.target.value as Role)}
                              title="Alterar perfil de acesso do colaborador"
                              className="px-2 py-1 text-[11px] font-bold bg-surface-container border border-line rounded-lg text-on-surface focus:outline-none focus:ring-1 focus:ring-amber-brand cursor-pointer"
                            >
                              <option value="COLABORADOR">Colaborador</option>
                              <option value="GESTOR_STOCKS_PDE">Gestor Stocks & PDE</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                          )}

                          <button
                            onClick={() => handleOpenEditColab(c)}
                            title="Editar dados do colaborador"
                            className="px-2.5 py-1 text-[11px] font-bold text-amber-ink bg-amber-tint hover:bg-amber-border/30 border border-amber-border rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Editar</span>
                          </button>

                          {!isDeactivated && (
                            <button
                              onClick={() => handleDeactivateClick(c)}
                              title="Desativar colaborador (bloqueia o acesso mantendo o histórico)"
                              className="px-2.5 py-1 text-[11px] font-medium text-on-surface-muted bg-surface-container hover:bg-surface-hover border border-line rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <UserX className="w-3 h-3" />
                              <span className="hidden sm:inline">Desativar</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteClick(c)}
                            title="Apagar colaborador permanentemente"
                            className="px-2.5 py-1 text-[11px] font-bold text-danger-ink bg-danger-tint hover:bg-danger-border/40 border border-danger-border rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3 text-danger" />
                            <span>Apagar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= 2. SUB-ABA: CATÁLOGO ================= */}
      {subTab === 'catalogo' && (
        <div className="space-y-6">
          {articleError && (
            <div className="p-3 bg-danger-tint border border-danger-border rounded-xl flex items-center gap-2 text-xs text-danger-ink font-medium">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{articleError}</span>
            </div>
          )}

          {articleSuccess && (
            <div className="p-3 bg-success-tint border border-success-border rounded-xl flex items-center gap-2 text-xs text-success-ink font-medium">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <span>{articleSuccess}</span>
            </div>
          )}

          {/* Adicionar Artigo */}
          <div className="bg-surface-card rounded-2xl border border-line p-5 shadow-xs">
            <h2 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-ink" />
              <span>Novo Artigo no Catálogo Único da Secção</span>
            </h2>

            <form onSubmit={handleAddArticle} className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-muted mb-1">SKU *</label>
                <input
                  type="text"
                  required
                  value={newSku}
                  onChange={e => setNewSku(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono text-on-surface"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-on-surface-muted mb-1">Descrição Oficial *</label>
                <input
                  type="text"
                  required
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand uppercase text-on-surface font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Unidade</label>
                <select
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand text-on-surface font-medium"
                >
                  <option value="KG">KG</option>
                  <option value="UN">UN</option>
                  <option value="CX">CX</option>
                  <option value="PC">PC</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">Categoria</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand text-on-surface font-medium"
                >
                  <option value="Frutas">Frutas</option>
                  <option value="Legumes">Legumes</option>
                  <option value="Especialidades">Especialidades</option>
                  <option value="Biológicos">Biológicos</option>
                  <option value="Frutos Secos">Frutos Secos</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={articleLoading || !newSku.trim() || !newDescription.trim()}
                  className="w-full py-2 bg-primary hover:bg-primary-hover disabled:bg-surface-container disabled:text-on-surface-subtle text-on-primary font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Gravar Artigo
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Artigos */}
          <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
            <div className="p-4 border-b border-line space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-wider text-on-surface">
                  Catálogo Oficial da Secção ({articles.length} artigos registados)
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-on-surface-subtle absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Pesquisar por SKU, nome ou código..."
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-surface-container border border-line rounded-xl text-xs text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand"
                  />
                </div>
              </div>

              {/* Filtro por Categorias */}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-line-subtle text-xs">
                {['TODAS', 'Frutas', 'Legumes', 'Especialidades', 'Frutas Bio', 'Legumes Bio', 'Especialidades Bio'].map(cat => {
                  const count = cat === 'TODAS' ? articles.length : articles.filter(a => a.category === cat).length;
                  const isSelected = catalogCategoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatalogCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-primary text-on-primary border-primary shadow-xs'
                          : 'bg-surface-container hover:bg-surface-hover text-on-surface-muted border-line'
                      }`}
                    >
                      <span>{cat === 'TODAS' ? 'Todas as Categorias' : cat}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-amber-brand text-on-secondary' : 'bg-surface-card text-on-surface'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
              const filtered = articles.filter(a => {
                if (catalogCategoryFilter !== 'TODAS' && a.category !== catalogCategoryFilter) return false;
                const q = catalogSearch.toLowerCase().trim();
                return !q || a.description.toLowerCase().includes(q) || a.sku.includes(q) || (a.barcode && a.barcode.includes(q));
              });
              const displayed = filtered.slice(0, 100);

              return (
                <div>
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-container sticky top-0 border-b border-line text-on-surface-muted font-semibold z-10 backdrop-blur-xs">
                        <tr>
                          <th className="py-2.5 px-3.5">SKU</th>
                          <th className="py-2.5 px-3.5">Descrição do Artigo</th>
                          <th className="py-2.5 px-3.5">Unidade</th>
                          <th className="py-2.5 px-3.5">Código de Barras</th>
                          <th className="py-2.5 px-3.5">Categoria</th>
                          <th className="py-2.5 px-3.5">Estado</th>
                          <th className="py-2.5 px-3.5 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle font-mono">
                        {displayed.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-on-surface-subtle font-sans italic">
                              Nenhum artigo encontrado com os filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          displayed.map(a => (
                            <tr key={a.id} className={`hover:bg-surface-container/60 transition-colors ${!a.active ? 'opacity-50' : ''}`}>
                              <td className="py-2.5 px-3.5 font-bold text-on-surface">{a.sku}</td>
                              <td className="py-2.5 px-3.5 font-sans font-semibold text-on-surface">{a.description}</td>
                              <td className="py-2.5 px-3.5 text-on-surface-muted">{a.unit}</td>
                              <td className="py-2.5 px-3.5 text-on-surface-subtle">{a.barcode || '—'}</td>
                              <td className="py-2.5 px-3.5 font-sans">
                                <span className="text-[10px] bg-amber-tint px-2 py-0.5 rounded-full text-amber-ink font-medium border border-amber-border">
                                  {a.category}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 font-sans">
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${a.active ? 'bg-success-tint text-success-ink border-success-border' : 'bg-surface-container text-on-surface-muted border-line'}`}>
                                  {a.active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-sans">
                                <button
                                  onClick={() => handleToggleArticleActive(a)}
                                  className="text-[11px] text-amber-ink hover:text-on-surface font-bold underline cursor-pointer"
                                >
                                  {a.active ? 'Desativar' : 'Reativar'}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 bg-surface-container border-t border-line flex justify-between items-center text-xs text-on-surface-muted font-sans">
                    <span>
                      Total correspondente: <strong className="text-on-surface">{filtered.length}</strong> artigos.
                    </span>
                    {filtered.length > 100 && (
                      <span className="text-amber-ink font-medium">
                        A mostrar os primeiros 100 resultados. Utilize a pesquisa acima para encontrar um artigo específico.
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= 3. SUB-ABA: IMPORTAÇÃO (PTD / PTS) ================= */}
      {subTab === 'importacao' && (
        <div className="space-y-6">
          <div className="bg-surface-card rounded-2xl border border-line p-5 shadow-xs space-y-5">
            <div>
              <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-ink" />
                <span>Importação de Tarefas e Horários (Ficheiro Excel .xlsx)</span>
              </h2>
              <p className="text-xs text-on-surface-muted mt-1">
                Carregue um ficheiro <strong className="text-on-surface">.xlsx</strong> onde a informação de <strong className="text-on-surface">ptd app</strong> (tarefas principais e refeições) é retirada da folha <strong className="text-on-surface">PTD</strong> e a informação de <strong className="text-on-surface">pts app</strong> (tarefas secundárias) é retirada da folha <strong className="text-on-surface">PTS</strong>.
              </p>
            </div>

            {/* Passo 1: Seleção de Folhas a Extrair */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-on-surface-muted">
                1. Folhas a Extrair do Ficheiro (.xlsx) *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setImportSourceType('BOTH');
                    setPreviewData(null);
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    importSourceType === 'BOTH'
                      ? 'bg-amber-tint/70 border-amber-brand ring-2 ring-amber-brand/20'
                      : 'bg-surface-container border-line hover:bg-surface-hover'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${importSourceType === 'BOTH' ? 'bg-primary text-on-primary' : 'bg-surface-card text-on-surface-muted border border-line'}`}>
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span>Folhas PTD + PTS (Completo)</span>
                      {importSourceType === 'BOTH' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-ink shrink-0" />}
                    </div>
                    <p className="text-[11px] text-on-surface-muted mt-0.5">
                      Extrai ptd app da folha <strong>PTD</strong> e pts app da folha <strong>PTS</strong> no mesmo ficheiro .xlsx.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportSourceType('PTD');
                    setPreviewData(null);
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    importSourceType === 'PTD'
                      ? 'bg-amber-tint/70 border-amber-brand ring-2 ring-amber-brand/20'
                      : 'bg-surface-container border-line hover:bg-surface-hover'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${importSourceType === 'PTD' ? 'bg-primary text-on-primary' : 'bg-surface-card text-on-surface-muted border border-line'}`}>
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span>Apenas Folha PTD (ptd app)</span>
                      {importSourceType === 'PTD' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-ink shrink-0" />}
                    </div>
                    <p className="text-[11px] text-on-surface-muted mt-0.5">
                      Extrai tarefas principais diárias e horários de refeição da folha <strong>PTD</strong>.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportSourceType('PTS');
                    setPreviewData(null);
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    importSourceType === 'PTS'
                      ? 'bg-amber-tint/70 border-amber-brand ring-2 ring-amber-brand/20'
                      : 'bg-surface-container border-line hover:bg-surface-hover'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${importSourceType === 'PTS' ? 'bg-primary text-on-primary' : 'bg-surface-card text-on-surface-muted border border-line'}`}>
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span>Apenas Folha PTS (pts app)</span>
                      {importSourceType === 'PTS' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-ink shrink-0" />}
                    </div>
                    <p className="text-[11px] text-on-surface-muted mt-0.5">
                      Extrai tarefas secundárias da semana a partir da folha <strong>PTS</strong>.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Passo 2: Seleção de Semana */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-on-surface-muted">
                2. Escolha a Semana a que se referem *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  'Semana 09/11 a 15/11',
                  'Semana 16/11 a 22/11',
                  'Semana 23/11 a 29/11',
                  'Semana 30/11 a 06/12',
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setImportWeek(preset);
                      setExplicitWeekSelected(true);
                      setPreviewData(null);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      importWeek === preset
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container hover:bg-surface-hover text-on-surface border-line'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={importWeek}
                onChange={e => {
                  setImportWeek(e.target.value);
                  setExplicitWeekSelected(true);
                  setPreviewData(null);
                }}
                placeholder="Ex: Semana 16/11 a 22/11"
                className="w-full sm:w-96 px-3 py-2 bg-surface-container border border-line rounded-xl focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand text-on-surface font-semibold text-xs"
              />
              {detectedWeeks.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="block text-[11px] font-bold text-amber-ink">
                    Semanas detetadas no ficheiro ({detectedWeeks.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {detectedWeeks.map(dw => (
                      <button
                        key={dw}
                        type="button"
                        onClick={() => {
                          setImportWeek(dw);
                          setExplicitWeekSelected(true);
                          setPreviewData(null);
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          importWeek === dw
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-surface-card hover:bg-surface-container text-on-surface border-line'
                        }`}
                      >
                        {dw}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Passo 3: Ficheiro .xlsx */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-on-surface-muted">
                3. Selecione o Ficheiro Excel (.xlsx) *
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-line hover:border-amber-brand bg-surface-container/60 hover:bg-surface-container p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={e => handleSpreadsheetSelect(e.target.files)}
                />
                <div className="w-12 h-12 rounded-2xl bg-amber-tint border border-amber-border flex items-center justify-center text-amber-ink mx-auto transition-colors">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                {spreadsheetFile ? (
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-on-surface flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span>{spreadsheetFile.name}</span>
                    </div>
                    <span className="text-xs text-on-surface-muted font-mono">
                      {(spreadsheetFile.size / 1024).toFixed(1)} KB · Ficheiro .xlsx pronto para extração
                    </span>
                    <p className="text-[11px] text-on-surface-subtle font-sans">
                      Clique aqui se desejar substituir o ficheiro selecionado
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-on-surface">
                      Clique aqui para selecionar o ficheiro .xlsx (com folhas PTD e PTS)
                    </p>
                    <p className="text-[11px] text-on-surface-muted mt-0.5">
                      Folha "PTD" → ptd app (principais e refeição) · Folha "PTS" → pts app (secundárias)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Ações: Carregar para a App e Pré-visualizar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-line">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleUploadToApp}
                  disabled={importLoading || !spreadsheetFile}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4 text-amber-brand" />
                  <span>{importLoading ? 'A carregar para a app...' : 'Carregar para a App'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePreviewExcel}
                  disabled={importLoading || !spreadsheetFile}
                  className="px-4 py-2.5 bg-surface-container hover:bg-surface-hover text-on-surface border border-line text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Pré-visualizar Mapeamento
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-amber-tint hover:bg-amber-brand/25 text-amber-ink font-bold rounded-lg border border-amber-border transition-colors cursor-pointer flex items-center gap-1.5 text-[11px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Modelo Excel (.xlsx com folhas PTD e PTS)</span>
                </button>
              </div>
            </div>
          </div>

          {importMsg && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${
                importMsg.success
                  ? 'bg-success-tint border-success-border text-success-ink'
                  : 'bg-danger-tint border-danger-border text-danger-ink'
              }`}
            >
              {importMsg.success ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> : <AlertCircle className="w-4 h-4 text-danger shrink-0" />}
              <span>{importMsg.text}</span>
            </div>
          )}

          {/* Pré-visualização com correspondências */}
          {previewData && (
            <div className="bg-surface-card rounded-2xl border border-line p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">
                    Pré-visualização da Extração ({previewData.sourceType === 'BOTH' ? 'Folhas PTD + PTS' : `Folha ${previewData.sourceType}`} · {previewData.week})
                  </h3>
                  <p className="text-xs text-on-surface-muted mt-0.5">
                    Folha <strong>PTD</strong>: {previewData.ptdTasksCount ?? 0} tarefas e {previewData.generatedMeals?.length ?? 0} refeições · Folha <strong>PTS</strong>: {previewData.ptsTasksCount ?? 0} tarefas secundárias.
                    {Array.isArray(previewData.sheetsFound) && previewData.sheetsFound.length > 0 && (
                      <span className="text-on-surface-subtle"> (Folhas lidas: {previewData.sheetsFound.join(', ')})</span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePublishExcel}
                  disabled={importLoading}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {importLoading ? 'A publicar...' : 'Confirmar e Publicar'}
                </button>
              </div>

              {previewData.warnings.length > 0 && (
                <div className="p-3 bg-amber-tint border border-amber-border rounded-xl text-xs text-amber-ink space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Avisos de Mapeamento:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5">
                    {previewData.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto overflow-x-auto border border-line rounded-xl">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead className="bg-surface-container sticky top-0 text-on-surface-muted font-semibold border-b border-line">
                    <tr>
                      <th className="p-2.5">Folha</th>
                      <th className="p-2.5">Colaborador Mapeado</th>
                      <th className="p-2.5">Data</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Descrição</th>
                      <th className="p-2.5">Refeição</th>
                      <th className="p-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {previewData.previewRows.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-surface-container/60 transition-colors">
                        <td className="p-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            r.source === 'PTS' || r.taskType === 'SECUNDARIA'
                              ? 'bg-amber-tint text-amber-ink border-amber-border'
                              : 'bg-surface-container text-on-surface border-line'
                          }`}>
                            {r.source || (r.taskType === 'SECUNDARIA' ? 'PTS' : 'PTD')}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-on-surface">
                          {r.collaboratorName} {r.mecanographicNumber && `(${r.mecanographicNumber})`}
                        </td>
                        <td className="p-2.5 font-mono text-on-surface-muted">{formatDatePt(r.date)}</td>
                        <td className="p-2.5 font-medium text-on-surface-muted">{r.taskType}</td>
                        <td className="p-2.5 text-on-surface">{r.description}</td>
                        <td className="p-2.5 font-mono text-on-surface font-bold">{r.mealTime || '—'}</td>
                        <td className="p-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.isMatched ? 'bg-success-tint text-success-ink border-success-border' : 'bg-danger-tint text-danger-ink border-danger-border'}`}>
                            {r.isMatched ? 'Confirmado' : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Histórico dos Últimos 6 Ficheiros Carregados */}
          <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden">
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-ink" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                  Histórico dos Últimos 6 Ficheiros Carregados
                </h3>
              </div>
              <span className="text-[11px] text-on-surface-muted font-medium">
                {Math.min(imports.length, 6)} de {imports.length} registos
              </span>
            </div>

            {imports.length === 0 ? (
              <div className="p-8 text-center text-xs text-on-surface-muted">
                Nenhum ficheiro .xlsx carregado até ao momento. Utilize o formulário acima para carregar o primeiro ficheiro com as folhas PTD e PTS.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-surface-container border-b border-line text-on-surface-muted font-semibold">
                    <tr>
                      <th className="p-2.5">Ficheiro</th>
                      <th className="p-2.5">Folha / Destino</th>
                      <th className="p-2.5">Semana</th>
                      <th className="p-2.5">Versão</th>
                      <th className="p-2.5">Carregado por</th>
                      <th className="p-2.5">Data / Hora</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {imports.slice(0, 6).map(imp => (
                      <tr key={imp.id} className="hover:bg-surface-container/60 transition-colors">
                        <td className="p-2.5 font-medium text-on-surface flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-amber-ink shrink-0" />
                          <span>{imp.fileName}</span>
                        </td>
                        <td className="p-2.5 font-semibold text-on-surface">
                          {imp.sourceType === 'PTD' ? 'Folha PTD → ptd app' : 'Folha PTS → pts app'}
                        </td>
                        <td className="p-2.5 text-on-surface-muted font-medium">{imp.week}</td>
                        <td className="p-2.5 font-mono font-bold text-on-surface">v{imp.version}</td>
                        <td className="p-2.5 text-on-surface-muted">{imp.publishedBy || imp.uploadedBy}</td>
                        <td className="p-2.5 font-mono text-on-surface-subtle">
                          {imp.publishedAt ? formatDateTimePt(imp.publishedAt) : (imp.uploadedAt ? formatDateTimePt(imp.uploadedAt) : '—')}
                        </td>
                        <td className="p-2.5">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${imp.status === 'PUBLICADO' ? 'bg-success-tint text-success-ink border-success-border' : 'bg-surface-container text-on-surface-muted border-line'}`}>
                            {imp.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right">
                          {imp.status === 'PUBLICADO' && (
                            <button
                              onClick={() => handleRevertImportClick(imp.id)}
                              className="text-danger-ink hover:underline text-[11px] font-bold cursor-pointer"
                            >
                              Anular Versão
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 4. SUB-ABA: AUDITORIA ================= */}
      {subTab === 'auditoria' && (
        <div className="bg-surface-card rounded-2xl border border-line shadow-xs overflow-hidden space-y-4 p-5">
          <div>
            <h2 className="text-sm font-bold text-on-surface">
              Registo de Auditoria Operacional
            </h2>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Rastreio de todas as operações sensíveis na secção (sem gravação de credenciais ou palavras-passe).
            </p>
          </div>

          <div className="border border-line rounded-xl overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container sticky top-0 border-b border-line text-on-surface-muted font-semibold backdrop-blur-xs">
                <tr>
                  <th className="py-2.5 px-3.5">Data e Hora</th>
                  <th className="py-2.5 px-3.5">Autor</th>
                  <th className="py-2.5 px-3.5">Ação</th>
                  <th className="py-2.5 px-3.5">Entidade</th>
                  <th className="py-2.5 px-3.5">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle font-mono text-[11px]">
                {audits.map(a => (
                  <tr key={a.id} className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2.5 px-3.5 text-on-surface-subtle whitespace-nowrap">
                      {formatDateTimePt(a.timestamp)}
                    </td>
                    <td className="py-2.5 px-3.5 font-sans font-medium text-on-surface whitespace-nowrap">
                      {a.authorName} ({a.authorNumber})
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-tint text-amber-ink border border-amber-border">
                        {a.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-on-surface-muted whitespace-nowrap">{a.entity}</td>
                    <td className="py-2.5 px-3.5 font-sans text-on-surface">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL EDITAR COLABORADOR ================= */}
      {editingColab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full shadow-2xl border border-line overflow-hidden">
            <div className="bg-hero-bg px-5 py-4 text-hero-fg flex items-center justify-between border-b-2 border-amber-brand">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-brand" />
                <h3 className="text-sm font-bold tracking-tight">Editar Colaborador</h3>
              </div>
              <button
                type="button"
                disabled={editColabLoading}
                onClick={() => setEditingColab(null)}
                className="p-1 text-hero-muted hover:text-hero-fg rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditColab} className="p-5 space-y-4 text-xs">
              {editColabError && (
                <div className="p-3 bg-danger-tint border border-danger-border rounded-xl flex items-center gap-2 text-danger-ink font-medium">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                  <span>{editColabError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">
                  Nº Mecanográfico *
                </label>
                <input
                  type="text"
                  required
                  value={editingColab.mecanographicNumber}
                  onChange={e =>
                    setEditingColab(prev => (prev ? { ...prev, mecanographicNumber: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-muted mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editingColab.name}
                  onChange={e =>
                    setEditingColab(prev => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand uppercase font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-on-surface-muted mb-1">
                    Perfil de Acesso
                  </label>
                  <select
                    value={editingColab.role}
                    onChange={e =>
                      setEditingColab(prev => (prev ? { ...prev, role: e.target.value as Role } : null))
                    }
                    className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-semibold"
                  >
                    <option value="COLABORADOR">Colaborador</option>
                    <option value="GESTOR_STOCKS_PDE">Gestor Stocks & PDE</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-on-surface-muted mb-1">
                    Estado
                  </label>
                  <select
                    value={editingColab.status}
                    onChange={e =>
                      setEditingColab(prev =>
                        prev ? { ...prev, status: e.target.value as 'ATIVO' | 'DESATIVADO' } : null
                      )
                    }
                    className="w-full px-3 py-2 bg-surface-container border border-line rounded-xl text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand font-semibold"
                  >
                    <option value="ATIVO">ATIVO</option>
                    <option value="DESATIVADO">DESATIVADO</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line-subtle">
                <button
                  type="button"
                  disabled={editColabLoading}
                  onClick={() => setEditingColab(null)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editColabLoading || !editingColab.mecanographicNumber.trim() || !editingColab.name.trim()}
                  className="px-4 py-2 text-xs font-bold bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {editColabLoading ? 'A guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL SEGURO DE CONFIRMAÇÃO ================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 border ${confirmModal.isDanger ? 'bg-danger-tint text-danger-ink border-danger-border' : 'bg-amber-tint text-amber-ink border-amber-border'}`}>
                {confirmModal.isDanger ? <AlertTriangle className="w-5 h-5 text-danger" /> : <Shield className="w-5 h-5 text-amber-ink" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-on-surface">{confirmModal.title}</h3>
                <p className="text-xs text-on-surface-muted mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-xs font-semibold text-on-surface-muted bg-surface-container hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={async () => {
                  setIsConfirming(true);
                  try {
                    await confirmModal.onConfirm();
                  } finally {
                    setIsConfirming(false);
                    setConfirmModal(null);
                  }
                }}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs ${
                  confirmModal.isDanger
                    ? 'bg-danger hover:bg-danger-hover text-on-danger'
                    : 'bg-primary hover:bg-primary-hover text-on-primary'
                }`}
              >
                {isConfirming ? 'A executar...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

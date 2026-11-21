import React, { useState, useEffect, useRef } from 'react';
import { Collaborator, InAppNotification } from '../types/index.ts';
import { api } from '../services/api.ts';
import { Calendar, User, LogOut, ShieldCheck, Bell, X, Package, ClipboardList, CheckCheck, Sun, Moon } from 'lucide-react';

interface AvailableDate {
  date: string;
  label: string;
  week: string;
}

interface NavbarProps {
  currentUser: Collaborator;
  activeTab: 'tarefas' | 'stocks' | 'pde' | 'relatorio' | 'admin';
  onTabChange: (tab: 'tarefas' | 'stocks' | 'pde' | 'relatorio' | 'admin') => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  availableDates: AvailableDate[];
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  selectedDate,
  onDateChange,
  availableDates,
  onLogout,
  theme,
  onToggleTheme,
}) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const isAdmin2 = currentUser.role === 'ADMIN_2';
  const isAnyAdmin = isAdmin || isAdmin2;
  const isGestorStocksPde = currentUser.role === 'GESTOR_STOCKS_PDE';
  const isManagerBell = isAnyAdmin || isGestorStocksPde;
  const canViewTasks = currentUser.role !== 'GESTOR_STOCKS_PDE';

  // Notificações na App
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [toastNotif, setToastNotif] = useState<InAppNotification | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const previousNotifIdsRef = useRef<Set<string>>(new Set());
  const isFetchingNotifsRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const toastTimeoutRef = useRef<number | null>(null);

  const fetchNotifications = async (force = false, signal?: AbortSignal) => {
    if (typeof document !== 'undefined' && document.hidden && !force) return;
    if (isFetchingNotifsRef.current) return;
    const now = Date.now();
    if (!force && now - lastFetchAtRef.current < 5000) return;

    isFetchingNotifsRef.current = true;
    try {
      const list = await api.getNotifications(signal);
      lastFetchAtRef.current = Date.now();
      // Detetar se há nova notificação que não existia previamente
      if (previousNotifIdsRef.current.size > 0) {
        const newlyAdded = list.find(n => !n.read && !previousNotifIdsRef.current.has(n.id));
        if (newlyAdded) {
          setToastNotif(newlyAdded);
          if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
          }
          toastTimeoutRef.current = window.setTimeout(() => setToastNotif(null), 8000);
        }
      }
      previousNotifIdsRef.current = new Set(list.map(n => n.id));
      setNotifications(list);
    } catch (err) {
      if (!api.isAbortError(err)) {
        console.warn('Erro ao carregar notificações:', err);
      }
    } finally {
      isFetchingNotifsRef.current = false;
    }
  };

  useEffect(() => {
    previousNotifIdsRef.current = new Set();
    lastFetchAtRef.current = 0;
    setIsNotifOpen(false);
    const controller = new AbortController();
    fetchNotifications(true, controller.signal);

    // Polling moderado (30s) e pausado quando o separador está oculto
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        fetchNotifications(false);
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchNotifications(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [currentUser.id]);

  useEffect(() => {
    fetchNotifications(false);
  }, [activeTab]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getTargetTabForNotification = (notif: InAppNotification): 'tarefas' | 'stocks' | 'pde' => {
    if (notif.category === 'STOCK' || notif.stockId) return 'stocks';
    if (notif.category === 'PDE' || notif.pdeId) return 'pde';
    return canViewTasks ? 'tarefas' : 'stocks';
  };

  const handleOpenNotification = async (notif: InAppNotification) => {
    if (!notif.read) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notif.id ? { ...n, read: true } : n))
        );
      } catch (err) {
        console.warn('Erro ao desmarcar notificação:', err);
      }
    }
    setToastNotif(null);
    setIsNotifOpen(false);
    onTabChange(getTargetTabForNotification(notif));
    if (notif.date && (isAnyAdmin || availableDates.some(d => d.date === notif.date))) {
      onDateChange(notif.date);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setToastNotif(null);
    } catch (err) {
      console.warn('Erro ao marcar todas como lidas:', err);
    }
  };

  // Colaborador: não abre janela nenhuma; direciona diretamente para a nova tarefa e desmarca a notificação.
  // Admin / Gestor Stocks & PDE: abre a lista de novas entradas de Stocks e PDE adicionadas pelos colaboradores.
  const handleBellClick = async () => {
    if (isManagerBell) {
      setIsNotifOpen(prev => !prev);
      setToastNotif(null);
      return;
    }

    const targetNotif = notifications.find(n => !n.read) || notifications[0];
    if (targetNotif) {
      await handleOpenNotification(targetNotif);
    } else {
      onTabChange('tarefas');
    }
  };

  // Agrupar datas por semana para organização clara no seletor
  const weeksMap = availableDates.reduce<Record<string, AvailableDate[]>>((acc, item) => {
    if (!acc[item.week]) acc[item.week] = [];
    acc[item.week].push(item);
    return acc;
  }, {});

  // Função auxiliar para abreviar os rótulos de data em dispositivos móveis
  const formatShortDate = (label: string, date: string) => {
    const parts = date.split('-');
    const dayMonth = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
    const lower = label.toLowerCase();
    let weekday = '';
    if (lower.includes('seg')) weekday = 'Seg';
    else if (lower.includes('ter')) weekday = 'Ter';
    else if (lower.includes('qua')) weekday = 'Qua';
    else if (lower.includes('qui')) weekday = 'Qui';
    else if (lower.includes('sex')) weekday = 'Sex';
    else if (lower.includes('sáb') || lower.includes('sab')) weekday = 'Sáb';
    else if (lower.includes('dom')) weekday = 'Dom';

    return weekday ? `${weekday} ${dayMonth}` : dayMonth;
  };

  const getToastActionLabel = (notif: InAppNotification) => {
    const tab = getTargetTabForNotification(notif);
    if (tab === 'stocks') return 'Ver Stock →';
    if (tab === 'pde') return 'Ver PDE →';
    return 'Ver Tarefa →';
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-surface-card/90 backdrop-blur-md border-b border-line shadow-2xs max-w-full overflow-hidden">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-1.5 sm:gap-3 h-16">
            {/* Logo / Marca - Compacto em ecrãs móveis */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary font-black text-xs sm:text-sm tracking-tight shadow-xs shrink-0 ring-1 ring-amber-brand/50">
                FL
              </div>
              <div className="flex flex-col">
                <span className="text-xs sm:text-base font-extrabold text-on-surface tracking-tight leading-tight">
                  <span className="inline sm:hidden">F&L</span>
                  <span className="hidden sm:inline">Frutas e Legumes</span>
                </span>
                <span className="text-[11px] text-on-surface-muted font-medium hidden sm:inline">
                  Gestão Diária da Secção
                </span>
              </div>
            </div>

            {/* Abas Principais em LETRA MAIÚSCULA E NEGRITO */}
            <nav className="hidden md:flex items-center gap-1 bg-surface-container p-1 rounded-xl border border-line">
              {canViewTasks && (
                <button
                  onClick={() => onTabChange('tarefas')}
                  className={`px-3 py-1.5 rounded-lg transition-all text-xs lg:text-sm font-bold uppercase tracking-wider cursor-pointer ${
                    activeTab === 'tarefas'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-card/80'
                  }`}
                >
                  TAREFAS
                </button>
              )}

              <button
                onClick={() => onTabChange('stocks')}
                className={`px-3 py-1.5 rounded-lg transition-all text-xs lg:text-sm font-bold uppercase tracking-wider cursor-pointer ${
                  activeTab === 'stocks'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-card/80'
                }`}
              >
                STOCKS
              </button>

              {/* Nova Aba PDE (Pedidos de Qualidade) */}
              <button
                onClick={() => onTabChange('pde')}
                className={`px-3 py-1.5 rounded-lg transition-all text-xs lg:text-sm font-bold uppercase tracking-wider cursor-pointer ${
                  activeTab === 'pde'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-card/80'
                }`}
              >
                PDE
              </button>

              {/* Aba RELATÓRIOS: visível para Administrador e Administrador 2 */}
              {isAnyAdmin && (
                <button
                  onClick={() => onTabChange('relatorio')}
                  className={`px-3 py-1.5 rounded-lg transition-all text-xs lg:text-sm font-bold uppercase tracking-wider cursor-pointer ${
                    activeTab === 'relatorio'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-card/80'
                  }`}
                >
                  RELATÓRIOS
                </button>
              )}

              {/* Aba ADMINISTRAÇÃO: estritamente visível apenas para administradores */}
              {isAdmin && (
                <button
                  onClick={() => onTabChange('admin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs lg:text-sm font-bold uppercase tracking-wider cursor-pointer ${
                    activeTab === 'admin'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-card/80'
                  }`}
                >
                  <ShieldCheck className={`w-4 h-4 ${activeTab === 'admin' ? 'text-amber-brand' : 'text-amber-ink'}`} />
                  <span>ADMINISTRAÇÃO</span>
                </button>
              )}
            </nav>

            {/* Zona de Ações: Seletor Abreviado de Data, Perfil, Tema, Notificações e Sair */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {/* Seletor compacto e abreviado no telemóvel */}
              <div className="flex items-center gap-1 sm:gap-1.5 bg-surface-container border border-line shadow-2xs rounded-lg px-2 py-1.5 sm:px-2.5 sm:py-1.5 text-xs text-on-surface focus-within:ring-2 focus-within:ring-amber-brand focus-within:border-transparent transition-all max-w-[116px] sm:max-w-none">
                <Calendar className="w-3.5 h-3.5 text-amber-ink shrink-0" />
                <select
                  value={selectedDate}
                  onChange={e => onDateChange(e.target.value)}
                  className="bg-transparent border-none text-on-surface text-[11px] sm:text-xs font-bold focus:outline-none cursor-pointer pr-0.5 truncate max-w-[82px] sm:max-w-none"
                  title="Apenas dias das tarefas da semana adicionada"
                >
                  {Object.keys(weeksMap).length > 0 ? (
                    Object.entries(weeksMap).map(([weekTitle, items]) => (
                      <optgroup key={weekTitle} label={weekTitle} className="font-semibold bg-surface-card text-on-surface">
                        {items.map(item => (
                          <option key={item.date} value={item.date} className="font-medium bg-surface-card text-on-surface">
                            {formatShortDate(item.label, item.date)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    <option value={selectedDate} className="bg-surface-card text-on-surface">{selectedDate}</option>
                  )}
                </select>
              </div>

              {/* Info do Colaborador Ativo */}
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-line text-xs">
                <div className="w-7 h-7 rounded-full bg-amber-tint border border-amber-border flex items-center justify-center text-amber-ink font-semibold">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-bold text-on-surface truncate max-w-[140px]">
                    {currentUser.name}
                  </span>
                  <span className="text-[11px] text-on-surface-muted font-mono">
                    Nº {currentUser.mecanographicNumber}{' '}
                    {isAdmin ? '· Admin' : isAdmin2 ? '· Admin 2' : isGestorStocksPde ? '· Gestor Stocks & PDE' : ''}
                  </span>
                </div>
              </div>

              {/* Alternar Modo Claro / Escuro */}
              <button
                type="button"
                onClick={onToggleTheme}
                title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
                aria-label={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
                className="p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer border border-line bg-surface-container text-on-surface-muted hover:text-on-surface hover:bg-surface-hover shadow-2xs flex items-center justify-center shrink-0 active:scale-95"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-brand" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* Botão de Notificações */}
              <button
                type="button"
                onClick={handleBellClick}
                title={
                  isManagerBell
                    ? unreadCount > 0
                      ? `${unreadCount} nova(s) entrada(s) de Stocks / PDE`
                      : 'Notificações de Stocks e PDE'
                    : unreadCount > 0
                    ? `${unreadCount} nova(s) tarefa(s) atribuída(s) - clique para abrir`
                    : 'Notificações de tarefas'
                }
                className={`relative p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer border shadow-2xs flex items-center justify-center shrink-0 active:scale-95 ${
                  isNotifOpen
                    ? 'bg-amber-tint border-amber-border text-amber-ink'
                    : 'bg-surface-container border-line text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
                }`}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-danger text-on-danger font-extrabold text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse border border-surface-card shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Terminar Sessão */}
              <button
                onClick={onLogout}
                title="Terminar sessão"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-danger-ink bg-danger-tint hover:bg-danger-border/40 border border-danger-border rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-2xs active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="inline text-[11px] sm:text-xs">Sair</span>
              </button>
            </div>
          </div>

          {/* Mobile Navigation bar com abas MAIÚSCULAS E NEGRITO */}
          <div className="md:hidden flex items-center justify-around py-2 border-t border-line-subtle overflow-x-auto text-xs gap-1">
            {canViewTasks && (
              <button
                onClick={() => onTabChange('tarefas')}
                className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === 'tarefas'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                TAREFAS
              </button>
            )}
            <button
              onClick={() => onTabChange('stocks')}
              className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'stocks'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-muted hover:text-on-surface'
              }`}
            >
              STOCKS
            </button>
            <button
              onClick={() => onTabChange('pde')}
              className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'pde'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-muted hover:text-on-surface'
              }`}
            >
              PDE
            </button>
            {isAnyAdmin && (
              <button
                onClick={() => onTabChange('relatorio')}
                className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === 'relatorio'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                RELATÓRIOS
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onTabChange('admin')}
                className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                ADMINISTRAÇÃO
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Painel de Notificações de Stocks e PDE para Administrador e Gestor de Stocks & PDE */}
      {isManagerBell && isNotifOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setIsNotifOpen(false)}
          />
          <div className="fixed top-16 left-2 right-2 sm:left-auto sm:right-6 sm:w-96 z-50 bg-surface-card border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
            <div className="px-4 py-3 bg-surface-container border-b border-line flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 text-amber-ink shrink-0" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-on-surface truncate">
                  Notificações Stocks & PDE
                </span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-danger text-on-danger rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-ink hover:text-on-surface cursor-pointer"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Ler todas</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsNotifOpen(false)}
                  className="p-1 text-on-surface-muted hover:text-on-surface rounded-lg cursor-pointer"
                  title="Fechar painel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-line-subtle">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-on-surface-muted">
                  Sem notificações recentes de Stocks ou PDE adicionadas por colaboradores.
                </div>
              ) : (
                notifications.slice(0, 30).map(n => {
                  const isStock = n.category === 'STOCK' || Boolean(n.stockId);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleOpenNotification(n)}
                      className={`w-full text-left p-3.5 transition-colors hover:bg-surface-container cursor-pointer flex items-start gap-3 ${
                        !n.read ? 'bg-amber-tint/40' : 'bg-surface-card'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                          isStock
                            ? 'bg-amber-tint border-amber-border text-amber-ink'
                            : 'bg-danger-tint border-danger-border text-danger-ink'
                        }`}
                      >
                        {isStock ? (
                          <Package className="w-4 h-4" />
                        ) : (
                          <ClipboardList className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isStock
                                ? 'bg-amber-tint text-amber-ink border-amber-border'
                                : 'bg-danger-tint text-danger-ink border-danger-border'
                            }`}
                          >
                            {isStock ? 'STOCK' : 'PDE'}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono text-on-surface-muted">{n.date}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-danger" />
                            )}
                          </div>
                        </div>
                        <div className="text-xs font-bold text-on-surface mt-1 truncate">
                          {n.title}
                        </div>
                        <p className="text-[11px] text-on-surface-muted mt-0.5 leading-snug line-clamp-2">
                          {n.message}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Alerta / Toast Flutuante de Nova Notificação */}
      {toastNotif && (
        <div className="fixed top-18 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md bg-surface-card border-2 border-amber-brand shadow-2xl rounded-2xl p-4 z-50 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-full bg-amber-tint border border-amber-border flex items-center justify-center shrink-0 text-amber-ink">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wide truncate">
                {toastNotif.title}
              </h4>
              <button
                type="button"
                onClick={() => setToastNotif(null)}
                className="text-on-surface-subtle hover:text-on-surface p-0.5 cursor-pointer"
                title="Fechar alerta"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-on-surface-muted mt-1 leading-snug">
              {toastNotif.message}
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className="text-on-surface-subtle font-medium">Dia: <strong className="text-on-surface">{toastNotif.date}</strong></span>
              <button
                type="button"
                onClick={() => handleOpenNotification(toastNotif)}
                className="font-bold text-amber-ink hover:text-on-surface underline cursor-pointer"
              >
                {getToastActionLabel(toastNotif)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

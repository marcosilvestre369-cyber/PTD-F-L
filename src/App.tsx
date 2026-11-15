/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Collaborator } from './types/index.ts';
import { api } from './services/api.ts';
import { getTodayDateString } from './utils/date.ts';
import { Navbar } from './components/Navbar.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { TasksView } from './components/TasksView.tsx';
import { StocksView } from './components/StocksView.tsx';
import { PdeView } from './components/PdeView.tsx';
import { DailyReportView } from './components/DailyReportView.tsx';
import { AdminView } from './components/AdminView.tsx';

interface AvailableDate {
  date: string;
  label: string;
  week: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<Collaborator | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'tarefas' | 'stocks' | 'pde' | 'relatorio' | 'admin'>('tarefas');
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
    return 'light';
  });

  const handleToggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('fl_theme', next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  useEffect(() => {
    checkSession();
  }, []);

  const loadDates = async (preferredDate?: string, preserveCurrent = false) => {
    try {
      const dates = await api.getAvailableDates();
      const today = getTodayDateString();
      let finalDates = [...dates];

      if (!finalDates.some(d => d.date === today)) {
        const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const [year, month, day] = today.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const dayOfWeek = weekdayNames[d.getDay()];
        const label = `${dayOfWeek}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')} (Hoje)`;
        finalDates.unshift({ date: today, label, week: 'Hoje' });
      }
      setAvailableDates(finalDates);

      if (preferredDate && finalDates.some(d => d.date === preferredDate)) {
        setSelectedDate(preferredDate);
        return;
      }

      if (preserveCurrent && finalDates.some(d => d.date === selectedDate)) {
        return;
      }

      if (finalDates.some(d => d.date === today)) {
        setSelectedDate(today);
      } else if (finalDates.length > 0) {
        setSelectedDate(finalDates[0].date);
      }
    } catch (err) {
      console.error('Erro ao carregar datas:', err);
    }
  };

  const checkSession = async () => {
    setIsCheckingAuth(true);
    try {
      if (api.getToken()) {
        const res = await api.getMe();
        setCurrentUser(res.user);
        if (res.user.role === 'GESTOR_STOCKS_PDE') {
          setActiveTab('stocks');
        } else {
          setActiveTab('tarefas');
        }
        setSelectedDate(getTodayDateString());
        await loadDates();
      }
    } catch (err) {
      api.clearToken();
      setCurrentUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLoginSuccess = async (user: Collaborator) => {
    setCurrentUser(user);
    if (user.role === 'GESTOR_STOCKS_PDE') {
      setActiveTab('stocks');
    } else {
      setActiveTab('tarefas');
    }
    setSelectedDate(getTodayDateString());
    await loadDates();
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setActiveTab('tarefas');
  };

  const handleTabChange = (tab: 'tarefas' | 'stocks' | 'pde' | 'relatorio' | 'admin') => {
    // Gestor de Stocks & PDE só tem acesso a stocks e pde
    if (currentUser?.role === 'GESTOR_STOCKS_PDE') {
      if (tab !== 'stocks' && tab !== 'pde') {
        return;
      }
    } else if ((tab === 'admin' || tab === 'relatorio') && currentUser?.role !== 'ADMIN') {
      // Apenas administradores podem aceder às abas de administração e relatórios
      return;
    }
    setActiveTab(tab);
  };

  // Redirecionamento automático de segurança por papel de utilizador
  useEffect(() => {
    if (currentUser?.role === 'GESTOR_STOCKS_PDE') {
      if (activeTab !== 'stocks' && activeTab !== 'pde') {
        setActiveTab('stocks');
      }
    } else if ((activeTab === 'admin' || activeTab === 'relatorio') && currentUser?.role !== 'ADMIN') {
      setActiveTab('tarefas');
    }
  }, [currentUser, activeTab]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-on-surface-muted text-sm font-medium">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full border-2 border-line border-t-amber-brand animate-spin" />
          <span>A carregar sistema da secção...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthModal onSuccess={handleLoginSuccess} theme={theme} onToggleTheme={handleToggleTheme} />;
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col text-on-surface font-sans max-w-full overflow-x-hidden">
      {/* Barra de Navegação Superior */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        availableDates={availableDates}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Conteúdo Principal da Aba Ativa */}
      <main className="flex-1 pb-12 w-full max-w-full overflow-x-hidden">
        {activeTab === 'tarefas' && (
          <TasksView currentUser={currentUser} selectedDate={selectedDate} />
        )}

        {activeTab === 'stocks' && (
          <StocksView currentUser={currentUser} selectedDate={selectedDate} />
        )}

        {activeTab === 'pde' && (
          <PdeView currentUser={currentUser} selectedDate={selectedDate} />
        )}

        {activeTab === 'relatorio' && (
          <DailyReportView currentUser={currentUser} selectedDate={selectedDate} />
        )}

        {activeTab === 'admin' && currentUser.role === 'ADMIN' && (
          <AdminView
            currentUser={currentUser}
            selectedDate={selectedDate}
            onWeekAdded={preferredDate => loadDates(preferredDate, true)}
          />
        )}
      </main>

      {/* Rodapé Operacional */}
      <footer className="border-t border-line bg-surface-card/80 backdrop-blur-md py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-on-surface-muted gap-2">
          <div>
            <span className="font-bold text-on-surface">Gestão Diária da Secção · Frutas e Legumes</span>
            <span className="mx-2 text-line">·</span>
            <span className="text-on-surface-subtle">Versão 1.0 (Oficial)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span>Colaborador ativo: <strong className="text-on-surface">{currentUser.name}</strong> ({currentUser.mecanographicNumber})</span>
            {currentUser.role === 'ADMIN' && (
              <span className="px-1.5 py-0.5 bg-amber-tint text-amber-ink border border-amber-border rounded font-bold text-[10px]">
                ADMIN
              </span>
            )}
            {currentUser.role === 'GESTOR_STOCKS_PDE' && (
              <span className="px-1.5 py-0.5 bg-surface-container text-on-surface border border-line rounded font-bold text-[10px]">
                GESTOR STOCKS & PDE
              </span>
            )}
            <span className="mx-1 text-line">·</span>
            <span className="text-on-surface-subtle">Fuso: Europe/Lisbon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

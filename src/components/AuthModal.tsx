import React, { useState } from 'react';
import { api } from '../services/api.ts';
import { Collaborator } from '../types/index.ts';
import { ShieldCheck, AlertCircle, ArrowRight, User, Sun, Moon } from 'lucide-react';

interface AuthModalProps {
  onSuccess: (user: Collaborator) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, theme, onToggleTheme }) => {
  const [mecanographicNumber, setMecanographicNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = mecanographicNumber.trim();
    if (!trimmed) {
      setError('Por favor, introduza o seu número mecanográfico.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.login(trimmed);
      if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Número mecanográfico não reconhecido na secção.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative">
      {/* Botão discreto de alternância Claro/Escuro */}
      <button
        type="button"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
        aria-label={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
        className="fixed top-4 right-4 p-2.5 rounded-xl bg-surface-card border border-line text-on-surface-muted hover:text-on-surface hover:bg-surface-container transition-colors shadow-xs cursor-pointer"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-brand" /> : <Moon className="w-4 h-4" />}
      </button>

      <div className="bg-surface-card rounded-2xl shadow-xl border border-line max-w-md w-full overflow-hidden">
        {/* Cabeçalho Carvão & Âmbar */}
        <div className="bg-hero-bg px-6 py-8 text-hero-fg text-center relative overflow-hidden border-b-2 border-amber-brand">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-amber-brand/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-32 h-32 bg-amber-brand/10 rounded-full blur-2xl pointer-events-none" />
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-brand text-on-secondary mb-3 shadow-lg">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-hero-fg">Secção Frutas e Legumes</h1>
          <p className="text-xs text-hero-muted mt-1.5 font-medium">
            Gestão diária de tarefas, refeição e stocks da secção
          </p>
        </div>

        {/* Formulário de Identificação */}
        <div className="p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-base font-bold text-on-surface">Identificação de Colaborador</h2>
            <p className="text-xs text-on-surface-muted mt-1">
              Introduza o seu número mecanográfico para aceder à secção.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-danger-tint border border-danger-border rounded-xl flex items-start gap-2.5 text-xs text-danger-ink animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="mecanographicNumber" className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted mb-1.5">
                Número Mecanográfico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-subtle">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="mecanographicNumber"
                  type="text"
                  inputMode="numeric"
                  required
                  autoFocus
                  value={mecanographicNumber}
                  onChange={e => setMecanographicNumber(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-surface-container border border-line rounded-xl text-base text-on-surface focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-amber-brand focus:border-transparent font-mono transition-all font-semibold"
                />
              </div>
              <p className="text-[11px] text-on-surface-subtle mt-1.5">
                Identificador individual atribuído na lista de colaboradores.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !mecanographicNumber.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary-hover disabled:bg-surface-container disabled:text-on-surface-subtle disabled:cursor-not-allowed text-on-primary font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer active:scale-[0.99]"
            >
              <span>{isLoading ? 'A verificar...' : 'Entrar na Secção'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Rodapé informativo */}
        <div className="bg-surface-container px-6 py-3 border-t border-line-subtle text-center">
          <p className="text-[11px] text-on-surface-muted font-medium">
            Em caso de dúvida no número mecanográfico, contacte a chefia ou a administração.
          </p>
        </div>
      </div>
    </div>
  );
};

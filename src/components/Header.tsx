import React from 'react';
import {
  Bot,
  RefreshCw,
  ShieldCheck,
  Zap,
  QrCode,
  User,
  Sliders,
  Users,
  Sun,
  Moon,
  Cloud,
  Home,
  LogOut,
  Sparkles,
  Code,
  ShieldAlert,
  Key,
  Send,
  Store
} from 'lucide-react';
import { BotStats, AppWhitelabelConfig } from '../types/whatsapp';
import { resolveLogoUrl, handleLogoImgError } from '../lib/branding';

interface HeaderProps {
  stats: BotStats | null;
  onRefresh: () => void;
  isLoading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: 'admin' | 'user';
  setCurrentRole: (role: 'admin' | 'user') => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onGoHome?: () => void;
  onLogout?: () => void;
  currentUserName?: string;
  onOpenPinModal?: () => void;
  onOpenUpgrade?: () => void;
  planLabel?: string;
  whitelabel?: AppWhitelabelConfig | null;
}

const MOBILE_PAGE_TITLES: Record<string, string> = {
  dashboard: 'Beranda',
  connect: 'Koneksi WA',
  broadcast: 'Broadcast',
  rules: 'Balasan AI',
  catalog: 'Katalog Toko',
  profile: 'Profil Akun',
  apidocs: 'REST API',
  master: 'Master Panel',
  antiban: 'Anti-Ban',
  users: 'Pengguna',
  config: 'Kredensial',
  sql: 'Database'
};

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isLoading,
  activeTab,
  setActiveTab,
  currentRole,
  isDarkMode,
  onToggleTheme,
  onGoHome,
  onLogout,
  currentUserName = 'User',
  onOpenPinModal,
  onOpenUpgrade,
  planLabel,
  whitelabel
}) => {
  const appName = whitelabel?.app_name || 'Japriin';
  const appTagline = whitelabel?.tagline || 'WhatsApp Gateway & AI';
  const logoUrl = resolveLogoUrl(whitelabel?.logo_url);
  const mobileTitle = MOBILE_PAGE_TITLES[activeTab] || appName;

  const navItems = [
    { id: 'dashboard', label: 'Beranda', icon: Zap, roles: ['admin', 'user'] },
    { id: 'connect', label: 'Koneksi WA', icon: QrCode, roles: ['admin', 'user'] },
    { id: 'broadcast', label: 'Broadcast', icon: Send, roles: ['admin', 'user'] },
    { id: 'rules', label: 'Balasan AI', icon: Bot, roles: ['admin', 'user'] },
    { id: 'catalog', label: 'Katalog Toko', icon: Store, roles: ['admin', 'user'] },
    { id: 'profile', label: 'Profil', icon: User, roles: ['admin', 'user'] },
    { id: 'apidocs', label: 'API v1', icon: Code, roles: ['admin', 'user'] },
    { id: 'master', label: 'Master', icon: ShieldAlert, roles: ['admin'] },
    { id: 'antiban', label: 'Anti-Ban', icon: Sliders, roles: ['admin'] },
    { id: 'users', label: 'Pengguna', icon: Users, roles: ['admin'] },
    { id: 'config', label: 'Kredensial', icon: ShieldCheck, roles: ['admin'] },
    { id: 'sql', label: 'Database', icon: Cloud, roles: ['admin'] }
  ].filter(item => item.roles.includes(currentRole));

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-40 text-slate-800 dark:text-slate-100 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Row: Compact 56px on mobile, 64px on desktop */}
        <div className="flex items-center justify-between h-14 lg:h-16 gap-2">
          {/* Left: Brand Logo + Contextual Mobile Title / Desktop Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-xs flex items-center justify-center shrink-0"
              aria-label={appName}
            >
              <img
                src={logoUrl}
                alt={appName}
                onError={handleLogoImgError}
                className="w-full h-full object-cover rounded-[10px]"
              />
            </button>

            {/* Mobile: Native App Page Title */}
            <div className="lg:hidden min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate leading-tight">
                {mobileTitle}
              </h1>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block truncate leading-tight">
                {appName}{planLabel ? ` · ${planLabel}` : ''}
              </span>
            </div>

            {/* Desktop: Full Brand + Tagline */}
            <div
              onClick={onGoHome}
              className="hidden lg:block min-w-0 max-w-[280px] cursor-pointer"
            >
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                {appName}
              </h1>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block -mt-0.5 truncate">
                {appTagline}
              </span>
            </div>
          </div>

          {/* Right: Clean Utility Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Desktop Upgrade & Account Quick Actions */}
            {currentRole !== 'admin' && onOpenUpgrade && (
              <button
                type="button"
                onClick={onOpenUpgrade}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Upgrade</span>
              </button>
            )}

            {onOpenPinModal && (
              <button
                type="button"
                onClick={onOpenPinModal}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                title="Atur PIN Keamanan Bot"
              >
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span>PIN Bot</span>
              </button>
            )}

            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                title="Halaman Depan"
              >
                <Home className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Depan</span>
              </button>
            )}

            {/* Theme Toggle (>= 44px tap target on mobile) */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-11 h-11 lg:w-9 lg:h-9 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center"
              title={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
              aria-label={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
            >
              {isDarkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-slate-600" />}
            </button>

            {/* Refresh Data Button (>= 44px tap target on mobile) */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="w-11 h-11 lg:w-9 lg:h-9 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
              title="Perbarui Data"
              aria-label="Perbarui Data"
            >
              <RefreshCw className={`w-[18px] h-[18px] ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Mobile: Direct Avatar Shortcut to Profile */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`lg:hidden w-9 h-9 mx-0.5 rounded-full font-bold text-xs flex items-center justify-center transition-colors shrink-0 ${
                activeTab === 'profile'
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30'
                  : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
              }`}
              title={`Profil (${currentUserName})`}
              aria-label="Buka Profil Akun"
            >
              {currentUserName.charAt(0).toUpperCase()}
            </button>

            {/* Desktop: User Profile Pill + Logout */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="hidden lg:inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Buka Profil"
            >
              <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                {currentUserName.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[110px] truncate">
                {currentUserName}
              </span>
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="hidden lg:inline-flex items-center justify-center w-9 h-9 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                title="Keluar Akun"
                aria-label="Keluar Akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop Header Tab Navigation (Clean, Zero Candy Pills) */}
        <nav className="hidden lg:flex items-center gap-1 border-t border-slate-200/70 dark:border-slate-800/80 overflow-x-auto py-1.5 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

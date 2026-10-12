import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Disc3,
  Headphones,
  Home,
  Library,
  Maximize2,
  Minimize2,
  Search,
  Sliders,
} from 'lucide-react';
import { useAppSettings } from '../settings';
import { THEMES, type ThemeName } from '../theme';
import type { ViewTab } from '../types';

interface HeaderProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  isPlaying?: boolean;
  onOpenPlayer?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenAudioSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  isPlaying = false,
  onOpenPlayer,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onOpenAudioSettings,
}) => {
  const { settings } = useAppSettings();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClickSpinning, setIsClickSpinning] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleBrandInteraction = () => {
    setIsClickSpinning(true);
    setTimeout(() => {
      setIsClickSpinning(false);
    }, 600);
    if (onOpenPlayer) {
      onOpenPlayer();
    }
  };

  return (
    <header
      className="sticky top-0 z-40 w-full backdrop-blur-md border-b px-3 sm:px-6 py-2.5 transition-all select-none"
      style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}
    >
      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-3">
        {/* Left Section: Back/Forward history buttons + Brand */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Back & Forward History Navigation */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <button
              onClick={onGoBack}
              disabled={!canGoBack}
              title="Назад (Alt+Left)"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                canGoBack
                  ? 'text-slate-200 hover:text-white hover:bg-white/[0.08] active:scale-90'
                  : 'text-slate-600 cursor-not-allowed opacity-35'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onGoForward}
              disabled={!canGoForward}
              title="Вперёд (Alt+Right)"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                canGoForward
                  ? 'text-slate-200 hover:text-white hover:bg-white/[0.08] active:scale-90'
                  : 'text-slate-600 cursor-not-allowed opacity-35'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Brand Logo & Spinner */}
          <div
            className="flex items-center gap-2.5 cursor-pointer group active:scale-95 transition-all duration-200 ml-1"
            onClick={handleBrandInteraction}
            title="Открыть плеер на весь экран"
          >
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-cyan-500 to-cyan-300 p-[1px] shadow-sm group-hover:shadow-[0_0_16px_rgba(34,211,238,0.4)] transition-all duration-300">
              <div className="w-full h-full bg-[#07080c] rounded-[11px] flex items-center justify-center overflow-hidden">
                <div
                  className={`transition-transform duration-300 ease-out group-hover:scale-110 ${
                    isClickSpinning ? 'animate-full-spin' : ''
                  }`}
                >
                  <Disc3
                    className={`w-4 h-4 sm:w-4.5 sm:h-4.5 text-cyan-400 transition-colors group-hover:text-cyan-300 ${
                      isPlaying && settings.vinylSpinEnabled ? 'animate-vinyl-spin' : ''
                    }`}
                  />
                </div>
              </div>
            </div>
            <span className="font-bold tracking-tight text-sm sm:text-base text-white font-sans group-hover:text-cyan-300 transition-colors hidden md:flex items-center">
              FreeTo<span className="text-cyan-400 group-hover:text-cyan-300 transition-colors">Player</span>
            </span>
          </div>
        </div>

        {/* Center Section: Main Navigation Tabs */}
        <nav className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] backdrop-blur-md shadow-inner">
          <button
            onClick={() => onTabChange('home')}
            className={`group flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 ${
              currentTab === 'home'
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <Home className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span>Главная</span>
          </button>

          <button
            onClick={() => onTabChange('collection')}
            className={`group flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 ${
              currentTab === 'collection'
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <Library className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span>Медиатека</span>
          </button>

          <button
            onClick={() => onTabChange('online')}
            className={`group flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 ${
              currentTab === 'online'
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <Search className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span>Онлайн</span>
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className={`group flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 ${
              currentTab === 'settings'
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <Sliders className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span>Настройки</span>
          </button>
        </nav>

        {/* Right Section: Quick Tools + Tray & Fullscreen */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick Sound & Equalizer Settings Button */}
          {onOpenAudioSettings && (
            <button
              onClick={onOpenAudioSettings}
              title="Быстрые настройки звука и эквалайзер"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-purple-300 border border-white/[0.07] hover:border-purple-500/30 transition-all cursor-pointer active:scale-90"
            >
              <Headphones className="w-4 h-4" />
            </button>
          )}

          {/* Tray */}
          <button
            onClick={() => {
              const win = window as unknown as { minimizeToTray?: () => void };
              if (typeof win.minimizeToTray === 'function') {
                win.minimizeToTray();
              } else {
                fetch('/api/window/tray', { method: 'POST' }).catch(() => {});
              }
            }}
            title="Свернуть в системный трей (продолжит играть в фоне)"
            className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 hover:text-cyan-300 border border-white/[0.07] hover:border-cyan-500/40 transition-all cursor-pointer font-medium text-xs sm:text-sm active:scale-95 shadow-sm"
          >
            <span>Tray</span>
          </button>

          {/* Fullscreen (F11) */}
          <button
            onClick={() => {
              const win = window as unknown as { toggleFullscreen?: () => boolean; setWindowCaptionColor?: (hex: string) => void };
              if (typeof win.toggleFullscreen === 'function') {
                const nowFull = win.toggleFullscreen();
                setIsFullscreen(nowFull);
                const themeName = (localStorage.getItem('dj_theme') as ThemeName) || 'onyx';
                const theme = THEMES[themeName] || THEMES.onyx;
                if (typeof win.setWindowCaptionColor === 'function') {
                  win.setWindowCaptionColor(theme.bg);
                }
              } else if (document.fullscreenElement) {
                document.exitFullscreen();
                setIsFullscreen(false);
              } else {
                document.documentElement.requestFullscreen();
                setIsFullscreen(true);
              }
            }}
            title={isFullscreen ? 'Выйти из полноэкранного режима (F11)' : 'Полноэкранный режим (F11)'}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] hover:border-cyan-500/30 text-slate-400 hover:text-cyan-300 active:scale-90 transition-all cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-cyan-400 transition-transform active:rotate-45" />
            ) : (
              <Maximize2 className="w-4 h-4 transition-transform hover:rotate-12" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

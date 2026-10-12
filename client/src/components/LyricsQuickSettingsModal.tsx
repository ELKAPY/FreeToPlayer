import React from 'react';
import {
  Activity,
  Disc,
  Mic2,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { clearLyricsCache, getLyricsCacheSize } from '../lyrics';
import {
  type LyricsFontSize,
  type VisualizerStyle,
  useAppSettings,
} from '../settings';

interface LyricsQuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullSettings?: () => void;
  onToast?: (msg: string) => void;
}

export const LyricsQuickSettingsModal: React.FC<LyricsQuickSettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenFullSettings,
  onToast,
}) => {
  const { settings, updateSettings } = useAppSettings();

  if (!isOpen) return null;

  const fontSizes: { id: LyricsFontSize; label: string }[] = [
    { id: 'sm', label: 'Обычный' },
    { id: 'md', label: 'Крупный' },
    { id: 'lg', label: 'Большой' },
  ];

  const vizStyles: { id: VisualizerStyle; label: string }[] = [
    { id: 'bars', label: 'Столбики' },
    { id: 'wave', label: 'Волна' },
    { id: 'mirror', label: 'Симметрия' },
    { id: 'dots', label: 'Пики' },
  ];

  const cacheCount = getLyricsCacheSize();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#0b0c13] border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Mic2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Караоке и спектроанализатор</h3>
              <p className="text-[11px] text-slate-400">Шрифт текста песен, визуализатор и эффекты</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          {/* 1. Lyrics Display Settings */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Type className="w-3.5 h-3.5 text-emerald-400" />
              <span>Отображение караоке-текста</span>
            </div>

            {/* Font size */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Размер шрифта текста</span>
              <div className="flex items-center gap-1">
                {fontSizes.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => updateSettings({ lyricsFontSize: f.id })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.lyricsFontSize === f.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-scroll toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <div>
                <h4 className="text-xs font-semibold text-white">Автопрокрутка синхронизированного текста</h4>
                <p className="text-[10px] text-slate-400">Следовать за активной строчкой песни</p>
              </div>
              <button
                onClick={() => updateSettings({ autoScrollLyrics: !settings.autoScrollLyrics })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.autoScrollLyrics ? 'bg-emerald-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.autoScrollLyrics ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Auto-fetch lyrics */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <div>
                <h4 className="text-xs font-semibold text-white">Автопоиск слов при переключении</h4>
                <p className="text-[10px] text-slate-400">Автоматически искать в LRCLIB</p>
              </div>
              <button
                onClick={() => updateSettings({ autoFetchLyrics: !settings.autoFetchLyrics })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.autoFetchLyrics ? 'bg-emerald-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.autoFetchLyrics ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Clear lyrics cache */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
              <span className="text-slate-400">Кэш текстов: {cacheCount} треков</span>
              <button
                onClick={() => {
                  clearLyricsCache();
                  if (onToast) onToast('Кэш текстов песен очищен');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Очистить кэш</span>
              </button>
            </div>
          </div>

          {/* 2. Visualizer Settings */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Спектроанализатор</span>
              </div>
              <button
                onClick={() => updateSettings({ visualizerEnabled: !settings.visualizerEnabled })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.visualizerEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.visualizerEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Visualizer style */}
            <div className="grid grid-cols-4 gap-1.5">
              {vizStyles.map((st) => (
                <button
                  key={st.id}
                  disabled={!settings.visualizerEnabled}
                  onClick={() => updateSettings({ visualizerStyle: st.id })}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 ${
                    settings.visualizerStyle === st.id && settings.visualizerEnabled
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Visualizer bars */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
              <span className="text-slate-300">Детализация (полосы)</span>
              <div className="flex items-center gap-1">
                {[24, 36, 48, 64].map((b) => (
                  <button
                    key={b}
                    disabled={!settings.visualizerEnabled}
                    onClick={() => updateSettings({ visualizerBars: b as any })}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all disabled:opacity-40 ${
                      settings.visualizerBars === b && settings.visualizerEnabled
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Visual Effects (Vinyl spin & Ambient glow) */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Disc className="w-3.5 h-3.5 text-cyan-400" />
                <span>Вращение виниловой пластинки в шапке</span>
              </div>
              <button
                onClick={() => updateSettings({ vinylSpinEnabled: !settings.vinylSpinEnabled })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.vinylSpinEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.vinylSpinEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Динамическое свечение обложки в плеере</span>
              </div>
              <button
                onClick={() => updateSettings({ ambientBackground: !settings.ambientBackground })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.ambientBackground ? 'bg-purple-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.ambientBackground ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between px-4">
          {onOpenFullSettings ? (
            <button
              onClick={() => {
                onClose();
                onOpenFullSettings();
              }}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Все настройки оформления →</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Check,
  Globe,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { type MusicSourceId, useAppSettings } from '../settings';

interface OnlineQuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory?: () => void;
  onOpenFullSettings?: () => void;
  onToast?: (msg: string) => void;
}

export const OnlineQuickSettingsModal: React.FC<OnlineQuickSettingsModalProps> = ({
  isOpen,
  onClose,
  onClearHistory,
  onOpenFullSettings,
  onToast,
}) => {
  const { settings, updateSettings } = useAppSettings();

  if (!isOpen) return null;

  const sources: { id: MusicSourceId; label: string; desc: string }[] = [
    { id: 'all', label: 'Все источники', desc: 'Агрегатор каталогов' },
    { id: 'deezer', label: 'Deezer', desc: 'HD-обложки 1000x1000' },
    { id: 'yandex', label: 'Яндекс Музыка', desc: 'Каталог 320 kbps' },
    { id: 'hitmo', label: 'Hitmo', desc: 'Быстрый MP3' },
    { id: 'soundcloud', label: 'SoundCloud', desc: 'Ремиксы, лайвы' },
    { id: 'vk', label: 'VK Музыка', desc: 'Каверы и треки ВК' },
    { id: 'youtube', label: 'YouTube Music', desc: 'Аудио и клипы' },
    { id: 'audius', label: 'Audius', desc: 'Электронная музыка' },
  ];

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
            <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Настройки онлайн-поиска и радио</h3>
              <p className="text-[11px] text-slate-400">Каталоги, живой поиск, поток исполнителя</p>
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
          {/* 1. Default Music Source */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-white">Основной источник по умолчанию</span>
            <div className="grid grid-cols-2 gap-1.5">
              {sources.map((src) => {
                const isSelected = settings.defaultMusicSource === src.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => updateSettings({ defaultMusicSource: src.id })}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-0.5 ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white font-semibold'
                        : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs">{src.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <span className="text-[10px] text-slate-500">{src.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Search Behavior Toggles */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            {/* Live Search */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Живой поиск при вводе</h4>
                <p className="text-[10px] text-slate-400">Автоматически искать без нажатия клавиши Enter</p>
              </div>
              <button
                onClick={() => updateSettings({ liveSearchDebounce: !settings.liveSearchDebounce })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.liveSearchDebounce ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.liveSearchDebounce ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Show local matches in online search */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <div>
                <h4 className="text-xs font-semibold text-white">Показывать совпадения из коллекции</h4>
                <p className="text-[10px] text-slate-400">Выводить локальные треки и бейдж «В коллекции»</p>
              </div>
              <button
                onClick={() => updateSettings({ showLocalMatchesInOnline: !settings.showLocalMatchesInOnline })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.showLocalMatchesInOnline ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.showLocalMatchesInOnline ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Auto-play after download */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <div>
                <h4 className="text-xs font-semibold text-white">Автовоспроизведение после скачивания</h4>
                <p className="text-[10px] text-slate-400">Сразу включать скачанную песню</p>
              </div>
              <button
                onClick={() => updateSettings({ autoPlayAfterDownload: !settings.autoPlayAfterDownload })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.autoPlayAfterDownload ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.autoPlayAfterDownload ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Artist Flow & Radio bitrate */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Треков в потоке исполнителя</span>
              <div className="flex items-center gap-1">
                {[15, 25, 40].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSettings({ artistFlowCount: c as any })}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-mono transition-all ${
                      settings.artistFlowCount === c
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
              <span className="font-semibold text-white">Мин. битрейт радиостанций</span>
              <div className="flex items-center gap-1">
                {[
                  { bit: 0, label: 'Все' },
                  { bit: 64, label: '64k+' },
                  { bit: 128, label: '128k+' },
                  { bit: 192, label: '192k+' },
                ].map((item) => (
                  <button
                    key={item.bit}
                    onClick={() => updateSettings({ radioMinBitrate: item.bit as any })}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-mono transition-all ${
                      settings.radioMinBitrate === item.bit
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. History */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <span className="text-xs font-semibold text-white">История поиска</span>
              <p className="text-[10px] text-slate-400">Сохранять недавние запросы и онлайн-треки</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ saveSearchHistory: !settings.saveSearchHistory })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  settings.saveSearchHistory
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-white/[0.06] text-slate-400'
                }`}
              >
                {settings.saveSearchHistory ? 'Вкл' : 'Выкл'}
              </button>
              {onClearHistory && (
                <button
                  onClick={() => {
                    onClearHistory();
                    if (onToast) onToast('История поиска очищена');
                  }}
                  title="Очистить историю поиска"
                  className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
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
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Все настройки поиска в панели →</span>
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

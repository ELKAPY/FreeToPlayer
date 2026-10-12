import React from 'react';
import {
  Download,
  Folder,
  ListMusic,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { openStorageFolder } from '../api';
import { exportPlaylistToM3U8 } from '../m3u8';
import {
  type CollectionSortBy,
  type CollectionViewMode,
  useAppSettings,
} from '../settings';
import type { Track } from '../types';

interface CollectionQuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  onOpenFullSettings?: () => void;
  onToast?: (msg: string) => void;
}

export const CollectionQuickSettingsModal: React.FC<CollectionQuickSettingsModalProps> = ({
  isOpen,
  onClose,
  tracks,
  onOpenFullSettings,
  onToast,
}) => {
  const { settings, updateSettings } = useAppSettings();

  if (!isOpen) return null;

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
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
              <ListMusic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Настройки медиатеки</h3>
              <p className="text-[11px] text-slate-400">Сортировка, вид, умные подборки и экспорт</p>
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
          {/* 1. View Mode & Sort */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Вид отображения</span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'list', label: 'Список' },
                  { id: 'compact', label: 'Компактный' },
                  { id: 'grid', label: 'Плитка' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => updateSettings({ defaultViewMode: mode.id as CollectionViewMode })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.defaultViewMode === mode.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Sort */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-xs font-semibold text-white">Сортировка по умолчанию</span>
              <select
                value={settings.defaultSortBy}
                onChange={(e) => updateSettings({ defaultSortBy: e.target.value as CollectionSortBy })}
                className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-amber-300 focus:outline-none cursor-pointer"
              >
                <option value="added" className="bg-[#0b0c13] text-white">По дате добавления</option>
                <option value="title" className="bg-[#0b0c13] text-white">По названию трека</option>
                <option value="artist" className="bg-[#0b0c13] text-white">По исполнителю</option>
                <option value="duration" className="bg-[#0b0c13] text-white">По длительности</option>
                <option value="plays" className="bg-[#0b0c13] text-white">По количеству прослушиваний</option>
                <option value="size" className="bg-[#0b0c13] text-white">По размеру файла</option>
              </select>
            </div>

            {/* Display badges */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Показывать размер файла</span>
                <button
                  onClick={() => updateSettings({ showFileSize: !settings.showFileSize })}
                  className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                    settings.showFileSize ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                      settings.showFileSize ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Бейдж формата FLAC/MP3</span>
                <button
                  onClick={() => updateSettings({ showFormatBadge: !settings.showFormatBadge })}
                  className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                    settings.showFormatBadge ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                      settings.showFormatBadge ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 2. Smart Playlists Parameters */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Параметры умных подборок</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Лимит композиций в подборках</span>
              <div className="flex items-center gap-1">
                {[15, 30, 50, 100].map((lim) => (
                  <button
                    key={lim}
                    onClick={() => updateSettings({ smartPlaylistLimit: lim as any })}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                      settings.smartPlaylistLimit === lim
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    {lim}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.06]">
              <div>
                <span className="text-slate-300">Порог «Забытых фаворитов»</span>
                <p className="text-[10px] text-slate-500">Песни, не игравшие более N дней</p>
              </div>
              <div className="flex items-center gap-1">
                {[3, 7, 14, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => updateSettings({ forgottenDaysThreshold: days as any })}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                      settings.forgottenDaysThreshold === days
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    {days}д
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Export & Folder Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                const p = await exportPlaylistToM3U8(tracks, 'FreeToPlayer_Collection.m3u8');
                if (onToast) onToast(p ? 'Экспортировано в папку Загрузки' : 'M3U8 сохранён');
              }}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-200 hover:text-cyan-300 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Экспорт M3U8</span>
            </button>

            <button
              onClick={() => openStorageFolder()}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-200 hover:text-cyan-300 transition-all cursor-pointer"
            >
              <Folder className="w-3.5 h-3.5 text-cyan-400" />
              <span>Открыть Проводник</span>
            </button>
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
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Все настройки медиатеки →</span>
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

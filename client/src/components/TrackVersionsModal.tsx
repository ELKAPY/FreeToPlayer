import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  Disc,
  Download,
  Layers,
  Music,
  Pause,
  Play,
  Star,
  ThumbsDown,
  X,
} from 'lucide-react';
import {
  dislikeVersion,
  downloadOnlineTrack,
  fetchTrackVersions,
  setPreferredVersion,
} from '../api';
import type { OnlineTrack, Track, TrackVersion, VersionsResponse } from '../types';

interface TrackVersionsModalProps {
  track: Track | OnlineTrack;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayVersion: (version: TrackVersion) => void;
  onReplaceLocalVersion?: (localTrackId: string, version: TrackVersion) => Promise<void>;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const TrackVersionsModal: React.FC<TrackVersionsModalProps> = ({
  track,
  currentTrack,
  isPlaying,
  onPlayVersion,
  onReplaceLocalVersion,
  onClose,
  onToast,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VersionsResponse | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const isLocalTrack = 'filename' in track && !!track.filename && !('onlineStreamUrl' in track && (track as any).onlineStreamUrl);
  const localVersion = data?.versions.find((v) => v.source === 'local') || (isLocalTrack ? { id: track.id } : null);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await fetchTrackVersions(track.title, track.artist);
      setData(res);
    } catch (e) {
      console.error('Failed to load track versions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [track.title, track.artist]);

  const handleSetPreferred = async (v: TrackVersion) => {
    try {
      const isCurrentlyPref = !!v.isPreferred;
      await setPreferredVersion({
        songKey: data?.songKey,
        artist: track.artist,
        title: track.title,
        version: v,
        remove: isCurrentlyPref, // Toggle off / unstar if already preferred!
      });
      if (onToast) {
        if (isCurrentlyPref) {
          onToast(`Статус основной версии снят`);
        } else {
          onToast(`«${v.versionLabel}» установлена как основная версия этой песни`);
        }
      }
      loadVersions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDislike = async (v: TrackVersion) => {
    try {
      await dislikeVersion({
        songKey: data?.songKey,
        artist: track.artist,
        title: track.title,
        trackId: v.id,
        versionType: v.versionType,
      });
      if (onToast) {
        onToast(`Версия «${v.versionLabel}» добавлена в чёрный список (-)`);
      }
      // If current track is this disliked version, switch to another
      const alternatives = data?.versions.filter(
        (alt) => alt.id !== v.id && alt.versionType !== v.versionType && !alt.isDisliked
      );
      if (alternatives && alternatives.length > 0) {
        onPlayVersion(alternatives[0]);
      }
      loadVersions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReplace = async (v: TrackVersion) => {
    const targetLocalId = localVersion?.id || track.id;
    if (!onReplaceLocalVersion || !targetLocalId) return;
    setReplacingId(v.id);
    try {
      await onReplaceLocalVersion(targetLocalId, v);
      if (onToast) {
        onToast(`Локальный файл «${track.title}» заменен версией: ${v.versionLabel}`);
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert('Ошибка при замене файла');
    } finally {
      setReplacingId(null);
    }
  };

  const handleDownload = async (v: TrackVersion) => {
    setDownloadingId(v.id);
    try {
      const onlineTr: OnlineTrack = {
        id: v.id,
        title: v.title,
        artist: v.artist,
        album: v.album,
        duration: v.duration,
        durStr: v.durStr,
        coverUrl: v.coverUrl,
        audioUrl: v.audioUrl || v.streamUrl,
        streamUrl: v.streamUrl,
        source: v.source,
        sourceName: v.sourceName,
        version: v.versionLabel,
      };
      const res = await downloadOnlineTrack(onlineTr);
      if (res.success) {
        setDownloadedIds((prev) => new Set(prev).add(v.id));
        if (onToast) onToast(`«${v.title}» сохранена в локальную медиатеку`);
      }
    } catch (e) {
      alert('Ошибка при скачивании версии');
    } finally {
      setDownloadingId(null);
    }
  };

  const getSourceBadgeClass = (source: string) => {
    switch (source) {
      case 'yandex':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'hitmo':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'soundcloud':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'vk':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'youtube':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      case 'audius':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'local':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-white/[0.08] text-slate-300 border-white/[0.1]';
    }
  };

  const getVersionBadgeClass = (vType: string) => {
    switch (vType) {
      case 'live':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'reverbed':
      case 'slowed':
        return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
      case 'acoustic':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'remix':
        return 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40';
      case 'orchestral':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'instrumental':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      case 'demo':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      default:
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#0b0d14] border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                Версии композиции
              </h2>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              «{track.title}» — {track.artist}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-h-[260px]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 text-xs">
              <Disc className="w-8 h-8 text-cyan-400 animate-spin mb-3 opacity-80" />
              <span>Поиск альтернативных версий (Live, Reverb, Acoustic, Remix)...</span>
            </div>
          ) : !data || data.versions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
              <Layers className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
              <span>Альтернативных версий для этой песни не найдено</span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {data.versions.map((v) => {
                const isCurrentPlaying = currentTrack?.id === v.id;
                const isDownloaded = downloadedIds.has(v.id);
                const isDownloading = downloadingId === v.id;

                return (
                  <div
                    key={v.id}
                    className={`group flex items-center justify-between p-2.5 sm:px-3 rounded-xl transition-all ${
                      v.isDisliked
                        ? 'opacity-40 hover:opacity-75 bg-rose-950/10'
                        : isCurrentPlaying
                        ? 'bg-cyan-500/10 border border-cyan-500/20 text-white'
                        : 'hover:bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    {/* Left: Play button, Cover, Info */}
                    <div
                      onClick={() => onPlayVersion(v)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayVersion(v);
                        }}
                        className="w-8 h-8 rounded-full bg-white/[0.08] group-hover:bg-cyan-500 group-hover:text-slate-950 text-cyan-400 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      >
                        {isCurrentPlaying && isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current translate-x-0.5" />
                        )}
                      </button>

                      <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] relative flex items-center justify-center">
                        {v.coverUrl ? (
                          <img
                            src={v.coverUrl}
                            alt={v.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Music className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            className={`text-xs sm:text-sm font-semibold truncate ${
                              isCurrentPlaying ? 'text-cyan-400' : 'text-white'
                            }`}
                          >
                            {v.title}
                          </h4>
                        </div>

                        {/* Badges row: Version badge + Source badge (signed source!) */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {/* Version badge */}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${getVersionBadgeClass(
                              v.versionType
                            )}`}
                          >
                            {v.versionLabel}
                          </span>

                          {/* Source origin badge */}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-mono ${getSourceBadgeClass(
                              v.source
                            )}`}
                            title={`Источник: ${v.sourceName}`}
                          >
                            {v.sourceName}
                          </span>

                          {/* Local track indicator badge */}
                          {v.source === 'local' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Текущий файл</span>
                            </span>
                          )}

                          {/* Similarity gradation badge (Req 5 in upd_3.1) */}
                          {v.similarity !== undefined && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-md border font-mono font-medium ${
                                v.similarity === 100
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                                  : v.similarity >= 85
                                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              }`}
                              title={`Точность совпадения композиции: ${v.similarity}%`}
                            >
                              {v.similarity === 100 ? '100% совпадение' : `${v.similarity}%`}
                            </span>
                          )}

                          {v.isPreferred && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1 shadow-sm">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>Основная</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                      <span className="text-xs font-mono text-slate-400 w-11 text-right hidden sm:inline mr-1">
                        {v.durStr || '--:--'}
                      </span>

                      {/* Replace local track file with this version (Req 2 in upd_3.1) */}
                      {onReplaceLocalVersion && localVersion && v.source !== 'local' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReplace(v);
                          }}
                          disabled={replacingId === v.id}
                          title="Заменить локальный аудиофайл в коллекции этой версией трека"
                          className={`h-8 px-3 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs active:scale-95 ${
                            replacingId === v.id
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                              : 'text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] border-white/[0.06]'
                          }`}
                        >
                          <ArrowRightLeft className={`w-4 h-4 ${replacingId === v.id ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline text-[11px] font-medium">Заменить файл</span>
                        </button>
                      )}

                      {/* Set / Unset preferred version button (toggles on/off!) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPreferred(v);
                        }}
                        title={
                          v.isPreferred
                            ? 'Снять статус основной версии (кликните, чтобы убрать)'
                            : 'Сделать основной версией для этой песни'
                        }
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                          v.isPreferred
                            ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20 ring-1 ring-amber-400/40'
                            : 'text-slate-400 hover:text-amber-300 hover:bg-white/[0.06] border-white/[0.06]'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${v.isPreferred ? 'fill-current text-amber-400' : ''}`} />
                      </button>

                      {/* Dislike version button (-) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDislike(v);
                        }}
                        title={
                          v.isDisliked
                            ? 'Версия в черном списке'
                            : 'Не нравится эта версия (-) : переключить на другую'
                        }
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                          v.isDisliked
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] border-white/[0.06]'
                        }`}
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>

                      {/* Download button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(v);
                        }}
                        disabled={isDownloaded || isDownloading}
                        title={isDownloaded ? 'Уже в медиатеке' : 'Скачать в медиатеку'}
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                          isDownloaded
                            ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                            : 'text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] border-white/[0.06]'
                        }`}
                      >
                        {isDownloaded ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Download
                            className={`w-4 h-4 ${isDownloading ? 'animate-bounce text-cyan-400' : ''}`}
                          />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500 px-4">
          <span>Нажмите «Звезда», чтобы эта версия песни всегда играла по умолчанию.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

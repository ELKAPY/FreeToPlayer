import React, { useEffect, useState } from 'react';
import {
  Check,
  Disc,
  Download,
  Loader2,
  Music,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { downloadOnlineTrack, fetchOnlineAlbumTracks } from '../api';
import type { OnlineAlbum, OnlineTrack, Track } from '../types';

interface AlbumDetailModalProps {
  album: OnlineAlbum;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayAlbum: (tracks: OnlineTrack[], startIndex?: number) => void;
  onPlayTrack: (track: OnlineTrack) => void;
  onClose: () => void;
  onTrackDownloaded?: (track: Track) => void;
  onToast?: (msg: string) => void;
}

export const AlbumDetailModal: React.FC<AlbumDetailModalProps> = ({
  album,
  currentTrack,
  isPlaying,
  onPlayAlbum,
  onPlayTrack,
  onClose,
  onTrackDownloaded,
  onToast,
}) => {
  const [loading, setLoading] = useState(true);
  const [fullAlbum, setFullAlbum] = useState<OnlineAlbum | null>(null);
  const [downloadingAlbum, setDownloadingAlbum] = useState(false);
  const [albumProgress, setAlbumProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingSingleId, setDownloadingSingleId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchOnlineAlbumTracks(album.id)
      .then((data) => {
        if (isMounted) {
          setFullAlbum(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load album tracks:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [album.id]);

  const tracks = fullAlbum?.tracks || [];

  const handleDownloadSingle = async (tr: OnlineTrack) => {
    setDownloadingSingleId(tr.id);
    try {
      const res = await downloadOnlineTrack(tr);
      if (res.success && res.track) {
        setDownloadedIds((prev) => new Set(prev).add(tr.id));
        if (onTrackDownloaded) onTrackDownloaded(res.track);
        if (onToast) onToast(`«${tr.title}» добавлена в коллекцию`);
      }
    } catch (e) {
      alert('Ошибка при скачивании трека');
    } finally {
      setDownloadingSingleId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (tracks.length === 0 || downloadingAlbum) return;

    setDownloadingAlbum(true);
    setAlbumProgress({ current: 0, total: tracks.length });

    let count = 0;
    for (const tr of tracks) {
      if (downloadedIds.has(tr.id)) {
        count++;
        setAlbumProgress({ current: count, total: tracks.length });
        continue;
      }

      try {
        const res = await downloadOnlineTrack(tr);
        if (res.success && res.track) {
          setDownloadedIds((prev) => new Set(prev).add(tr.id));
          if (onTrackDownloaded) onTrackDownloaded(res.track);
        }
      } catch (e) {
        console.error(`Failed to download ${tr.title}:`, e);
      }

      count++;
      setAlbumProgress({ current: count, total: tracks.length });
    }

    setDownloadingAlbum(false);
    setAlbumProgress(null);
    if (onToast) {
      onToast(`Альбом «${album.title}» успешно скачан в коллекцию!`);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[#0b0d14] border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header with Album Info */}
        <div className="p-5 border-b border-white/[0.08] bg-white/[0.02] flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* Album Cover */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-black/50 overflow-hidden shrink-0 border border-white/[0.08] shadow-lg flex items-center justify-center relative">
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Disc className="w-10 h-10 text-slate-500" />
              )}
            </div>

            {/* Album Details */}
            <div className="min-w-0">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                {album.sourceName || 'Альбом'}
              </span>
              <h2 className="text-base sm:text-xl font-bold text-white truncate mt-1">
                {album.title}
              </h2>
              <p className="text-xs sm:text-sm text-cyan-400 font-medium truncate mt-0.5">
                {album.artist}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {album.year > 0 && <span>{album.year} • </span>}
                <span>{album.trackCount || tracks.length} треков</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Buttons: Play Album & Download Album */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onPlayAlbum(tracks, 0)}
            disabled={tracks.length === 0}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm transition-all cursor-pointer shadow-md disabled:opacity-40 active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Слушать альбом</span>
          </button>

          <button
            onClick={handleDownloadAll}
            disabled={tracks.length === 0 || downloadingAlbum}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1] font-medium text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-40 active:scale-95"
          >
            {downloadingAlbum ? (
              <>
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>
                  Загрузка {albumProgress ? `${albumProgress.current}/${albumProgress.total}` : ''}...
                </span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Скачать весь альбом</span>
              </>
            )}
          </button>
        </div>

        {/* Tracklist */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 min-h-[260px]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 text-xs">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3 opacity-80" />
              <span>Загрузка композиций альбома...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
              <Music className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
              <span>В этом альбоме нет доступных треков</span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {tracks.map((tr, idx) => {
                const isCurrentPlaying = currentTrack?.id === tr.id;
                const isDownloaded = downloadedIds.has(tr.id);
                const isDownloading = downloadingSingleId === tr.id;

                return (
                  <div
                    key={tr.id}
                    className={`group flex items-center justify-between p-2.5 sm:px-3 rounded-xl transition-all ${
                      isCurrentPlaying
                        ? 'bg-cyan-500/10 border border-cyan-500/20 text-white'
                        : 'hover:bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    {/* Index & Play */}
                    <div
                      onClick={() => onPlayTrack(tr)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="w-6 text-center shrink-0 flex items-center justify-center">
                        <span className="text-xs font-mono text-slate-500 group-hover:hidden">
                          {idx + 1}
                        </span>
                        {isCurrentPlaying && isPlaying ? (
                          <Pause className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-cyan-400 hidden group-hover:block fill-cyan-400" />
                        )}
                      </div>

                      <div className="min-w-0 pr-2">
                        <h4
                          className={`text-xs sm:text-sm font-semibold truncate ${
                            isCurrentPlaying ? 'text-cyan-400' : 'text-white'
                          }`}
                        >
                          {tr.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate">{tr.artist}</p>
                      </div>
                    </div>

                    {/* Duration & Download */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-slate-400 w-10 text-right">
                        {tr.durStr || '--:--'}
                      </span>

                      <button
                        onClick={() => handleDownloadSingle(tr)}
                        disabled={isDownloaded || isDownloading}
                        title={isDownloaded ? 'Уже в медиатеке' : 'Скачать трек'}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          isDownloaded
                            ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                            : 'text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] border-white/[0.06]'
                        }`}
                      >
                        {isDownloaded ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Download
                            className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce text-cyan-400' : ''}`}
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
      </div>
    </div>
  );
};

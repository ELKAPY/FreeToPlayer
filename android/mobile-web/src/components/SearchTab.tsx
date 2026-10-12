import { useState } from 'react';
import {
  Check,
  Disc,
  Download,
  Loader2,
  Music,
  Play,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { downloadOnlineTrack, fetchAlbumTracks, searchOnline, searchOnlineAlbums } from '../api';
import type { OnlineAlbum, OnlineTrack } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface SearchTabProps {
  currentTrackId?: string;
  onPlayOnlineTrack: (track: OnlineTrack, queue?: OnlineTrack[]) => void;
  onRefreshLibrary: () => void;
}

export function SearchTab({
  currentTrackId,
  onPlayOnlineTrack,
  onRefreshLibrary,
}: SearchTabProps) {
  const [query, setQuery] = useState<string>('');
  const [source, setSource] = useState<string>('all');
  const [searchMode, setSearchMode] = useState<'tracks' | 'albums'>('tracks');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [trackResults, setTrackResults] = useState<OnlineTrack[]>([]);
  const [albumResults, setAlbumResults] = useState<OnlineAlbum[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [downloadedIds, setDownloadedIds] = useState<Record<string, boolean>>({});

  // Active album modal
  const [activeAlbum, setActiveAlbum] = useState<OnlineAlbum | null>(null);
  const [albumTracks, setAlbumTracks] = useState<OnlineTrack[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState<boolean>(false);

  const sources = [
    { id: 'all', label: 'Все источники' },
    { id: 'hitmo', label: 'Hitmo (Hi-Fi)' },
    { id: 'yandex', label: 'Яндекс Музыка' },
    { id: 'soundcloud', label: 'SoundCloud' },
    { id: 'youtube', label: 'YouTube' },
  ];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    triggerHaptic(15);
    setIsLoading(true);

    if (searchMode === 'tracks') {
      const results = await searchOnline(query, source);
      setTrackResults(results);
    } else {
      const results = await searchOnlineAlbums(query);
      setAlbumResults(results);
    }

    setIsLoading(false);
  };

  const handleDownload = async (track: OnlineTrack) => {
    triggerHaptic(20);
    setDownloadingIds((prev) => ({ ...prev, [track.id]: true }));

    const ok = await downloadOnlineTrack(track);
    setDownloadingIds((prev) => ({ ...prev, [track.id]: false }));

    if (ok) {
      triggerHaptic(40);
      setDownloadedIds((prev) => ({ ...prev, [track.id]: true }));
      onRefreshLibrary();
    }
  };

  const handleOpenAlbum = async (album: OnlineAlbum) => {
    triggerHaptic(15);
    setActiveAlbum(album);
    setIsLoadingAlbum(true);
    const tracks = await fetchAlbumTracks(album.id);
    setAlbumTracks(tracks);
    setIsLoadingAlbum(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-36 flex flex-col gap-4 no-scrollbar select-none">
      {/* Title */}
      <div>
        <h2 className="text-xl font-extrabold text-white">Онлайн Поиск</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Миллионы треков, альбомов и Hi-Fi версий
        </p>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="relative flex items-center">
        <Search className="absolute left-3.5 w-4 h-4 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск музыки, исполнителя, ремикса..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-20 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--accent-color)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-12 p-1 text-neutral-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-1.5 px-3 py-1.5 bg-[var(--accent-color)] text-black font-bold text-xs rounded-xl active:scale-95 transition"
        >
          Найти
        </button>
      </form>

      {/* Mode Switcher: Tracks / Albums */}
      <div className="flex items-center gap-2">
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => {
              triggerHaptic(10);
              setSearchMode('tracks');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              searchMode === 'tracks'
                ? 'bg-white/10 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Треки
          </button>
          <button
            onClick={() => {
              triggerHaptic(10);
              setSearchMode('albums');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              searchMode === 'albums'
                ? 'bg-white/10 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Альбомы
          </button>
        </div>

        {/* Source Pills (for tracks mode) */}
        {searchMode === 'tracks' && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  triggerHaptic(10);
                  setSource(s.id);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition active:scale-95 ${
                  source === s.id
                    ? 'bg-cyan-500/20 text-[var(--accent-color)] border border-cyan-500/30'
                    : 'bg-white/5 text-neutral-400 border border-white/5'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-2 text-neutral-400 text-xs">
          <Loader2 className="w-7 h-7 text-[var(--accent-color)] animate-spin" />
          <span>Поиск в глобальных базах...</span>
        </div>
      )}

      {/* Track Results */}
      {!isLoading && searchMode === 'tracks' && trackResults.length > 0 && (
        <div className="flex flex-col gap-2">
          {trackResults.map((t) => {
            const isPlaying = t.id === currentTrackId;
            const isDownloading = downloadingIds[t.id];
            const isDownloaded = downloadedIds[t.id];

            return (
              <div
                key={t.id}
                onClick={() => {
                  triggerHaptic(15);
                  onPlayOnlineTrack(t, trackResults);
                }}
                className={`flex items-center justify-between p-2.5 rounded-2xl transition active:scale-[0.99] cursor-pointer ${
                  isPlaying
                    ? 'bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30'
                    : 'bg-white/5 border border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-800">
                    {t.coverUrl ? (
                      <img src={t.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-500">
                        <Music className="w-5 h-5 text-[var(--accent-color)]" />
                      </div>
                    )}
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)] animate-ping" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-2">
                    <p
                      className={`text-xs font-bold truncate ${
                        isPlaying ? 'text-[var(--accent-color)]' : 'text-white'
                      }`}
                    >
                      {t.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-neutral-400 truncate">{t.artist}</span>
                      {t.source && (
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold bg-white/10 text-neutral-300">
                          {t.source}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Download Button */}
                <div
                  className="flex items-center gap-2 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleDownload(t)}
                    disabled={isDownloading || isDownloaded}
                    className={`p-2 rounded-xl transition active:scale-90 ${
                      isDownloaded
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : isDownloading
                        ? 'text-cyan-400'
                        : 'text-neutral-400 hover:text-white bg-white/5'
                    }`}
                    title="Скачать в медиатеку"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isDownloaded ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Album Results */}
      {!isLoading && searchMode === 'albums' && albumResults.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {albumResults.map((alb) => (
            <div
              key={alb.id}
              onClick={() => handleOpenAlbum(alb)}
              className="flex flex-col gap-2 p-2.5 rounded-2xl bg-white/5 border border-white/5 active:scale-95 transition cursor-pointer"
            >
              <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-neutral-800">
                {alb.coverUrl ? (
                  <img src={alb.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc className="w-8 h-8 text-[var(--accent-color)]" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{alb.title}</p>
                <p className="text-[11px] text-neutral-400 truncate">{alb.artist}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty / Intro state */}
      {!isLoading && trackResults.length === 0 && albumResults.length === 0 && (
        <div className="py-16 text-center text-neutral-500 text-xs flex flex-col items-center gap-3">
          <div className="p-3.5 rounded-2xl bg-white/5 text-[var(--accent-color)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="max-w-[240px]">
            Введите название песни, артиста или альбома для мгновенного онлайн-поиска
          </p>
        </div>
      )}

      {/* Album Modal */}
      {activeAlbum && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md">
          <div className="w-full bg-neutral-900 border-t border-white/10 rounded-t-3xl p-5 safe-bottom max-h-[85vh] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeAlbum.coverUrl}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover bg-neutral-800"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{activeAlbum.title}</h3>
                  <p className="text-xs text-neutral-400 truncate">{activeAlbum.artist}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveAlbum(null)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-full bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingAlbum ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-color)]" />
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[50vh] flex flex-col gap-2 no-scrollbar">
                {albumTracks.map((t, idx) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      triggerHaptic(15);
                      onPlayOnlineTrack(t, albumTracks);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-5 text-neutral-500 font-mono">{idx + 1}</span>
                      <span className="font-semibold text-white truncate">{t.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(t);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-white"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

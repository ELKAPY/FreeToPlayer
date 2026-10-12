import { useState } from 'react';
import { Heart, ListPlus, Music, Play, Search, X } from 'lucide-react';
import { DEFAULT_COVER, getCoverUrl } from '../api';
import type { Track } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface CollectionTabProps {
  tracks: Track[];
  currentTrackId?: string;
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleLike?: (track: Track) => void;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function CollectionTab({
  tracks,
  currentTrackId,
  onPlayTrack,
  onAddToQueue,
  onToggleLike,
}: CollectionTabProps) {
  const [filterType, setFilterType] = useState<'all' | 'liked' | 'top'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  let filtered = tracks;
  if (filterType === 'liked') {
    filtered = filtered.filter((t) => t.liked);
  } else if (filterType === 'top') {
    filtered = [...filtered].sort((a, b) => (b.plays || 0) - (a.plays || 0));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q))
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-36 flex flex-col gap-4 no-scrollbar select-none">
      {/* Title & Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white">Моя Медиатека</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            {tracks.length} композиций сохранено
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 w-4 h-4 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию или артисту..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--accent-color)]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 p-1 text-neutral-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            triggerHaptic(10);
            setFilterType('all');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
            filterType === 'all'
              ? 'bg-[var(--accent-color)] text-black'
              : 'bg-white/5 text-neutral-300 border border-white/5'
          }`}
        >
          Все ({tracks.length})
        </button>

        <button
          onClick={() => {
            triggerHaptic(10);
            setFilterType('liked');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
            filterType === 'liked'
              ? 'bg-[var(--accent-color)] text-black'
              : 'bg-white/5 text-neutral-300 border border-white/5'
          }`}
        >
          <Heart className="w-3.5 h-3.5 fill-current" />
          <span>Любимые ({tracks.filter((t) => t.liked).length})</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic(10);
            setFilterType('top');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
            filterType === 'top'
              ? 'bg-[var(--accent-color)] text-black'
              : 'bg-white/5 text-neutral-300 border border-white/5'
          }`}
        >
          Топ по прослушиваниям
        </button>
      </div>

      {/* Track List */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-neutral-500 text-xs flex flex-col items-center gap-2">
            <Music className="w-8 h-8 opacity-40" />
            <span>Треки не найдены</span>
          </div>
        ) : (
          filtered.map((t) => {
            const cover = getCoverUrl(t);
            const isPlaying = t.id === currentTrackId;

            return (
              <div
                key={t.id}
                onClick={() => {
                  triggerHaptic(15);
                  onPlayTrack(t, filtered);
                }}
                className={`flex items-center justify-between p-2.5 rounded-2xl transition active:scale-[0.99] cursor-pointer ${
                  isPlaying
                    ? 'bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30'
                    : 'bg-white/5 border border-white/5 hover:bg-white/10'
                }`}
              >
                {/* Left: Thumbnail & Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-800">
                    <img
                      src={cover || DEFAULT_COVER}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_COVER;
                      }}
                    />
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)] animate-ping" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-2">
                    <p
                      className={`text-xs font-bold truncate leading-tight ${
                        isPlaying ? 'text-[var(--accent-color)]' : 'text-white'
                      }`}
                    >
                      {t.title}
                    </p>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">{t.artist}</p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div
                  className="flex items-center gap-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-mono text-neutral-500 mr-1.5">
                    {formatDuration(t.duration)}
                  </span>

                  {onToggleLike && (
                    <button
                      onClick={() => {
                        triggerHaptic(15);
                        onToggleLike(t);
                      }}
                      className="p-2 text-neutral-400 hover:text-rose-500 active:scale-90 transition"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          t.liked ? 'fill-rose-500 text-rose-500' : ''
                        }`}
                      />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      triggerHaptic(15);
                      onAddToQueue(t);
                    }}
                    className="p-2 text-neutral-400 hover:text-white active:scale-90 transition"
                    title="Добавить в очередь"
                  >
                    <ListPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

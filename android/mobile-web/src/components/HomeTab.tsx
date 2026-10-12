import { Compass, Flame, Heart, ListMusic, Music, Play, Radio, Sparkles } from 'lucide-react';
import { DEFAULT_COVER, getCoverUrl } from '../api';
import type { MobileTab, Track } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface HomeTabProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  onNavigateTab: (tab: MobileTab) => void;
  onOpenConnect: () => void;
  isConnected: boolean;
}

export function HomeTab({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onNavigateTab,
  onOpenConnect,
  isConnected,
}: HomeTabProps) {
  const favoriteTracks = tracks.filter((t) => t.liked);
  const recentTracks = [...tracks].slice(0, 10);
  const topTracks = [...tracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-36 flex flex-col gap-6 no-scrollbar">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl p-5 border border-white/10 bg-gradient-to-br from-cyan-950/40 via-neutral-900 to-black shadow-2xl">
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-[var(--accent-color)] border border-cyan-500/30">
              DJ PLAYER HI-FI
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-white leading-tight">
            Музыка в студийном качестве на твоем телефоне
          </h2>

          <p className="text-xs text-neutral-400">
            {isConnected
              ? `Синхронизировано с ПК. Доступно треков: ${tracks.length}`
              : 'Работает в автономном режиме. Подключитесь к ПК для доступа ко всей медиатеке.'}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                triggerHaptic(15);
                if (tracks.length > 0) {
                  onPlayTrack(tracks[0], tracks);
                } else {
                  onNavigateTab('search');
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider active:scale-95 transition shadow-lg"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Слушать музыку</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic(15);
                onNavigateTab('search');
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-semibold text-xs active:scale-95 transition border border-white/10"
            >
              <Compass className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Онлайн поиск</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            triggerHaptic(15);
            onNavigateTab('collection');
          }}
          className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/5 active:scale-95 transition text-left"
        >
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <ListMusic className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Медиатека</p>
            <p className="text-[11px] text-neutral-400">{tracks.length} треков</p>
          </div>
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            onNavigateTab('collection');
          }}
          className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/5 active:scale-95 transition text-left"
        >
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
            <Heart className="w-5 h-5 fill-current" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Любимые</p>
            <p className="text-[11px] text-neutral-400">{favoriteTracks.length} треков</p>
          </div>
        </button>
      </div>

      {/* Recently Added Section */}
      {recentTracks.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-color)]" />
              <h3 className="text-sm font-bold text-white">Недавно добавленные</h3>
            </div>
            <button
              onClick={() => onNavigateTab('collection')}
              className="text-xs text-[var(--accent-color)] font-semibold"
            >
              Все
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recentTracks.map((t) => {
              const cover = getCoverUrl(t);
              const isThisPlaying = t.id === currentTrackId;

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    triggerHaptic(15);
                    onPlayTrack(t, tracks);
                  }}
                  className="flex-shrink-0 w-36 flex flex-col gap-2 p-2.5 rounded-2xl bg-white/5 border border-white/5 active:scale-95 transition cursor-pointer"
                >
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-neutral-800">
                    <img
                      src={cover || DEFAULT_COVER}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_COVER;
                      }}
                    />
                    {isThisPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-[var(--accent-color)] animate-ping" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{t.title}</p>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">{t.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Played Tracks */}
      {topTracks.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Топ прослушиваний</h3>
          </div>

          <div className="flex flex-col gap-2">
            {topTracks.map((t, idx) => {
              const cover = getCoverUrl(t);
              const isThisPlaying = t.id === currentTrackId;

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    triggerHaptic(15);
                    onPlayTrack(t, tracks);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-2xl transition active:scale-98 ${
                    isThisPlaying
                      ? 'bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30'
                      : 'bg-white/5 border border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-4 text-center text-xs font-mono font-bold text-neutral-500">
                      {idx + 1}
                    </span>

                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-800">
                      <img
                        src={cover || DEFAULT_COVER}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_COVER;
                        }}
                      />
                    </div>

                    <div className="min-w-0 flex-1 pr-2">
                      <p
                        className={`text-xs font-bold truncate ${
                          isThisPlaying ? 'text-[var(--accent-color)]' : 'text-white'
                        }`}
                      >
                        {t.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{t.artist}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-neutral-500 pr-1">
                    {t.plays ? `${t.plays} прослуш.` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

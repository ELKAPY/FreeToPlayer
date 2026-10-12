import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FastForward,
  Heart,
  Layers,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  Sliders,
  ThumbsDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getTrackCoverSrc } from '../api';
import { isTrackLiked, toggleLikeTrack } from '../favorites';
import { fetchLyrics, type LyricsData } from '../lyrics';
import { useAppSettings } from '../settings';
import type { Track } from '../types';
import { BigProgressBar } from './BigProgressBar';
import { LyricsQuickSettingsModal } from './LyricsQuickSettingsModal';
import { SeekBackward10, SeekForward10 } from './SeekIcons';

interface NowPlayingExpandedProps {
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  playbackRate?: number;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onSeek: (seconds: number) => void;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onClose: () => void;
  onOpenVersions?: () => void;
  onStartArtistFlow?: () => void;
  onDislikeVersion?: () => void;
  onSelectArtist?: (artist: string) => void;
  onOpenFullSettings?: () => void;
}

export const NowPlayingExpanded: React.FC<NowPlayingExpandedProps> = ({
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  volume,
  isMuted,
  repeatMode,
  isShuffle,
  playbackRate = 1.0,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onSeek,
  onSetVolume,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onClose,
  onOpenVersions,
  onStartArtistFlow,
  onDislikeVersion,
  onSelectArtist,
  onOpenFullSettings,
}) => {
  const { settings } = useAppSettings();
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [isLiked, setIsLiked] = useState<boolean>(() => (currentTrack ? isTrackLiked(currentTrack.id) : false));
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!currentTrack) return;
    setIsLiked(isTrackLiked(currentTrack.id));
    const handleLikesChanged = (e: any) => {
      if (e.detail?.trackId === currentTrack.id) {
        setIsLiked(e.detail.isLiked);
      }
    };
    window.addEventListener('dj_likes_changed', handleLikesChanged);
    return () => window.removeEventListener('dj_likes_changed', handleLikesChanged);
  }, [currentTrack?.id]);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack) {
      setLyricsData(null);
      return;
    }
    if (!settings.autoFetchLyrics && !showLyrics) {
      return;
    }
    setLoadingLyrics(true);
    fetchLyrics(currentTrack.artist, currentTrack.title, currentTrack.duration)
      .then((data) => {
        setLyricsData(data);
      })
      .finally(() => setLoadingLyrics(false));
  }, [currentTrack, showLyrics, settings.autoFetchLyrics]);

  // Find active line index
  const activeIndex = lyricsData?.synced
    ? lyricsData.synced.findIndex((line, i) => {
        const nextTime = lyricsData.synced![i + 1]?.time ?? Infinity;
        return currentTime >= line.time && currentTime < nextTime;
      })
    : -1;

  // Auto-scroll active line
  useEffect(() => {
    if (showLyrics && activeLineRef.current && settings.autoScrollLyrics) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex, showLyrics, settings.autoScrollLyrics]);

  const coverSrc = currentTrack ? getTrackCoverSrc(currentTrack) : null;

  const getLyricsFontClass = (isActive: boolean) => {
    if (settings.lyricsFontSize === 'lg') {
      return isActive
        ? 'text-white text-2xl sm:text-3xl font-extrabold scale-105 drop-shadow-[0_0_15px_rgba(6,182,212,0.9)]'
        : 'text-slate-500 text-base sm:text-lg hover:text-slate-300';
    }
    if (settings.lyricsFontSize === 'sm') {
      return isActive
        ? 'text-white text-lg sm:text-xl font-bold scale-105 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]'
        : 'text-slate-500 text-xs sm:text-sm hover:text-slate-300';
    }
    // 'md'
    return isActive
      ? 'text-white text-xl sm:text-2xl font-bold scale-105 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]'
      : 'text-slate-500 text-sm sm:text-base hover:text-slate-300';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden animate-slide-up select-none"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      {/* Dynamic ambient blurred background from cover */}
      {coverSrc && settings.ambientBackground && (
        <div
          className="absolute inset-0 opacity-20 scale-125 blur-3xl pointer-events-none transition-all duration-1000"
          style={{
            backgroundImage: `url(${coverSrc})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* Top Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <button
          onClick={onClose}
          title="Свернуть (Esc)"
          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLyrics(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              !showLyrics ? 'bg-white/[0.12] text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Обложка
          </button>
          <button
            onClick={() => setShowLyrics(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              showLyrics ? 'bg-white/[0.12] text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Текст песни</span>
          </button>
        </div>

        {/* Quick Settings for Lyrics / Visualizer */}
        <button
          onClick={() => setIsQuickSettingsOpen(true)}
          title="Настройки караоке, шрифта и эффектов"
          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>

      {/* Center Content: Either Big Album Art OR Synced Lyrics */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 max-w-2xl mx-auto w-full text-center min-h-0">
        {!showLyrics ? (
          /* Album Cover View */
          <>
            <div className="relative mb-5">
              <div
                className={`w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden shadow-2xl border border-white/[0.1] relative bg-black/50 transition-all duration-500 ${
                  isPlaying ? 'ring-2 ring-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.25)]' : ''
                }`}
              >
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={currentTrack ? currentTrack.title : ''}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-600">
                    <Music2 className="w-16 h-16 text-slate-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="w-full mb-4 flex flex-col items-center">
              <div className="flex items-center justify-center gap-3 max-w-full">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
                  {currentTrack ? currentTrack.title : 'Трек не выбран'}
                </h1>
                {playbackRate !== 1.0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold">
                    {playbackRate}x
                  </span>
                )}
                {currentTrack && (
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = toggleLikeTrack(currentTrack.id);
                        setIsLiked(next);
                      }}
                      title={isLiked ? 'Удалить из любимых' : 'Добавить в любимые'}
                      className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/[0.08] transition-all cursor-pointer shrink-0 active:scale-90"
                    >
                      <Heart
                        className={`w-6 h-6 transition-transform active:scale-125 ${
                          isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-400 hover:text-rose-400'
                        }`}
                      />
                    </button>

                    {/* Dislike version button (-) */}
                    {onDislikeVersion && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDislikeVersion();
                        }}
                        title="Не нравится эта версия (-): переключить на другую версию песни"
                        className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/[0.08] text-slate-400 hover:text-rose-400 transition-all cursor-pointer shrink-0 active:scale-90"
                      >
                        <ThumbsDown className="w-5 h-5 transition-transform active:rotate-12" />
                      </button>
                    )}

                    {/* Versions button */}
                    {onOpenVersions && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenVersions();
                        }}
                        title="Версии композиции (Live, Reverb, Acoustic, Remix)"
                        className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/[0.08] text-slate-400 hover:text-purple-400 transition-all cursor-pointer shrink-0 active:scale-90"
                      >
                        <Layers className="w-5 h-5" />
                      </button>
                    )}

                    {/* Artist flow button */}
                    {onStartArtistFlow && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartArtistFlow();
                        }}
                        title={`Запустить поток по исполнителю: ${currentTrack.artist}`}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/[0.08] text-slate-400 hover:text-cyan-400 transition-all cursor-pointer shrink-0 active:scale-90"
                      >
                        <Radio className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm sm:text-base text-slate-300 font-medium truncate mt-1">
                {currentTrack ? (
                  <span
                    onClick={() => {
                      if (onSelectArtist) onSelectArtist(currentTrack.artist);
                    }}
                    className="hover:text-cyan-400 hover:underline cursor-pointer"
                  >
                    {currentTrack.artist}
                  </span>
                ) : (
                  'Выберите композицию из медиатеки'
                )}
              </p>
              {currentTrack?.album && currentTrack.album !== 'Unknown Album' && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{currentTrack.album}</p>
              )}
            </div>
          </>
        ) : (
          /* Synced Lyrics Karaoke View */
          <div
            ref={lyricsContainerRef}
            className="w-full h-full max-h-[380px] overflow-y-auto px-4 py-6 flex flex-col items-center gap-4 text-center scroll-smooth"
          >
            {loadingLyrics ? (
              <p className="text-sm text-slate-400 animate-pulse my-auto">
                Поиск синхронизированного текста...
              </p>
            ) : lyricsData?.synced && lyricsData.synced.length > 0 ? (
              lyricsData.synced.map((line, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <p
                    key={idx}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => onSeek(line.time)}
                    className={`transition-all duration-300 cursor-pointer font-medium max-w-lg leading-relaxed ${getLyricsFontClass(
                      isActive
                    )}`}
                  >
                    {line.text}
                  </p>
                );
              })
            ) : lyricsData?.plain ? (
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line my-auto max-w-md">
                {lyricsData.plain}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 my-auto">
                <p className="text-sm text-slate-500">
                  Текст для этой песни пока не найден в базе.
                </p>
                <button
                  onClick={() => {
                    if (!currentTrack) return;
                    setLoadingLyrics(true);
                    fetchLyrics(currentTrack.artist, currentTrack.title, currentTrack.duration)
                      .then((data) => setLyricsData(data))
                      .finally(() => setLoadingLyrics(false));
                  }}
                  className="px-3 py-1 text-xs rounded-lg border border-white/10 text-cyan-400 hover:bg-white/[0.06] transition-all cursor-pointer"
                >
                  Повторить поиск
                </button>
              </div>
            )}
          </div>
        )}

        {/* Big Scrubber */}
        <div className="w-full max-w-xl mb-4">
          <BigProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={onSeek}
            disabled={!currentTrack}
          />
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 w-full max-w-md mb-4">
          <button
            onClick={onToggleShuffle}
            title={isShuffle ? 'Случайный порядок (Вкл)' : 'Случайный порядок (Выкл)'}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              isShuffle ? 'text-cyan-400 bg-cyan-500/15 border border-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={() => onSeek(currentTime - (settings.seekStepSeconds || 10))}
            title={`-${settings.seekStepSeconds || 10} сек`}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer active:scale-90"
          >
            <SeekBackward10 className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            onClick={onPrevTrack}
            title="Предыдущий трек"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90 cursor-pointer"
          >
            <Rewind className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
          </button>

          <button
            onClick={onTogglePlay}
            title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white text-slate-950 shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
            ) : (
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current translate-x-0.5" />
            )}
          </button>

          <button
            onClick={onNextTrack}
            title="Следующий трек"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90 cursor-pointer"
          >
            <FastForward className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
          </button>

          <button
            onClick={() => onSeek(currentTime + (settings.seekStepSeconds || 10))}
            title={`+${settings.seekStepSeconds || 10} сек`}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer active:scale-90"
          >
            <SeekForward10 className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            onClick={onToggleRepeat}
            title={`Повтор: ${repeatMode}`}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              repeatMode !== 'off' ? 'text-cyan-400 bg-cyan-500/15 border border-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Volume Bar */}
        <div className="flex items-center justify-center gap-3 w-full max-w-xs pb-4">
          <button
            onClick={onToggleMute}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer active:scale-90"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-5 h-5 text-rose-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-slate-300" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => onSetVolume(parseFloat(e.target.value))}
            className="w-32 sm:w-44 h-1.5 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
      </div>

      {/* Lyrics Quick Settings Modal */}
      {isQuickSettingsOpen && (
        <LyricsQuickSettingsModal
          isOpen={isQuickSettingsOpen}
          onClose={() => setIsQuickSettingsOpen(false)}
          onOpenFullSettings={onOpenFullSettings}
        />
      )}
    </div>
  );
};

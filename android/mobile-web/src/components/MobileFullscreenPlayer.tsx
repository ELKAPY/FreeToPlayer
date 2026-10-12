import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Heart,
  ListMusic,
  Mic2,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Trash2,
} from 'lucide-react';
import { DEFAULT_COVER, getCoverUrl } from '../api';
import { fetchLyrics, type LyricsData } from '../lyrics';
import type { OnlineTrack, Track } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface MobileFullscreenPlayerProps {
  currentTrack: Track | OnlineTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  queue: (Track | OnlineTrack)[];
  serverUrl: string;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onPlayQueueTrack: (track: Track | OnlineTrack) => void;
  onRemoveFromQueue: (index: number) => void;
  onOpenEq: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function MobileFullscreenPlayer({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  repeatMode,
  isShuffle,
  queue,
  serverUrl,
  isLiked,
  onToggleLike,
  onClose,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onToggleShuffle,
  onToggleRepeat,
  onPlayQueueTrack,
  onRemoveFromQueue,
  onOpenEq,
}: MobileFullscreenPlayerProps) {
  const [activeTab, setActiveTab] = useState<'cover' | 'lyrics' | 'queue'>('cover');
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack) {
      setLyricsData(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingLyrics(true);

    fetchLyrics(currentTrack.artist, currentTrack.title, duration, serverUrl)
      .then((data) => {
        if (!isCancelled) {
          setLyricsData(data);
          setIsLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLyricsData(null);
          setIsLoadingLyrics(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack, duration, serverUrl]);

  // Find active lyric line
  const activeLyricIndex = lyricsData?.synced
    ? lyricsData.synced.reduce((bestIdx, line, idx) => {
        if (line.time <= currentTime + 0.3) {
          return idx;
        }
        return bestIdx;
      }, -1)
    : -1;

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeTab === 'lyrics' && lyricsContainerRef.current && activeLyricIndex >= 0) {
      const activeEl = lyricsContainerRef.current.children[activeLyricIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeLyricIndex, activeTab]);

  if (!currentTrack) return null;

  const coverUrl = getCoverUrl(currentTrack) || DEFAULT_COVER;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-main)] safe-top safe-bottom overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300 select-none">
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 opacity-25 blur-3xl pointer-events-none scale-150 transition-opacity duration-700"
        style={{
          backgroundImage: `url(${coverUrl})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button
          onClick={() => {
            triggerHaptic(15);
            onClose();
          }}
          className="p-2 text-neutral-300 hover:text-white rounded-full bg-white/5 active:scale-90 transition"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center">
          <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
            {activeTab === 'cover' ? 'СЕЙЧАС ИГРАЕТ' : activeTab === 'lyrics' ? 'ТЕКСТ ПЕСНИ' : 'ОЧЕРЕДЬ'}
          </span>
          <p className="text-xs font-bold text-white max-w-[200px] truncate">
            {currentTrack.title}
          </p>
        </div>

        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenEq();
          }}
          className="p-2 text-neutral-300 hover:text-white rounded-full bg-white/5 active:scale-90 transition"
        >
          <Sliders className="w-5 h-5" />
        </button>
      </div>

      {/* Middle Content Area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-4 flex flex-col justify-center items-center no-scrollbar">
        {/* Cover Art View */}
        {activeTab === 'cover' && (
          <div className="w-full flex flex-col items-center justify-center my-auto">
            <div
              className={`relative w-[72vw] max-w-[320px] aspect-square rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 border border-white/10 ${
                isPlaying ? 'scale-100 glow-active' : 'scale-95 opacity-85'
              }`}
            >
              <img
                src={coverUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_COVER;
                }}
              />
            </div>
          </div>
        )}

        {/* Synchronized Lyrics View */}
        {activeTab === 'lyrics' && (
          <div
            ref={lyricsContainerRef}
            className="w-full h-[50vh] overflow-y-auto px-2 py-8 flex flex-col items-center gap-6 text-center no-scrollbar"
          >
            {isLoadingLyrics ? (
              <div className="my-auto text-neutral-400 text-sm animate-pulse">
                Загрузка караоке-текста...
              </div>
            ) : lyricsData?.synced && lyricsData.synced.length > 0 ? (
              lyricsData.synced.map((line, idx) => {
                const isActive = idx === activeLyricIndex;
                return (
                  <p
                    key={idx}
                    onClick={() => {
                      triggerHaptic(15);
                      onSeek(line.time);
                    }}
                    className={`cursor-pointer transition-all duration-300 font-semibold leading-relaxed ${
                      isActive
                        ? 'text-[var(--accent-color)] text-xl scale-105 font-bold'
                        : 'text-neutral-500 hover:text-neutral-300 text-base opacity-60'
                    }`}
                  >
                    {line.text}
                  </p>
                );
              })
            ) : lyricsData?.plain ? (
              <div className="text-neutral-300 whitespace-pre-line text-sm leading-relaxed my-auto">
                {lyricsData.plain}
              </div>
            ) : (
              <div className="my-auto text-neutral-500 text-sm">
                Текст песни не найден для этого трека
              </div>
            )}
          </div>
        )}

        {/* Queue View */}
        {activeTab === 'queue' && (
          <div className="w-full h-[50vh] overflow-y-auto px-2 py-2 flex flex-col gap-2 no-scrollbar">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              В очереди: {queue.length} треков
            </p>
            {queue.map((t, idx) => {
              const isCurrent = t.id === currentTrack.id;
              return (
                <div
                  key={`${t.id}-${idx}`}
                  onClick={() => {
                    triggerHaptic(15);
                    onPlayQueueTrack(t);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl transition ${
                    isCurrent
                      ? 'bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/30 text-white'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className={`text-sm truncate font-medium ${isCurrent ? 'text-[var(--accent-color)] font-bold' : ''}`}>
                      {t.title}
                    </p>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {t.artist}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromQueue(idx);
                    }}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Track Info (Title, Artist, Like) */}
      <div className="relative z-10 px-6 pt-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate leading-tight">
              {currentTrack.title || 'Без названия'}
            </h2>
            <p className="text-sm font-medium text-neutral-400 truncate mt-1">
              {currentTrack.artist || 'Неизвестный исполнитель'}
            </p>
          </div>

          {/* Like Heart Button */}
          {onToggleLike && (
            <button
              onClick={() => {
                triggerHaptic(20);
                onToggleLike();
              }}
              className="p-3 rounded-full text-neutral-400 hover:text-white active:scale-90 transition"
            >
              <Heart
                className={`w-6 h-6 transition-colors ${
                  isLiked ? 'fill-rose-500 text-rose-500' : ''
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Scrubber Progress Slider */}
      <div className="relative z-10 px-6 py-4">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onSeek(val);
            }}
            className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
          />
        </div>
        <div className="flex justify-between items-center text-[11px] font-semibold text-neutral-400 mt-2 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Touch Playback Controls */}
      <div className="relative z-10 px-6 pb-4 flex items-center justify-between">
        {/* Shuffle */}
        <button
          onClick={onToggleShuffle}
          className={`p-3 rounded-full transition active:scale-90 ${
            isShuffle ? 'text-[var(--accent-color)]' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Shuffle className="w-5 h-5" />
        </button>

        {/* Previous */}
        <button
          onClick={onPrev}
          className="p-3 text-neutral-200 hover:text-white active:scale-90 transition"
        >
          <SkipBack className="w-7 h-7 fill-current" />
        </button>

        {/* Big Play / Pause */}
        <button
          onClick={onTogglePlay}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-xl active:scale-95 transition"
        >
          {isPlaying ? (
            <Pause className="w-7 h-7 fill-current" />
          ) : (
            <Play className="w-7 h-7 fill-current ml-1" />
          )}
        </button>

        {/* Next */}
        <button
          onClick={onNext}
          className="p-3 text-neutral-200 hover:text-white active:scale-90 transition"
        >
          <SkipForward className="w-7 h-7 fill-current" />
        </button>

        {/* Repeat */}
        <button
          onClick={onToggleRepeat}
          className={`p-3 rounded-full transition active:scale-90 ${
            repeatMode !== 'off' ? 'text-[var(--accent-color)]' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
        </button>
      </div>

      {/* Bottom Sub-View Switcher (Cover, Lyrics, Queue) */}
      <div className="relative z-10 flex items-center justify-around py-3 px-6 border-t border-white/5 bg-black/20">
        <button
          onClick={() => {
            triggerHaptic(12);
            setActiveTab('cover');
          }}
          className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-xl transition ${
            activeTab === 'cover' ? 'bg-white/10 text-white' : 'text-neutral-500'
          }`}
        >
          <Music2 className="w-4 h-4" />
          <span>Обложка</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic(12);
            setActiveTab('lyrics');
          }}
          className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-xl transition ${
            activeTab === 'lyrics' ? 'bg-white/10 text-[var(--accent-color)]' : 'text-neutral-500'
          }`}
        >
          <Mic2 className="w-4 h-4" />
          <span>Караоке</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic(12);
            setActiveTab('queue');
          }}
          className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-xl transition ${
            activeTab === 'queue' ? 'bg-white/10 text-white' : 'text-neutral-500'
          }`}
        >
          <ListMusic className="w-4 h-4" />
          <span>Очередь ({queue.length})</span>
        </button>
      </div>
    </div>
  );
}

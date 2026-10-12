import { Music2, Pause, Play, SkipForward } from 'lucide-react';
import { DEFAULT_COVER, getCoverUrl } from '../api';
import type { OnlineTrack, Track } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface MobileMiniPlayerProps {
  currentTrack: Track | OnlineTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onExpand: () => void;
}

export function MobileMiniPlayer({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onNext,
  onExpand,
}: MobileMiniPlayerProps) {
  if (!currentTrack) return null;

  const coverUrl = getCoverUrl(currentTrack) || DEFAULT_COVER;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      onClick={onExpand}
      className="fixed left-2.5 right-2.5 bottom-17 z-30 overflow-hidden rounded-2xl bg-neutral-900/90 border border-white/10 backdrop-blur-2xl shadow-2xl active:scale-[0.99] transition cursor-pointer select-none"
      style={{
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.2)',
      }}
    >
      {/* Top progress indicator bar */}
      <div className="w-full h-1 bg-white/10 overflow-hidden">
        <div
          className="h-full bg-[var(--accent-color)] transition-all duration-300"
          style={{
            width: `${progressPercent}%`,
            boxShadow: '0 0 8px var(--accent-color)',
          }}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 gap-3">
        {/* Cover Art */}
        <div className="relative w-11 h-11 flex-shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-md">
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_COVER;
            }}
          />
        </div>

        {/* Title & Artist */}
        <div className="flex-1 min-w-0 pr-1">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {currentTrack.title || 'Без названия'}
          </p>
          <p className="text-xs text-neutral-400 truncate mt-0.5">
            {currentTrack.artist || 'Неизвестный исполнитель'}
          </p>
        </div>

        {/* Play/Pause & Next Buttons */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              triggerHaptic(15);
              onTogglePlay();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black active:scale-90 transition shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              onNext();
            }}
            className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-300 hover:text-white active:scale-90 transition"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

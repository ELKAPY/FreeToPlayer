import React, { useCallback, useRef, useState } from 'react';
import { formatTime } from '../useAudioPlayer';

interface BigProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}

export const BigProgressBar: React.FC<BigProgressBarProps> = ({
  currentTime,
  duration,
  onSeek,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const percent = duration > 0 ? Math.min(100, Math.max(0, ((dragTime ?? currentTime) / duration) * 100)) : 0;

  const calculateTimeFromEvent = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (!containerRef.current || duration <= 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const newTime = calculateTimeFromEvent(e);
    setDragTime(newTime);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled || duration <= 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPercent(ratio * 100);

    if (isDragging) {
      setDragTime(ratio * duration);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      const newTime = calculateTimeFromEvent(e);
      onSeek(newTime);
      setDragTime(null);
    }
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  };

  const displayTime = dragTime ?? currentTime;
  const hoverTime = hoverPercent !== null && duration > 0 ? (hoverPercent / 100) * duration : null;

  return (
    <div className="w-full select-none">
      {/* Time stats */}
      <div className="flex items-center justify-between text-xs font-mono font-medium tracking-wider mb-2 px-1 text-slate-400">
        <span className="text-cyan-400 font-semibold">{formatTime(displayTime)}</span>
        <span className="text-slate-500">
          {duration > 0 ? `-${formatTime(Math.max(0, duration - displayTime))}` : '0:00'}
        </span>
        <span className="text-slate-300 font-semibold">{formatTime(duration)}</span>
      </div>

      {/* The Big Scrubber Bar */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={`relative h-5 group cursor-pointer flex items-center touch-none transition-all duration-150 ${
          disabled ? 'opacity-40 cursor-not-allowed' : ''
        }`}
      >
        {/* Track background */}
        <div className="w-full h-3 group-hover:h-4 bg-slate-800/80 rounded-full overflow-hidden transition-all duration-200 border border-slate-700/60 shadow-inner relative backdrop-blur-md">
          {/* Hover preview marker */}
          {hoverPercent !== null && !disabled && (
            <div
              className="absolute top-0 bottom-0 bg-white/10 pointer-events-none rounded-full"
              style={{ width: `${hoverPercent}%` }}
            />
          )}

          {/* Filled progress with juicy gradient */}
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 rounded-full relative transition-[width] duration-75 ease-linear shadow-[0_0_14px_rgba(6,182,212,0.5)]"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Large Grab Handle (Thumb) */}
        <div
          className="absolute -ml-2.5 w-5 h-5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(6,182,212,1)] border-2 border-slate-950 flex items-center justify-center pointer-events-none transition-transform duration-100 group-hover:scale-125"
          style={{
            left: `${percent}%`,
            transform: isDragging ? 'scale(1.35)' : undefined,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-purple-700" />
        </div>

        {/* Tooltip on hover */}
        {hoverPercent !== null && hoverTime !== null && !disabled && (
          <div
            className="absolute -top-9 px-2 py-0.5 bg-slate-900/95 text-cyan-300 text-xs font-mono font-bold rounded-md shadow-xl border border-cyan-500/40 pointer-events-none -translate-x-1/2 backdrop-blur-md transition-opacity duration-150"
            style={{ left: `${hoverPercent}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>
    </div>
  );
};

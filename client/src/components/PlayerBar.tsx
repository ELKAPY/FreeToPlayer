import React, { useEffect, useState } from 'react';
import {
  ChevronUp,
  FastForward,
  Headphones,
  Heart,
  Layers,
  Music,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  ThumbsDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getTrackCoverSrc } from '../api';
import { isTrackLiked, toggleLikeTrack } from '../favorites';
import type { Track } from '../types';
import { formatTime } from '../useAudioPlayer';
import { SeekBackward10, SeekForward10 } from './SeekIcons';

interface PlayerBarProps {
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
  onSeek: (sec: number) => void;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onOpenHome: () => void;
  onOpenExpanded: () => void;
  onOpenVersions?: () => void;
  onStartArtistFlow?: () => void;
  onDislikeVersion?: () => void;
  onSelectArtist?: (artist: string) => void;
  onOpenAudioSettings?: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
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
  onOpenExpanded,
  onOpenVersions,
  onStartArtistFlow,
  onDislikeVersion,
  onSelectArtist,
  onOpenAudioSettings,
}) => {
  const [isLiked, setIsLiked] = useState<boolean>(() => (currentTrack ? isTrackLiked(currentTrack.id) : false));

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

  if (!currentTrack) return null;

  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl px-4 py-2.5 transition-all select-none"
      style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}
    >
      {/* Top thin scrubber bar */}
      <div
        onClick={(e) => {
          if (duration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(ratio * duration);
        }}
        className={`absolute top-0 left-0 right-0 h-1 transition-all ${
          duration > 0 ? 'bg-white/[0.06] hover:h-2 cursor-pointer group' : 'bg-rose-500/20'
        }`}
      >
        <div
          className={`h-full ${
            duration > 0
              ? 'bg-gradient-to-r from-purple-500 to-cyan-400 group-hover:brightness-125'
              : 'bg-rose-500 animate-pulse w-full'
          }`}
          style={duration > 0 ? { width: `${percent}%` } : undefined}
        />
      </div>

      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
        {/* Track preview */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-xs sm:max-w-sm">
          <div
            onClick={onOpenExpanded}
            className="flex items-center gap-3 min-w-0 cursor-pointer group"
            title="Открыть плеер на весь экран"
          >
            <div className="w-11 h-11 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center border border-white/[0.08] relative group-hover:scale-105 transition-transform">
              {getTrackCoverSrc(currentTrack) ? (
                <img
                  src={getTrackCoverSrc(currentTrack)!}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Music className="w-5 h-5 text-slate-500" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ChevronUp className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <h5 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                  {currentTrack.title}
                </h5>
                {playbackRate !== 1.0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {playbackRate}x
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectArtist) onSelectArtist(currentTrack.artist);
                  }}
                  className="hover:text-cyan-400 hover:underline cursor-pointer"
                >
                  {currentTrack.artist}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const next = toggleLikeTrack(currentTrack.id);
              setIsLiked(next);
            }}
            title={isLiked ? 'Удалить из любимых' : 'Добавить в любимые'}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all duration-200 cursor-pointer shrink-0 active:scale-125"
          >
            <Heart
              className={`w-4 h-4 transition-transform duration-200 ${
                isLiked ? 'fill-rose-500 text-rose-500 animate-heart-pop' : 'text-slate-400 hover:text-rose-400'
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
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all duration-200 cursor-pointer shrink-0 active:scale-90"
            >
              <ThumbsDown className="w-4 h-4 transition-transform active:rotate-12" />
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
              className="w-8 h-8 rounded-xl items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-purple-500/15 transition-all duration-200 cursor-pointer shrink-0 hidden sm:flex active:scale-90"
            >
              <Layers className="w-4 h-4" />
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
              className="w-8 h-8 rounded-xl items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all duration-200 cursor-pointer shrink-0 hidden sm:flex active:scale-90"
            >
              <Radio className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Central Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleShuffle}
            className={`hidden sm:flex w-8.5 h-8.5 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 ${
              isShuffle
                ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={() => onSeek(currentTime - 10)}
            title="-10 сек"
            className="hidden md:flex w-8.5 h-8.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer items-center justify-center active:scale-90 hover:-translate-x-0.5"
          >
            <SeekBackward10 className="w-4 h-4" />
          </button>

          <button
            onClick={onPrevTrack}
            className="w-8.5 h-8.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all duration-200 cursor-pointer active:scale-90 hover:-translate-x-0.5"
          >
            <Rewind className="w-4 h-4 fill-current" />
          </button>

          {/* Main Play/Pause Button with Glow & Spring */}
          <button
            onClick={onTogglePlay}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 cursor-pointer active:scale-90 hover:scale-106 ${
              isPlaying
                ? 'bg-gradient-to-tr from-cyan-400 to-white text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.55)] animate-glow-pulse'
                : 'bg-white hover:bg-cyan-50 text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.35)]'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current translate-x-0.5" />
            )}
          </button>

          <button
            onClick={onNextTrack}
            className="w-8.5 h-8.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all duration-200 cursor-pointer active:scale-90 hover:translate-x-0.5"
          >
            <FastForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => onSeek(currentTime + 10)}
            title="+10 сек"
            className="hidden md:flex w-8.5 h-8.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer items-center justify-center active:scale-90 hover:translate-x-0.5"
          >
            <SeekForward10 className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleRepeat}
            className={`hidden sm:flex w-8.5 h-8.5 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 ${
              repeatMode !== 'off'
                ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]'
            }`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>

          <div className="hidden md:flex items-center text-xs font-mono gap-1.5 ml-2">
            {duration > 0 ? (
              <div className="flex items-center gap-1 text-slate-400">
                <span className="text-slate-200">{formatTime(currentTime)}</span>
                <span className="text-slate-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-semibold shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>LIVE STREAM</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Audio / EQ & Volume */}
        <div className="flex items-center gap-2.5">
          {onOpenAudioSettings && (
            <button
              onClick={onOpenAudioSettings}
              title="Быстрые настройки звука и эквалайзер"
              className="w-8.5 h-8.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-purple-300 border border-white/[0.06] flex items-center justify-center transition-all cursor-pointer active:scale-95"
            >
              <Headphones className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2.5 px-2 py-1 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors">
            <button
              onClick={onToggleMute}
              className="p-1 text-slate-400 hover:text-white hover:scale-110 active:scale-90 transition-all cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400 animate-pulse" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onSetVolume(parseFloat(e.target.value))}
              className="w-16 sm:w-20 h-1 bg-white/[0.1] hover:h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400 transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

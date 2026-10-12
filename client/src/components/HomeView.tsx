import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  DownloadCloud,
  FastForward,
  FolderPlus,
  GripVertical,
  Heart,
  Layers,
  ListMusic,
  LocateFixed,
  Maximize2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Rewind,
  Search,
  Shuffle,
  Sliders,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getTrackCoverSrc } from '../api';
import { getLikedTrackIds, toggleLikeTrack } from '../favorites';
import { createPlaylist } from '../playlists';
import { useAppSettings } from '../settings';
import type { PlaybackState, Track } from '../types';
import { formatTime } from '../useAudioPlayer';
import { BigProgressBar } from './BigProgressBar';
import { PlaybackQuickSettingsModal } from './PlaybackQuickSettingsModal';
import { SeekBackward10, SeekForward10 } from './SeekIcons';
import { Visualizer } from './Visualizer';

interface HomeViewProps {
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  savedState: PlaybackState | null;
  tracks: Track[];
  analyser: AnalyserNode | null;
  sleepTimerMinutes?: number | null;
  sleepRemaining?: number | null;
  playbackRate?: number;
  onPlayTrack: (track: Track, startTime?: number) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onResumeLastSession: () => void;
  onOpenCollection: () => void;
  onOpenExpanded: () => void;
  onReorderQueue?: (newQueue: Track[]) => void;
  onDeleteTrack?: (id: string) => void;
  onSetSleepTimer?: (min: number | null) => void;
  onSetPlaybackRate?: (rate: number) => void;
  onOpenSettings?: () => void;
  onStartArtistFlow?: (artist: string) => void;
  onSelectArtist?: (artist: string) => void;
  onOpenVersions?: (track: Track) => void;
  onNavigateToTab?: (tab: 'home' | 'collection' | 'online' | 'settings', options?: any) => void;
  onUploadFiles?: (files: FileList) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  volume,
  isMuted,
  repeatMode,
  isShuffle,
  tracks,
  analyser,
  sleepTimerMinutes = null,
  sleepRemaining = null,
  playbackRate = 1.0,
  onPlayTrack,
  onTogglePlay,
  onSeek,
  onNextTrack,
  onPrevTrack,
  onSetVolume,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onOpenCollection,
  onOpenExpanded,
  onReorderQueue,
  onDeleteTrack,
  onSetSleepTimer,
  onSetPlaybackRate,
  onOpenSettings,
  onStartArtistFlow,
  onSelectArtist,
  onOpenVersions,
  onNavigateToTab,
  onUploadFiles,
}) => {
  const { settings } = useAppSettings();
  const [queueSearch, setQueueSearch] = useState('');
  const [isQueueSearchOpen, setIsQueueSearchOpen] = useState(false);
  const queueSearchInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => getLikedTrackIds());
  const activeTrackRef = useRef<HTMLDivElement>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);

  useEffect(() => {
    const handleLikes = () => {
      setLikedIds(getLikedTrackIds());
    };
    window.addEventListener('dj_likes_changed', handleLikes);
    return () => window.removeEventListener('dj_likes_changed', handleLikes);
  }, []);

  const scrollToActiveTrack = () => {
    if (activeTrackRef.current) {
      activeTrackRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Auto-scroll to currently playing track on song change
  useEffect(() => {
    if (currentTrack && activeTrackRef.current) {
      activeTrackRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTrack?.id]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const next = [...tracks];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraggedIndex(null);
    if (onReorderQueue) {
      onReorderQueue(next);
    }
  };

  const handleSaveQueueAsPlaylist = () => {
    if (tracks.length === 0) return;
    const name = window.prompt('Название нового плейлиста:', `Очередь (${new Date().toLocaleDateString()})`);
    if (name && name.trim()) {
      const pl = createPlaylist(name.trim());
      for (const t of tracks) {
        pl.trackIds.push(t.id);
      }
      alert(`Плейлист «${name.trim()}» сохранен (${tracks.length} треков)`);
    }
  };

  const filteredQueue = queueSearch
    ? tracks.filter(
        (t) =>
          t.title.toLowerCase().includes(queueSearch.toLowerCase()) ||
          t.artist.toLowerCase().includes(queueSearch.toLowerCase())
      )
    : tracks;

  const totalQueueSeconds = useMemo(() => {
    return filteredQueue.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [filteredQueue]);

  const formatTotalTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0 мин';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    }
    const secs = Math.floor(seconds % 60);
    return `${minutes} мин ${secs} сек`;
  };

  const formatSleepCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-2 sm:px-4 lg:px-6 py-4 select-none">
      {/* 2-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (5/12): Main Now Playing Console */}
        <div className="lg:col-span-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 shadow-lg flex flex-col items-center text-center relative overflow-hidden">
          {/* Quick Settings Icon on Console */}
          <div className="w-full flex items-center justify-between pb-2 mb-1">
            <div className="flex items-center gap-1.5">
              {playbackRate !== 1.0 && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold">
                  {playbackRate}x
                </span>
              )}
              {sleepRemaining !== null && sleepRemaining > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono animate-pulse">
                  <Timer className="w-2.5 h-2.5" />
                  <span>{formatSleepCountdown(sleepRemaining)}</span>
                </span>
              )}
            </div>

            <button
              onClick={() => setIsQuickSettingsOpen(true)}
              title="Настройки плеера, скорости и таймера сна"
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 border border-white/[0.06] hover:border-cyan-500/30 transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Cover Art (Clickable to open full screen player) */}
          <div
            onClick={onOpenExpanded}
            className="relative mb-3 cursor-pointer group"
            title="Открыть плеер на весь экран"
          >
            <div
              className={`w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden shadow-xl border border-white/[0.08] relative bg-black/40 group-hover:scale-102 transition-all ${
                isPlaying ? 'ring-1 ring-cyan-500/30' : ''
              }`}
            >
              {getTrackCoverSrc(currentTrack) ? (
                <img
                  src={getTrackCoverSrc(currentTrack)!}
                  alt={currentTrack?.title || 'Cover'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-slate-600">
                  <div
                    className={`w-20 h-20 rounded-full border border-white/[0.08] bg-[#07080c] flex items-center justify-center ${
                      isPlaying && settings.vinylSpinEnabled ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: '10s' }}
                  >
                    <Music2 className="w-6 h-6 text-slate-500" />
                  </div>
                </div>
              )}
              {/* Expand icon on hover */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl">
                <Maximize2 className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Track Info */}
          <div className="w-full mb-2 flex items-center justify-between gap-2 px-1">
            <div className="min-w-0 flex-1 text-left">
              <h2
                onClick={onOpenExpanded}
                className="text-base sm:text-lg font-bold text-white tracking-tight truncate hover:text-cyan-400 cursor-pointer transition-colors"
                title="Открыть плеер на весь экран"
              >
                {currentTrack ? currentTrack.title : 'Трек не выбран'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-normal truncate mt-0.5">
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
                  'Выберите композицию из очереди'
                )}
              </p>
              {currentTrack?.album && currentTrack.album !== 'Unknown Album' && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{currentTrack.album}</p>
              )}
            </div>

            {currentTrack && (
              <div className="flex items-center gap-1 shrink-0">
                {onStartArtistFlow && (
                  <button
                    onClick={() => onStartArtistFlow(currentTrack.artist)}
                    title={`Запустить поток: ${currentTrack.artist}`}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLikeTrack(currentTrack.id);
                    setLikedIds(getLikedTrackIds());
                  }}
                  title={likedIds.has(currentTrack.id) ? 'Удалить из любимых' : 'Добавить в любимые'}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  <Heart
                    className={`w-5 h-5 transition-transform active:scale-125 ${
                      likedIds.has(currentTrack.id) ? 'fill-rose-500 text-rose-500' : 'text-slate-400 hover:text-rose-400'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Visualizer */}
          <div className="w-full max-w-xs mb-3 opacity-80">
            <Visualizer analyser={analyser} isPlaying={isPlaying} />
          </div>

          {/* Scrubber Bar */}
          <div className="w-full mb-3">
            <BigProgressBar
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              disabled={!currentTrack}
            />
          </div>

          {/* Controls - Row 1: Transport */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 w-full mb-2.5">
            <button
              onClick={onToggleShuffle}
              title={isShuffle ? 'Случайный порядок включен' : 'Случайный порядок'}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                isShuffle
                  ? 'text-cyan-400 bg-cyan-500/15'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={() => onSeek(currentTime - (settings.seekStepSeconds || 10))}
              disabled={!currentTrack}
              title={`-${settings.seekStepSeconds || 10} сек`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer disabled:opacity-30 flex items-center justify-center"
            >
              <SeekBackward10 className="w-5 h-5" />
            </button>

            <button
              onClick={onPrevTrack}
              title="Предыдущий трек"
              className="p-2 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <Rewind className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={onTogglePlay}
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
              className="p-3.5 rounded-full bg-white text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              onClick={onNextTrack}
              title="Следующий трек"
              className="p-2 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <FastForward className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={() => onSeek(currentTime + (settings.seekStepSeconds || 10))}
              disabled={!currentTrack}
              title={`+${settings.seekStepSeconds || 10} сек`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer disabled:opacity-30 flex items-center justify-center"
            >
              <SeekForward10 className="w-5 h-5" />
            </button>

            <button
              onClick={onToggleRepeat}
              title={`Повтор: ${repeatMode}`}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                repeatMode !== 'off'
                  ? 'text-cyan-400 bg-cyan-500/15'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Controls - Row 2: Volume */}
          <div className="flex items-center justify-center gap-2.5">
            <button
              onClick={onToggleMute}
              title={isMuted ? 'Включить звук' : 'Без звука'}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-400" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onSetVolume(parseFloat(e.target.value))}
              className="w-28 sm:w-36 h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* Right Column (7/12): Full Interactive Queue */}
        <div className="lg:col-span-7 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 flex flex-col min-h-[460px] h-[calc(100vh-210px)] max-h-[85vh]">
          {/* Queue Header & Search */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 flex-wrap">
              <ListMusic className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">
                Очередь воспроизведения
              </h3>
              <span className="text-[11px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
                {filteredQueue.length} треков • {formatTotalTime(totalQueueSeconds)}
              </span>
              {currentTrack && (
                <button
                  onClick={scrollToActiveTrack}
                  title="Прокрутить к играющему треку (центрировать)"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-cyan-400 border border-white/[0.06] transition-all cursor-pointer text-[11px] font-medium shrink-0"
                >
                  <LocateFixed className="w-3 h-3 text-cyan-400" />
                  <span className="hidden sm:inline">К играющему</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Save Queue as Playlist */}
              {tracks.length > 0 && (
                <button
                  onClick={handleSaveQueueAsPlaylist}
                  title="Сохранить текущую очередь как новый плейлист"
                  className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 border border-white/[0.06] flex items-center justify-center transition-all cursor-pointer active:scale-95"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}

              {/* Clear Queue */}
              {onReorderQueue && tracks.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Очистить очередь воспроизведения?')) {
                      onReorderQueue([]);
                    }
                  }}
                  title="Очистить очередь"
                  className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/[0.06] flex items-center justify-center transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {isQueueSearchOpen || queueSearch ? (
                <div className="relative animate-search-slide flex items-center w-36 sm:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={queueSearchInputRef}
                    type="text"
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setQueueSearch('');
                        setIsQueueSearchOpen(false);
                      }
                    }}
                    placeholder="Поиск..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-black/40 border border-cyan-500/40 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 shadow-md"
                  />
                  <button
                    onClick={() => {
                      setQueueSearch('');
                      setIsQueueSearchOpen(false);
                    }}
                    title="Закрыть поиск (Esc)"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.1] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsQueueSearchOpen(true);
                    setTimeout(() => queueSearchInputRef.current?.focus(), 50);
                  }}
                  title="Поиск в очереди"
                  className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-cyan-400 border border-white/[0.06] hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
                >
                  <Search className="w-4 h-4 text-cyan-400" />
                </button>
              )}

              <button
                onClick={onOpenCollection}
                className="px-2.5 py-1.5 rounded-xl text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-medium transition-all cursor-pointer shrink-0 active:scale-95"
              >
                Медиатека →
              </button>
            </div>
          </div>

          {/* Queue Tracks List */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03] pr-1 mt-2">
            {tracks.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-center p-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Добро пожаловать в FreeToPlayer!
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
                  Ваша очередь пуста. Выберите удобный способ добавить или включить любимую музыку:
                </p>

                <div className="w-full max-w-md grid grid-cols-2 gap-2 text-left">
                  {/* Option 1: Онлайн-Поиск и Радио */}
                  <div
                    onClick={() => onNavigateToTab?.('online')}
                    className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-cyan-500/40 cursor-pointer transition-all group flex flex-col"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Compass className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-semibold text-white">Онлайн-Поиск</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Поиск по Deezer, SoundCloud, Hitmo и 40k+ радиостанций
                    </span>
                  </div>

                  {/* Option 2: Яндекс Музыка */}
                  <div
                    onClick={() => onNavigateToTab?.('settings', { category: 'accounts' })}
                    className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-amber-500/40 cursor-pointer transition-all group flex flex-col"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <DownloadCloud className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-semibold text-white">Яндекс Музыка</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Вход в Яндекс ID и авто-синхронизация плейлиста «Любимое»
                    </span>
                  </div>

                  {/* Option 3: YouTube Music */}
                  <div
                    onClick={() => onNavigateToTab?.('settings', { category: 'accounts' })}
                    className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-rose-500/40 cursor-pointer transition-all group flex flex-col"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Video className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-semibold text-white">YouTube Music</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Вход через Google аккаунт и скачивание ваших треков
                    </span>
                  </div>

                  {/* Option 4: Локальные треки */}
                  <label className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-purple-500/40 cursor-pointer transition-all group flex flex-col">
                    <input
                      type="file"
                      multiple
                      accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          onUploadFiles?.(e.target.files);
                        }
                      }}
                    />
                    <div className="flex items-center gap-2 mb-1.5">
                      <Upload className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-semibold text-white">Открыть файлы</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Или перетащите аудиофайлы мышью прямо в окно плеера
                    </span>
                  </label>
                </div>
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                Ничего не найдено
              </div>
            ) : (
              filteredQueue.map((track, idx) => {
                const isThisPlaying = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    ref={isThisPlaying ? activeTrackRef : null}
                    draggable
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    onClick={() => onPlayTrack(track)}
                    className={`flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer group ${
                      isThisPlaying
                        ? 'bg-white/[0.08] text-white border border-cyan-500/30'
                        : 'hover:bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <GripVertical className="w-3.5 h-3.5 text-slate-600 hover:text-slate-300 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="w-4 text-center text-[11px] font-mono text-slate-500 group-hover:hidden">
                        {idx + 1}
                      </span>
                      <Play className="w-3 h-3 text-cyan-400 hidden group-hover:block fill-cyan-400 shrink-0" />

                      <div className="w-8 h-8 rounded bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] relative flex items-center justify-center">
                        {getTrackCoverSrc(track) ? (
                          <img
                            src={getTrackCoverSrc(track)!}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Music2 className="w-4 h-4 text-slate-600" />
                        )}
                        {isThisPlaying && isPlaying && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-medium truncate ${
                            isThisPlaying ? 'text-cyan-400 font-semibold' : 'text-slate-200'
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectArtist) onSelectArtist(track.artist);
                            }}
                            className="hover:text-cyan-400 hover:underline cursor-pointer"
                          >
                            {track.artist}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-3">
                      {onOpenVersions && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenVersions(track);
                          }}
                          title="Версии композиции (Live, Reverb, Acoustic, Remix)"
                          className="opacity-0 group-hover:opacity-100 w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-purple-500/15 rounded-xl transition-all cursor-pointer active:scale-90"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikeTrack(track.id);
                          setLikedIds(getLikedTrackIds());
                        }}
                        title={likedIds.has(track.id) ? 'Удалить из любимых' : 'Добавить в любимые'}
                        className="w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition-all cursor-pointer active:scale-90"
                      >
                        <Heart
                          className={`w-4 h-4 transition-transform active:scale-125 ${
                            likedIds.has(track.id) ? 'fill-rose-500 text-rose-500' : 'text-slate-400 group-hover:text-slate-300'
                          }`}
                        />
                      </button>

                      <span className="text-[11px] font-mono text-slate-400 min-w-10 text-right px-1">
                        {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                      </span>

                      {onDeleteTrack && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Удалить «${track.title}»?`)) {
                              onDeleteTrack(track.id);
                            }
                          }}
                          title="Удалить трек"
                          className="opacity-0 group-hover:opacity-100 w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition-all cursor-pointer active:scale-90"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Playback Quick Settings Modal */}
      {isQuickSettingsOpen && (
        <PlaybackQuickSettingsModal
          isOpen={isQuickSettingsOpen}
          onClose={() => setIsQuickSettingsOpen(false)}
          sleepTimerMinutes={sleepTimerMinutes}
          sleepRemaining={sleepRemaining}
          onSetSleepTimer={onSetSleepTimer || (() => {})}
          playbackRate={playbackRate}
          onSetPlaybackRate={onSetPlaybackRate || (() => {})}
          onOpenFullSettings={onOpenSettings}
        />
      )}
    </div>
  );
};

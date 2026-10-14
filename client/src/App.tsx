import { useCallback, useEffect, useState } from 'react';
import {
  checkForAppUpdates,
  deleteTrack,
  dislikeVersion,
  fetchUpdateProgress,
  restartAndInstallUpdate,
  startDownloadUpdate,
  editTrackMetadata,
  fetchArtistFlow,
  fetchTracks,
  fetchTrackVersions,
  replaceLocalTrackVersion,
  savePlaybackState,
  saveReorderedQueue,
  uploadAudioFiles,
} from './api';
import { AlbumDetailModal } from './components/AlbumDetailModal';
import { AudioQuickSettingsModal } from './components/AudioQuickSettingsModal';
import { CollectionView } from './components/CollectionView';
import { DropOverlay } from './components/DropOverlay';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { MobileConnectModal } from './components/MobileConnectModal';
import { NowPlayingExpanded } from './components/NowPlayingExpanded';
import { OnlineSearchView } from './components/OnlineSearchView';
import { PlayerBar } from './components/PlayerBar';
import { SettingsView } from './components/SettingsView';
import { TrackVersionsModal } from './components/TrackVersionsModal';
import { updateMediaSession } from './mediaSession';
import { type MusicSourceId, type SettingsCategory, useAppSettings } from './settings';
import { THEMES, applyTheme, type ThemeName } from './theme';
import type { OnlineAlbum, OnlineTrack, Track, TrackVersion, ViewTab } from './types';
import { useAudioPlayer } from './useAudioPlayer';

interface NavState {
  tab: ViewTab;
  settingsCategory?: SettingsCategory;
  artist?: string;
  album?: string;
}

export function App() {
  const { settings, updateSettings } = useAppSettings();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTab, setCurrentTab] = useState<ViewTab>(() => {
    try {
      const saved = sessionStorage.getItem('dj_session_active_tab') as ViewTab;
      if (saved && ['home', 'collection', 'online', 'settings'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'home';
  });
  // Temporary session-only tab storage for settings (resets to 'all' on restart)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>(() => {
    return (sessionStorage.getItem('dj_session_settings_cat') as SettingsCategory) || 'all';
  });
  const [activeArtistFilter, setActiveArtistFilter] = useState<string | null>(null);
  const [activeAlbumFilter, setActiveAlbumFilter] = useState<string | null>(null);
  const [activePlaylistIdFilter, setActivePlaylistIdFilter] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isNowPlayingExpanded, setIsNowPlayingExpanded] = useState<boolean>(false);
  const [activeVersionsTrack, setActiveVersionsTrack] = useState<Track | OnlineTrack | null>(null);
  const [activeAlbum, setActiveAlbum] = useState<OnlineAlbum | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState<boolean>(false);
  const [isAudioQuickSettingsOpen, setIsAudioQuickSettingsOpen] = useState<boolean>(false);
  const [isMobileConnectOpen, setIsMobileConnectOpen] = useState<boolean>(false);

  // Background update check on startup
  const [availableUpdate, setAvailableUpdate] = useState<import('./types').AppUpdateInfo | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<import('./types').AppUpdateProgress | null>(null);
  const [isUpdatingFromBanner, setIsUpdatingFromBanner] = useState(false);

  useEffect(() => {
    // Check for updates 3 seconds after launch silently
    const timer = setTimeout(async () => {
      try {
        const res = await checkForAppUpdates();
        if (res.success && res.update && res.update.hasUpdate) {
          setAvailableUpdate(res.update);
        }
      } catch {}
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleStartBannerUpdate = async () => {
    if (!availableUpdate) return;
    setIsUpdatingFromBanner(true);
    try {
      await startDownloadUpdate();
      const interval = setInterval(async () => {
        try {
          const prog = await fetchUpdateProgress();
          setUpdateDownloadProgress(prog);
          if (prog.status === 'ready') {
            clearInterval(interval);
          } else if (prog.status === 'error') {
            clearInterval(interval);
            setIsUpdatingFromBanner(false);
          }
        } catch {
          clearInterval(interval);
          setIsUpdatingFromBanner(false);
        }
      }, 500);
    } catch {
      setIsUpdatingFromBanner(false);
    }
  };

  // Navigation History Stack (Back/Forward)
  const [navHistory, setNavHistory] = useState<NavState[]>([{ tab: 'home' }]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem('dj_theme') as ThemeName) || 'onyx';
  });

  const [defaultMusicSource, setDefaultMusicSource] = useState<MusicSourceId>(() => {
    return (localStorage.getItem('dj_default_source') as MusicSourceId) || 'all';
  });

  const player = useAudioPlayer(tracks);

  const [isDiscordEnabled, setIsDiscordEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dj_discord_enabled') === 'true';
  });

  // Navigation history push
  const navigateTo = useCallback((
    tab: ViewTab,
    options?: {
      category?: SettingsCategory;
      artist?: string;
      album?: string;
      playlistId?: string;
    }
  ) => {
    setCurrentTab(tab);
    try {
      sessionStorage.setItem('dj_session_active_tab', tab);
    } catch {}
    if (options?.category) {
      setSettingsCategory(options.category);
      try {
        sessionStorage.setItem('dj_session_settings_cat', options.category);
      } catch (e) {}
    }
    setActiveArtistFilter(options?.artist || null);
    setActiveAlbumFilter(options?.album || null);
    setActivePlaylistIdFilter(options?.playlistId || null);

    setNavHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({
        tab,
        settingsCategory: options?.category,
        artist: options?.artist,
        album: options?.album,
      });
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleGoBack = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const target = navHistory[targetIdx];
      if (target) {
        setHistoryIndex(targetIdx);
        setCurrentTab(target.tab);
        if (target.settingsCategory) {
          setSettingsCategory(target.settingsCategory);
          try {
            sessionStorage.setItem('dj_session_settings_cat', target.settingsCategory);
          } catch (e) {}
        }
        setActiveArtistFilter(target.artist || null);
        setActiveAlbumFilter(target.album || null);
      }
    }
  }, [historyIndex, navHistory]);

  const handleGoForward = useCallback(() => {
    if (historyIndex < navHistory.length - 1) {
      const targetIdx = historyIndex + 1;
      const target = navHistory[targetIdx];
      if (target) {
        setHistoryIndex(targetIdx);
        setCurrentTab(target.tab);
        if (target.settingsCategory) {
          setSettingsCategory(target.settingsCategory);
          try {
            sessionStorage.setItem('dj_session_settings_cat', target.settingsCategory);
          } catch (e) {}
        }
        setActiveArtistFilter(target.artist || null);
        setActiveAlbumFilter(target.album || null);
      }
    }
  }, [historyIndex, navHistory]);

  // Back/Forward and Global Search Keyboard/Mouse Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Ctrl+F to open Global Search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      }
      // Alt+Left (Back) and Alt+Right (Forward)
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleGoBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleGoForward();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Browser back/forward mouse buttons
      if (e.button === 3) {
        e.preventDefault();
        handleGoBack();
      } else if (e.button === 4) {
        e.preventDefault();
        handleGoForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleGoBack, handleGoForward]);

  // Auto-start artist flow on queue end event
  useEffect(() => {
    const handleQueueEndFlow = (e: any) => {
      const artist = e.detail?.artist;
      if (artist) {
        handleStartArtistFlow(artist);
      }
    };
    window.addEventListener('dj_trigger_artist_flow', handleQueueEndFlow);
    return () => window.removeEventListener('dj_trigger_artist_flow', handleQueueEndFlow);
  }, []);

  // Restore theme, discord state, and default music source when backend state is loaded
  useEffect(() => {
    if (player.savedState) {
      if (player.savedState.theme) {
        const t = player.savedState.theme as ThemeName;
        setCurrentTheme(t);
        applyTheme(t);
      }
      if (player.savedState.isDiscordEnabled !== undefined) {
        setIsDiscordEnabled(player.savedState.isDiscordEnabled);
        try {
          localStorage.setItem('dj_discord_enabled', String(player.savedState.isDiscordEnabled));
        } catch (e) {}
      }
      if (player.savedState.defaultMusicSource) {
        setDefaultMusicSource(player.savedState.defaultMusicSource as any);
        try {
          localStorage.setItem('dj_default_source', player.savedState.defaultMusicSource);
        } catch (e) {}
      }
    }
  }, [player.savedState]);

  const handleSetDefaultMusicSource = (src: MusicSourceId) => {
    setDefaultMusicSource(src);
    updateSettings({ defaultMusicSource: src });
    try {
      localStorage.setItem('dj_default_source', src);
    } catch (e) {}
    savePlaybackState({
      currentTrackId: player.currentTrack?.id || '',
      currentTime: player.currentTime,
      volume: player.volume,
      isPlaying: player.isPlaying,
      isMuted: player.isMuted,
      repeatMode: player.repeatMode,
      isShuffle: player.isShuffle,
      queue: player.queue.map((t) => t.id),
      theme: currentTheme,
      isDiscordEnabled,
      defaultMusicSource: src,
    }).catch(() => {});
  };

  const handleToggleDiscord = () => {
    setIsDiscordEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dj_discord_enabled', String(next));
      } catch (e) {}
      fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: next,
          title: player.currentTrack?.title || '',
          artist: player.currentTrack?.artist || '',
          coverUrl: player.currentTrack?.coverUrl || '',
          isPlaying: player.isPlaying,
        }),
      }).catch(() => {});
      savePlaybackState({
        currentTrackId: player.currentTrack?.id || '',
        currentTime: player.currentTime,
        volume: player.volume,
        isPlaying: player.isPlaying,
        isMuted: player.isMuted,
        repeatMode: player.repeatMode,
        isShuffle: player.isShuffle,
        queue: player.queue.map((tr) => tr.id),
        theme: currentTheme,
        isDiscordEnabled: next,
      }).catch(() => {});
      return next;
    });
  };

  const handleSetTheme = (t: ThemeName) => {
    setCurrentTheme(t);
    applyTheme(t);
    try {
      localStorage.setItem('dj_theme', t);
    } catch (e) {}
    savePlaybackState({
      currentTrackId: player.currentTrack?.id || '',
      currentTime: player.currentTime,
      volume: player.volume,
      isPlaying: player.isPlaying,
      isMuted: player.isMuted,
      repeatMode: player.repeatMode,
      isShuffle: player.isShuffle,
      queue: player.queue.map((tr) => tr.id),
      theme: t,
      isDiscordEnabled,
    }).catch(() => {});
  };

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // Sync Discord status
  useEffect(() => {
    if (!isDiscordEnabled) return;
    fetch('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        title: player.currentTrack?.title || '',
        artist: player.currentTrack?.artist || '',
        coverUrl: player.currentTrack?.coverUrl || '',
        isPlaying: player.isPlaying,
      }),
    }).catch(() => {});
  }, [isDiscordEnabled, player.currentTrack, player.isPlaying]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchTracks();
      setTracks(data);
      showToast(`Библиотека обновлена (${data.length} треков)`);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  }, []);

  // Auto-sync library when background downloader is running
  useEffect(() => {
    const intervalSec = settings.autoScanIntervalSec || 4;
    if (intervalSec <= 0) return;
    const interval = setInterval(async () => {
      try {
        const data = await fetchTracks();
        setTracks((prev) => {
          if (prev.length !== data.length) {
            return data;
          }
          return prev;
        });
      } catch (e) {}
    }, intervalSec * 1000);
    return () => clearInterval(interval);
  }, [settings.autoScanIntervalSec]);

  const loadTracks = useCallback(async () => {
    try {
      const data = await fetchTracks();
      setTracks(data);
    } catch (e) {
      console.error('Failed to load tracks:', e);
    }
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    try {
      showToast('Импорт файлов...');
      const res = await uploadAudioFiles(files);
      showToast(`Успешно добавлено: ${res.count} трек(ов)`);
      await loadTracks();

      if (!player.currentTrack && res.uploaded.length > 0) {
        player.playTrack(res.uploaded[0]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка загрузки файлов';
      showToast(errorMsg);
    }
  };

  const handleDeleteTrack = async (id: string) => {
    try {
      if (player.currentTrack?.id === id) {
        if (player.audioRef.current) {
          player.audioRef.current.pause();
          player.audioRef.current.removeAttribute('src');
          player.audioRef.current.load();
        }
        player.setCurrentTrack(null);
      }

      player.setQueue((prev) => prev.filter((t) => t.id !== id));
      setTracks((prev) => prev.filter((t) => t.id !== id));

      const ok = await deleteTrack(id);
      if (ok) {
        showToast('Трек удален');
        await loadTracks();
      }
    } catch (e) {
      console.error(e);
      showToast('Не удалось удалить трек');
    }
  };

  const handleEditTrack = async (id: string, data: { title: string; artist: string; album: string; year?: number }) => {
    try {
      const ok = await editTrackMetadata(id, data);
      if (ok) {
        showToast('Теги успешно обновлены');
        await loadTracks();
      }
    } catch (e) {
      console.error(e);
      showToast('Ошибка обновления тегов');
    }
  };

  // Windows Media Session API
  useEffect(() => {
    updateMediaSession(player.currentTrack, {
      onPlay: player.togglePlay,
      onPause: player.togglePlay,
      onNext: player.nextTrack,
      onPrev: player.prevTrack,
      onSeek: player.seek,
    });
  }, [player.currentTrack, player.togglePlay, player.nextTrack, player.prevTrack, player.seek]);

  const handleReorderQueue = async (newQueue: Track[]) => {
    player.setQueue(newQueue);
    await saveReorderedQueue(newQueue.map((t) => t.id));
    savePlaybackState({
      currentTrackId: player.currentTrack?.id || '',
      currentTime: player.currentTime,
      volume: player.volume,
      isPlaying: player.isPlaying,
      isMuted: player.isMuted,
      repeatMode: player.repeatMode,
      isShuffle: player.isShuffle,
      queue: newQueue.map((t) => t.id),
      theme: currentTheme,
      isDiscordEnabled,
    }).catch(() => {});
  };

  const handlePlayOnlineTrack = (virtualTrack: Track) => {
    player.playTrack(virtualTrack);
  };

  const handleAddOnlineTrackToQueue = (virtualTrack: Track) => {
    player.setQueue((prev) => [...prev, virtualTrack]);
    showToast(`«${virtualTrack.title}» добавлен в очередь`);
  };

  const handleTrackDownloaded = (newTrack: Track) => {
    setTracks((prev) => [newTrack, ...prev]);
    showToast(`«${newTrack.title}» скачан в медиатеку!`);
  };

  const handleStartArtistFlow = async (artist: string) => {
    try {
      showToast(`Поиск потока по исполнителю: ${artist}...`);
      const res = await fetchArtistFlow(artist);
      if (res.tracks.length === 0) {
        showToast(`Для исполнителя ${artist} треков не найдено`);
        return;
      }
      const virtualQueue: Track[] = res.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album || 'Поток исполнителя',
        year: t.year || new Date().getFullYear(),
        duration: t.duration,
        format: 'MP3',
        isLossless: false,
        fileSize: 0,
        hasCover: !!t.coverUrl,
        coverUrl: t.coverUrl,
        onlineStreamUrl: t.streamUrl,
        filename: '',
        originalName: `${t.artist} - ${t.title}.mp3`,
        createdAt: new Date().toISOString(),
      }));

      player.setQueue(virtualQueue);
      player.playTrack(virtualQueue[0]);
      showToast(`Запущен поток: ${artist} (${virtualQueue.length} треков)`);
    } catch (e) {
      console.error(e);
      showToast(`Ошибка запуска потока`);
    }
  };

  const handleOpenVersions = (track: Track | OnlineTrack) => {
    setActiveVersionsTrack(track);
  };

  const handlePlayVersion = (version: TrackVersion) => {
    const virtualTrack: Track = {
      id: version.id,
      title: version.title,
      artist: version.artist,
      album: version.album || 'Версия',
      year: new Date().getFullYear(),
      duration: version.duration,
      format: 'MP3',
      isLossless: false,
      fileSize: 0,
      hasCover: !!version.coverUrl,
      coverUrl: version.coverUrl,
      filename: '',
      originalName: `${version.artist} - ${version.title}.mp3`,
      createdAt: new Date().toISOString(),
      onlineStreamUrl: version.streamUrl,
    };

    const targetTrack = activeVersionsTrack || player.currentTrack;
    if (targetTrack) {
      player.setQueue((prevQueue) => {
        const idx = prevQueue.findIndex((t) => t.id === targetTrack.id);
        if (idx !== -1) {
          const nextQueue = [...prevQueue];
          nextQueue[idx] = virtualTrack;
          return nextQueue;
        }
        return [virtualTrack, ...prevQueue];
      });
    } else {
      player.setQueue((prevQueue) => [virtualTrack, ...prevQueue]);
    }

    const isReplacingCurrentlyPlaying = !activeVersionsTrack || (player.currentTrack && activeVersionsTrack.id === player.currentTrack.id);
    const resumeTime = isReplacingCurrentlyPlaying && player.currentTime > 0 ? player.currentTime : 0;

    player.playTrack(virtualTrack, resumeTime);
    showToast(`Включена версия: ${version.versionLabel} (${version.sourceName})`);
    setActiveVersionsTrack(null);
  };

  const handleDislikeCurrentVersion = async () => {
    if (!player.currentTrack) return;
    try {
      showToast('Подбираем альтернативную версию песни...');
      const versionsData = await fetchTrackVersions(
        player.currentTrack.title,
        player.currentTrack.artist
      );
      await dislikeVersion({
        songKey: versionsData.songKey,
        artist: player.currentTrack.artist,
        title: player.currentTrack.title,
        trackId: player.currentTrack.id,
      });

      const alternatives = versionsData.versions.filter(
        (v) => v.id !== player.currentTrack?.id && !v.isDisliked
      );
      if (alternatives.length > 0) {
        handlePlayVersion(alternatives[0]);
      } else {
        showToast('Версия отклонена (-), других версий не найдено');
      }
    } catch (e) {
      console.error(e);
      showToast('Не удалось переключить версию');
    }
  };

  const handleOpenAlbum = (album: OnlineAlbum) => {
    setActiveAlbum(album);
  };

  const handlePlayAlbum = (albumTracks: OnlineTrack[], startIndex: number = 0) => {
    if (albumTracks.length === 0) return;
    const virtualQueue: Track[] = albumTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album || activeAlbum?.title || 'Альбом',
      year: t.year || activeAlbum?.year || new Date().getFullYear(),
      duration: t.duration,
      format: 'MP3',
      isLossless: false,
      fileSize: 0,
      hasCover: !!t.coverUrl,
      coverUrl: t.coverUrl,
      onlineStreamUrl: t.streamUrl,
      filename: '',
      originalName: `${t.artist} - ${t.title}.mp3`,
      createdAt: new Date().toISOString(),
    }));

    player.setQueue(virtualQueue);
    player.playTrack(virtualQueue[startIndex]);
    showToast(`Воспроизведение альбома (${virtualQueue.length} треков)`);
    setActiveAlbum(null);
  };

  const handlePlayTracks = (tracksList: Track[], startIndex: number = 0) => {
    if (tracksList.length === 0) return;
    player.setQueue(tracksList);
    player.playTrack(tracksList[startIndex]);
  };

  const handlePlayTrackFromCollection = (track: Track, currentFilteredList?: Track[]) => {
    const sourceList = (currentFilteredList && currentFilteredList.length > 0) ? currentFilteredList : tracks;
    const selectedIdx = sourceList.findIndex((t) => t.id === track.id);
    const chosen = selectedIdx >= 0 ? sourceList[selectedIdx] : track;

    if (player.isShuffle) {
      // 1. Shuffled mode: выбранный трек идёт первым, остальные перемешиваются
      const others = sourceList.filter((t) => t.id !== chosen.id);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      const shuffledQueue = [chosen, ...others];
      player.setQueue(shuffledQueue);
      player.playTrack(chosen);
    } else {
      // 2. Linear mode: поток идёт строго по списку библиотеки начиная с выбранного
      player.setQueue(sourceList);
      player.playTrack(chosen);
    }
  };

  const handleAddTracksToQueue = (newTracks: Track[]) => {
    player.setQueue((prev) => [...prev, ...newTracks]);
    showToast(`Добавлено в очередь: ${newTracks.length} треков`);
  };

  const handleReplaceLocalVersion = async (localTrackId: string, version: TrackVersion) => {
    try {
      showToast(`Загрузка и замена файла версией «${version.versionLabel}»...`);
      const res = await replaceLocalTrackVersion(localTrackId, version);
      if (res.success && res.track) {
        await loadTracks();
        setTracks((prev) => {
          const exists = prev.some((t) => t.id === localTrackId || t.id === res.track.id);
          if (exists) {
            return prev.map((t) => (t.id === localTrackId ? res.track : t));
          }
          return [res.track, ...prev];
        });
        player.setQueue((prev) => {
          const exists = prev.some((t) => t.id === localTrackId);
          if (exists) {
            return prev.map((t) => (t.id === localTrackId ? res.track : t));
          }
          return [res.track, ...prev];
        });

        if (player.currentTrack?.id === localTrackId || player.currentTrack?.id === res.track.id) {
          player.setCurrentTrack(res.track);
          if (player.audioRef.current) {
            const currentTime = player.currentTime;
            const isPlaying = player.isPlaying;
            player.audioRef.current.src = `/api/stream/${res.track.id}?t=${Date.now()}`;
            player.audioRef.current.currentTime = currentTime;
            if (isPlaying) {
              player.audioRef.current.play().catch(console.error);
            }
          }
        }
        showToast(`Файл «${res.track.title}» заменен версией ${version.versionLabel}!`);
      }
    } catch (e) {
      console.error(e);
      showToast('Ошибка при замене файла трека');
    }
  };

  // Keyboard events (F11 and Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        const win = window as unknown as { toggleFullscreen?: () => boolean; setWindowCaptionColor?: (hex: string) => void };
        if (typeof win.toggleFullscreen === 'function') {
          win.toggleFullscreen();
          const themeName = (localStorage.getItem('dj_theme') as ThemeName) || 'onyx';
          const theme = THEMES[themeName] || THEMES.onyx;
          if (typeof win.setWindowCaptionColor === 'function') {
            win.setWindowCaptionColor(theme.bg);
          }
        } else if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      } else if (e.key === 'Escape') {
        if (isNowPlayingExpanded) {
          setIsNowPlayingExpanded(false);
        }
        if (isGlobalSearchOpen) {
          setIsGlobalSearchOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNowPlayingExpanded, isGlobalSearchOpen]);

  // Global Drag & Drop events
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsDraggingOver(false);
        dragCounter = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      dragCounter = 0;

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleUploadFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      {/* Hidden HTML5 Audio Element */}
      <audio ref={player.audioRef} crossOrigin="anonymous" preload="metadata" />

      {/* Full-screen Dropzone Overlay */}
      <DropOverlay isDraggingOver={isDraggingOver} />

      {/* Header */}
      <Header
        currentTab={currentTab}
        onTabChange={(tab) => navigateTo(tab)}
        isPlaying={player.isPlaying}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < navHistory.length - 1}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onOpenAudioSettings={() => setIsAudioQuickSettingsOpen(true)}
        onOpenPlayer={() => {
          if (!player.currentTrack) {
            if (player.queue.length > 0) {
              player.playTrack(player.queue[0]);
            } else if (tracks.length > 0) {
              player.playTrack(tracks[0]);
            }
          }
          setIsNowPlayingExpanded(true);
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2 rounded-xl bg-[#090a0f] border border-white/[0.1] text-cyan-300 text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global Available Update Notification Banner */}
      {availableUpdate && availableUpdate.hasUpdate && (
        <div className="sticky top-0 z-40 px-4 py-2 bg-gradient-to-r from-cyan-950/90 via-slate-900/90 to-purple-950/90 border-b border-cyan-500/30 backdrop-blur-md flex items-center justify-between gap-3 text-xs shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <div className="truncate text-slate-200">
              <span className="font-bold text-white">Доступно обновление FreeToPlayer v{availableUpdate.latestVersion}!</span>{' '}
              <span className="text-slate-400 hidden sm:inline">(у вас v{availableUpdate.currentVersion})</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {updateDownloadProgress?.status === 'ready' ? (
              <button
                onClick={() => restartAndInstallUpdate()}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all animate-pulse"
              >
                Установить и перезапустить
              </button>
            ) : isUpdatingFromBanner ? (
              <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-xl border border-white/10 font-mono text-cyan-300 text-xs">
                <span>{updateDownloadProgress?.message || 'Скачивание...'}</span>
                {updateDownloadProgress?.percent !== undefined && updateDownloadProgress.percent > 0 && (
                  <span>{Math.round(updateDownloadProgress.percent)}%</span>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={handleStartBannerUpdate}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95 transition-all"
                >
                  Обновить сейчас
                </button>
                <button
                  onClick={() => navigateTo('settings', { category: 'system' })}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.08] text-xs cursor-pointer active:scale-95 transition-all"
                >
                  Подробнее
                </button>
              </>
            )}

            <button
              onClick={() => setAvailableUpdate(null)}
              title="Закрыть уведомление"
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.1] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 pb-24">
        {currentTab === 'home' && (
          <div key="home" className="view-transition">
            <HomeView
              currentTrack={player.currentTrack}
              currentTime={player.currentTime}
              duration={player.duration}
              isPlaying={player.isPlaying}
              volume={player.volume}
              isMuted={player.isMuted}
              repeatMode={player.repeatMode}
              isShuffle={player.isShuffle}
              savedState={player.savedState}
              tracks={player.queue.length > 0 ? player.queue : tracks}
              analyser={player.analyserRef.current}
              sleepTimerMinutes={player.sleepTimerMinutes}
              sleepRemaining={player.sleepRemaining}
              playbackRate={player.playbackRate}
              onPlayTrack={player.playTrack}
              onTogglePlay={player.togglePlay}
              onSeek={player.seek}
              onNextTrack={player.nextTrack}
              onPrevTrack={player.prevTrack}
              onSetVolume={player.setVolume}
              onToggleMute={player.toggleMute}
              onToggleRepeat={player.toggleRepeat}
              onToggleShuffle={player.toggleShuffle}
              onResumeLastSession={player.resumeLastSession}
              onOpenCollection={() => navigateTo('collection')}
              onOpenExpanded={() => setIsNowPlayingExpanded(true)}
              onReorderQueue={handleReorderQueue}
              onDeleteTrack={handleDeleteTrack}
              onSetSleepTimer={player.setSleepTimer}
              onSetPlaybackRate={player.setPlaybackRate}
              onOpenSettings={() => navigateTo('settings', { category: 'playback' })}
              onStartArtistFlow={handleStartArtistFlow}
              onSelectArtist={(art) => {
                navigateTo('collection', { artist: art });
              }}
              onOpenVersions={handleOpenVersions}
              onNavigateToTab={(tab, opts) => navigateTo(tab, opts)}
              onUploadFiles={handleUploadFiles}
            />
          </div>
        )}

        {currentTab === 'collection' && (
          <div key="collection" className="view-transition">
            <CollectionView
              tracks={tracks}
              currentTrack={player.currentTrack}
              isPlaying={player.isPlaying}
              initialArtist={activeArtistFilter}
              initialAlbum={activeAlbumFilter}
              initialPlaylistId={activePlaylistIdFilter}
              onPlayTrack={handlePlayTrackFromCollection}
              onDeleteTrack={handleDeleteTrack}
              onEditTrack={handleEditTrack}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onStartArtistFlow={handleStartArtistFlow}
              onOpenVersions={handleOpenVersions}
              onPlayTracks={handlePlayTracks}
              onAddTracksToQueue={handleAddTracksToQueue}
              onOpenSettings={() => navigateTo('settings', { category: 'collection' })}
              onOpenUploadDialog={() => {
                const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                fileInput?.click();
              }}
            />
          </div>
        )}

        {currentTab === 'online' && (
          <div key="online" className="view-transition">
            <OnlineSearchView
              currentTrack={player.currentTrack}
              isPlaying={player.isPlaying}
              tracks={tracks}
              defaultMusicSource={defaultMusicSource}
              onPlayOnlineTrack={handlePlayOnlineTrack}
              onAddOnlineTrackToQueue={handleAddOnlineTrackToQueue}
              onTrackDownloaded={handleTrackDownloaded}
              onStartArtistFlow={handleStartArtistFlow}
              onOpenVersions={handleOpenVersions}
              onOpenAlbum={handleOpenAlbum}
              onOpenSettings={() => navigateTo('settings', { category: 'online' })}
            />
          </div>
        )}

        {currentTab === 'settings' && (
          <div key="settings" className="view-transition">
            <SettingsView
              tracks={tracks}
              eqPreset={player.eqPreset}
              eqGains={player.eqGains}
              eqEnabled={player.eqEnabled}
              playbackRate={player.playbackRate}
              stereoBalance={player.stereoBalance}
              isNormalizationEnabled={player.isNormalizationEnabled}
              crossfadeSeconds={player.crossfadeSeconds}
              audioDevices={player.audioDevices}
              selectedDevice={player.selectedDevice}
              selectedDevices={player.selectedDevices}
              sleepTimerMinutes={player.sleepTimerMinutes}
              sleepRemaining={player.sleepRemaining}
              currentTheme={currentTheme}
              isDiscordEnabled={isDiscordEnabled}
              initialCategory={settingsCategory}
              defaultMusicSource={defaultMusicSource}
              onSetDefaultMusicSource={handleSetDefaultMusicSource}
              onRefreshTracks={loadTracks}
              onToast={showToast}
              onSetEqualizerPreset={player.selectEqPreset}
              onSetEqBandGain={player.setEqBandGain}
              onToggleEqEnabled={player.setEqEnabled}
              onSetPlaybackRate={player.setPlaybackRate}
              onSetStereoBalance={player.setStereoBalance}
              onToggleNormalization={player.toggleNormalization}
              onSetAudioDevice={player.setAudioDevice}
              onRefreshAudioDevices={player.refreshAudioDevices}
              onRecoverAudio={player.recoverAudio}
              onSetCrossfade={player.setCrossfadeSeconds}
              onSetSleepTimer={player.setSleepTimer}
              onSetTheme={handleSetTheme}
              onToggleDiscord={handleToggleDiscord}
              onOpenMobileConnect={() => setIsMobileConnectOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Persistent Bottom Player Bar */}
      {(currentTab !== 'home' || settings.showPlayerBarOnHome) && player.currentTrack && (
        <PlayerBar
          currentTrack={player.currentTrack}
          currentTime={player.currentTime}
          duration={player.duration}
          isPlaying={player.isPlaying}
          volume={player.volume}
          isMuted={player.isMuted}
          repeatMode={player.repeatMode}
          isShuffle={player.isShuffle}
          playbackRate={player.playbackRate}
          onTogglePlay={player.togglePlay}
          onNextTrack={player.nextTrack}
          onPrevTrack={player.prevTrack}
          onSeek={player.seek}
          onSetVolume={player.setVolume}
          onToggleMute={player.toggleMute}
          onToggleRepeat={player.toggleRepeat}
          onToggleShuffle={player.toggleShuffle}
          onOpenHome={() => navigateTo('home')}
          onOpenExpanded={() => setIsNowPlayingExpanded(true)}
          onOpenVersions={() => player.currentTrack && handleOpenVersions(player.currentTrack)}
          onStartArtistFlow={() => player.currentTrack && handleStartArtistFlow(player.currentTrack.artist)}
          onDislikeVersion={handleDislikeCurrentVersion}
          onSelectArtist={(art) => navigateTo('collection', { artist: art })}
          onOpenAudioSettings={() => setIsAudioQuickSettingsOpen(true)}
        />
      )}

      {/* Fullscreen Now Playing Overlay */}
      {isNowPlayingExpanded && (
        <NowPlayingExpanded
          currentTrack={player.currentTrack}
          currentTime={player.currentTime}
          duration={player.duration}
          isPlaying={player.isPlaying}
          volume={player.volume}
          isMuted={player.isMuted}
          repeatMode={player.repeatMode}
          isShuffle={player.isShuffle}
          playbackRate={player.playbackRate}
          onTogglePlay={player.togglePlay}
          onNextTrack={player.nextTrack}
          onPrevTrack={player.prevTrack}
          onSeek={player.seek}
          onSetVolume={player.setVolume}
          onToggleMute={player.toggleMute}
          onToggleRepeat={player.toggleRepeat}
          onToggleShuffle={player.toggleShuffle}
          onClose={() => setIsNowPlayingExpanded(false)}
          onOpenVersions={() => player.currentTrack && handleOpenVersions(player.currentTrack)}
          onStartArtistFlow={() => player.currentTrack && handleStartArtistFlow(player.currentTrack.artist)}
          onDislikeVersion={handleDislikeCurrentVersion}
          onSelectArtist={(art) => {
            setIsNowPlayingExpanded(false);
            navigateTo('collection', { artist: art });
          }}
          onOpenFullSettings={() => {
            setIsNowPlayingExpanded(false);
            navigateTo('settings', { category: 'appearance' });
          }}
        />
      )}

      {/* Global Quick Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        tracks={tracks}
        onPlayTrack={player.playTrack}
        onAddTrackToQueue={(tr) => {
          player.setQueue((prev) => [...prev, tr]);
          showToast(`«${tr.title}» добавлен в очередь`);
        }}
        onNavigateTab={(tab) => navigateTo(tab)}
        onSelectArtist={(art) => {
          navigateTo('collection', { artist: art });
        }}
        onSelectPlaylist={(pl) => {
          navigateTo('collection', { playlistId: pl.id });
        }}
        onSelectSmartPlaylist={() => {
          navigateTo('collection');
        }}
        onSearchOnline={(_q, _mode) => {
          navigateTo('online');
        }}
        onOpenSettingsCategory={(cat) => {
          navigateTo('settings', { category: cat });
        }}
        onStartArtistFlow={handleStartArtistFlow}
      />

      {/* Quick Audio Settings Modal */}
      <AudioQuickSettingsModal
        isOpen={isAudioQuickSettingsOpen}
        onClose={() => setIsAudioQuickSettingsOpen(false)}
        eqPreset={player.eqPreset}
        eqGains={player.eqGains}
        eqEnabled={player.eqEnabled}
        isNormalizationEnabled={player.isNormalizationEnabled}
        crossfadeSeconds={player.crossfadeSeconds}
        audioDevices={player.audioDevices}
        selectedDevices={player.selectedDevices}
        onSetEqualizerPreset={player.selectEqPreset}
        onToggleEqEnabled={player.setEqEnabled}
        onToggleNormalization={player.toggleNormalization}
        onSetCrossfade={player.setCrossfadeSeconds}
        onSetAudioDevice={player.setAudioDevice}
        onRecoverAudio={player.recoverAudio}
        onOpenFullSettings={() => navigateTo('settings', { category: 'audio' })}
      />

      {/* Track Versions Modal */}
      {activeVersionsTrack && (
        <TrackVersionsModal
          track={activeVersionsTrack}
          currentTrack={player.currentTrack}
          isPlaying={player.isPlaying}
          onPlayVersion={handlePlayVersion}
          onReplaceLocalVersion={handleReplaceLocalVersion}
          onClose={() => setActiveVersionsTrack(null)}
          onToast={showToast}
        />
      )}

      {/* Album Detail Modal */}
      {activeAlbum && (
        <AlbumDetailModal
          album={activeAlbum}
          currentTrack={player.currentTrack}
          isPlaying={player.isPlaying}
          onPlayAlbum={handlePlayAlbum}
          onPlayTrack={(tr) => {
            const virtualTrack: Track = {
              id: tr.id,
              title: tr.title,
              artist: tr.artist,
              album: tr.album || activeAlbum.title,
              year: tr.year || activeAlbum.year || new Date().getFullYear(),
              duration: tr.duration,
              format: 'MP3',
              isLossless: false,
              fileSize: 0,
              hasCover: !!tr.coverUrl,
              coverUrl: tr.coverUrl,
              filename: '',
              originalName: `${tr.artist} - ${tr.title}.mp3`,
              createdAt: new Date().toISOString(),
            };
            (virtualTrack as any).onlineStreamUrl = tr.streamUrl;
            player.playTrack(virtualTrack);
          }}
          onClose={() => setActiveAlbum(null)}
          onTrackDownloaded={handleTrackDownloaded}
          onToast={showToast}
        />
      )}

      {/* Mobile QR Connect Modal */}
      <MobileConnectModal
        isOpen={isMobileConnectOpen}
        onClose={() => setIsMobileConnectOpen(false)}
        onToast={showToast}
      />
    </div>
  );
}

export default App;

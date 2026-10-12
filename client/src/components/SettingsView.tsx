import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Folder,
  Globe,
  Headphones,
  Key,
  ListMusic,
  LogIn,
  LogOut,
  Palette,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Smartphone,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  fetchAutoCovers,
  fetchStorageStats,
  openStorageFolder,
  setStoragePath,
} from '../api';
import { clearPlayStats } from '../favorites';
import { clearLyricsCache, getLyricsCacheSize } from '../lyrics';
import { exportPlaylistToM3U8 } from '../m3u8';
import {
  type CollectionSortBy,
  type CollectionViewMode,
  type LyricsFontSize,
  type MusicSourceId,
  type QueueEndAction,
  type SettingsCategory,
  type VisualizerStyle,
  useAppSettings,
} from '../settings';
import { THEMES, type ThemeName } from '../theme';
import type { StorageStats, Track } from '../types';
import {
  EQ_FREQUENCIES,
  type EQPresetName,
} from '../useAudioPlayer';

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const YandexIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 5.524 4.477 10 10 10s10-4.476 10-10c0-5.523-4.477-10-10-10zm1.7 14.5h-1.9l-2.8-4.1h-.9v4.1H6.3V7.5h3.6c2.4 0 3.7 1.2 3.7 3 0 1.2-.6 2.1-1.6 2.6l3.6 4.4zm-3.8-5.8c1.1 0 1.7-.5 1.7-1.4s-.6-1.4-1.7-1.4h-1.7v2.8h1.7z" />
  </svg>
);

interface SettingsViewProps {
  tracks: Track[];
  eqPreset: EQPresetName;
  eqGains: number[];
  eqEnabled?: boolean;
  playbackRate?: number;
  stereoBalance?: number;
  isNormalizationEnabled: boolean;
  crossfadeSeconds: number;
  audioDevices: MediaDeviceInfo[];
  selectedDevice: string;
  selectedDevices: string[];
  sleepTimerMinutes: number | null;
  sleepRemaining: number | null;
  currentTheme: ThemeName;
  isDiscordEnabled: boolean;
  initialCategory?: SettingsCategory;
  defaultMusicSource?: MusicSourceId;
  onSetDefaultMusicSource?: (source: MusicSourceId) => void;
  onRefreshTracks?: () => Promise<void>;
  onToast?: (msg: string) => void;
  onSetEqualizerPreset: (preset: EQPresetName) => void;
  onSetEqBandGain: (band: number, gain: number) => void;
  onToggleEqEnabled?: (enabled: boolean) => void;
  onSetPlaybackRate?: (rate: number) => void;
  onSetStereoBalance?: (balance: number) => void;
  onToggleNormalization: () => void;
  onSetAudioDevice: (id: string) => Promise<boolean>;
  onRefreshAudioDevices: () => Promise<void>;
  onRecoverAudio: () => Promise<void>;
  onSetCrossfade: (sec: number) => void;
  onSetSleepTimer: (min: number | null) => void;
  onSetTheme: (theme: ThemeName) => void;
  onToggleDiscord: () => void;
  onOpenMobileConnect?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  tracks,
  eqPreset,
  eqGains,
  eqEnabled = true,
  playbackRate = 1.0,
  stereoBalance: _stereoBalance = 0,
  isNormalizationEnabled,
  crossfadeSeconds,
  audioDevices,
  selectedDevices,
  sleepTimerMinutes,
  sleepRemaining,
  currentTheme,
  isDiscordEnabled,
  initialCategory = 'all',
  onRefreshTracks,
  onToast,
  onSetEqualizerPreset,
  onSetEqBandGain,
  onToggleEqEnabled,
  onSetPlaybackRate,
  onSetStereoBalance,
  onToggleNormalization,
  onSetAudioDevice,
  onRefreshAudioDevices,
  onRecoverAudio,
  onSetCrossfade,
  onSetSleepTimer,
  onSetTheme,
  onToggleDiscord,
  onOpenMobileConnect,
}) => {
  const { settings, updateSettings, resetSettings } = useAppSettings();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(() => {
    if (initialCategory && initialCategory !== 'all') return initialCategory;
    try {
      const saved = sessionStorage.getItem('dj_session_settings_category') as SettingsCategory;
      if (saved && ['all', 'audio', 'playback', 'collection', 'online', 'appearance', 'system'].includes(saved)) {
        return saved;
      }
    } catch {}
    return initialCategory || 'all';
  });

  useEffect(() => {
    if (initialCategory && initialCategory !== 'all') {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_settings_category', activeCategory);
    } catch {}
  }, [activeCategory]);

  const [searchSettingsQuery, setSearchSettingsQuery] = useState('');

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isRefreshingAudio, setIsRefreshingAudio] = useState(false);
  const [_switchingDeviceId, setSwitchingDeviceId] = useState<string | null>(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');
  // Yandex Music State & Account
  const [syncStatus, setSyncStatus] = useState<{
    status: string;
    message: string;
    current: number;
    total: number;
    done: boolean;
    error: string | null;
  } | null>(null);
  const [isSyncingYandex, setIsSyncingYandex] = useState(false);
  const [yandexAccount, setYandexAccount] = useState<{
    isAuthorized: boolean;
    name?: string;
    login?: string;
    hasPlus?: boolean;
    uid?: number;
  } | null>(null);
  const [isLoggingInYandex, setIsLoggingInYandex] = useState(false);
  const [isManualTokenOpen, setIsManualTokenOpen] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');

  // YouTube Music Integration State & Account
  const [youtubeSyncStatus, setYouTubeSyncStatus] = useState<{
    status: string;
    message: string;
    current: number;
    total: number;
    done: boolean;
    error: string | null;
  } | null>(null);
  const [isSyncingYouTube, setIsSyncingYouTube] = useState(false);
  const [youtubePlaylistUrl, setYouTubePlaylistUrl] = useState('');
  const [youtubeHasCookies, setYouTubeHasCookies] = useState(false);
  const [isSavingYouTubeConfig, setIsSavingYouTubeConfig] = useState(false);
  const [youtubeAccount, setYouTubeAccount] = useState<{
    isAuthorized: boolean;
    hasCookies?: boolean;
  } | null>(null);
  const [isLoggingInYouTube, setIsLoggingInYouTube] = useState(false);

  const [isFetchingCovers, setIsFetchingCovers] = useState(false);
  const [coverFetchResult, setCoverFetchResult] = useState<string | null>(null);

  const [networkInfo, setNetworkInfo] = useState<{ port: number; ips: string[]; primaryIp: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch initial accounts status & network info
  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setNetworkInfo(data);
      })
      .catch(() => {});

    // Fetch initial Yandex account info
    fetch('/api/yandex/account')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setYandexAccount(data);
      })
      .catch(() => {});

    // Fetch initial YouTube config & account
    fetch('/api/youtube/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.playlist_url) setYouTubePlaylistUrl(data.playlist_url);
          if (data.hasCookies) setYouTubeHasCookies(true);
        }
      })
      .catch(() => {});

    fetch('/api/youtube/account')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setYouTubeAccount(data);
      })
      .catch(() => {});
  }, []);

  // Poll for Yandex login completion
  useEffect(() => {
    let interval: any = null;
    if (isLoggingInYandex) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/yandex/account');
          if (res.ok) {
            const data = await res.json();
            if (data && data.isAuthorized) {
              setYandexAccount(data);
              setIsLoggingInYandex(false);
              clearInterval(interval);
              if (onToast) onToast(`Успешный вход: ${data.name || data.login || 'Яндекс Музыка'}`);
              if (onRefreshTracks) onRefreshTracks();
            }
          }
        } catch (e) {}
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoggingInYandex, onToast, onRefreshTracks]);

  // Poll for YouTube login completion
  useEffect(() => {
    let interval: any = null;
    if (isLoggingInYouTube) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/youtube/account');
          if (res.ok) {
            const data = await res.json();
            if (data && data.isAuthorized) {
              setYouTubeAccount(data);
              setYouTubeHasCookies(true);
              setIsLoggingInYouTube(false);
              clearInterval(interval);
              if (onToast) onToast('Успешный вход в YouTube Music!');
            }
          }
        } catch (e) {}
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoggingInYouTube, onToast]);

  useEffect(() => {
    let interval: any = null;
    if (isSyncingYandex) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/yandex/status');
          if (res.ok) {
            const data = await res.json();
            setSyncStatus(data);
            if (data.done) {
              setIsSyncingYandex(false);
              clearInterval(interval);
              if (onRefreshTracks) onRefreshTracks();
            }
          }
        } catch (e) {}
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncingYandex, onRefreshTracks]);

  // YouTube sync polling
  useEffect(() => {
    let interval: any = null;
    if (isSyncingYouTube) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/youtube/status');
          if (res.ok) {
            const data = await res.json();
            setYouTubeSyncStatus(data);
            if (data.done) {
              setIsSyncingYouTube(false);
              clearInterval(interval);
              if (onRefreshTracks) onRefreshTracks();
            }
          }
        } catch (e) {}
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncingYouTube, onRefreshTracks]);

  const handleLoginYandex = async () => {
    try {
      setIsLoggingInYandex(true);
      const res = await fetch('/api/yandex/login', { method: 'POST' });
      if (!res.ok) {
        setIsLoggingInYandex(false);
        alert('Не удалось открыть окно входа Яндекс');
      }
    } catch {
      setIsLoggingInYandex(false);
      alert('Ошибка при вызове окна авторизации');
    }
  };

  const handleLogoutYandex = async () => {
    try {
      const res = await fetch('/api/yandex/logout', { method: 'POST' });
      if (res.ok) {
        setYandexAccount(null);
        if (onToast) onToast('Вы вышли из аккаунта Яндекс Музыки');
      }
    } catch {}
  };

  const handleSaveManualToken = async () => {
    if (!manualTokenInput.trim()) return;
    try {
      const res = await fetch('/api/yandex/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manualTokenInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.account && data.account.isAuthorized) {
          setYandexAccount(data.account);
          setManualTokenInput('');
          setIsManualTokenOpen(false);
          if (onToast) onToast('Токен сохранен и подтвержден!');
        } else {
          alert('Токен сохранен, но авторизация не подтвердилась. Проверьте правильность токена.');
        }
      }
    } catch {
      alert('Ошибка при сохранении токена');
    }
  };

  const handleLoginYouTube = async () => {
    try {
      setIsLoggingInYouTube(true);
      const res = await fetch('/api/youtube/login', { method: 'POST' });
      if (!res.ok) {
        setIsLoggingInYouTube(false);
        alert('Не удалось открыть окно входа YouTube');
      }
    } catch {
      setIsLoggingInYouTube(false);
      alert('Ошибка при вызове окна авторизации');
    }
  };

  const handleLogoutYouTube = async () => {
    try {
      const res = await fetch('/api/youtube/logout', { method: 'POST' });
      if (res.ok) {
        setYouTubeAccount(null);
        setYouTubeHasCookies(false);
        if (onToast) onToast('Вы вышли из аккаунта YouTube Music');
      }
    } catch {}
  };

  const handleSavePath = async () => {
    if (!newPathInput.trim()) return;
    const ok = await setStoragePath(newPathInput.trim());
    if (ok) {
      setIsEditingPath(false);
      fetchStorageStats().then(setStats).catch(() => {});
      if (onToast) onToast('Путь к папке обновлен');
    }
  };

  const handleRefreshAudio = async () => {
    setIsRefreshingAudio(true);
    try {
      await onRefreshAudioDevices();
    } finally {
      setTimeout(() => setIsRefreshingAudio(false), 400);
    }
  };

  const handleSelectAudioDevice = async (id: string) => {
    setSwitchingDeviceId(id);
    try {
      await onSetAudioDevice(id);
    } finally {
      setTimeout(() => setSwitchingDeviceId(null), 250);
    }
  };

  useEffect(() => {
    fetchStorageStats()
      .then(setStats)
      .catch((e) => console.error('Failed to load stats', e));
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) {
      return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
  };

  const presets: { id: EQPresetName; name: string }[] = [
    { id: 'flat', name: 'Flat (Студия)' },
    { id: 'rock', name: 'Рок' },
    { id: 'metal', name: 'Метал' },
    { id: 'electronic', name: 'Dance' },
    { id: 'hiphop', name: 'Bass' },
    { id: 'acoustic', name: 'Акустика' },
    { id: 'vocal', name: 'Вокал' },
  ];

  const formatFreq = (hz: number) => {
    return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
  };

  const formatSleepCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFetchCoversBatch = async () => {
    setIsFetchingCovers(true);
    setCoverFetchResult(null);
    try {
      if (onToast) onToast('Поиск 100% совпадающих обложек в сети...');
      const res = await fetchAutoCovers();
      if (res.updatedCount > 0) {
        setCoverFetchResult(`Успешно добавлено обложек: ${res.updatedCount}`);
        if (onRefreshTracks) await onRefreshTracks();
        if (onToast) onToast(`Обновлено ${res.updatedCount} обложек!`);
      } else {
        setCoverFetchResult('Для треков без обложек точных 100% совпадений не найдено');
        if (onToast) onToast('Для треков без обложек точных совпадений не найдено');
      }
    } catch (e) {
      console.error(e);
      setCoverFetchResult('Ошибка при поиске обложек');
    } finally {
      setIsFetchingCovers(false);
    }
  };

  const cleanSearch = searchSettingsQuery.trim().toLowerCase();

  const isSectionVisible = (category: SettingsCategory, keywords: string[] = []) => {
    if (activeCategory !== 'all' && activeCategory !== category) {
      return false;
    }
    if (!cleanSearch) {
      return true;
    }
    return keywords.some((k) => k.toLowerCase().includes(cleanSearch) || cleanSearch.includes(k.toLowerCase()));
  };

  const categories: { id: SettingsCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Все настройки', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'audio', label: 'Звук и EQ', icon: <Headphones className="w-4 h-4" /> },
    { id: 'playback', label: 'Плеер и Очередь', icon: <Clock className="w-4 h-4" /> },
    { id: 'collection', label: 'Медиатека и Файлы', icon: <ListMusic className="w-4 h-4" /> },
    { id: 'online', label: 'Онлайн и Радио', icon: <Globe className="w-4 h-4" /> },
    { id: 'appearance', label: 'Оформление и Текст', icon: <Palette className="w-4 h-4" /> },
    { id: 'system', label: 'Система и Интеграции', icon: <Sliders className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full max-w-[1720px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-5 select-none">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <span>Настройки FreeToPlayer</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Конфигурация аудиоядра, эквалайзера, медиатеки, онлайн-каталогов и внешнего вида
          </p>
        </div>

        {/* Search settings input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchSettingsQuery}
            onChange={(e) => setSearchSettingsQuery(e.target.value)}
            placeholder="Поиск по настройкам..."
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 shadow-inner"
          />
          {searchSettingsQuery && (
            <button
              onClick={() => setSearchSettingsQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Categories Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
        {categories.map((c) => {
          const isSelected = activeCategory === c.id;
          return (
            <button
              key={c.id}
              onClick={() => {
                setActiveCategory(c.id);
                setSearchSettingsQuery('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/40 shadow-sm'
                  : 'bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white border border-white/[0.05]'
              }`}
            >
              <span className={isSelected ? 'text-cyan-400' : 'text-slate-500'}>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Settings Sections */}
      <div className="flex flex-col gap-6">
        {/* ======================================================== */}
        {/* 1. ЗВУК И ЭКВАЛАЙЗЕР (AUDIO & EQ) */}
        {/* ======================================================== */}
        {isSectionVisible('audio', ['звук', 'эквалайзер', 'eq', 'баланс', 'кроссфейд', 'лимитер', 'replaygain', 'громкость', 'цап', 'наушники', 'динамики', 'устройство', 'пресет']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <Headphones className="w-4 h-4 text-purple-400" />
                <span>Звук, Эквалайзер и Вывод</span>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">
                EQ: {eqEnabled ? eqPreset : 'Выключен'}
              </span>
            </div>

            {/* EQ Toggle & Presets */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">10-полосный эквалайзер</h4>
                  <p className="text-[11px] text-slate-400">Точная регулировка частот без искажений</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{eqEnabled ? 'Включен' : 'Выключен'}</span>
                  <button
                    onClick={() => {
                      const next = !eqEnabled;
                      if (onToggleEqEnabled) onToggleEqEnabled(next);
                      updateSettings({ eqEnabled: next });
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      eqEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        eqEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Preset Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {presets.map((p) => {
                  const isSelected = eqPreset === p.id && eqEnabled;
                  return (
                    <button
                      key={p.id}
                      disabled={!eqEnabled}
                      onClick={() => onSetEqualizerPreset(p.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 active:scale-95 ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                          : 'bg-black/20 text-slate-400 border border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>

              {/* 10 Vertical Sliders */}
              <div className={`grid grid-cols-10 gap-1.5 sm:gap-2 p-3 bg-black/30 rounded-xl border border-white/[0.04] ${!eqEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                {EQ_FREQUENCIES.map((freq, idx) => {
                  const gain = eqGains[idx] || 0;
                  return (
                    <div key={freq} className="flex flex-col items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-400">
                        {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
                      </span>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        onChange={(e) => onSetEqBandGain(idx, parseFloat(e.target.value))}
                        className="h-28 w-1.5 appearance-none bg-white/[0.1] rounded-full accent-cyan-400 cursor-pointer -rotate-180"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      />
                      <span className="text-[10px] font-mono font-medium text-slate-400">
                        {formatFreq(freq)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stereo Balance & Preamp Auto */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              {/* Stereo Balance */}
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Стереобаланс (L / R)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {settings.stereoBalance === 0
                      ? 'Центр'
                      : settings.stereoBalance < 0
                      ? `Левый ${Math.round(Math.abs(settings.stereoBalance) * 100)}%`
                      : `Правый ${Math.round(settings.stereoBalance * 100)}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">L</span>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.05"
                    value={settings.stereoBalance}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateSettings({ stereoBalance: v });
                      if (onSetStereoBalance) onSetStereoBalance(v);
                    }}
                    className="w-full h-1.5 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-slate-400">R</span>
                  {settings.stereoBalance !== 0 && (
                    <button
                      onClick={() => {
                        updateSettings({ stereoBalance: 0 });
                        if (onSetStereoBalance) onSetStereoBalance(0);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 hover:text-white"
                    >
                      Центр
                    </button>
                  )}
                </div>
              </div>

              {/* Anti-clipping auto preamp */}
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Защита от перегрузки (Preamp Headroom)</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Автоматическая компенсация клиппинга EQ</p>
                </div>
                <button
                  onClick={() => updateSettings({ eqPreampAuto: !settings.eqPreampAuto })}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.eqPreampAuto ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.eqPreampAuto ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Normalization & Crossfade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              {/* Normalization */}
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Нормализация громкости (ReplayGain)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Выравнивает уровень тихих и громких треков</p>
                </div>
                <button
                  onClick={onToggleNormalization}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isNormalizationEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      isNormalizationEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Crossfade */}
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white">Кроссфейд (Плавный переход)</h4>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    {crossfadeSeconds === 0 ? 'Выкл' : `${crossfadeSeconds} сек`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={crossfadeSeconds}
                  onChange={(e) => onSetCrossfade(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Audio Output Devices */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Устройства вывода звука</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Выберите любое количество аудиовыходов (наушники, динамики, ЦАП, виртуальные кабели) для одновременной синхронной игры:
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={() => {
                      // Select all devices
                      const allIds = ['default', ...audioDevices.map((d) => d.deviceId)];
                      allIds.forEach((id) => {
                        if (!selectedDevices.includes(id)) {
                          handleSelectAudioDevice(id);
                        }
                      });
                      if (onToast) onToast('Подключены все доступные устройства вывода');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-xs font-medium cursor-pointer transition-all active:scale-95"
                  >
                    <span>Выбрать все</span>
                  </button>

                  <button
                    onClick={async () => {
                      await onRecoverAudio();
                      if (onToast) onToast('Аудиодвижок перезапущен и переподключен');
                    }}
                    title="Сбросить звуковой движок при сбоях"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-amber-400 border border-white/[0.08] hover:border-amber-500/30 text-xs font-medium cursor-pointer transition-all active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сброс звука</span>
                  </button>

                  <button
                    onClick={handleRefreshAudio}
                    disabled={isRefreshingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-cyan-400 border border-white/[0.08] hover:border-cyan-500/30 text-xs font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAudio ? 'animate-spin' : ''}`} />
                    <span>Обновить</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                {/* Default */}
                <div
                  onClick={() => handleSelectAudioDevice('default')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    selectedDevices.includes('default')
                      ? 'bg-cyan-500/15 border-cyan-500/60 shadow-sm'
                      : 'bg-black/20 border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <h5 className="text-xs font-semibold text-white truncate">По умолчанию (Windows)</h5>
                      <span className="text-[10px] text-slate-500">Системное устройство</span>
                    </div>
                  </div>
                  {selectedDevices.includes('default') && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />}
                </div>

                {audioDevices.map((d) => {
                  const isSelected = selectedDevices.includes(d.deviceId);
                  return (
                    <div
                      key={d.deviceId}
                      onClick={() => handleSelectAudioDevice(d.deviceId)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/60 shadow-sm'
                          : 'bg-black/20 border-white/[0.04] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <h5 className="text-xs font-semibold text-white truncate" title={d.label}>{d.label}</h5>
                          <span className="text-[10px] text-slate-500">
                            {isSelected ? 'Активно (Синхронно)' : 'Нажмите для подключения'}
                          </span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. ПЛЕЕР И ОЧЕРЕДЬ (PLAYBACK & QUEUE) */}
        {/* ======================================================== */}
        {isSectionVisible('playback', ['плеер', 'скорость', 'таймер', 'сон', 'очередь', 'перемотка', 'шаг', 'громкость', 'пауза', 'звонок']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Плеер, Очередь и Воспроизведение</span>
              </div>
            </div>

            {/* Playback speed & pitch preservation */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Скорость воспроизведения</h4>
                  <p className="text-[11px] text-slate-400">Ускорение или замедление звука без потери качества</p>
                </div>
                <span className="text-xs font-mono text-cyan-400 font-bold">{playbackRate}x</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      if (onSetPlaybackRate) onSetPlaybackRate(r);
                      updateSettings({ playbackRate: r });
                    }}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      playbackRate === r
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] border border-white/[0.06]'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <span className="text-slate-300">Сохранять естественную тональность голоса (Preserve Pitch)</span>
                <button
                  onClick={() => updateSettings({ preservePitch: !settings.preservePitch })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.preservePitch ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.preservePitch ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Seek Step & Volume Step */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Шаг перемотки кнопками</h4>
                  <p className="text-[10px] text-slate-400">Кнопки ±сек и клавиши стрелок</p>
                </div>
                <div className="flex items-center gap-1">
                  {[5, 10, 15, 30].map((s) => (
                    <button
                      key={s}
                      onClick={() => updateSettings({ seekStepSeconds: s as any })}
                      className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                        settings.seekStepSeconds === s
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-white/[0.04] text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}с
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Шаг изменения громкости</h4>
                  <p className="text-[10px] text-slate-400">Клавиши ↑ / ↓</p>
                </div>
                <div className="flex items-center gap-1">
                  {[2, 5, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => updateSettings({ volumeStepPercent: v as any })}
                      className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                        settings.volumeStepPercent === v
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-white/[0.04] text-slate-400 hover:text-white'
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sleep Timer */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Таймер сна</h4>
                  <p className="text-[11px] text-slate-400">Автоматически плавно остановит плеер</p>
                </div>
                {sleepRemaining !== null && sleepRemaining > 0 && (
                  <span className="text-xs font-mono text-cyan-400 font-bold animate-pulse">
                    Осталось: {formatSleepCountdown(sleepRemaining)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[
                  { min: null, label: 'Выкл' },
                  { min: 15, label: '15 минут' },
                  { min: 30, label: '30 минут' },
                  { min: 45, label: '45 минут' },
                  { min: 60, label: '1 час' },
                ].map((item) => (
                  <button
                    key={String(item.min)}
                    onClick={() => onSetSleepTimer(item.min)}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      sleepTimerMinutes === item.min
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] border border-white/[0.06]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <span className="text-slate-300">Плавное затухание громкости в последние 15 секунд таймера</span>
                <button
                  onClick={() => updateSettings({ sleepFadeOut: !settings.sleepFadeOut })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.sleepFadeOut ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.sleepFadeOut ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Queue End Action & Preload */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col justify-between gap-2">
                <span className="text-xs font-semibold text-white">Поведение по окончании очереди:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'repeat', label: 'Повторять' },
                    { id: 'stop', label: 'Стоп' },
                    { id: 'artist_flow', label: 'Авто-поток' },
                  ].map((act) => (
                    <button
                      key={act.id}
                      onClick={() => updateSettings({ queueEndAction: act.id as QueueEndAction })}
                      className={`py-1 rounded-lg text-xs font-medium transition-all ${
                        settings.queueEndAction === act.id
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                          : 'bg-white/[0.03] text-slate-400 hover:text-white'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Бесшовный переход (Gapless Preload)</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Предзагружать следующий трек за 6 сек до конца</p>
                </div>
                <button
                  onClick={() => updateSettings({ gaplessPreload: !settings.gaplessPreload })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.gaplessPreload ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.gaplessPreload ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Additional Playback Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автозапуск при старте</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Продолжать последний трек</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoResumeOnStartup: !settings.autoResumeOnStartup })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoResumeOnStartup ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoResumeOnStartup ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автопауза при звонке</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Пауза при Hands-Free гарнитуре</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoPauseOnCall: !settings.autoPauseOnCall })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoPauseOnCall ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoPauseOnCall ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Плейбар на Главной</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Показывать нижнюю панель</p>
                </div>
                <button
                  onClick={() => updateSettings({ showPlayerBarOnHome: !settings.showPlayerBarOnHome })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.showPlayerBarOnHome ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.showPlayerBarOnHome ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. МЕДИАТЕКА И ФАЙЛЫ (COLLECTION & LIBRARY) */}
        {/* ======================================================== */}
        {isSectionVisible('collection', ['папка', 'хранение', 'медиатека', 'библиотека', 'm3u8', 'экспорт', 'диск', 'обложки', 'сортировка', 'вид', 'проводник']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <ListMusic className="w-4 h-4 text-amber-400" />
                <span>Медиатека, Локальные Файлы и Папка Хранения</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const path = await exportPlaylistToM3U8(tracks, 'FreeToPlayer_Collection.m3u8');
                    alert(path ? `Плейлист успешно экспортирован в папку Загрузки:\n${path}` : 'Плейлист сохранён в Загрузки');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-white"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Экспорт M3U8</span>
                </button>
                <button
                  onClick={() => openStorageFolder()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-cyan-400"
                >
                  <span>Проводник</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Storage Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.04]">
                <span className="text-[11px] text-slate-500 font-mono">Всего композиций в коллекции</span>
                <p className="text-xl font-bold text-white mt-1">{stats ? stats.totalTracks : tracks.length}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.04]">
                <span className="text-[11px] text-slate-500 font-mono">Занято места на диске</span>
                <p className="text-xl font-bold text-cyan-400 mt-1">{stats ? formatSize(stats.totalBytes) : '...'}</p>
              </div>
            </div>

            {/* Folder Path Edit */}
            {stats?.storageDir && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div
                    onClick={() => openStorageFolder()}
                    className="flex-1 p-2.5 rounded-lg bg-black/20 hover:bg-white/[0.04] border border-white/[0.04] text-[11px] text-slate-400 hover:text-slate-200 font-mono flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{stats.storageDir}</span>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-500 shrink-0" />
                  </div>

                  <button
                    onClick={() => {
                      setNewPathInput(stats.storageDir);
                      setIsEditingPath(!isEditingPath);
                    }}
                    title="Сменить путь к папке"
                    className="p-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-cyan-400"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isEditingPath && (
                  <div className="flex items-center gap-2 p-2 bg-black/40 rounded-lg border border-white/[0.08]">
                    <input
                      type="text"
                      value={newPathInput}
                      onChange={(e) => setNewPathInput(e.target.value)}
                      placeholder="Введите новый путь к папке..."
                      className="flex-1 px-2.5 py-1 text-xs bg-white/[0.06] rounded border border-white/[0.1] text-white focus:outline-none"
                    />
                    <button
                      onClick={handleSavePath}
                      className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 text-xs font-semibold"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsEditingPath(false)}
                      className="px-2.5 py-1 rounded bg-white/[0.06] text-slate-400 text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Default Collection View & Sort */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Вид отображения по умолчанию</h4>
                  <p className="text-[10px] text-slate-400">Формат списка в медиатеке</p>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'list', label: 'Список' },
                    { id: 'compact', label: 'Компакт' },
                    { id: 'grid', label: 'Плитка' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => updateSettings({ defaultViewMode: m.id as CollectionViewMode })}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        settings.defaultViewMode === m.id
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Сортировка по умолчанию</h4>
                  <p className="text-[10px] text-slate-400">При входе во вкладку</p>
                </div>
                <select
                  value={settings.defaultSortBy}
                  onChange={(e) => updateSettings({ defaultSortBy: e.target.value as CollectionSortBy })}
                  className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-amber-300 focus:outline-none cursor-pointer"
                >
                  <option value="added" className="bg-[#0b0c13]">По дате добавления</option>
                  <option value="title" className="bg-[#0b0c13]">По названию</option>
                  <option value="artist" className="bg-[#0b0c13]">По исполнителю</option>
                  <option value="duration" className="bg-[#0b0c13]">По длительности</option>
                  <option value="size" className="bg-[#0b0c13]">По размеру файла</option>
                </select>
              </div>
            </div>

            {/* Smart Playlists Limits & Reset stats */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-semibold text-white">Умные подборки</h4>
                  <p className="text-[10px] text-slate-400">Лимит композиций в подборках «Топ», «Недавние», «Забытые»</p>
                </div>
                <div className="flex items-center gap-1">
                  {[15, 30, 50, 100].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => updateSettings({ smartPlaylistLimit: lim as any })}
                      className={`px-2 py-0.5 rounded text-xs font-mono ${
                        settings.smartPlaylistLimit === lim
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {lim}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <span className="text-slate-400">Сбросить историю прослушиваний треков</span>
                <button
                  onClick={() => {
                    if (window.confirm('Сбросить статистику прослушиваний?')) {
                      clearPlayStats();
                      if (onToast) onToast('Статистика прослушиваний сброшена');
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-white/[0.06] hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors"
                >
                  Сбросить статистику
                </button>
              </div>
            </div>

            {/* Auto-cover Search on 100% Match */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автопоиск обложек в сети (100% совпадение)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Автоматически подбирать обложки высокого разрешения для треков без обложек
                  </p>
                </div>
                <button
                  onClick={() => updateSettings({ autoFetchCovers: !settings.autoFetchCovers })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoFetchCovers ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoFetchCovers ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleFetchCoversBatch}
                  disabled={isFetchingCovers}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 text-xs font-semibold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingCovers ? 'animate-spin' : ''}`} />
                  <span>{isFetchingCovers ? 'Поиск обложек...' : 'Найти обложки для треков без обложек (1 клик)'}</span>
                </button>
                {coverFetchResult && (
                  <span className="text-xs text-slate-300 font-mono">{coverFetchResult}</span>
                )}
              </div>
            </div>

            {/* Display & Behavior Flags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Размер файлов</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Размер в строке трека</p>
                </div>
                <button
                  onClick={() => updateSettings({ showFileSize: !settings.showFileSize })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.showFileSize ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.showFileSize ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Бейдж формата</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">FLAC / MP3 индикатор</p>
                </div>
                <button
                  onClick={() => updateSettings({ showFormatBadge: !settings.showFormatBadge })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.showFormatBadge ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.showFormatBadge ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Компактные строки</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Уменьшенная высота</p>
                </div>
                <button
                  onClick={() => updateSettings({ compactRows: !settings.compactRows })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.compactRows ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.compactRows ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Подтверждение удаления</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Диалог перед удалением</p>
                </div>
                <button
                  onClick={() => updateSettings({ confirmBeforeDelete: !settings.confirmBeforeDelete })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.confirmBeforeDelete ? 'bg-amber-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.confirmBeforeDelete ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 4. ОНЛАЙН, РАДИО И ВЕРСИИ (ONLINE, RADIO & VERSIONS) */}
        {/* ======================================================== */}
        {isSectionVisible('online', ['онлайн', 'поиск', 'радио', 'источник', 'deezer', 'яндекс', 'hitmo', 'soundcloud', 'версии', 'поток', 'битрейт']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <Globe className="w-4 h-4 text-rose-400" />
                <span>Онлайн-Поиск, Каталоги и Радио</span>
              </div>
            </div>

            {/* Default Source */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white">Основной источник музыки по умолчанию</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'all', label: 'Все источники', badge: 'Агрегатор' },
                  { id: 'deezer', label: 'Deezer', badge: 'HD 1000x1000' },
                  { id: 'yandex', label: 'Яндекс Музыка', badge: '320 kbps' },
                  { id: 'hitmo', label: 'Hitmo', badge: 'Быстрый MP3' },
                  { id: 'soundcloud', label: 'SoundCloud', badge: 'Ремиксы/Live' },
                  { id: 'vk', label: 'VK Музыка', badge: 'ВК/Каверы' },
                  { id: 'youtube', label: 'YouTube Music', badge: 'Аудио/Клипы' },
                  { id: 'audius', label: 'Audius', badge: 'Электроника' },
                ].map((src) => {
                  const isSelected = settings.defaultMusicSource === src.id;
                  return (
                    <button
                      key={src.id}
                      onClick={() => updateSettings({ defaultMusicSource: src.id as MusicSourceId })}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-white font-semibold'
                          : 'bg-black/20 border-white/[0.04] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs">{src.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <span className="text-[10px] text-slate-500">{src.badge}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Search & Local matches toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Живой поиск при вводе</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Автоматический поиск с дебаунсом</p>
                </div>
                <button
                  onClick={() => updateSettings({ liveSearchDebounce: !settings.liveSearchDebounce })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.liveSearchDebounce ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.liveSearchDebounce ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Совпадения из медиатеки</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Показывать локальные треки в онлайн-поиске</p>
                </div>
                <button
                  onClick={() => updateSettings({ showLocalMatchesInOnline: !settings.showLocalMatchesInOnline })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.showLocalMatchesInOnline ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.showLocalMatchesInOnline ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Radio min bitrate & Artist flow count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Мин. битрейт радиостанций</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Фильтрация низкокачественных потоков</p>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { b: 0, l: 'Все' },
                    { b: 64, l: '64k+' },
                    { b: 128, l: '128k+' },
                    { b: 192, l: '192k+' },
                  ].map((item) => (
                    <button
                      key={item.b}
                      onClick={() => updateSettings({ radioMinBitrate: item.b as any })}
                      className={`px-2 py-1 rounded text-xs font-mono ${
                        settings.radioMinBitrate === item.b
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {item.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Треков в потоке исполнителя</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Размер авто-очереди</p>
                </div>
                <div className="flex items-center gap-1">
                  {[15, 25, 40].map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSettings({ artistFlowCount: c as any })}
                      className={`px-2 py-1 rounded text-xs font-mono ${
                        settings.artistFlowCount === c
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Online Flags */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автовоспроизведение</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Включать скачанный трек</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoPlayAfterDownload: !settings.autoPlayAfterDownload })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoPlayAfterDownload ? 'bg-rose-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoPlayAfterDownload ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автовыбор версии</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Выбирать лучший битрейт</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoSelectPreferredVersion: !settings.autoSelectPreferredVersion })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoSelectPreferredVersion ? 'bg-rose-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoSelectPreferredVersion ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">История поиска</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Сохранять запросы</p>
                </div>
                <button
                  onClick={() => updateSettings({ saveSearchHistory: !settings.saveSearchHistory })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.saveSearchHistory ? 'bg-rose-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.saveSearchHistory ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 5. ОФОРМЛЕНИЕ, ВИЗУАЛИЗАТОР И КАРАОКЕ (APPEARANCE) */}
        {/* ======================================================== */}
        {isSectionVisible('appearance', ['тема', 'оформление', 'визуализатор', 'спектр', 'караоке', 'текст', 'шрифт', 'слова', 'винил', 'свечение']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <Palette className="w-4 h-4 text-emerald-400" />
                <span>Темы, Визуализатор и Караоке</span>
              </div>
            </div>

            {/* Themes Grid */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white">Цветовая тема оформления</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {(Object.keys(THEMES) as ThemeName[]).map((key) => {
                  const t = THEMES[key];
                  const isSelected = currentTheme === key;
                  return (
                    <div
                      key={key}
                      onClick={() => onSetTheme(key)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? 'bg-white/[0.08] border-cyan-500/50 shadow-sm'
                          : 'bg-black/20 border-white/[0.04] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{ backgroundColor: t.accent }}
                          />
                          <h4 className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {t.name}
                          </h4>
                        </div>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">{t.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visualizer Settings */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Спектроанализатор звука</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Стиль и детализация спектра</p>
                </div>
                <button
                  onClick={() => updateSettings({ visualizerEnabled: !settings.visualizerEnabled })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.visualizerEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.visualizerEnabled ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'bars', label: 'Столбики' },
                  { id: 'wave', label: 'Волна' },
                  { id: 'mirror', label: 'Симметрия' },
                  { id: 'dots', label: 'Пики' },
                ].map((st) => (
                  <button
                    key={st.id}
                    disabled={!settings.visualizerEnabled}
                    onClick={() => updateSettings({ visualizerStyle: st.id as VisualizerStyle })}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                      settings.visualizerStyle === st.id && settings.visualizerEnabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lyrics / Karaoke Settings */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-semibold text-white">Размер шрифта текста караоке</h4>
                  <p className="text-[10px] text-slate-400">В полноэкранном плеере</p>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'sm', label: 'Обычный' },
                    { id: 'md', label: 'Крупный' },
                    { id: 'lg', label: 'Большой' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => updateSettings({ lyricsFontSize: f.id as LyricsFontSize })}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        settings.lyricsFontSize === f.id
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <div>
                  <span className="text-slate-300">Автопрокрутка синхронизированного караоке</span>
                  <p className="text-[10px] text-slate-500">Следовать за текущей поющей строкой</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoScrollLyrics: !settings.autoScrollLyrics })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoScrollLyrics ? 'bg-emerald-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoScrollLyrics ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <span className="text-slate-400">Кэш текстов песен: {getLyricsCacheSize()} треков</span>
                <button
                  onClick={() => {
                    clearLyricsCache();
                    if (onToast) onToast('Кэш текстов песен очищен');
                  }}
                  className="px-2.5 py-1 rounded bg-white/[0.06] text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Очистить кэш текстов
                </button>
              </div>
            </div>

            {/* Additional Appearance & Visual Flags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Вращение винила</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Пластинка в шапке</p>
                </div>
                <button
                  onClick={() => updateSettings({ vinylSpinEnabled: !settings.vinylSpinEnabled })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.vinylSpinEnabled ? 'bg-emerald-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.vinylSpinEnabled ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Эмбиент-фон</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Свечение под обложку</p>
                </div>
                <button
                  onClick={() => updateSettings({ ambientBackground: !settings.ambientBackground })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.ambientBackground ? 'bg-emerald-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.ambientBackground ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Автопоиск слов</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Искать караоке-текст</p>
                </div>
                <button
                  onClick={() => updateSettings({ autoFetchLyrics: !settings.autoFetchLyrics })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.autoFetchLyrics ? 'bg-emerald-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.autoFetchLyrics ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Таймкод караоке</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Время перед строками</p>
                </div>
                <button
                  onClick={() => updateSettings({ showSyncedTimecode: !settings.showSyncedTimecode })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.showSyncedTimecode ? 'bg-emerald-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.showSyncedTimecode ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 6. СИСТЕМА И ИНТЕГРАЦИИ (SYSTEM & WINDOW) */}
        {/* ======================================================== */}
        {isSectionVisible('system', ['система', 'окно', 'поверх', 'discord', 'яндекс', 'синхронизация', 'телефон', 'android', 'клавиши', 'хоткеи', 'сброс']) && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Система, Окно и Интеграции</span>
              </div>
            </div>

            {/* Discord Rich Presence */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Discord Rich Presence (Статус в Discord)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Транслирует играющую песню, исполнителя и обложку</p>
                </div>
                <button
                  onClick={onToggleDiscord}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isDiscordEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      isDiscordEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isDiscordEnabled && (
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                  <div>
                    <span className="text-slate-300">Показывать время трека в статусе</span>
                    <p className="text-[10px] text-slate-500">Таймкод и прошедшее время прослушивания</p>
                  </div>
                  <button
                    onClick={() => updateSettings({ discordShowTimestamp: !settings.discordShowTimestamp })}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.discordShowTimestamp ? 'bg-cyan-500' : 'bg-white/[0.1]'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                        settings.discordShowTimestamp ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Global Hotkeys */}
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/[0.04] flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Глобальные горячие клавиши</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Управление воспроизведением с клавиатуры</p>
                </div>
                <button
                  onClick={() => updateSettings({ enableGlobalHotkeys: !settings.enableGlobalHotkeys })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.enableGlobalHotkeys ? 'bg-cyan-500' : 'bg-white/[0.1]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.enableGlobalHotkeys ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="p-2 rounded bg-black/30 border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-400">Play / Pause</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">Пробел</kbd>
                </div>
                <div className="p-2 rounded bg-black/30 border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-400">Перемотка</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">← / →</kbd>
                </div>
                <div className="p-2 rounded bg-black/30 border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-400">Громкость</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">↑ / ↓</kbd>
                </div>
                <div className="p-2 rounded bg-black/30 border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-400">Без звука</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">M</kbd>
                </div>
              </div>
            </div>

            {/* Yandex Music Synchronization & Account */}
            <div className="p-4 rounded-2xl bg-black/20 border border-white/[0.06] flex flex-col gap-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-sm">
                    <YandexIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Яндекс Музыка</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${
                          yandexAccount?.isAuthorized
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/[0.06] text-slate-400 border-white/[0.08]'
                        }`}
                      >
                        {yandexAccount?.isAuthorized ? 'Авторизован' : 'Не авторизован'}
                      </span>
                      {yandexAccount?.hasPlus && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Плюс</span>
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {yandexAccount?.isAuthorized
                        ? `Аккаунт: ${yandexAccount.name || yandexAccount.login || 'Пользователь'} (UID: ${yandexAccount.uid || '—'})`
                        : 'Встроенный вход в аккаунт Яндекс для скачивания «Любимого»'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {yandexAccount?.isAuthorized ? (
                    <button
                      onClick={handleLogoutYandex}
                      title="Выйти из аккаунта Яндекс Музыки"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-300 border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Выйти</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleLoginYandex}
                      disabled={isLoggingInYandex}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{isLoggingInYandex ? 'Ожидание входа...' : 'Войти в Яндекс'}</span>
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      try {
                        setIsSyncingYandex(true);
                        const res = await fetch('/api/yandex/sync', { method: 'POST' });
                        if (!res.ok) {
                          setIsSyncingYandex(false);
                          alert('Не удалось запустить синхронизацию. Авторизуйтесь в Яндекс Музыке.');
                        }
                      } catch (e) {
                        setIsSyncingYandex(false);
                        alert('Ошибка соединения с сервером');
                      }
                    }}
                    disabled={isSyncingYandex}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingYandex ? 'animate-spin' : ''}`} />
                    <span>{isSyncingYandex ? 'Синхронизация...' : 'Синхронизировать'}</span>
                  </button>
                </div>
              </div>

              {/* Login In Progress Banner */}
              {isLoggingInYandex && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Открыто окно авторизации. Войдите в свой Яндекс аккаунт — окно закроется само.</span>
                  </div>
                  <button
                    onClick={() => setIsLoggingInYandex(false)}
                    className="text-slate-400 hover:text-white text-xs underline cursor-pointer ml-2"
                  >
                    Отмена
                  </button>
                </div>
              )}

              {/* Manual Token Collapsible */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsManualTokenOpen(!isManualTokenOpen)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Key className="w-3 h-3" />
                  <span>{isManualTokenOpen ? 'Скрыть ручной ввод токена' : 'Указать токен вручную (если окно не открылось)'}</span>
                </button>

                {isManualTokenOpen && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                    <input
                      type="password"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="Вставьте токен OAuth (y0_...)"
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={handleSaveManualToken}
                      disabled={!manualTokenInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all disabled:opacity-40 shrink-0"
                    >
                      Сохранить токен
                    </button>
                  </div>
                )}
              </div>

              {/* Sync Status Banner */}
              {syncStatus && (
                <div className="p-3 rounded-lg bg-black/30 border border-white/[0.06] flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className={syncStatus.done ? (syncStatus.error ? 'text-rose-400' : 'text-emerald-400') : 'text-amber-300'}>
                      {syncStatus.message || 'Синхронизация...'}
                    </span>
                    {syncStatus.total > 0 && (
                      <span className="font-mono text-slate-400">
                        {syncStatus.current} / {syncStatus.total}
                      </span>
                    )}
                  </div>
                  {syncStatus.total > 0 && !syncStatus.done && (
                    <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((syncStatus.current / syncStatus.total) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* YouTube Music Synchronization & Account */}
            <div className="p-4 rounded-2xl bg-black/20 border border-white/[0.06] flex flex-col gap-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0 shadow-sm">
                    <YouTubeIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>YouTube Music</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${
                          youtubeHasCookies || youtubeAccount?.isAuthorized
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/[0.06] text-slate-400 border-white/[0.08]'
                        }`}
                      >
                        {youtubeHasCookies || youtubeAccount?.isAuthorized ? 'Аккаунт подключен' : 'Не авторизован'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {youtubeHasCookies || youtubeAccount?.isAuthorized
                        ? 'Сессия активна: доступны личные плейлисты и «Понравившиеся»'
                        : 'Встроенный вход для скачивания «Понравившихся» и приватных плейлистов'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {youtubeHasCookies || youtubeAccount?.isAuthorized ? (
                    <button
                      onClick={handleLogoutYouTube}
                      title="Выйти из аккаунта YouTube Music"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-300 border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Выйти</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleLoginYouTube}
                      disabled={isLoggingInYouTube}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-md shadow-rose-500/20 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{isLoggingInYouTube ? 'Ожидание входа...' : 'Войти в YouTube'}</span>
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      try {
                        setIsSyncingYouTube(true);
                        // Save config first if needed
                        if (youtubePlaylistUrl) {
                          await fetch('/api/youtube/config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ playlist_url: youtubePlaylistUrl }),
                          });
                        }
                        const res = await fetch('/api/youtube/sync', { method: 'POST' });
                        if (!res.ok) {
                          setIsSyncingYouTube(false);
                          const errText = await res.text();
                          alert(`Не удалось запустить синхронизацию: ${errText}`);
                        }
                      } catch (e) {
                        setIsSyncingYouTube(false);
                        alert('Ошибка соединения с сервером');
                      }
                    }}
                    disabled={isSyncingYouTube || !youtubePlaylistUrl.trim()}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-md shadow-rose-500/20 cursor-pointer active:scale-95 transition-all disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingYouTube ? 'animate-spin' : ''}`} />
                    <span>{isSyncingYouTube ? 'Синхронизация...' : 'Синхронизировать'}</span>
                  </button>
                </div>
              </div>

              {/* Login In Progress Banner */}
              {isLoggingInYouTube && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs text-rose-200">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                    <span>Открыто окно авторизации Google. Войдите в аккаунт — сессия сохранится автоматически.</span>
                  </div>
                  <button
                    onClick={() => setIsLoggingInYouTube(false)}
                    className="text-slate-400 hover:text-white text-xs underline cursor-pointer ml-2"
                  >
                    Отмена
                  </button>
                </div>
              )}

              {/* Playlist URL Input & Save */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <input
                  type="text"
                  value={youtubePlaylistUrl}
                  onChange={(e) => setYouTubePlaylistUrl(e.target.value)}
                  placeholder="Вставьте ссылку на плейлист (или https://music.youtube.com/playlist?list=LM для «Понравившихся»)"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500/50"
                />
                <button
                  onClick={async () => {
                    if (!youtubePlaylistUrl.trim()) return;
                    setIsSavingYouTubeConfig(true);
                    try {
                      const res = await fetch('/api/youtube/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ playlist_url: youtubePlaylistUrl.trim() }),
                      });
                      if (res.ok) {
                        if (onToast) onToast('Ссылка на плейлист YouTube Music сохранена');
                      }
                    } catch {
                    } finally {
                      setTimeout(() => setIsSavingYouTubeConfig(false), 300);
                    }
                  }}
                  disabled={isSavingYouTubeConfig || !youtubePlaylistUrl.trim()}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all disabled:opacity-40 shrink-0"
                >
                  {isSavingYouTubeConfig ? 'Сохранено' : 'Сохранить ссылку'}
                </button>
              </div>

              {/* Progress & Live Status Box */}
              {youtubeSyncStatus && (
                <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.06] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span
                      className={
                        youtubeSyncStatus.done
                          ? youtubeSyncStatus.error
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                          : 'text-rose-300'
                      }
                    >
                      {youtubeSyncStatus.message || 'Синхронизация...'}
                    </span>
                    {youtubeSyncStatus.total > 0 && (
                      <span className="font-mono text-slate-400 text-xs">
                        {youtubeSyncStatus.current} / {youtubeSyncStatus.total}
                      </span>
                    )}
                  </div>

                  {youtubeSyncStatus.total > 0 && !youtubeSyncStatus.done && (
                    <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((youtubeSyncStatus.current / youtubeSyncStatus.total) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Нажмите «Войти в YouTube», чтобы авторизоваться в Google/YouTube Music в один клик. После входа вы сможете скачивать ваш приватный плейлист «Понравившиеся» (<code className="text-slate-300 bg-white/[0.06] px-1.5 py-0.5 rounded">https://music.youtube.com/playlist?list=LM</code>) или любые другие плейлисты.
              </p>
            </div>

            {/* Mobile / Android PWA */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/20 via-black/30 to-purple-950/20 border border-cyan-500/20 flex flex-col gap-3.5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Управление с телефона (Wi-Fi)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                        Онлайн
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Слушайте музыку и переключайте треки с любого смартфона через браузер
                    </p>
                  </div>
                </div>

                {onOpenMobileConnect && (
                  <button
                    onClick={onOpenMobileConnect}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95 transition-all shrink-0"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Показать QR-код</span>
                  </button>
                )}
              </div>

              {networkInfo && networkInfo.ips && networkInfo.ips.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={`http://${networkInfo.primaryIp}:${networkInfo.port}/mobile`}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-cyan-300 font-mono focus:outline-none select-all"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`http://${networkInfo.primaryIp}:${networkInfo.port}/mobile`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                      if (onToast) onToast('Ссылка скопирована!');
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.08] text-xs font-semibold transition cursor-pointer active:scale-95 shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                  <a
                    href={`http://${networkInfo.primaryIp}:${networkInfo.port}/mobile`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition shrink-0"
                    title="Открыть в браузере"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            {/* Reset All Settings to Factory Default */}
            <div className="p-3.5 rounded-xl bg-rose-950/15 border border-rose-500/30 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-rose-300">Сброс всех настроек</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Вернуть все параметры звука, плеера и поиска по умолчанию</p>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('Сбросить все настройки приложения на значения по умолчанию?')) {
                    resetSettings();
                    if (onToast) onToast('Настройки сброшены по умолчанию');
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition cursor-pointer active:scale-95"
              >
                Сбросить настройки
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

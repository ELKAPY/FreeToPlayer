import { useCallback, useEffect, useState } from 'react';

export type MusicSourceId =
  | 'all'
  | 'deezer'
  | 'yandex'
  | 'hitmo'
  | 'soundcloud'
  | 'vk'
  | 'audius'
  | 'youtube';

export type VisualizerStyle = 'bars' | 'wave' | 'mirror' | 'dots';
export type CollectionSortBy = 'added' | 'title' | 'artist' | 'duration' | 'size' | 'plays';
export type CollectionViewMode = 'list' | 'compact' | 'grid';
export type QueueEndAction = 'repeat' | 'stop' | 'artist_flow';
export type LyricsFontSize = 'sm' | 'md' | 'lg';
export type SettingsCategory =
  | 'all'
  | 'audio'
  | 'playback'
  | 'collection'
  | 'online'
  | 'accounts'
  | 'appearance'
  | 'system';

export interface AppSettings {
  // 1. Звук и Эквалайзер (Audio & EQ)
  eqEnabled: boolean;
  eqPreampAuto: boolean;
  stereoBalance: number; // -1.0 (Left) to +1.0 (Right)
  sleepFadeOut: boolean;
  wasapiExclusive: boolean; // Direct bit-perfect DAC output mode

  // 2. Плеер и Очередь (Playback & Queue)
  autoResumeOnStartup: boolean;
  seekStepSeconds: 5 | 10 | 15 | 30;
  volumeStepPercent: 2 | 5 | 10;
  playbackRate: number; // 0.5 to 2.0
  preservePitch: boolean;
  autoPauseOnCall: boolean;
  gaplessPreload: boolean;
  queueEndAction: QueueEndAction;
  showPlayerBarOnHome: boolean;

  // 3. Медиатека и Плейлисты (Collection & Library)
  defaultSortBy: CollectionSortBy;
  defaultSortOrder: 'asc' | 'desc';
  defaultViewMode: CollectionViewMode;
  showFileSize: boolean;
  showFormatBadge: boolean;
  confirmBeforeDelete: boolean;
  smartPlaylistLimit: 15 | 30 | 50 | 100;
  forgottenDaysThreshold: 3 | 7 | 14 | 30;
  autoScanIntervalSec: 0 | 4 | 10 | 30;
  autoFetchCovers: boolean;

  // 4. Онлайн-поиск, Версии и Радио (Online, Versions & Radio)
  defaultMusicSource: MusicSourceId;
  liveSearchDebounce: boolean;
  showLocalMatchesInOnline: boolean;
  autoPlayAfterDownload: boolean;
  artistFlowCount: 15 | 25 | 40;
  artistFlowShuffle: boolean;
  autoSelectPreferredVersion: boolean;
  hideDislikedVersions: boolean;
  radioMinBitrate: 0 | 64 | 128 | 192;
  radioDefaultCategory: string;
  saveSearchHistory: boolean;
  searchHistoryLimit: 10 | 15 | 30;

  // 5. Интерфейс, Визуализатор и Караоке (Appearance, Visualizer & Lyrics)
  visualizerEnabled: boolean;
  visualizerStyle: VisualizerStyle;
  visualizerBars: 24 | 36 | 48 | 64;
  visualizerSensitivity: number; // 0.6 to 1.6
  vinylSpinEnabled: boolean;
  ambientBackground: boolean;
  compactRows: boolean;
  autoFetchLyrics: boolean;
  autoScrollLyrics: boolean;
  lyricsFontSize: LyricsFontSize;
  showSyncedTimecode: boolean;

  // 6. Система и Окно (System & Window)
  enableGlobalHotkeys: boolean;
  discordShowTimestamp: boolean;
}

const SETTINGS_STORAGE_KEY = 'dj_app_settings_v2';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // Audio
  eqEnabled: true,
  eqPreampAuto: true,
  stereoBalance: 0,
  sleepFadeOut: true,
  wasapiExclusive: false,

  // Playback
  autoResumeOnStartup: false,
  seekStepSeconds: 10,
  volumeStepPercent: 5,
  playbackRate: 1.0,
  preservePitch: true,
  autoPauseOnCall: true,
  gaplessPreload: true,
  queueEndAction: 'repeat',
  showPlayerBarOnHome: false,

  // Collection
  defaultSortBy: 'added',
  defaultSortOrder: 'desc',
  defaultViewMode: 'list',
  showFileSize: true,
  showFormatBadge: true,
  confirmBeforeDelete: true,
  smartPlaylistLimit: 30,
  forgottenDaysThreshold: 7,
  autoScanIntervalSec: 4,
  autoFetchCovers: true,

  // Online
  defaultMusicSource: 'all',
  liveSearchDebounce: true,
  showLocalMatchesInOnline: true,
  autoPlayAfterDownload: false,
  artistFlowCount: 25,
  artistFlowShuffle: false,
  autoSelectPreferredVersion: true,
  hideDislikedVersions: false,
  radioMinBitrate: 0,
  radioDefaultCategory: 'top',
  saveSearchHistory: true,
  searchHistoryLimit: 15,

  // Appearance & Lyrics
  visualizerEnabled: true,
  visualizerStyle: 'bars',
  visualizerBars: 36,
  visualizerSensitivity: 1.0,
  vinylSpinEnabled: true,
  ambientBackground: true,
  compactRows: false,
  autoFetchLyrics: true,
  autoScrollLyrics: true,
  lyricsFontSize: 'md',
  showSyncedTimecode: true,

  // System
  enableGlobalHotkeys: true,
  discordShowTimestamp: true,
};

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    // Migrate legacy single keys if not yet in v2 object
    const legacySource = localStorage.getItem('dj_default_source') as MusicSourceId | null;
    const legacyAutoCovers = localStorage.getItem('dj_auto_fetch_covers');
    const legacySaveHistory = localStorage.getItem('dj_save_search_history');

    return {
      ...DEFAULT_APP_SETTINGS,
      ...(legacySource ? { defaultMusicSource: legacySource } : {}),
      ...(legacyAutoCovers !== null ? { autoFetchCovers: legacyAutoCovers !== 'false' } : {}),
      ...(legacySaveHistory !== null ? { saveSearchHistory: legacySaveHistory !== 'false' } : {}),
      ...parsed,
    };
  } catch (e) {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const next: AppSettings = { ...current, ...patch };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    // Keep legacy keys in sync for any direct readers
    if (patch.defaultMusicSource !== undefined) {
      localStorage.setItem('dj_default_source', patch.defaultMusicSource);
    }
    if (patch.autoFetchCovers !== undefined) {
      localStorage.setItem('dj_auto_fetch_covers', String(patch.autoFetchCovers));
    }
    if (patch.saveSearchHistory !== undefined) {
      localStorage.setItem('dj_save_search_history', String(patch.saveSearchHistory));
    }
    window.dispatchEvent(new CustomEvent('dj_settings_changed', { detail: next }));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
  return next;
}

export function resetAppSettings(): AppSettings {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_APP_SETTINGS));
    localStorage.setItem('dj_default_source', DEFAULT_APP_SETTINGS.defaultMusicSource);
    localStorage.setItem('dj_auto_fetch_covers', String(DEFAULT_APP_SETTINGS.autoFetchCovers));
    localStorage.setItem('dj_save_search_history', String(DEFAULT_APP_SETTINGS.saveSearchHistory));
    window.dispatchEvent(new CustomEvent('dj_settings_changed', { detail: DEFAULT_APP_SETTINGS }));
  } catch (e) {}
  return { ...DEFAULT_APP_SETTINGS };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<AppSettings>;
      if (custom.detail) {
        setSettings(custom.detail);
      } else {
        setSettings(getAppSettings());
      }
    };
    window.addEventListener('dj_settings_changed', handler);
    return () => window.removeEventListener('dj_settings_changed', handler);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = updateAppSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const resetSettings = useCallback(() => {
    const next = resetAppSettings();
    setSettings(next);
    return next;
  }, []);

  return { settings, updateSettings, resetSettings };
}

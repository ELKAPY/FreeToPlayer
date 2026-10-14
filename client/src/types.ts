export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  duration: number; // in seconds
  format: string;   // FLAC, WAV, MP3, etc.
  isLossless: boolean;
  fileSize: number;
  hasCover: boolean;
  coverExt?: string;
  coverUrl?: string;
  coverUpdatedAt?: number;
  onlineStreamUrl?: string;
  filename: string;
  originalName: string;
  createdAt: string;
}

export interface PlaybackState {
  currentTrackId: string;
  currentTrack?: Track;
  currentTime: number; // position in seconds
  volume: number;      // 0.0 - 1.0
  isPlaying: boolean;
  isMuted?: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  queue: string[];
  queueTracks?: Track[];
  eqPreset?: string;
  eqGains?: number[];
  isNormalizationEnabled?: boolean;
  crossfadeSeconds?: number;
  selectedAudioDevice?: string;
  selectedAudioDeviceName?: string;
  theme?: string;
  isDiscordEnabled?: boolean;
  defaultMusicSource?: 'all' | 'deezer' | 'yandex' | 'hitmo' | 'soundcloud' | 'vk' | 'audius' | 'youtube';
  autoFetchCovers?: boolean;
  saveSearchHistory?: boolean;
}

export interface StorageStats {
  totalTracks: number;
  totalBytes: number;
  storageDir: string;
}

export interface OnlineTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  duration: number;
  durStr: string;
  coverUrl: string;
  audioUrl: string;
  streamUrl: string;
  source?: string;
  sourceName?: string;
  version?: string;
}

export interface OnlineAlbum {
  id: string;
  title: string;
  artist: string;
  year: number;
  trackCount: number;
  coverUrl: string;
  source: string;
  sourceName: string;
  tracks?: OnlineTrack[];
}

export interface TrackVersion {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  durStr: string;
  coverUrl: string;
  streamUrl: string;
  audioUrl: string;
  source: string;
  sourceName: string;
  versionType: string;
  versionLabel: string;
  similarity?: number;
  isPreferred?: boolean;
  isDisliked?: boolean;
}

export interface VersionPreferences {
  preferred: Record<string, TrackVersion>;
  disliked: Record<string, string[]>;
}

export interface VersionsResponse {
  songKey: string;
  title: string;
  artist: string;
  versions: TrackVersion[];
  hasPreferred: boolean;
  preferred?: TrackVersion;
}

export interface ArtistFlowResponse {
  artist: string;
  tracks: OnlineTrack[];
  total: number;
}

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  countryCode?: string;
  tags?: string[];
  codec?: string;
  bitrate?: number;
  votes?: number;
}

export type ViewTab = 'home' | 'collection' | 'online' | 'settings';

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  publishedAt: string;
}

export interface AppUpdateProgress {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error';
  percent: number;
  downloaded: number;
  total: number;
  message: string;
  error?: string;
}

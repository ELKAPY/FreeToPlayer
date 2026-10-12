export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  filename: string;
  coverPath?: string;
  hasCover?: boolean;
  size?: number;
  addedAt?: string;
  plays?: number;
  liked?: boolean;
  versionType?: string;
  streamUrl?: string;
  coverUrl?: string;
}

export interface OnlineTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
  source?: 'hitmo' | 'yandex' | 'soundcloud' | 'vk' | 'audius' | 'youtube' | string;
  bitrate?: string;
  isDownloading?: boolean;
  isDownloaded?: boolean;
}

export interface OnlineAlbum {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  year?: string;
  trackCount?: number;
  source?: string;
}

export interface TrackVersion {
  id: string;
  title: string;
  artist: string;
  duration: number;
  source: string;
  streamUrl: string;
  bitrate?: string;
  coverUrl?: string;
}

export type MobileTab = 'home' | 'collection' | 'search' | 'settings';

export interface StorageStats {
  trackCount: number;
  totalDuration: number;
  totalSize: number;
}

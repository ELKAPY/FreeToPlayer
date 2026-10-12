import type { OnlineAlbum, OnlineTrack, Track, TrackVersion } from './types';

// Server URL storage key
const SERVER_URL_KEY = 'dj_server_url';

export function getServerUrl(): string {
  const saved = localStorage.getItem(SERVER_URL_KEY);
  if (saved) return saved.replace(/\/+$/, '');
  
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    // If running in browser served by Go backend or proxy
    return window.location.origin;
  }
  return '';
}

export function setServerUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '');
  localStorage.setItem(SERVER_URL_KEY, clean);
}

function buildUrl(endpoint: string): string {
  const base = getServerUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
}

export async function checkServerConnection(urlToCheck?: string): Promise<boolean> {
  const base = urlToCheck !== undefined ? urlToCheck.replace(/\/+$/, '') : getServerUrl();
  try {
    const testUrl = base ? `${base}/api/tracks` : '/api/tracks';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(testUrl, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchTracks(): Promise<Track[]> {
  try {
    const res = await fetch(buildUrl('/api/tracks'));
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.warn('Failed to fetch tracks:', e);
    return [];
  }
}

export async function fetchState(): Promise<any> {
  try {
    const res = await fetch(buildUrl('/api/state'));
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function savePlaybackState(state: any): Promise<void> {
  try {
    await fetch(buildUrl('/api/state'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  } catch (e) {
    // Silent ignore
  }
}

export async function searchOnline(query: string, source: string = 'all', limit: number = 30): Promise<OnlineTrack[]> {
  try {
    const params = new URLSearchParams({ q: query, source, limit: String(limit) });
    const res = await fetch(buildUrl(`/api/online/search?${params.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.tracks || []);
  } catch (e) {
    console.warn('Online search failed:', e);
    return [];
  }
}

export async function searchOnlineAlbums(query: string): Promise<OnlineAlbum[]> {
  try {
    const res = await fetch(buildUrl(`/api/online/albums?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function fetchAlbumTracks(albumId: string): Promise<OnlineTrack[]> {
  try {
    const res = await fetch(buildUrl(`/api/online/album-tracks?id=${encodeURIComponent(albumId)}`));
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function fetchTrackVersions(artist: string, title: string): Promise<TrackVersion[]> {
  try {
    const params = new URLSearchParams({ artist, title });
    const res = await fetch(buildUrl(`/api/online/versions?${params.toString()}`));
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function downloadOnlineTrack(track: OnlineTrack): Promise<boolean> {
  try {
    const res = await fetch(buildUrl('/api/online/download'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export function getAudioStreamUrl(track: Track | OnlineTrack): string {
  const base = getServerUrl();
  if ('streamUrl' in track && track.streamUrl) {
    if (track.streamUrl.startsWith('http://') || track.streamUrl.startsWith('https://')) {
      return track.streamUrl;
    }
    return base ? `${base}${track.streamUrl}` : track.streamUrl;
  }

  // Local track streaming
  const localStream = `/api/stream/${encodeURIComponent(track.id)}`;
  return base ? `${base}${localStream}` : localStream;
}

export const DEFAULT_COVER = './default_cover.svg';

export function getCoverUrl(track: Track | OnlineTrack | null | undefined): string {
  if (!track) return DEFAULT_COVER;
  const base = getServerUrl();

  if ('coverUrl' in track && track.coverUrl) {
    return track.coverUrl;
  }

  if ('hasCover' in track && track.hasCover) {
    const coverPath = `/api/cover/${encodeURIComponent(track.id)}`;
    return base ? `${base}${coverPath}` : coverPath;
  }

  return DEFAULT_COVER;
}

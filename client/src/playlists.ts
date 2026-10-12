import type { Track } from './types';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

const STORAGE_KEY = 'freetoplayer_playlists';

export function getPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('dj_playlists');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load playlists:', e);
  }
  return [];
}

export function savePlaylists(playlists: Playlist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    localStorage.setItem('dj_playlists', JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: playlists }));
  } catch (e) {
    console.warn('Failed to save playlists:', e);
  }
}

export function createPlaylist(name: string): Playlist {
  const playlists = getPlaylists();
  const newPl: Playlist = {
    id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim() || 'Новый плейлист',
    trackIds: [],
    createdAt: Date.now(),
  };
  playlists.push(newPl);
  savePlaylists(playlists);
  return newPl;
}

export function deletePlaylist(id: string): void {
  const playlists = getPlaylists().filter((p) => p.id !== id);
  savePlaylists(playlists);
}

export function addTrackToPlaylist(playlistId: string, trackId: string): boolean {
  const playlists = getPlaylists();
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return false;
  if (!pl.trackIds.includes(trackId)) {
    pl.trackIds.push(trackId);
    savePlaylists(playlists);
    return true;
  }
  return false;
}

export function removeTrackFromPlaylist(playlistId: string, trackId: string): void {
  const playlists = getPlaylists();
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
  savePlaylists(playlists);
}

export function getPlaylistTracks(playlist: Playlist, allTracks: Track[]): Track[] {
  const map = new Map<string, Track>();
  for (const t of allTracks) {
    map.set(t.id, t);
  }
  const result: Track[] = [];
  for (const tid of playlist.trackIds) {
    const t = map.get(tid);
    if (t) {
      result.push(t);
    }
  }
  return result;
}

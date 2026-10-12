import { getAppSettings } from './settings';
import type { Track } from './types';

const LIKED_KEY = 'dj_liked_tracks';
const STATS_KEY = 'dj_play_stats';

export interface TrackPlayStat {
  count: number;
  lastPlayed: number; // timestamp
}

export function getLikedTrackIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (e) {}
  return new Set<string>();
}

export function isTrackLiked(trackId: string): boolean {
  if (!trackId) return false;
  return getLikedTrackIds().has(trackId);
}

export function toggleLikeTrack(trackId: string): boolean {
  if (!trackId) return false;
  const set = getLikedTrackIds();
  let isNowLiked = false;
  if (set.has(trackId)) {
    set.delete(trackId);
    isNowLiked = false;
  } else {
    set.add(trackId);
    isNowLiked = true;
  }
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent('dj_likes_changed', { detail: { trackId, isLiked: isNowLiked } }));
  } catch (e) {}
  return isNowLiked;
}

export function getPlayStats(): Record<string, TrackPlayStat> {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

export function clearPlayStats(): void {
  try {
    localStorage.removeItem(STATS_KEY);
    window.dispatchEvent(new CustomEvent('dj_stats_changed', { detail: {} }));
  } catch (e) {}
}

export function recordTrackPlay(trackId: string) {
  if (!trackId) return;
  try {
    const stats = getPlayStats();
    const cur = stats[trackId] || { count: 0, lastPlayed: 0 };
    stats[trackId] = {
      count: cur.count + 1,
      lastPlayed: Date.now(),
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent('dj_stats_changed', { detail: { trackId, stats: stats[trackId] } }));
  } catch (e) {}
}

export function getFavoritesTracks(tracks: Track[]): Track[] {
  const liked = getLikedTrackIds();
  return tracks.filter((t) => liked.has(t.id));
}

export function getMostPlayedTracks(tracks: Track[], customLimit?: number): Track[] {
  const limit = customLimit || getAppSettings().smartPlaylistLimit || 30;
  const stats = getPlayStats();
  const played = tracks.filter((t) => (stats[t.id]?.count || 0) > 0);
  return played
    .sort((a, b) => {
      const ca = stats[a.id]?.count || 0;
      const cb = stats[b.id]?.count || 0;
      return cb - ca;
    })
    .slice(0, limit);
}

export function getRecentlyAddedTracks(tracks: Track[], customLimit?: number): Track[] {
  const limit = customLimit || getAppSettings().smartPlaylistLimit || 30;
  return [...tracks]
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, limit);
}

export function getForgottenFavoritesTracks(tracks: Track[], customLimit?: number): Track[] {
  const appSettings = getAppSettings();
  const limit = customLimit || appSettings.smartPlaylistLimit || 30;
  const days = appSettings.forgottenDaysThreshold || 7;
  const liked = getLikedTrackIds();
  const stats = getPlayStats();
  const now = Date.now();
  const thresholdAgo = now - days * 24 * 60 * 60 * 1000;

  return tracks
    .filter((t) => {
      const isLoved = liked.has(t.id);
      const count = stats[t.id]?.count || 0;
      const lastPlayed = stats[t.id]?.lastPlayed || 0;
      if ((isLoved || count >= 2) && (lastPlayed === 0 || lastPlayed < thresholdAgo)) {
        return true;
      }
      return false;
    })
    .slice(0, limit);
}

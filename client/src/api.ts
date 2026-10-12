import type {
  ArtistFlowResponse,
  OnlineAlbum,
  OnlineTrack,
  PlaybackState,
  RadioStation,
  StorageStats,
  Track,
  TrackVersion,
  VersionPreferences,
  VersionsResponse,
} from './types';

const API_BASE = '/api';

export async function fetchTracks(): Promise<Track[]> {
  const res = await fetch(`${API_BASE}/tracks`);
  if (!res.ok) throw new Error('Failed to load tracks');
  return res.json();
}

export async function uploadAudioFiles(
  files: FileList | File[],
  onProgress?: (percent: number) => void
): Promise<{ uploaded: Track[]; count: number }> {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(xhr.responseText || 'Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export async function deleteTrack(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/tracks/${id}`, { method: 'DELETE' });
  return res.ok;
}

export async function fetchPlaybackState(): Promise<PlaybackState> {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

export async function savePlaybackState(state: PlaybackState): Promise<void> {
  await fetch(`${API_BASE}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

export async function updateTrackDuration(id: string, seconds: number): Promise<void> {
  await fetch(`${API_BASE}/duration/${id}?seconds=${seconds}`, {
    method: 'POST',
  });
}

export async function fetchStorageStats(): Promise<StorageStats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export function getAudioStreamUrl(trackId: string): string {
  return `${API_BASE}/stream/${trackId}`;
}

export function getCoverUrl(trackId: string, updatedAt?: number): string {
  if (updatedAt) {
    return `${API_BASE}/cover/${trackId}?t=${updatedAt}`;
  }
  return `${API_BASE}/cover/${trackId}`;
}

export function getTrackCoverSrc(track: Track | null | undefined): string | null {
  if (!track) return null;
  if (track.coverUrl) return track.coverUrl;
  if (track.hasCover) return getCoverUrl(track.id, track.coverUpdatedAt);
  return null;
}

export async function openStorageFolder(): Promise<void> {
  await fetch(`${API_BASE}/open-storage`, { method: 'POST' });
}

export async function editTrackMetadata(
  id: string,
  data: { title: string; artist: string; album: string }
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/edit-track/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function setStoragePath(newPath: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/set-storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: newPath }),
  });
  return res.ok;
}

export async function saveReorderedQueue(ids: string[]): Promise<boolean> {
  const res = await fetch(`${API_BASE}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids),
  });
  return res.ok;
}

export async function searchOnlineTracks(query: string, source: string = 'all'): Promise<OnlineTrack[]> {
  try {
    const res = await fetch(`${API_BASE}/online/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('searchOnlineTracks failed:', err);
    return [];
  }
}

export async function downloadOnlineTrack(item: OnlineTrack): Promise<{ success: boolean; track?: Track }> {
  const res = await fetch(`${API_BASE}/online/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Download failed');
  return res.json();
}

export async function searchOnlineAlbums(query: string, source: string = 'all'): Promise<OnlineAlbum[]> {
  try {
    const res = await fetch(`${API_BASE}/online/albums?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('searchOnlineAlbums failed:', err);
    return [];
  }
}

export async function fetchOnlineAlbumTracks(albumId: string): Promise<OnlineAlbum> {
  const res = await fetch(`${API_BASE}/online/album-tracks?id=${encodeURIComponent(albumId)}`);
  if (!res.ok) throw new Error('Failed to fetch album tracks');
  const data = await res.json();
  if (data && !Array.isArray(data.tracks)) {
    data.tracks = [];
  }
  return data;
}

export async function fetchArtistFlow(artist: string): Promise<ArtistFlowResponse> {
  try {
    const res = await fetch(`${API_BASE}/online/artist-flow?artist=${encodeURIComponent(artist)}`);
    if (!res.ok) return { artist, tracks: [], total: 0 };
    const data = await res.json();
    return {
      artist: data?.artist || artist,
      tracks: Array.isArray(data?.tracks) ? data.tracks : [],
      total: data?.total || 0,
    };
  } catch (err) {
    console.warn('fetchArtistFlow failed:', err);
    return { artist, tracks: [], total: 0 };
  }
}

export async function fetchTrackVersions(title: string, artist: string): Promise<VersionsResponse> {
  try {
    const res = await fetch(`${API_BASE}/online/versions?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
    if (!res.ok) return { songKey: '', title, artist, versions: [], hasPreferred: false };
    const data = await res.json();
    return {
      songKey: data?.songKey || '',
      title: data?.title || title,
      artist: data?.artist || artist,
      versions: Array.isArray(data?.versions) ? data.versions : [],
      hasPreferred: !!data?.hasPreferred,
      preferred: data?.preferred,
    };
  } catch (err) {
    console.warn('fetchTrackVersions failed:', err);
    return { songKey: '', title, artist, versions: [], hasPreferred: false };
  }
}

export async function fetchVersionPreferences(): Promise<VersionPreferences> {
  try {
    const res = await fetch(`${API_BASE}/versions/preferences`);
    if (!res.ok) return { preferred: {}, disliked: {} };
    const data = await res.json();
    return {
      preferred: data?.preferred || {},
      disliked: data?.disliked || {},
    };
  } catch (err) {
    console.warn('fetchVersionPreferences failed:', err);
    return { preferred: {}, disliked: {} };
  }
}

export async function setPreferredVersion(data: {
  songKey?: string;
  artist: string;
  title: string;
  version: TrackVersion;
  remove?: boolean;
}): Promise<{ success: boolean; removed?: boolean; songKey: string }> {
  const res = await fetch(`${API_BASE}/versions/preferred`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to set preferred version');
  return res.json();
}

export async function dislikeVersion(data: {
  songKey?: string;
  artist: string;
  title: string;
  trackId?: string;
  versionType?: string;
}): Promise<{ success: boolean; disliked: string; songKey: string }> {
  const res = await fetch(`${API_BASE}/versions/dislike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to dislike version');
  return res.json();
}

export async function fetchAutoCovers(trackId?: string): Promise<{ success: boolean; updatedCount: number; tracks: Track[] }> {
  const url = trackId ? `${API_BASE}/tracks/auto-covers?trackId=${encodeURIComponent(trackId)}` : `${API_BASE}/tracks/auto-covers`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to fetch auto covers');
  return res.json();
}

export interface CoverCandidate {
  url: string;
  title: string;
  artist: string;
  sourceName: string;
}

export async function searchCovers(trackId?: string, query?: string): Promise<CoverCandidate[]> {
  const params = new URLSearchParams();
  if (trackId) params.set('trackId', trackId);
  if (query) params.set('q', query);
  const res = await fetch(`${API_BASE}/tracks/search-covers?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.covers || [];
}

export async function setTrackCover(
  trackId: string,
  payload: { coverUrl?: string; coverBase64?: string }
): Promise<Track | null> {
  const res = await fetch(`${API_BASE}/tracks/set-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, ...payload }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.track || null;
}

export async function replaceLocalTrackVersion(
  localTrackId: string,
  version: TrackVersion
): Promise<{ success: boolean; track: Track }> {
  const res = await fetch(`${API_BASE}/tracks/replace-version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localTrackId, version }),
  });
  if (!res.ok) throw new Error('Failed to replace track version');
  return res.json();
}

export async function fetchRadioTop(): Promise<RadioStation[]> {
  try {
    const res = await fetch(`${API_BASE}/online/radio/top`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('fetchRadioTop failed:', err);
    return [];
  }
}

export async function fetchRadioByGenre(tag: string): Promise<RadioStation[]> {
  try {
    const res = await fetch(`${API_BASE}/online/radio/genre?tag=${encodeURIComponent(tag)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('fetchRadioByGenre failed:', err);
    return [];
  }
}

export async function fetchRadioByCountry(code: string): Promise<RadioStation[]> {
  try {
    const res = await fetch(`${API_BASE}/online/radio/country?code=${encodeURIComponent(code)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('fetchRadioByCountry failed:', err);
    return [];
  }
}

export async function searchRadioStations(query: string): Promise<RadioStation[]> {
  try {
    const res = await fetch(`${API_BASE}/online/radio/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('searchRadioStations failed:', err);
    return [];
  }
}

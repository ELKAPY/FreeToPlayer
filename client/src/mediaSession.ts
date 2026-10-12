import { getTrackCoverSrc } from './api';
import type { Track } from './types';

export function updateMediaSession(
  track: Track | null,
  handlers: {
    onPlay: () => void;
    onPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSeek: (sec: number) => void;
  }
) {
  if (!('mediaSession' in navigator) || !track) {
    document.title = 'FreeToPlayer';
    return;
  }

  document.title = `${track.title} • ${track.artist} - FreeToPlayer`;

  const coverUrl = getTrackCoverSrc(track) || '/favicon.svg';

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album && track.album !== 'Unknown Album' ? track.album : 'FreeToPlayer',
    artwork: [
      { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
      { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
      { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
      { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
    ],
  });

  try {
    navigator.mediaSession.setActionHandler('play', handlers.onPlay);
    navigator.mediaSession.setActionHandler('pause', handlers.onPause);
    navigator.mediaSession.setActionHandler('previoustrack', handlers.onPrev);
    navigator.mediaSession.setActionHandler('nexttrack', handlers.onNext);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        handlers.onSeek(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skip = details.seekOffset || 10;
      handlers.onSeek(Math.max(0, (navigator.mediaSession as unknown as { positionState?: { position?: number } })?.positionState?.position || 0 - skip));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skip = details.seekOffset || 10;
      handlers.onSeek((navigator.mediaSession as unknown as { positionState?: { position?: number } })?.positionState?.position || 0 + skip);
    });
  } catch (e) {
    console.warn('MediaSession handler error:', e);
  }
}

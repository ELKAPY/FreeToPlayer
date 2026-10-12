import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioStreamUrl, getCoverUrl, savePlaybackState } from './api';
import type { OnlineTrack, Track } from './types';

export const EQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 1, 2, 3],
  rock: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
  electronic: [5, 4, 1, 0, -1, 1, 2, 3, 4, 4],
  vocal: [-2, -2, 0, 2, 4, 4, 3, 1, 0, -1],
  pop: [-1, 1, 3, 4, 3, 1, -1, -1, 1, 2],
};

// Haptic feedback helper
export function triggerHaptic(duration = 15) {
  try {
    const win = window as any;
    if (win.AndroidBridge && typeof win.AndroidBridge.vibrate === 'function') {
      win.AndroidBridge.vibrate(duration);
    } else if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (e) {}
}

export function useAudioPlayer(initialTracks: Track[] = []) {
  const [currentTrack, setCurrentTrack] = useState<Track | OnlineTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(() => {
    const v = localStorage.getItem('dj_mobile_volume');
    return v !== null ? parseFloat(v) : 1;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [queue, setQueue] = useState<(Track | OnlineTrack)[]>([]);

  // EQ states (-12 to +12 dB)
  const [eqGains, setEqGains] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('dj_mobile_eq');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  });
  const [preamp, setPreamp] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const preampGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize Web Audio graph
  const initAudioGraph = useCallback(() => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ latencyHint: 'playback' });
      audioCtxRef.current = ctx;

      const audio = audioRef.current;
      if (!audio) return;

      const source = ctx.createMediaElementSource(audio);

      // Preamp gain
      const preampNode = ctx.createGain();
      preampGainRef.current = preampNode;

      // 10-band EQ filters
      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = eqGains[idx] || 0;
        return filter;
      });
      eqFiltersRef.current = filters;

      // Limiter / Compressor to avoid distortion on boosted EQ
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -0.5;
      compressor.knee.value = 4;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      // Analyser node for audio visualization
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      // Chain: source -> preamp -> filters -> compressor -> analyser -> destination
      let lastNode: AudioNode = source;
      lastNode.connect(preampNode);
      lastNode = preampNode;

      for (const filter of filters) {
        lastNode.connect(filter);
        lastNode = filter;
      }

      lastNode.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (e) {
      console.warn('Web Audio initialization fallback:', e);
    }
  }, [eqGains]);

  // Unlock AudioContext on first user touch anywhere
  useEffect(() => {
    const unlock = () => {
      initAudioGraph();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, [initAudioGraph]);

  // Create audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    (audio as any).playsInline = true;
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };
    const onPlay = () => {
      setIsPlaying(true);
      const win = window as any;
      if (win.AndroidBridge?.setKeepScreenOn) win.AndroidBridge.setKeepScreenOn(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      const win = window as any;
      if (win.AndroidBridge?.setKeepScreenOn) win.AndroidBridge.setKeepScreenOn(false);
    };
    const onEnded = () => {
      handleNextTrack();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Update MediaSession on track change
  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const cover = getCoverUrl(currentTrack);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown Title',
      artist: currentTrack.artist || 'Unknown Artist',
      album: ('album' in currentTrack && currentTrack.album) || 'DJ Player',
      artwork: cover
        ? [
            { src: cover, sizes: '96x96', type: 'image/jpeg' },
            { src: cover, sizes: '128x128', type: 'image/jpeg' },
            { src: cover, sizes: '256x256', type: 'image/jpeg' },
            { src: cover, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      if (audioRef.current) audioRef.current.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (audioRef.current) audioRef.current.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      handlePrevTrack();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      handleNextTrack();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
      }
    });
  }, [currentTrack]);

  // Sync MediaSession playback state & position
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(duration, 0),
          playbackRate: 1,
          position: Math.min(Math.max(currentTime, 0), duration),
        });
      } catch (e) {}
    }
  }, [isPlaying, currentTime, duration]);

  // Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Play track
  const playTrack = useCallback(
    (track: Track | OnlineTrack, newQueue?: (Track | OnlineTrack)[]) => {
      initAudioGraph();
      const audio = audioRef.current;
      if (!audio) return;

      triggerHaptic(20);
      setCurrentTrack(track);

      if (newQueue) {
        setQueue(newQueue);
      } else if (!queue.some((q) => q.id === track.id)) {
        setQueue((prev) => [track, ...prev]);
      }

      const streamUrl = getAudioStreamUrl(track);
      audio.src = streamUrl;
      audio.load();
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Playback error (need user gesture):', err);
          setIsPlaying(false);
        });
    },
    [initAudioGraph, queue]
  );

  const togglePlay = useCallback(() => {
    initAudioGraph();
    const audio = audioRef.current;
    if (!audio) return;
    triggerHaptic(15);

    if (isPlaying) {
      audio.pause();
    } else {
      if (!audio.src && currentTrack) {
        audio.src = getAudioStreamUrl(currentTrack);
      }
      audio.play().catch(() => {});
    }
  }, [initAudioGraph, isPlaying, currentTrack]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleNextTrack = useCallback(() => {
    triggerHaptic(15);
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }

    if (queue.length === 0) return;

    if (isShuffle) {
      const nextIdx = Math.floor(Math.random() * queue.length);
      playTrack(queue[nextIdx]);
      return;
    }

    const currentIdx = queue.findIndex((t) => t.id === currentTrack?.id);
    if (currentIdx !== -1 && currentIdx < queue.length - 1) {
      playTrack(queue[currentIdx + 1]);
    } else if (repeatMode === 'all' && queue.length > 0) {
      playTrack(queue[0]);
    } else {
      setIsPlaying(false);
    }
  }, [queue, currentTrack, isShuffle, repeatMode, playTrack]);

  const handlePrevTrack = useCallback(() => {
    triggerHaptic(15);
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (queue.length === 0) return;
    const currentIdx = queue.findIndex((t) => t.id === currentTrack?.id);
    if (currentIdx > 0) {
      playTrack(queue[currentIdx - 1]);
    } else if (queue.length > 0) {
      playTrack(queue[queue.length - 1]);
    }
  }, [queue, currentTrack, playTrack]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    localStorage.setItem('dj_mobile_volume', String(clamped));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    triggerHaptic(10);
    setIsShuffle((prev) => !prev);
  }, []);

  const toggleRepeat = useCallback(() => {
    triggerHaptic(10);
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const setEqBand = useCallback((index: number, gain: number) => {
    setEqGains((prev) => {
      const next = [...prev];
      next[index] = gain;
      if (eqFiltersRef.current[index]) {
        eqFiltersRef.current[index].gain.value = gain;
      }
      localStorage.setItem('dj_mobile_eq', JSON.stringify(next));
      return next;
    });
  }, []);

  const applyPreset = useCallback((presetName: string) => {
    const preset = EQ_PRESETS[presetName] || EQ_PRESETS.flat;
    setEqGains(preset);
    preset.forEach((gain, i) => {
      if (eqFiltersRef.current[i]) {
        eqFiltersRef.current[i].gain.value = gain;
      }
    });
    localStorage.setItem('dj_mobile_eq', JSON.stringify(preset));
    triggerHaptic(20);
  }, []);

  const addToQueue = useCallback((track: Track | OnlineTrack) => {
    triggerHaptic(10);
    setQueue((prev) => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    triggerHaptic(10);
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    queue,
    eqGains,
    preamp,
    playTrack,
    togglePlay,
    seek,
    next: handleNextTrack,
    prev: handlePrevTrack,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    setEqBand,
    applyPreset,
    addToQueue,
    removeFromQueue,
    setQueue,
  };
}

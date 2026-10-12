import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPlaybackState,
  getAudioStreamUrl,
  savePlaybackState,
  updateTrackDuration,
} from './api';
import { recordTrackPlay } from './favorites';
import { getAppSettings } from './settings';
import type { PlaybackState, Track } from './types';

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type EQPresetName = 'flat' | 'rock' | 'metal' | 'electronic' | 'hiphop' | 'acoustic' | 'vocal' | 'custom';

export const EQ_PRESETS: Record<EQPresetName, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [4.5, 3.5, 1.5, -0.5, -1.0, 0.5, 2.0, 3.5, 4.0, 4.5],
  metal: [6.0, 4.5, 2.0, -1.5, -2.5, 0.5, 3.0, 5.0, 5.5, 6.0],
  electronic: [5.5, 4.5, 2.0, 0, -1.0, 1.5, 2.5, 3.5, 4.0, 4.5],
  hiphop: [6.0, 5.0, 2.0, 0, -1.5, -1.0, 1.5, 2.5, 3.5, 4.0],
  acoustic: [3.0, 2.0, 1.0, 1.5, 2.0, 2.0, 3.0, 3.5, 3.0, 2.5],
  vocal: [-2.0, -1.5, 0, 2.5, 5.0, 4.5, 2.5, 1.0, 0, -1.0],
  custom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export function useAudioPlayer(tracks: Track[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const preampGainRef = useRef<GainNode | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const extraAudioNodesRef = useRef<Map<string, { ctx: AudioContext; source: MediaStreamAudioSourceNode }>>(new Map());
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);

  // 10-band Equalizer filter nodes
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(() => {
    const val = localStorage.getItem('dj_volume');
    return val !== null ? parseFloat(val) : 0.8;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('dj_muted') === 'true';
  });
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>(() => {
    return (localStorage.getItem('dj_repeat_mode') as 'off' | 'all' | 'one') || 'all';
  });
  const [isShuffle, setIsShuffle] = useState<boolean>(() => {
    return localStorage.getItem('dj_is_shuffle') === 'true';
  });
  const [savedState, setSavedState] = useState<PlaybackState | null>(null);

  // Queue state (Yandex Music style shuffle)
  const [queue, setQueue] = useState<Track[]>(tracks);
  const originalQueueRef = useRef<Track[]>(tracks);
  const isQueueRestoredRef = useRef<boolean>(false);

  // App Settings Integration
  const [eqEnabled, setEqEnabledState] = useState<boolean>(() => getAppSettings().eqEnabled);
  const eqEnabledRef = useRef<boolean>(eqEnabled);
  eqEnabledRef.current = eqEnabled;

  const [playbackRate, setPlaybackRateState] = useState<number>(() => getAppSettings().playbackRate || 1.0);
  const playbackRateRef = useRef<number>(playbackRate);
  playbackRateRef.current = playbackRate;

  const [stereoBalance, setStereoBalanceState] = useState<number>(() => getAppSettings().stereoBalance || 0);
  const stereoBalanceRef = useRef<number>(stereoBalance);
  stereoBalanceRef.current = stereoBalance;

  const [seekStepSeconds, setSeekStepSeconds] = useState<number>(() => getAppSettings().seekStepSeconds || 10);
  const seekStepRef = useRef<number>(seekStepSeconds);
  seekStepRef.current = seekStepSeconds;

  const [volumeStepPercent, setVolumeStepPercent] = useState<number>(() => (getAppSettings().volumeStepPercent || 5) / 100);
  const volumeStepRef = useRef<number>(volumeStepPercent);
  volumeStepRef.current = volumeStepPercent;

  // Advanced Audio Features (persisted in localStorage and synced to backend)
  const [eqPreset, setEqPreset] = useState<EQPresetName>(() => {
    return (localStorage.getItem('dj_eq_preset') as EQPresetName) || 'flat';
  });
  const [eqGains, setEqGains] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('dj_eq_gains');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const p = (localStorage.getItem('dj_eq_preset') as EQPresetName) || 'flat';
    return [...(EQ_PRESETS[p] || EQ_PRESETS.flat)];
  });
  const [isNormalizationEnabled, setIsNormalizationEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dj_normalization') === 'true';
  });
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(() => {
    const val = localStorage.getItem('dj_crossfade');
    return val !== null ? parseInt(val, 10) : 2;
  });

  // Audio output device selection (supports simultaneous multi-device sync!)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dj_selected_devices');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch (e) {}
    const single = localStorage.getItem('dj_selected_device_id') || 'default';
    return [single];
  });
  const selectedDevicesRef = useRef<string[]>(['default']);
  selectedDevicesRef.current = selectedDevices;
  const selectedDevice = selectedDevices[0] || 'default';
  const selectedDeviceRef = useRef<string>('default');
  selectedDeviceRef.current = selectedDevice;

  const setSelectedDevice = useCallback((id: string) => {
    setSelectedDevices([id]);
  }, []);

  // Sleep Timer
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  // Up-to-date refs to avoid stale closures in event handlers
  const currentTrackRef = useRef<Track | null>(null);
  currentTrackRef.current = currentTrack;
  const queueRef = useRef<Track[]>([]);
  queueRef.current = queue;
  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('all');
  repeatModeRef.current = repeatMode;
  const crossfadeRef = useRef<number>(2);
  crossfadeRef.current = crossfadeSeconds;
  const volumeRef = useRef<number>(0.8);
  volumeRef.current = volume;
  const isMutedRef = useRef<boolean>(false);
  isMutedRef.current = isMuted;
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;
  const wasPlayingBeforeCallRef = useRef<boolean>(false);

  // Restore queue from savedState or initialize when tracks arrive
  useEffect(() => {
    if (tracks.length === 0) return;

    if (!isQueueRestoredRef.current) {
      isQueueRestoredRef.current = true;

      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      let restoredQueue: Track[] = [];

      // 1. If savedState has an existing queue sequence, restore it exactly
      if (savedState?.queue && savedState.queue.length > 0) {
        for (const id of savedState.queue) {
          const t = trackMap.get(id);
          if (t) {
            restoredQueue.push(t);
            trackMap.delete(id);
          }
        }
        // Append any new tracks in library that weren't in the saved queue
        for (const t of trackMap.values()) {
          restoredQueue.push(t);
        }
      } else {
        restoredQueue = [...tracks];
      }

      setQueue(restoredQueue);
      originalQueueRef.current = [...restoredQueue];
      queueRef.current = restoredQueue;
    } else {
      // Keep active queue intact, only removing deleted tracks and appending newly uploaded ones, preserving online streams & versions
      const currentIds = new Set(queueRef.current.map((t) => t.id));
      const validTrackIds = new Set(tracks.map((t) => t.id));
      const updatedQueue = queueRef.current.filter((t) => validTrackIds.has(t.id) || !!(t as any).onlineStreamUrl);
      for (const t of tracks) {
        if (!currentIds.has(t.id)) {
          updatedQueue.push(t);
        }
      }
      setQueue(updatedQueue);
      queueRef.current = updatedQueue;
    }
  }, [tracks, savedState]);

  // Refresh and name audio output devices (Zero permission popups, distinct devices only)
  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      let devs = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devs.some((d) => d.kind === 'audiooutput' && d.label && d.label.trim() !== '');

      // Only attempt silent media permission unlock if labels/IDs are hidden by browser sandbox
      if (!hasLabels) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          devs = await navigator.mediaDevices.enumerateDevices();
        } catch (e) {}
      }

      // Filter for valid audio outputs, omitting virtual aliases like 'default' and 'communications'
      const outputs = devs.filter(
        (d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'
      );

      let winNames: string[] = [];
      try {
        const res = await fetch('/api/audio-devices');
        if (res.ok) {
          const winDevs: { id: string; name: string }[] = await res.json();
          winNames = winDevs.filter((w) => w.id !== 'default').map((w) => w.name);
        }
      } catch (e) {}

      // Explicitly extract fields (never object spread MediaDeviceInfo, which drops prototype getters)
      const cleanOutputs = outputs.map((d, i) => {
        let label = d.label;
        if (!label || label.trim() === '') {
          label = winNames[i] || `Аудиоустройство ${i + 1}`;
        }
        return {
          deviceId: d.deviceId,
          groupId: d.groupId,
          kind: d.kind,
          label: label.replace(/\s+/g, ' ').trim(),
          toJSON: () => ({ deviceId: d.deviceId, groupId: d.groupId, kind: d.kind, label }),
        } as MediaDeviceInfo;
      });

      const seenIds = new Set<string>();
      const seenLabels = new Set<string>();
      const uniqueOutputs = cleanOutputs.filter((d) => {
        if (!d.deviceId) return false;
        if (seenIds.has(d.deviceId)) return false;
        const norm = d.label.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
        if (norm && seenLabels.has(norm)) return false;
        seenIds.add(d.deviceId);
        if (norm) seenLabels.add(norm);
        return true;
      });

      setAudioDevices(uniqueOutputs);

      // Restore previously saved user preference from localStorage
      try {
        const savedId = localStorage.getItem('dj_selected_device_id');
        const savedName = localStorage.getItem('dj_selected_device_name');
        if (savedId || savedName) {
          const match = uniqueOutputs.find(
            (u) => (savedId && u.deviceId === savedId) || (savedName && u.label === savedName)
          );
          if (match) {
            setSelectedDevice(match.deviceId);
            selectedDeviceRef.current = match.deviceId;
            const sink = match.deviceId === 'default' ? '' : match.deviceId;
            if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
              (audioRef.current as any).setSinkId(sink).catch(() => {});
            }
            if (audioCtxRef.current && typeof (audioCtxRef.current as any).setSinkId === 'function') {
              (audioCtxRef.current as any).setSinkId(sink).catch(() => {});
            }
          }
        }
      } catch (e) {}
    } catch (err) {
      console.warn('Failed to enumerate audio devices:', err);
    }
  }, []);

  useEffect(() => {
    refreshAudioDevices();
  }, [refreshAudioDevices]);

  // Auto-recover audio pipeline and auto-resume after phone calls or device changes
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = async () => {
      console.log('Audio topology changed (e.g. phone call started/ended / Bluetooth changed)');
      await refreshAudioDevices();

      const devs = await navigator.mediaDevices.enumerateDevices();
      const outputs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');
      const isTargetStillPresent =
        selectedDeviceRef.current === 'default' || outputs.some((d) => d.deviceId === selectedDeviceRef.current);

      const audio = audioRef.current;
      const ctx = audioCtxRef.current as any;

      // 1. If currently selected headphones disappeared (phone call started / profile switched to call):
      if (!isTargetStillPresent) {
        console.log('Headphones switched to call / unavailable -> pausing music');
        if (isPlayingRef.current) {
          wasPlayingBeforeCallRef.current = true;
          if (audio) audio.pause();
          setIsPlaying(false);
        }
        return; // Do NOT switch to speakers during a call! Keep waiting for headphones to return.
      }

      // 2. Target device IS present (call finished or headphones reconnected):
      if (ctx) {
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
          await ctx.resume().catch(() => {});
        }
        const sink = selectedDeviceRef.current === 'default' ? '' : selectedDeviceRef.current;
        if (typeof ctx.setSinkId === 'function') {
          try {
            await ctx.setSinkId(sink);
          } catch (e) {
            console.warn('Set sink error on restore:', e);
          }
        }
      }

      // 3. If audio was playing right before the call/interruption, automatically resume in headphones!
      if (wasPlayingBeforeCallRef.current) {
        wasPlayingBeforeCallRef.current = false;
        setTimeout(async () => {
          if (audio && currentTrackRef.current) {
            try {
              if (ctx && ctx.state === 'suspended') {
                await ctx.resume();
              }
              await audio.play();
              setIsPlaying(true);
            } catch (err) {
              console.warn('Auto-resume after call error:', err);
            }
          }
        }, 500); // 500ms delay to let Windows Bluetooth profile switch back to stereo A2DP
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshAudioDevices]);

  // Sync settings when changed in UI
  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const s = (e as CustomEvent).detail || getAppSettings();
      if (s) {
        if (s.eqEnabled !== undefined) {
          setEqEnabledState(s.eqEnabled);
          eqEnabledRef.current = s.eqEnabled;
        }
        if (s.playbackRate !== undefined) {
          setPlaybackRateState(s.playbackRate);
          playbackRateRef.current = s.playbackRate;
          if (audioRef.current) {
            audioRef.current.playbackRate = s.playbackRate;
            (audioRef.current as any).preservesPitch = s.preservePitch !== false;
          }
        }
        if (s.stereoBalance !== undefined) {
          setStereoBalanceState(s.stereoBalance);
          stereoBalanceRef.current = s.stereoBalance;
          if (pannerNodeRef.current) {
            pannerNodeRef.current.pan.value = s.stereoBalance;
          }
        }
        if (s.seekStepSeconds !== undefined) {
          setSeekStepSeconds(s.seekStepSeconds);
          seekStepRef.current = s.seekStepSeconds;
        }
        if (s.volumeStepPercent !== undefined) {
          const step = s.volumeStepPercent / 100;
          setVolumeStepPercent(step);
          volumeStepRef.current = step;
        }
        applyAudioRouting();
      }
    };
    window.addEventListener('dj_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('dj_settings_changed', handleSettingsChanged);
  }, []);

  // Set playback rate
  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, rate));
    setPlaybackRateState(clamped);
    playbackRateRef.current = clamped;
    if (audioRef.current) {
      audioRef.current.playbackRate = clamped;
      (audioRef.current as any).preservesPitch = getAppSettings().preservePitch !== false;
    }
  }, []);

  // Set stereo balance
  const setStereoBalance = useCallback((balance: number) => {
    const clamped = Math.max(-1, Math.min(1, balance));
    setStereoBalanceState(clamped);
    stereoBalanceRef.current = clamped;
    if (pannerNodeRef.current) {
      pannerNodeRef.current.pan.value = clamped;
    }
  }, []);

  // Set EQ enabled toggle
  const setEqEnabled = useCallback((enabled: boolean) => {
    setEqEnabledState(enabled);
    eqEnabledRef.current = enabled;
    setTimeout(() => applyAudioRouting(), 10);
  }, []);

  // Reconnect audio routing graph with headroom gain to prevent clipping
  const applyAudioRouting = useCallback(() => {
    if (!sourceNodeRef.current || !audioCtxRef.current) return;
    const source = sourceNodeRef.current;
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    const filters = eqFiltersRef.current;
    const compressor = compressorRef.current;
    const preamp = preampGainRef.current;
    const panner = pannerNodeRef.current;
    const settings = getAppSettings();

    try {
      source.disconnect();
      if (preamp) preamp.disconnect();
      if (compressor) compressor.disconnect();
      if (panner) panner.disconnect();
      if (analyser) analyser.disconnect();
      for (const f of filters) {
        f.disconnect();
      }

      let lastNode: AudioNode = source;

      // 1. Check if EQ is enabled and has non-zero gain
      const isEqOn = eqEnabledRef.current;
      const hasEq = isEqOn && filters.length === 10 && eqGains.some((g) => g !== 0);
      if (hasEq) {
        const maxBoost = Math.max(0, ...eqGains);
        if (preamp && settings.eqPreampAuto) {
          // Attenuate input by maxBoost dB so that boosting bands never exceeds 0 dBFS
          preamp.gain.value = Math.pow(10, -maxBoost / 20);
          lastNode.connect(preamp);
          lastNode = preamp;
        } else if (preamp) {
          preamp.gain.value = 1.0;
        }
        for (let i = 0; i < filters.length; i++) {
          lastNode.connect(filters[i]);
          lastNode = filters[i];
        }
      } else if (preamp) {
        preamp.gain.value = 1.0;
      }

      // 2. Normalization via transparent peak limiter (catches only genuine overs)
      if (isNormalizationEnabled && compressor) {
        lastNode.connect(compressor);
        lastNode = compressor;
      }

      // 3. Stereo Panner / Balance
      if (panner) {
        panner.pan.value = stereoBalanceRef.current;
        lastNode.connect(panner);
        lastNode = panner;
      }

      // 4. Connect cleanly to main destination
      lastNode.connect(ctx.destination);

      // 5. Split audio to secondary output stream for synchronized multi-device playback
      if (streamDestRef.current) {
        lastNode.connect(streamDestRef.current);
      }

      // 6. Connect to visualizer analyser
      if (analyser) {
        lastNode.connect(analyser);
      }
    } catch (err) {
      console.warn('Audio routing reconnect error:', err);
    }
  }, [eqGains, isNormalizationEnabled]);

  // Initialize Web Audio API nodes
  const initAudioContext = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;

      // Stream destination for synchronized multi-device output
      const streamDest = ctx.createMediaStreamDestination();
      streamDestRef.current = streamDest;

      // Preamp gain to prevent EQ clipping
      const preamp = ctx.createGain();
      preamp.gain.value = 1.0;

      // True-peak safety limiter (transparent, never squashes dynamics or distorts)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -0.5;
      compressor.knee.value = 4;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.05;

      const filters: BiquadFilterNode[] = [];
      for (let i = 0; i < EQ_FREQUENCIES.length; i++) {
        const freq = EQ_FREQUENCIES[i];
        const f = ctx.createBiquadFilter();
        if (i === 0) {
          f.type = 'lowshelf';
        } else if (i === EQ_FREQUENCIES.length - 1) {
          f.type = 'highshelf';
        } else {
          f.type = 'peaking';
          f.Q.value = 1.4;
        }
        f.frequency.value = freq;
        f.gain.value = eqGains[i] || 0;
        filters.push(f);
      }

      const source = ctx.createMediaElementSource(audioRef.current);

      // Stereo balance panner
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = stereoBalanceRef.current;
        pannerNodeRef.current = panner;
      }

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      preampGainRef.current = preamp;
      compressorRef.current = compressor;
      eqFiltersRef.current = filters;

      // Apply initial audio routing graph
      applyAudioRouting();

      // Listen to AudioContext state changes (e.g. system interruptions during phone calls)
      ctx.onstatechange = () => {
        const st = ctx.state;
        if ((st === 'suspended' || (st as any) === 'interrupted') && isPlayingRef.current) {
          wasPlayingBeforeCallRef.current = true;
        } else if (st === 'running' && wasPlayingBeforeCallRef.current) {
          wasPlayingBeforeCallRef.current = false;
          if (audioRef.current && audioRef.current.paused && currentTrackRef.current) {
            audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        }
      };

      // Apply current audio output sink if user previously selected a specific device
      const currentSinkId = selectedDeviceRef.current === 'default' ? '' : selectedDeviceRef.current;
      if (currentSinkId && typeof (ctx as any).setSinkId === 'function') {
        (ctx as any).setSinkId(currentSinkId).catch((err: any) => console.warn('ctx.setSinkId init error:', err));
      }
    } catch (e) {
      console.warn('Web Audio API already connected or error:', e);
    }
  }, [eqGains, applyAudioRouting]);

  // Sync state to backend periodically
  const syncStateToBackend = useCallback(
    (trackId: string | null | undefined, time: number, playing: boolean) => {
      const activeId = trackId !== undefined && trackId !== null ? trackId : (currentTrackRef.current?.id || '');
      const currentQueue = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
      const theme = localStorage.getItem('dj_theme') || 'onyx';
      const isDiscord = localStorage.getItem('dj_discord_enabled') === 'true';
      const devName = localStorage.getItem('dj_selected_device_name') || '';

      const trackObj = currentTrackRef.current || null;
      if (trackObj) {
        try {
          localStorage.setItem('dj_last_track', JSON.stringify(trackObj));
          localStorage.setItem('dj_last_time', String(time));
        } catch (e) {}
      }

      savePlaybackState({
        currentTrackId: activeId,
        currentTrack: trackObj || undefined,
        currentTime: time,
        volume: volumeRef.current,
        isPlaying: playing,
        isMuted: isMutedRef.current,
        repeatMode: repeatModeRef.current,
        isShuffle,
        queue: currentQueue.map((t) => t.id),
        queueTracks: currentQueue,
        eqPreset,
        eqGains,
        isNormalizationEnabled,
        crossfadeSeconds: crossfadeRef.current,
        selectedAudioDevice: selectedDeviceRef.current,
        selectedAudioDeviceName: devName,
        theme,
        isDiscordEnabled: isDiscord,
      }).catch((e) => console.error('Sync state err:', e));
    },
    [isShuffle, eqPreset, eqGains, isNormalizationEnabled]
  );

  // Set equalizer preset
  const selectEqPreset = useCallback(
    (preset: EQPresetName) => {
      setEqPreset(preset);
      const gains = [...EQ_PRESETS[preset]];
      setEqGains(gains);
      try {
        localStorage.setItem('dj_eq_preset', preset);
        localStorage.setItem('dj_eq_gains', JSON.stringify(gains));
      } catch (e) {}

      const filters = eqFiltersRef.current;
      for (let i = 0; i < filters.length && i < gains.length; i++) {
        filters[i].gain.value = gains[i];
      }
      setTimeout(() => applyAudioRouting(), 10);
      syncStateToBackend(currentTrackRef.current?.id, audioRef.current?.currentTime || 0, isPlaying);
    },
    [applyAudioRouting, isPlaying, syncStateToBackend]
  );

  // Set individual EQ band gain
  const setEqBandGain = useCallback(
    (bandIndex: number, gainDb: number) => {
      setEqGains((prev) => {
        const next = [...prev];
        next[bandIndex] = gainDb;
        try {
          localStorage.setItem('dj_eq_preset', 'custom');
          localStorage.setItem('dj_eq_gains', JSON.stringify(next));
        } catch (e) {}
        return next;
      });
      setEqPreset('custom');

      const filter = eqFiltersRef.current[bandIndex];
      if (filter) {
        filter.gain.value = gainDb;
      }
      setTimeout(() => applyAudioRouting(), 10);
      syncStateToBackend(currentTrackRef.current?.id, audioRef.current?.currentTime || 0, isPlaying);
    },
    [applyAudioRouting, isPlaying, syncStateToBackend]
  );

  // Toggle normalization
  const toggleNormalization = useCallback(() => {
    setIsNormalizationEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dj_normalization', String(next));
      } catch (e) {}
      setTimeout(() => applyAudioRouting(), 10);
      syncStateToBackend(currentTrackRef.current?.id, audioRef.current?.currentTime || 0, isPlaying);
      return next;
    });
  }, [applyAudioRouting, isPlaying, syncStateToBackend]);

  // Set crossfade duration
  const handleSetCrossfadeSeconds = useCallback(
    (seconds: number) => {
      setCrossfadeSeconds(seconds);
      crossfadeRef.current = seconds;
      try {
        localStorage.setItem('dj_crossfade', String(seconds));
      } catch (e) {}
      syncStateToBackend(currentTrackRef.current?.id, audioRef.current?.currentTime || 0, isPlaying);
    },
    [isPlaying, syncStateToBackend]
  );

// Update multi-device audio sinks synchronously (supports any number of devices: 1, 2, 3... all!)
  const updateAudioSinks = useCallback(
    async (deviceIds: string[]) => {
      const activeIds = deviceIds.length === 0 ? ['default'] : deviceIds;
      const primaryId = activeIds[0] || 'default';
      const secondaryIds = activeIds.slice(1).filter((id) => id !== 'default');
      const primarySink = primaryId === 'default' ? '' : primaryId;

      // 1. Primary destination on main AudioContext
      const ctx = audioCtxRef.current as any;
      if (ctx && typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId(primarySink);
        } catch (e) {
          console.warn('Primary ctx.setSinkId error:', e);
        }
      }

      // 2. Additional destinations: create an AudioContext for each additional device chosen
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Clean up extra nodes that are no longer selected
      const currentActiveExtraIds = new Set(secondaryIds);
      for (const [id, extra] of extraAudioNodesRef.current.entries()) {
        if (!currentActiveExtraIds.has(id)) {
          extra.source.disconnect();
          extra.ctx.close().catch(() => {});
          extraAudioNodesRef.current.delete(id);
        }
      }

      // Connect any new selected secondary devices
      if (streamDestRef.current && secondaryIds.length > 0) {
        for (const secId of secondaryIds) {
          let extra = extraAudioNodesRef.current.get(secId);
          if (!extra) {
            try {
              const auxCtx = new AudioContextClass();
              const auxSource = auxCtx.createMediaStreamSource(streamDestRef.current.stream);
              auxSource.connect(auxCtx.destination);
              extra = { ctx: auxCtx, source: auxSource };
              extraAudioNodesRef.current.set(secId, extra);
            } catch (err) {
              console.warn(`Failed to create extra AudioContext for sink ${secId}:`, err);
            }
          }

          if (extra) {
            const auxCtxAny = extra.ctx as any;
            if (auxCtxAny && typeof auxCtxAny.setSinkId === 'function') {
              try {
                await auxCtxAny.setSinkId(secId);
                if (auxCtxAny.state === 'suspended') {
                  await auxCtxAny.resume();
                }
              } catch (e) {
                console.warn(`Sink setSinkId error for device ${secId}:`, e);
              }
            }
          }
        }
      }
    },
    []
  );

  // Set audio output device (supports unlimited simultaneous multi-device toggling!)
  const setAudioDevice = useCallback(
    async (deviceId: string) => {
      if (!audioCtxRef.current) {
        initAudioContext();
      }

      let nextDevices: string[];
      if (deviceId === 'default') {
        // Toggle default: if already default only, keep it; if multiple, toggle default in/out
        if (selectedDevicesRef.current.includes('default')) {
          const filtered = selectedDevicesRef.current.filter((id) => id !== 'default');
          nextDevices = filtered.length > 0 ? filtered : ['default'];
        } else {
          nextDevices = [...selectedDevicesRef.current, 'default'];
        }
      } else {
        const current = selectedDevicesRef.current;
        if (current.includes(deviceId)) {
          // Deselect device
          nextDevices = current.filter((id) => id !== deviceId);
          if (nextDevices.length === 0) {
            nextDevices = ['default'];
          }
        } else {
          // Select this device in addition to all existing devices! (no limit)
          nextDevices = [...current, deviceId];
        }
      }

      setSelectedDevices(nextDevices);
      selectedDevicesRef.current = nextDevices;

      try {
        localStorage.setItem('dj_selected_devices', JSON.stringify(nextDevices));
        localStorage.setItem('dj_selected_device_id', nextDevices[0]);
        const dev = audioDevices.find((d) => d.deviceId === nextDevices[0]);
        if (dev) {
          localStorage.setItem('dj_selected_device_name', dev.label);
        } else if (nextDevices[0] === 'default') {
          localStorage.removeItem('dj_selected_device_name');
        }
      } catch (e) {}

      await updateAudioSinks(nextDevices);
      syncStateToBackend(currentTrackRef.current?.id, audioRef.current?.currentTime || 0, isPlaying);
      return true;
    },
    [initAudioContext, updateAudioSinks, audioDevices, syncStateToBackend, isPlaying]
  );

  // Set sleep timer
  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    setSleepRemaining(minutes ? minutes * 60 : null);
  }, []);

  // Sleep timer countdown
  useEffect(() => {
    if (!sleepRemaining || sleepRemaining <= 0) return;
    const interval = setInterval(() => {
      setSleepRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
          }
          setIsPlaying(false);
          setSleepTimerMinutes(null);
          return null;
        }

        // Smooth volume fade-out in last 15 seconds if enabled in settings
        if (prev <= 15 && getAppSettings().sleepFadeOut && audioRef.current && !isMutedRef.current) {
          const fadeRatio = (prev - 1) / 15;
          audioRef.current.volume = Math.max(0, volumeRef.current * fadeRatio);
        }

        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepRemaining]);

  // Load initial state from backend
  useEffect(() => {
    fetchPlaybackState()
      .then((st) => {
        setSavedState(st);
        if (st.volume >= 0 && st.volume <= 1) {
          setVolumeState(st.volume);
          volumeRef.current = st.volume;
        }
        if (st.repeatMode) {
          setRepeatMode(st.repeatMode);
          repeatModeRef.current = st.repeatMode;
        }
        if (st.isShuffle !== undefined) {
          setIsShuffle(st.isShuffle);
        }
        if (st.isMuted !== undefined) {
          setIsMuted(st.isMuted);
          isMutedRef.current = st.isMuted;
        }
        if (st.crossfadeSeconds !== undefined && st.crossfadeSeconds >= 0) {
          setCrossfadeSeconds(st.crossfadeSeconds);
          crossfadeRef.current = st.crossfadeSeconds;
        }
        if (st.eqPreset && EQ_PRESETS[st.eqPreset as EQPresetName]) {
          setEqPreset(st.eqPreset as EQPresetName);
        }
        if (st.eqGains && st.eqGains.length === 10) {
          setEqGains(st.eqGains);
        }
        if (st.isNormalizationEnabled !== undefined) {
          setIsNormalizationEnabled(st.isNormalizationEnabled);
        }
      })
      .catch((err) => console.error('Failed to load playback state', err));
  }, []);

  // Pre-load saved track & position when tracks arrive or from savedState (supports online tracks!)
  useEffect(() => {
    if (currentTrack) return;

    let targetTrack: Track | null = null;
    let targetTime = 0;

    // 1. Always prefer the fresh track from library if it exists in tracks (Requirement 2 & persistence)
    if (savedState?.currentTrackId && tracks.length > 0) {
      const inLib = tracks.find((t) => t.id === savedState.currentTrackId);
      targetTrack = inLib || savedState.currentTrack || null;
      targetTime = savedState.currentTime || 0;
    } else if (savedState?.currentTrack) {
      const inLib = tracks.find((t) => t.id === savedState.currentTrack?.id);
      targetTrack = inLib || savedState.currentTrack;
      targetTime = savedState.currentTime || 0;
    } else {
      try {
        const rawLast = localStorage.getItem('dj_last_track');
        if (rawLast) {
          const parsed = JSON.parse(rawLast);
          const inLib = tracks.find((t) => t.id === parsed.id);
          targetTrack = inLib || parsed;
          targetTime = parseFloat(localStorage.getItem('dj_last_time') || '0') || 0;
        }
      } catch (e) {}
    }

    if (targetTrack) {
      setCurrentTrack(targetTrack);
      setCurrentTime(targetTime);
      if (targetTrack.duration > 0) {
        setDuration(targetTrack.duration);
      }
      if (audioRef.current) {
        const streamUrl = targetTrack.onlineStreamUrl
          ? targetTrack.onlineStreamUrl
          : `${getAudioStreamUrl(targetTrack.id)}?v=${targetTrack.fileSize || targetTrack.duration || Date.now()}`;
        audioRef.current.src = streamUrl;
        const onLoaded = () => {
          if (audioRef.current && targetTime > 0) {
            audioRef.current.currentTime = targetTime;
          }
          audioRef.current?.removeEventListener('loadedmetadata', onLoaded);
        };
        audioRef.current.addEventListener('loadedmetadata', onLoaded);
      }
    }
  }, [tracks, savedState, currentTrack]);

  // Update HTML5 audio volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Interval sync while playing
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    const interval = setInterval(() => {
      if (audioRef.current) {
        syncStateToBackend(currentTrack.id, audioRef.current.currentTime, true);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, syncStateToBackend]);

  // Play track with robust error handling and volume crossfade
  const playTrack = useCallback(
    async (track: Track, startTime = 0) => {
      const audio = audioRef.current;
      if (!audio) return;

      initAudioContext();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume().catch(() => {});
      }

      const curOnline = (currentTrackRef.current as any)?.onlineStreamUrl || '';
      const newOnline = (track as any)?.onlineStreamUrl || '';
      const isSameTrack = currentTrackRef.current?.id === track.id && curOnline === newOnline;
      setCurrentTrack(track);

      // Smooth volume fade transition if already playing a different track
      if (!audio.paused && !isSameTrack && crossfadeRef.current > 0) {
        const targetVol = isMutedRef.current ? 0 : volumeRef.current;
        let v = audio.volume;
        const step = v / 5;
        const fadeInterval = setInterval(() => {
          v = Math.max(0, v - step);
          audio.volume = v;
          if (v <= 0.05) {
            clearInterval(fadeInterval);
            const baseStreamUrl = (track as any).onlineStreamUrl || getAudioStreamUrl(track.id);
            const streamUrl = (track as any).onlineStreamUrl
              ? (track as any).onlineStreamUrl
              : `${baseStreamUrl}?v=${track.fileSize || track.duration || Date.now()}`;
            audio.src = streamUrl;
            if (startTime > 0) {
              const onMeta = () => {
                try {
                  audio.currentTime = startTime;
                } catch (e) {}
                audio.removeEventListener('loadedmetadata', onMeta);
              };
              audio.addEventListener('loadedmetadata', onMeta);
            }
            audio.volume = targetVol;
            audio.play().catch(console.error);
            setIsPlaying(true);
            syncStateToBackend(track.id, startTime, true);
          }
        }, 30);
        return;
      }

      if (!isSameTrack || !audio.src) {
        const baseStreamUrl = (track as any).onlineStreamUrl || getAudioStreamUrl(track.id);
        const streamUrl = (track as any).onlineStreamUrl
          ? (track as any).onlineStreamUrl
          : `${baseStreamUrl}?v=${track.fileSize || track.duration || Date.now()}`;
        audio.src = streamUrl;
        if (startTime > 0) {
          const onMeta = () => {
            try {
              audio.currentTime = startTime;
            } catch (e) {}
            audio.removeEventListener('loadedmetadata', onMeta);
          };
          audio.addEventListener('loadedmetadata', onMeta);
        }
      } else if (startTime > 0) {
        try {
          audio.currentTime = startTime;
        } catch (e) {}
      }

      try {
        audio.playbackRate = playbackRateRef.current;
        (audio as any).preservesPitch = getAppSettings().preservePitch !== false;
        await audio.play();
        setIsPlaying(true);
        recordTrackPlay(track.id);
        syncStateToBackend(track.id, startTime, true);
      } catch (err) {
        console.error('Play failed:', err);
      }
    },
    [initAudioContext, syncStateToBackend]
  );

  // Next track - 100% reliable using latest refs
  const nextTrack = useCallback(() => {
    const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
    if (list.length === 0) return;

    const cur = currentTrackRef.current;
    let nextIdx = 0;
    if (cur) {
      const curIdx = list.findIndex((t) => t.id === cur.id);
      if (curIdx !== -1) {
        nextIdx = (curIdx + 1) % list.length;
      }
    }
    playTrack(list[nextIdx]);
  }, [playTrack]);

  // Prev track - 100% reliable using latest refs
  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
    if (list.length === 0) return;

    const cur = currentTrackRef.current;
    let prevIdx = list.length - 1;
    if (cur) {
      const curIdx = list.findIndex((t) => t.id === cur.id);
      if (curIdx > 0) {
        prevIdx = curIdx - 1;
      } else if (curIdx === 0) {
        prevIdx = list.length - 1;
      }
    }
    playTrack(list[prevIdx]);
  }, [playTrack]);

  // Toggle Play / Pause - 100% reliable check on actual audio.paused property
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    initAudioContext();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }

    if (!audio.paused) {
      wasPlayingBeforeCallRef.current = false;
      audio.pause();
      setIsPlaying(false);
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, audio.currentTime, false);
      }
    } else {
      wasPlayingBeforeCallRef.current = false;
      if (!audio.src || audio.src === '' || audio.src === window.location.href) {
        const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
        if (list.length > 0) {
          playTrack(list[0]);
          return;
        }
      }
      try {
        await audio.play();
        setIsPlaying(true);
        if (currentTrackRef.current) {
          syncStateToBackend(currentTrackRef.current.id, audio.currentTime, true);
        }
      } catch (e) {
        console.error('Play failed:', e);
      }
    }
  }, [initAudioContext, playTrack, syncStateToBackend]);

  // Resume last session
  const resumeLastSession = useCallback(() => {
    if (!savedState?.currentTrackId) return;
    const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
    const track = list.find((t) => t.id === savedState.currentTrackId);
    if (track) {
      playTrack(track, savedState.currentTime || 0);
    }
  }, [savedState, playTrack]);

  // Explicit audio recovery (re-sync sink, un-suspend AudioContext, resume playback)
  const recoverAudio = useCallback(async () => {
    const ctx = audioCtxRef.current as any;
    if (ctx) {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        await ctx.resume().catch(() => {});
      }
      const sink = selectedDeviceRef.current === 'default' ? '' : selectedDeviceRef.current;
      if (typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId(sink);
        } catch (e) {
          try {
            await ctx.setSinkId('');
            setSelectedDevice('default');
            selectedDeviceRef.current = 'default';
          } catch (e2) {}
        }
      }
    }
    applyAudioRouting();
    if (audioRef.current && currentTrackRef.current) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (e) {}
    }
    await refreshAudioDevices();
  }, [applyAudioRouting, refreshAudioDevices]);

  // Seek
  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const targetTime = Math.max(0, Math.min(seconds, duration || 99999));
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, targetTime, !audio.paused);
      }
    },
    [duration, syncStateToBackend]
  );

  // Set Volume
  const setVolume = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      setVolumeState(clamped);
      volumeRef.current = clamped;
      setIsMuted(false);
      isMutedRef.current = false;
      try {
        localStorage.setItem('dj_volume', String(clamped));
        localStorage.setItem('dj_muted', 'false');
      } catch (e) {}
      if (audioRef.current) {
        audioRef.current.volume = clamped;
      }
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, audioRef.current?.currentTime || 0, isPlaying);
      }
    },
    [isPlaying, syncStateToBackend]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      try {
        localStorage.setItem('dj_muted', String(next));
      } catch (e) {}
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volumeRef.current;
      }
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, audioRef.current?.currentTime || 0, isPlaying);
      }
      return next;
    });
  }, [isPlaying, syncStateToBackend]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      let nextMode: 'off' | 'all' | 'one' = 'all';
      if (prev === 'off') nextMode = 'all';
      else if (prev === 'all') nextMode = 'one';
      else nextMode = 'off';
      repeatModeRef.current = nextMode;
      try {
        localStorage.setItem('dj_repeat_mode', nextMode);
      } catch (e) {}
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, audioRef.current?.currentTime || 0, isPlaying);
      }
      return nextMode;
    });
  }, [isPlaying, syncStateToBackend]);

  // Yandex Music-style Queue Shuffle
  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => {
      const willBeShuffle = !prev;
      try {
        localStorage.setItem('dj_is_shuffle', String(willBeShuffle));
      } catch (e) {}
      if (willBeShuffle) {
        originalQueueRef.current = [...queueRef.current];
        const currentList = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
        if (currentList.length > 1) {
          const active = currentTrackRef.current || currentList[0];
          const others = currentList.filter((t) => t.id !== active.id);
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          const shuffled = [active, ...others];
          setQueue(shuffled);
          queueRef.current = shuffled;
        }
      } else {
        const restored =
          originalQueueRef.current.length > 0
            ? [...originalQueueRef.current]
            : [...tracksRef.current];
        setQueue(restored);
        queueRef.current = restored;
      }
      if (currentTrackRef.current) {
        syncStateToBackend(currentTrackRef.current.id, audioRef.current?.currentTime || 0, isPlaying);
      }
      return willBeShuffle;
    });
  }, [isPlaying, syncStateToBackend]);

  // Bind audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Gapless preloading of next track 6 seconds before end
      if (getAppSettings().gaplessPreload && audio.duration > 15 && audio.currentTime >= audio.duration - 6) {
        const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
        const cur = currentTrackRef.current;
        if (cur && list.length > 0) {
          const curIdx = list.findIndex((t) => t.id === cur.id);
          const nextIdx = (curIdx + 1) % list.length;
          const nextTrackItem = list[nextIdx];
          if (nextTrackItem) {
            const prefetchLink = (document.querySelector('link[rel="prefetch"]') as HTMLLinkElement) || document.createElement('link');
            prefetchLink.rel = 'prefetch';
            prefetchLink.as = 'fetch';
            prefetchLink.href = getAudioStreamUrl(nextTrackItem.id);
            if (!prefetchLink.parentNode) {
              document.head.appendChild(prefetchLink);
            }
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (!isNaN(dur) && dur > 0) {
        setDuration(dur);
        if (currentTrackRef.current && currentTrackRef.current.duration <= 0) {
          updateTrackDuration(currentTrackRef.current.id, dur);
        }
      }
    };

    // Auto-advance to next track when song finishes!
    const handleEnded = () => {
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        const list = queueRef.current.length > 0 ? queueRef.current : tracksRef.current;
        const cur = currentTrackRef.current;
        const curIdx = cur ? list.findIndex((t) => t.id === cur.id) : -1;
        const isLast = curIdx >= 0 && curIdx === list.length - 1;

        if (isLast && repeatModeRef.current === 'off') {
          const endAction = getAppSettings().queueEndAction;
          if (endAction === 'artist_flow' && cur?.artist) {
            window.dispatchEvent(new CustomEvent('dj_trigger_artist_flow', { detail: { artist: cur.artist } }));
          } else if (endAction === 'stop') {
            setIsPlaying(false);
          } else {
            nextTrack();
          }
        } else {
          nextTrack();
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      wasPlayingBeforeCallRef.current = false;
    };

    const handlePause = () => {
      setIsPlaying(false);
      // If paused unexpectedly by OS/call ducking while track was active, mark for resume
      if (isPlayingRef.current) {
        wasPlayingBeforeCallRef.current = true;
      }
    };

    const handleError = () => {
      const err = audio.error;
      console.warn('Audio element error during playback/stream:', err);
      if (currentTrackRef.current) {
        const cur = currentTrackRef.current;
        const savedPos = audio.currentTime;
        const fallbackSrc = (cur as any).onlineStreamUrl
          ? (cur as any).onlineStreamUrl
          : `${getAudioStreamUrl(cur.id)}?v=${cur.fileSize || cur.duration || Date.now()}`;
        audio.src = fallbackSrc;
        try {
          audio.currentTime = savedPos;
        } catch (e) {}
        if (wasPlayingBeforeCallRef.current || isPlayingRef.current) {
          setTimeout(() => {
            audio.play().then(() => setIsPlaying(true)).catch(() => {});
          }, 400);
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [nextTrack]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!getAppSettings().enableGlobalHotkeys) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const sStep = seekStepRef.current || 10;
      const vStep = volumeStepRef.current || 0.05;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(currentTime + sStep);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(currentTime - sStep);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolume(volume + vStep);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume(volume - vStep);
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seek, currentTime, setVolume, volume, toggleMute]);

  return {
    audioRef,
    analyserRef,
    currentTrack,
    setCurrentTrack,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    queue,
    setQueue,
    savedState,
    eqPreset,
    eqGains,
    isNormalizationEnabled,
    crossfadeSeconds,
    audioDevices,
    selectedDevice,
    selectedDevices,
    refreshAudioDevices,
    sleepTimerMinutes,
    sleepRemaining,
    eqEnabled,
    setEqEnabled,
    playbackRate,
    setPlaybackRate,
    stereoBalance,
    setStereoBalance,
    seekStepSeconds,
    selectEqPreset,
    setEqBandGain,
    toggleNormalization,
    setAudioDevice,
    setCrossfadeSeconds: handleSetCrossfadeSeconds,
    setSleepTimer,
    playTrack,
    togglePlay,
    seek,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    resumeLastSession,
    recoverAudio,
  };
}

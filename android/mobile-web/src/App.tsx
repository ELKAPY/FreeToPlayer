import { useCallback, useEffect, useState } from 'react';
import { checkServerConnection, fetchTracks, getServerUrl } from './api';
import { BottomNav } from './components/BottomNav';
import { CollectionTab } from './components/CollectionTab';
import { ConnectModal } from './components/ConnectModal';
import { EqualizerModal } from './components/EqualizerModal';
import { HomeTab } from './components/HomeTab';
import { MobileFullscreenPlayer } from './components/MobileFullscreenPlayer';
import { MobileHeader } from './components/MobileHeader';
import { MobileMiniPlayer } from './components/MobileMiniPlayer';
import { SearchTab } from './components/SearchTab';
import { SettingsTab } from './components/SettingsTab';
import { applyTheme, type ThemeName } from './theme';
import type { MobileTab, OnlineTrack, Track } from './types';
import { useAudioPlayer } from './useAudioPlayer';

const DEFAULT_DEMO_TRACKS: Track[] = [
  {
    id: 'demo-1',
    title: 'DJ Player Studio Master',
    artist: 'Hi-Fi Audio Lab',
    album: 'Acoustic Reference',
    duration: 180,
    path: '',
    filename: '',
    hasCover: true,
    coverUrl: './default_cover.svg',
    streamUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    plays: 42,
    liked: true,
  },
  {
    id: 'demo-2',
    title: 'Cyberpunk Neon Drive',
    artist: 'Synthwave Sound Lab',
    album: 'Neon Horizon',
    duration: 215,
    path: '',
    filename: '',
    hasCover: true,
    coverUrl: './default_cover.svg',
    streamUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
    plays: 28,
    liked: true,
  },
  {
    id: 'demo-3',
    title: 'Subwoofer Frequency Test (30-100Hz)',
    artist: 'Subwoofer Acoustics',
    album: 'Hi-Fi Calibration',
    duration: 150,
    path: '',
    filename: '',
    hasCover: true,
    coverUrl: './default_cover.svg',
    streamUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
    plays: 56,
    liked: false,
  },
];

export function App() {
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_DEMO_TRACKS);
  const [currentTab, setCurrentTab] = useState<MobileTab>('home');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverUrl, setServerUrlState] = useState<string>(() => getServerUrl());

  const [isExpandedPlayer, setIsExpandedPlayer] = useState<boolean>(false);
  const [isEqModalOpen, setIsEqModalOpen] = useState<boolean>(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);

  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem('dj_theme') as ThemeName) || 'onyx';
  });

  const player = useAudioPlayer(tracks);

  // Load tracks from server
  const loadTracks = useCallback(async () => {
    const isOk = await checkServerConnection();
    setIsConnected(isOk);
    if (isOk) {
      const data = await fetchTracks();
      if (Array.isArray(data) && data.length > 0) {
        setTracks(data);
      }
    }
  }, []);

  useEffect(() => {
    applyTheme(currentTheme);
    loadTracks();
  }, [currentTheme, loadTracks]);

  // Handle Android native back button
  useEffect(() => {
    (window as any).__onAndroidBackPressed = () => {
      if (isEqModalOpen) {
        setIsEqModalOpen(false);
        return true;
      }
      if (isConnectModalOpen) {
        setIsConnectModalOpen(false);
        return true;
      }
      if (isExpandedPlayer) {
        setIsExpandedPlayer(false);
        return true;
      }
      if (currentTab !== 'home') {
        setCurrentTab('home');
        return true;
      }
      return false; // Exit app or move to back
    };

    return () => {
      delete (window as any).__onAndroidBackPressed;
    };
  }, [isEqModalOpen, isConnectModalOpen, isExpandedPlayer, currentTab]);

  const handleSetTheme = (t: ThemeName) => {
    setCurrentTheme(t);
    applyTheme(t);
  };

  const handleToggleLike = (track: Track | OnlineTrack) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === track.id ? { ...t, liked: !t.liked } : t))
    );
  };

  const isCurrentTrackLiked = Boolean(
    player.currentTrack &&
      tracks.find((t) => t.id === player.currentTrack?.id)?.liked
  );

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-main)] text-white overflow-hidden select-none">
      {/* Mobile Top Header */}
      <MobileHeader
        isPlaying={player.isPlaying}
        isConnected={isConnected}
        serverUrl={serverUrl}
        onOpenConnect={() => setIsConnectModalOpen(true)}
        onOpenEq={() => setIsEqModalOpen(true)}
      />

      {/* Main Tab Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {currentTab === 'home' && (
          <HomeTab
            tracks={tracks}
            currentTrackId={player.currentTrack?.id}
            isPlaying={player.isPlaying}
            onPlayTrack={(track, newQueue) => player.playTrack(track, newQueue)}
            onNavigateTab={setCurrentTab}
            onOpenConnect={() => setIsConnectModalOpen(true)}
            isConnected={isConnected}
          />
        )}

        {currentTab === 'collection' && (
          <CollectionTab
            tracks={tracks}
            currentTrackId={player.currentTrack?.id}
            onPlayTrack={(track, newQueue) => player.playTrack(track, newQueue)}
            onAddToQueue={(track) => player.addToQueue(track)}
            onToggleLike={handleToggleLike}
          />
        )}

        {currentTab === 'search' && (
          <SearchTab
            currentTrackId={player.currentTrack?.id}
            onPlayOnlineTrack={(track, newQueue) => player.playTrack(track, newQueue)}
            onRefreshLibrary={loadTracks}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsTab
            currentTheme={currentTheme}
            onSetTheme={handleSetTheme}
            onOpenEq={() => setIsEqModalOpen(true)}
            onOpenConnect={() => setIsConnectModalOpen(true)}
            isConnected={isConnected}
            serverUrl={serverUrl}
          />
        )}
      </main>

      {/* Sticky Mini Player (floating above BottomNav) */}
      <MobileMiniPlayer
        currentTrack={player.currentTrack}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        onTogglePlay={player.togglePlay}
        onNext={player.next}
        onExpand={() => setIsExpandedPlayer(true)}
      />

      {/* Bottom Navigation */}
      <BottomNav currentTab={currentTab} onChangeTab={setCurrentTab} />

      {/* Fullscreen Player Modal */}
      {isExpandedPlayer && (
        <MobileFullscreenPlayer
          currentTrack={player.currentTrack}
          isPlaying={player.isPlaying}
          currentTime={player.currentTime}
          duration={player.duration}
          repeatMode={player.repeatMode}
          isShuffle={player.isShuffle}
          queue={player.queue}
          serverUrl={serverUrl}
          isLiked={isCurrentTrackLiked}
          onToggleLike={() => player.currentTrack && handleToggleLike(player.currentTrack)}
          onClose={() => setIsExpandedPlayer(false)}
          onTogglePlay={player.togglePlay}
          onNext={player.next}
          onPrev={player.prev}
          onSeek={player.seek}
          onToggleShuffle={player.toggleShuffle}
          onToggleRepeat={player.toggleRepeat}
          onPlayQueueTrack={(t) => player.playTrack(t)}
          onRemoveFromQueue={player.removeFromQueue}
          onOpenEq={() => setIsEqModalOpen(true)}
        />
      )}

      {/* Equalizer Modal */}
      {isEqModalOpen && (
        <EqualizerModal
          eqGains={player.eqGains}
          onSetBand={player.setEqBand}
          onApplyPreset={player.applyPreset}
          onClose={() => setIsEqModalOpen(false)}
        />
      )}

      {/* PC Connect Modal */}
      {isConnectModalOpen && (
        <ConnectModal
          onClose={() => setIsConnectModalOpen(false)}
          onConnected={() => {
            setServerUrlState(getServerUrl());
            loadTracks();
          }}
        />
      )}
    </div>
  );
}

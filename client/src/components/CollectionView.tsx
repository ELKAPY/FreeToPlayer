import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Clock,
  Disc,
  Edit3,
  Flame,
  FolderPlus,
  Heart,
  Layers,
  LayoutGrid,
  LayoutList,
  List,
  ListMusic,
  Mic,
  Music,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { getCoverUrl } from '../api';
import {
  getFavoritesTracks,
  getForgottenFavoritesTracks,
  getLikedTrackIds,
  getMostPlayedTracks,
  getRecentlyAddedTracks,
  toggleLikeTrack,
} from '../favorites';
import {
  type Playlist,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  getPlaylists,
  removeTrackFromPlaylist,
} from '../playlists';
import {
  type CollectionSortBy,
  type CollectionViewMode,
  useAppSettings,
} from '../settings';
import type { Track } from '../types';
import { formatTime } from '../useAudioPlayer';
import { CollectionQuickSettingsModal } from './CollectionQuickSettingsModal';
import { TagEditorModal } from './TagEditorModal';

export type CollectionTab =
  | 'tracks'
  | 'favorites'
  | 'playlists'
  | 'artists'
  | 'albums';

interface CollectionViewProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track, currentFilteredList?: Track[]) => void;
  onDeleteTrack: (id: string) => void;
  onEditTrack: (id: string, data: { title: string; artist: string; album: string }) => Promise<void>;
  onOpenUploadDialog: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  onStartArtistFlow?: (artist: string) => void;
  onOpenVersions?: (track: Track) => void;
  onPlayTracks?: (tracks: Track[], startIndex?: number) => void;
  onAddTracksToQueue?: (tracks: Track[]) => void;
  onOpenSettings?: () => void;
  initialArtist?: string | null;
  initialAlbum?: string | null;
  initialPlaylistId?: string | null;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onDeleteTrack,
  onEditTrack,
  onOpenUploadDialog,
  onRefresh,
  isRefreshing = false,
  onStartArtistFlow,
  onOpenVersions,
  onPlayTracks,
  onAddTracksToQueue: _onAddTracksToQueue,
  onOpenSettings,
  initialArtist = null,
  initialAlbum = null,
  initialPlaylistId = null,
}) => {
  const { settings, updateSettings } = useAppSettings();

  const [collectionTab, setCollectionTab] = useState<CollectionTab>(() => {
    if (initialAlbum) return 'albums';
    if (initialArtist) return 'artists';
    if (initialPlaylistId) return 'playlists';
    try {
      const saved = sessionStorage.getItem('dj_session_collection_tab') as CollectionTab;
      if (saved && ['tracks', 'favorites', 'playlists', 'artists', 'albums'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'tracks';
  });

  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return sessionStorage.getItem('dj_session_collection_search') || '';
    } catch {}
    return '';
  });

  const [selectedArtist, setSelectedArtist] = useState<string | null>(() => {
    if (initialArtist) return initialArtist;
    try {
      return sessionStorage.getItem('dj_session_collection_artist') || null;
    } catch {}
    return null;
  });

  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(() => {
    if (initialAlbum) return initialAlbum;
    try {
      return sessionStorage.getItem('dj_session_collection_album') || null;
    } catch {}
    return null;
  });

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(() => {
    const plId = initialPlaylistId || sessionStorage.getItem('dj_session_collection_playlist_id');
    if (plId) {
      const list = getPlaylists();
      return list.find((p) => p.id === plId) || null;
    }
    return null;
  });

  const [selectedSmartPlaylist, setSelectedSmartPlaylist] = useState<'most_played' | 'recently_added' | 'forgotten' | null>(() => {
    try {
      const saved = sessionStorage.getItem('dj_session_collection_smart_playlist') as any;
      if (saved && ['most_played', 'recently_added', 'forgotten'].includes(saved)) {
        return saved;
      }
    } catch {}
    return null;
  });

  // Keep session state in sync during 1 session
  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_collection_tab', collectionTab);
    } catch {}
  }, [collectionTab]);

  useEffect(() => {
    try {
      if (selectedArtist) {
        sessionStorage.setItem('dj_session_collection_artist', selectedArtist);
      } else {
        sessionStorage.removeItem('dj_session_collection_artist');
      }
    } catch {}
  }, [selectedArtist]);

  useEffect(() => {
    try {
      if (selectedAlbum) {
        sessionStorage.setItem('dj_session_collection_album', selectedAlbum);
      } else {
        sessionStorage.removeItem('dj_session_collection_album');
      }
    } catch {}
  }, [selectedAlbum]);

  useEffect(() => {
    try {
      if (selectedPlaylist) {
        sessionStorage.setItem('dj_session_collection_playlist_id', selectedPlaylist.id);
      } else {
        sessionStorage.removeItem('dj_session_collection_playlist_id');
      }
    } catch {}
  }, [selectedPlaylist]);

  useEffect(() => {
    try {
      if (selectedSmartPlaylist) {
        sessionStorage.setItem('dj_session_collection_smart_playlist', selectedSmartPlaylist);
      } else {
        sessionStorage.removeItem('dj_session_collection_smart_playlist');
      }
    } catch {}
  }, [selectedSmartPlaylist]);

  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_collection_search', searchQuery);
    } catch {}
  }, [searchQuery]);

  // Sync props when user navigates into collection with deep link
  useEffect(() => {
    if (initialArtist) {
      setSelectedArtist(initialArtist);
      setCollectionTab('artists');
    }
  }, [initialArtist]);

  useEffect(() => {
    if (initialAlbum) {
      setSelectedAlbum(initialAlbum);
      setCollectionTab('albums');
    }
  }, [initialAlbum]);

  // Sorting & Filtering
  const [sortBy, setSortBy] = useState<CollectionSortBy>(() => settings.defaultSortBy || 'added');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => settings.defaultSortOrder || 'desc');
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => settings.defaultViewMode || 'list');
  const [formatFilter, setFormatFilter] = useState<'all' | 'lossless' | 'with_cover' | 'without_cover'>('all');

  // Quick settings modal
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>(() => getPlaylists());
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [trackForAddToPlaylist, setTrackForAddToPlaylist] = useState<Track | null>(null);
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);
  const [trackToEdit, setTrackToEdit] = useState<Track | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => getLikedTrackIds());

  // Progressive batch loading for collection tracks (prevents DOM lag with large libraries)
  const [visibleTrackLimit, setVisibleTrackLimit] = useState<number>(40);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  // Reset limit on search, tab or filter change
  useEffect(() => {
    setVisibleTrackLimit(40);
  }, [
    collectionTab,
    searchQuery,
    formatFilter,
    sortBy,
    sortOrder,
    selectedArtist,
    selectedAlbum,
    selectedPlaylist,
    selectedSmartPlaylist,
  ]);

  useEffect(() => {
    const handleLikes = () => {
      setLikedIds(getLikedTrackIds());
    };
    const handlePls = () => {
      const plList = getPlaylists();
      setPlaylists(plList);
      if (selectedPlaylist) {
        const found = plList.find((p) => p.id === selectedPlaylist.id);
        setSelectedPlaylist(found || null);
      }
    };
    window.addEventListener('dj_likes_changed', handleLikes);
    window.addEventListener('playlists_changed', handlePls);
    return () => {
      window.removeEventListener('dj_likes_changed', handleLikes);
      window.removeEventListener('playlists_changed', handlePls);
    };
  }, [selectedPlaylist]);

  // Group by Artists
  const artistsMap = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      const art = t.artist || 'Unknown Artist';
      if (!map.has(art)) {
        map.set(art, []);
      }
      map.get(art)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [tracks]);

  // Group by Albums
  const albumsMap = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      const alb = t.album && t.album !== 'Unknown Album' ? t.album : 'Без альбома';
      if (!map.has(alb)) {
        map.set(alb, []);
      }
      map.get(alb)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [tracks]);

  // Base list depending on active section
  const baseTracks = useMemo(() => {
    if (selectedSmartPlaylist === 'most_played') {
      return getMostPlayedTracks(tracks);
    }
    if (selectedSmartPlaylist === 'recently_added') {
      return getRecentlyAddedTracks(tracks);
    }
    if (selectedSmartPlaylist === 'forgotten') {
      return getForgottenFavoritesTracks(tracks);
    }
    if (selectedPlaylist) {
      return getPlaylistTracks(selectedPlaylist, tracks);
    }
    switch (collectionTab) {
      case 'favorites':
        return getFavoritesTracks(tracks);
      default:
        return tracks;
    }
  }, [tracks, collectionTab, likedIds, selectedPlaylist, selectedSmartPlaylist]);

  // Filter & Sort Tracks
  const filteredTracks = useMemo(() => {
    let list = baseTracks;

    if (selectedArtist) {
      list = list.filter((t) => t.artist === selectedArtist);
    }

    if (selectedAlbum) {
      list = list.filter((t) => (t.album && t.album !== 'Unknown Album' ? t.album : 'Без альбома') === selectedAlbum);
    }

    // Filter chips
    if (formatFilter === 'lossless') {
      list = list.filter((t) => t.isLossless || /flac|wav|alac/i.test(t.format));
    } else if (formatFilter === 'with_cover') {
      list = list.filter((t) => t.hasCover || !!t.coverUrl);
    } else if (formatFilter === 'without_cover') {
      list = list.filter((t) => !t.hasCover && !t.coverUrl);
    }

    // Search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q))
      );
    }

    // Sorting
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'artist') {
        cmp = a.artist.localeCompare(b.artist);
      } else if (sortBy === 'duration') {
        cmp = (a.duration || 0) - (b.duration || 0);
      } else if (sortBy === 'size') {
        cmp = (a.fileSize || 0) - (b.fileSize || 0);
      } else {
        // 'added'
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        cmp = ta - tb;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [baseTracks, searchQuery, selectedArtist, selectedAlbum, formatFilter, sortBy, sortOrder]);

  // Seamless infinite scroll observer for collection tracks
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleTrackLimit((prev) => {
            if (prev < filteredTracks.length) {
              return Math.min(prev + 40, filteredTracks.length);
            }
            return prev;
          });
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(loadMoreTriggerRef.current);
    return () => observer.disconnect();
  }, [filteredTracks.length]);

  const totalDuration = useMemo(() => {
    return filteredTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [filteredTracks]);

  const formatTotalTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0 мин';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    }
    const secs = Math.floor(seconds % 60);
    return `${minutes} мин ${secs} сек`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDeleteConfirm = () => {
    if (trackToDelete) {
      onDeleteTrack(trackToDelete.id);
      setTrackToDelete(null);
    }
  };

  const resetSubSelections = () => {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedPlaylist(null);
    setSelectedSmartPlaylist(null);
  };

  const hasActiveSubSelection = !!(selectedArtist || selectedAlbum || selectedPlaylist || selectedSmartPlaylist);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-2 sm:px-4 lg:px-6 py-4 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <ListMusic className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              <span>Медиатека</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-lg font-mono bg-white/[0.06] text-slate-300">
              {filteredTracks.length} треков
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Длительность звучания: {formatTotalTime(totalDuration)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto flex-wrap">
          {/* Quick Settings */}
          <button
            onClick={() => setIsQuickSettingsOpen(true)}
            title="Настройки медиатеки"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] hover:border-cyan-500/40 text-xs sm:text-sm font-medium transition-all cursor-pointer active:scale-95"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Настройки</span>
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Обновить медиатеку"
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] hover:border-cyan-500/30 font-medium text-xs sm:text-sm active:scale-95 transition-all cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Обновить</span>
          </button>

          {/* Play All */}
          {filteredTracks.length > 0 && (
            <button
              onClick={() => onPlayTrack(filteredTracks[0], filteredTracks)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-4.5 py-2.5 rounded-xl bg-white hover:bg-cyan-50 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:scale-102 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Слушать всё</span>
            </button>
          )}

          {/* Add Tracks */}
          <button
            onClick={onOpenUploadDialog}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:scale-102 active:scale-95 transition-all cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Добавить файлы</span>
          </button>
        </div>
      </div>

      {/* Breadcrumbs Bar (when an artist, album, or playlist is active) */}
      {hasActiveSubSelection && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/20 text-xs animate-fade-in flex-wrap">
          <button
            onClick={resetSubSelections}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-medium cursor-pointer transition-colors"
          >
            <span>← Назад в медиатеку</span>
          </button>

          <span className="text-slate-500">/</span>

          {selectedArtist && (
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Users className="w-3.5 h-3.5" />
              <span>Исполнитель: {selectedArtist}</span>
              {onStartArtistFlow && (
                <button
                  onClick={() => onStartArtistFlow(selectedArtist)}
                  className="ml-2 px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-bold flex items-center gap-1"
                >
                  <Radio className="w-3 h-3" />
                  <span>Поток</span>
                </button>
              )}
            </div>
          )}

          {selectedAlbum && (
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Disc className="w-3.5 h-3.5" />
              <span>Альбом: {selectedAlbum}</span>
            </div>
          )}

          {selectedPlaylist && (
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <ListMusic className="w-3.5 h-3.5" />
              <span>Плейлист: {selectedPlaylist.name}</span>
            </div>
          )}

          {selectedSmartPlaylist && (
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Подборка:{' '}
                {selectedSmartPlaylist === 'most_played'
                  ? 'Топ прослушиваний'
                  : selectedSmartPlaylist === 'recently_added'
                  ? 'Недавно добавленные'
                  : 'Забытые фавориты'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sub-navigation Tabs: Все, Любимые, Плейлисты, Исполнители, Альбомы */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] overflow-x-auto max-w-full">
          <button
            onClick={() => {
              setCollectionTab('tracks');
              resetSubSelections();
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              collectionTab === 'tracks' && !hasActiveSubSelection
                ? 'bg-white/[0.12] text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Все треки</span>
          </button>

          <button
            onClick={() => {
              setCollectionTab('favorites');
              resetSubSelections();
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              collectionTab === 'favorites' && !hasActiveSubSelection
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/10'
            }`}
          >
            <Heart className={`w-4 h-4 ${likedIds.size > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>Любимые ({likedIds.size})</span>
          </button>

          <button
            onClick={() => {
              setCollectionTab('playlists');
              resetSubSelections();
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              collectionTab === 'playlists' && !hasActiveSubSelection
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <ListMusic className="w-4 h-4 text-cyan-400" />
            <span>Плейлисты ({playlists.length})</span>
          </button>

          <button
            onClick={() => {
              setCollectionTab('artists');
              resetSubSelections();
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              collectionTab === 'artists' && !hasActiveSubSelection
                ? 'bg-white/[0.12] text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Исполнители ({artistsMap.length})</span>
          </button>

          <button
            onClick={() => {
              setCollectionTab('albums');
              resetSubSelections();
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              collectionTab === 'albums' && !hasActiveSubSelection
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            <Disc className="w-4 h-4 text-amber-400" />
            <span>Альбомы ({albumsMap.length})</span>
          </button>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] shrink-0 self-end md:self-auto">
          <button
            onClick={() => {
              setViewMode('list');
              updateSettings({ defaultViewMode: 'list' });
            }}
            title="Обычный список"
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-95 ${
              viewMode === 'list'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setViewMode('compact');
              updateSettings({ defaultViewMode: 'compact' });
            }}
            title="Компактный список"
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-95 ${
              viewMode === 'compact'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setViewMode('grid');
              updateSettings({ defaultViewMode: 'grid' });
            }}
            title="Плитка"
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-95 ${
              viewMode === 'grid'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Always-visible Search Bar & Sorting Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, исполнителю или альбому..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort & Filter Controls */}
        <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
          {/* Format Filter Chips */}
          <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            {[
              { id: 'all', label: 'Все' },
              { id: 'lossless', label: 'FLAC/Lossless' },
              { id: 'with_cover', label: 'С обложкой' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFormatFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                  formatFilter === f.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="text-slate-600 hidden sm:inline">|</span>

          {/* Sort Dropdown & Order Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => {
                const s = e.target.value as CollectionSortBy;
                setSortBy(s);
                updateSettings({ defaultSortBy: s });
              }}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value="added" className="bg-[#0b0c13] text-white">По дате добавления</option>
              <option value="title" className="bg-[#0b0c13] text-white">По названию</option>
              <option value="artist" className="bg-[#0b0c13] text-white">По исполнителю</option>
              <option value="duration" className="bg-[#0b0c13] text-white">По длительности</option>
              <option value="size" className="bg-[#0b0c13] text-white">По размеру файла</option>
            </select>

            <button
              onClick={() => {
                const next = sortOrder === 'asc' ? 'desc' : 'asc';
                setSortOrder(next);
                updateSettings({ defaultSortOrder: next });
              }}
              title={sortOrder === 'asc' ? 'По возрастанию (кликните для переключения)' : 'По убыванию'}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-cyan-400 border border-white/[0.06] transition-colors"
            >
              {sortOrder === 'asc' ? <ArrowUpAZ className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* View: Artists Grid */}
      {collectionTab === 'artists' && !selectedArtist && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {artistsMap.map(([artName, artTracks]) => {
            const sampleCover = artTracks.find((t) => t.hasCover);
            return (
              <div
                key={artName}
                onClick={() => {
                  setSelectedArtist(artName);
                  setCollectionTab('tracks');
                }}
                className="p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col items-center text-center gap-2 group"
              >
                <div className="w-16 h-16 rounded-full bg-black/40 overflow-hidden border border-white/[0.08] relative group-hover:scale-105 transition-transform flex items-center justify-center">
                  {sampleCover ? (
                    <img
                      src={getCoverUrl(sampleCover.id)}
                      alt={artName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Mic className="w-6 h-6 text-slate-500" />
                  )}
                </div>
                <h4 className="text-xs font-semibold text-white truncate w-full group-hover:text-cyan-400 transition-colors">
                  {artName}
                </h4>
                <span className="text-[10px] font-mono text-slate-500">
                  {artTracks.length} треков
                </span>
                {onStartArtistFlow && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartArtistFlow(artName);
                    }}
                    title={`Запустить поток: ${artName}`}
                    className="mt-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Radio className="w-3 h-3 text-cyan-400" />
                    <span>Поток</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View: Albums Grid (NEW Feature!) */}
      {collectionTab === 'albums' && !selectedAlbum && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {albumsMap.map(([albName, albTracks]) => {
            const sampleCover = albTracks.find((t) => t.hasCover);
            const artistName = albTracks[0]?.artist || 'Разные исполнители';
            return (
              <div
                key={albName}
                onClick={() => {
                  setSelectedAlbum(albName);
                  setCollectionTab('tracks');
                }}
                className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.07] border border-white/[0.05] hover:border-amber-500/40 transition-all cursor-pointer flex flex-col gap-2 group"
              >
                <div className="w-full aspect-square rounded-xl bg-black/40 overflow-hidden border border-white/[0.08] relative group-hover:scale-102 transition-transform flex items-center justify-center">
                  {sampleCover ? (
                    <img
                      src={getCoverUrl(sampleCover.id)}
                      alt={albName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Disc className="w-10 h-10 text-amber-500/40" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                    {albName}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{artistName}</p>
                  <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                    {albTracks.length} треков
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View: Playlists Overview */}
      {collectionTab === 'playlists' && !selectedPlaylist && !selectedSmartPlaylist && (
        <div className="flex flex-col gap-6">
          {/* Smart Playlists Section */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Умные подборки
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Most played */}
              <div
                onClick={() => setSelectedSmartPlaylist('most_played')}
                className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-amber-500/40 hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                      Топ прослушиваний
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {getMostPlayedTracks(tracks).length} треков
                    </p>
                  </div>
                </div>
                {onPlayTracks && getMostPlayedTracks(tracks).length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTracks(getMostPlayedTracks(tracks), 0);
                    }}
                    title="Слушать топ"
                    className="p-2 rounded-xl bg-white/[0.05] hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 active:scale-90 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>

              {/* Recently added */}
              <div
                onClick={() => setSelectedSmartPlaylist('recently_added')}
                className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/40 hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                      Недавно добавленные
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {getRecentlyAddedTracks(tracks).length} треков
                    </p>
                  </div>
                </div>
                {onPlayTracks && getRecentlyAddedTracks(tracks).length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTracks(getRecentlyAddedTracks(tracks), 0);
                    }}
                    title="Слушать новинки"
                    className="p-2 rounded-xl bg-white/[0.05] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 active:scale-90 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>

              {/* Forgotten favorites */}
              <div
                onClick={() => setSelectedSmartPlaylist('forgotten')}
                className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-purple-500/40 hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                      Забытые фавориты
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {getForgottenFavoritesTracks(tracks).length} треков
                    </p>
                  </div>
                </div>
                {onPlayTracks && getForgottenFavoritesTracks(tracks).length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTracks(getForgottenFavoritesTracks(tracks), 0);
                    }}
                    title="Вспомнить старое"
                    className="p-2 rounded-xl bg-white/[0.05] hover:bg-purple-500/20 text-slate-300 hover:text-purple-300 active:scale-90 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* User Playlists Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Мои плейлисты ({playlists.length})
              </h3>
              <button
                onClick={() => {
                  setNewPlaylistTitle('');
                  setIsCreatePlaylistOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Создать плейлист</span>
              </button>
            </div>

            {playlists.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.01] p-10 flex flex-col items-center justify-center text-center">
                <ListMusic className="w-10 h-10 text-slate-600 mb-3" />
                <h4 className="text-sm font-semibold text-white mb-1">
                  У вас пока нет пользовательских плейлистов
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  Создавайте персональные подборки под настроение, жанры или тренировки.
                </p>
                <button
                  onClick={() => {
                    setNewPlaylistTitle('');
                    setIsCreatePlaylistOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Создать первый плейлист
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {playlists.map((pl) => {
                  const plTracks = getPlaylistTracks(pl, tracks);
                  const coverTrack = plTracks.find((t) => t.hasCover);
                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setSelectedPlaylist(pl);
                        setSelectedSmartPlaylist(null);
                      }}
                      className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.07] border border-white/[0.05] hover:border-cyan-500/40 transition-all cursor-pointer flex flex-col gap-2 group"
                    >
                      <div className="w-full aspect-square rounded-xl bg-black/40 overflow-hidden border border-white/[0.08] relative group-hover:scale-102 transition-transform flex items-center justify-center">
                        {coverTrack ? (
                          <img
                            src={getCoverUrl(coverTrack.id)}
                            alt={pl.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ListMusic className="w-8 h-8 text-cyan-500/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                          {pl.name}
                        </h4>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                          <span>{pl.trackIds.length} треков</span>
                          <div className="flex items-center gap-1">
                            {onPlayTracks && plTracks.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlayTracks(plTracks, 0);
                                }}
                                title="Слушать плейлист"
                                className="p-1 rounded hover:bg-white/[0.1] text-slate-300 hover:text-white"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Удалить плейлист «${pl.name}»?`)) {
                                  deletePlaylist(pl.id);
                                  setPlaylists(getPlaylists());
                                }
                              }}
                              title="Удалить плейлист"
                              className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* View: Tracks List (or Grid if viewMode === 'grid') */}
      {(collectionTab === 'tracks' ||
        collectionTab === 'favorites' ||
        selectedPlaylist ||
        selectedSmartPlaylist ||
        selectedArtist ||
        selectedAlbum) && (
        filteredTracks.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 flex flex-col items-center justify-center text-center">
            <Music className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">
              {tracks.length === 0 ? 'Коллекция пуста' : 'Ничего не найдено'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mb-2">
              Попробуйте сбросить фильтры или изменить поисковый запрос.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredTracks.slice(0, visibleTrackLimit).map((track) => {
                const isThisPlaying = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    onClick={() => onPlayTrack(track, filteredTracks)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 group ${
                      isThisPlaying
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-white shadow-sm'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.05] hover:border-cyan-500/30'
                    }`}
                  >
                  <div className="w-full aspect-square rounded-xl bg-black/40 overflow-hidden border border-white/[0.06] relative group-hover:scale-102 transition-transform flex items-center justify-center">
                    {track.hasCover ? (
                      <img src={getCoverUrl(track.id)} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-8 h-8 text-slate-600" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-5 h-5 text-cyan-400 fill-current" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate group-hover:text-cyan-300">
                      {track.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{track.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination / Batch Loader for Grid */}
          {filteredTracks.length > 40 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 mt-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-slate-400 font-mono">
                Показано{' '}
                <span className="text-cyan-300 font-bold">
                  {Math.min(visibleTrackLimit, filteredTracks.length)}
                </span>{' '}
                из <span className="text-white font-bold">{filteredTracks.length}</span> треков
              </div>

              {visibleTrackLimit < filteredTracks.length && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setVisibleTrackLimit((prev) => Math.min(prev + 40, filteredTracks.length))
                    }
                    className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    Загрузить ещё (+40)
                  </button>
                  <button
                    onClick={() => setVisibleTrackLimit(filteredTracks.length)}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    Показать все
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seamless Scroll Trigger */}
          {visibleTrackLimit < filteredTracks.length && (
            <div ref={loadMoreTriggerRef} className="h-8 w-full" />
          )}
        </>
        ) : (
          /* List & Compact View */
          <>
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              <div className="divide-y divide-white/[0.04]">
                {filteredTracks.slice(0, visibleTrackLimit).map((track, idx) => {
                  const isThisPlaying = currentTrack?.id === track.id;
                  const isCompact = viewMode === 'compact';

                  return (
                    <div
                      key={track.id}
                      className={`group flex items-center justify-between ${
                        isCompact ? 'p-1.5 sm:px-3 sm:py-1.5' : 'p-2.5 sm:px-4 sm:py-2.5'
                      } transition-colors ${
                        isThisPlaying ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                    {/* Left: Index / Play & Info */}
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => onPlayTrack(track, filteredTracks)}
                    >
                      <div className="w-6 text-center shrink-0 flex items-center justify-center">
                        <span className="text-xs font-mono text-slate-500 group-hover:hidden">
                          {idx + 1}
                        </span>
                        <Play className="w-3.5 h-3.5 text-cyan-400 hidden group-hover:block fill-cyan-400" />
                      </div>

                      <div
                        className={`${
                          isCompact ? 'w-8 h-8 rounded' : 'w-10 h-10 rounded-md'
                        } bg-black/40 overflow-hidden shrink-0 flex items-center justify-center border border-white/[0.06] relative`}
                      >
                        {track.hasCover ? (
                          <img
                            src={getCoverUrl(track.id)}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="w-4 h-4 text-slate-600" />
                        )}
                        {isThisPlaying && isPlaying && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            className={`text-xs sm:text-sm font-medium truncate ${
                              isThisPlaying ? 'text-cyan-400 font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {track.title}
                          </h4>
                          {settings.showFormatBadge && (track.isLossless || /flac|wav/i.test(track.format)) && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              HI-RES
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedArtist(track.artist);
                              setCollectionTab('tracks');
                            }}
                            className="hover:text-cyan-400 hover:underline cursor-pointer"
                          >
                            {track.artist}
                          </span>
                          {track.album && track.album !== 'Unknown Album' && (
                            <>
                              <span> • </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAlbum(track.album);
                                  setCollectionTab('tracks');
                                }}
                                className="hover:text-amber-400 hover:underline cursor-pointer"
                              >
                                {track.album}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Right Info & Actions */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 font-mono text-xs text-slate-400">
                      {settings.showFileSize && (
                        <span className="hidden md:inline text-slate-500 text-[11px] mr-1.5">
                          {formatFileSize(track.fileSize)}
                        </span>
                      )}

                      <span className="w-11 text-right text-slate-400 text-xs mr-2">
                        {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                      </span>

                      {/* Favorite button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikeTrack(track.id);
                          setLikedIds(getLikedTrackIds());
                        }}
                        title={likedIds.has(track.id) ? 'Удалить из любимых' : 'Добавить в любимые'}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer active:scale-90"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            likedIds.has(track.id) ? 'fill-rose-500 text-rose-500' : ''
                          }`}
                        />
                      </button>

                      {/* Add to Playlist button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrackForAddToPlaylist(track);
                        }}
                        title="Добавить в плейлист"
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer active:scale-90"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      {/* Remove from current playlist if inside custom playlist */}
                      {selectedPlaylist && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTrackFromPlaylist(selectedPlaylist.id, track.id);
                            setPlaylists(getPlaylists());
                          }}
                          title="Удалить из этого плейлиста"
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-amber-500/15 transition-all cursor-pointer active:scale-90"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {/* Versions button */}
                      {onOpenVersions && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenVersions(track);
                          }}
                          title="Поиск версий песни (Live, Reverb, Acoustic, Remix)"
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-purple-500/15 transition-all cursor-pointer active:scale-90"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                      )}

                      {/* Artist flow button */}
                      {onStartArtistFlow && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartArtistFlow(track.artist);
                          }}
                          title={`Запустить поток: ${track.artist}`}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer active:scale-90"
                        >
                          <Radio className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrackToEdit(track);
                        }}
                        title="Редактировать теги"
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer active:scale-90"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (settings.confirmBeforeDelete) {
                            setTrackToDelete(track);
                          } else {
                            onDeleteTrack(track.id);
                          }
                        }}
                        title="Удалить"
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer active:scale-90"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination / Batch Loader for List & Compact View */}
          {filteredTracks.length > 40 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 mt-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-slate-400 font-mono">
                Показано{' '}
                <span className="text-cyan-300 font-bold">
                  {Math.min(visibleTrackLimit, filteredTracks.length)}
                </span>{' '}
                из <span className="text-white font-bold">{filteredTracks.length}</span> треков
              </div>

              {visibleTrackLimit < filteredTracks.length && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setVisibleTrackLimit((prev) => Math.min(prev + 40, filteredTracks.length))
                    }
                    className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    Загрузить ещё (+40)
                  </button>
                  <button
                    onClick={() => setVisibleTrackLimit(filteredTracks.length)}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    Показать все
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seamless Scroll Trigger */}
          {visibleTrackLimit < filteredTracks.length && (
            <div ref={loadMoreTriggerRef} className="h-8 w-full" />
          )}
        </>
      ))}

      {/* Collection Quick Settings Modal */}
      {isQuickSettingsOpen && (
        <CollectionQuickSettingsModal
          isOpen={isQuickSettingsOpen}
          onClose={() => setIsQuickSettingsOpen(false)}
          tracks={tracks}
          onOpenFullSettings={onOpenSettings}
        />
      )}

      {/* Tag Editor Modal */}
      {trackToEdit && (
        <TagEditorModal
          track={trackToEdit}
          onClose={() => setTrackToEdit(null)}
          onSave={onEditTrack}
          onCoverUpdated={async () => {
            if (onRefresh) {
              await onRefresh();
            }
          }}
        />
      )}

      {/* Create Playlist Modal */}
      {isCreatePlaylistOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-[#090a0f] border border-white/[0.1] p-5 shadow-2xl flex flex-col gap-3 animate-slide-up">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-cyan-400" />
                <span>Создать новый плейлист</span>
              </h3>
              <input
                type="text"
                autoFocus
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPlaylistTitle.trim()) {
                    createPlaylist(newPlaylistTitle);
                    setPlaylists(getPlaylists());
                    setIsCreatePlaylistOpen(false);
                    setNewPlaylistTitle('');
                  }
                  if (e.key === 'Escape') {
                    setIsCreatePlaylistOpen(false);
                  }
                }}
                placeholder="Название плейлиста..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsCreatePlaylistOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  disabled={!newPlaylistTitle.trim()}
                  onClick={() => {
                    if (newPlaylistTitle.trim()) {
                      createPlaylist(newPlaylistTitle);
                      setPlaylists(getPlaylists());
                      setIsCreatePlaylistOpen(false);
                      setNewPlaylistTitle('');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Создать
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Add Track to Playlist Modal */}
      {trackForAddToPlaylist &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-[#090a0f] border border-white/[0.1] p-5 shadow-2xl flex flex-col gap-3 animate-slide-up">
              <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                <h3 className="text-sm font-bold text-white truncate pr-2">
                  Добавить в плейлист
                </h3>
                <button
                  onClick={() => setTrackForAddToPlaylist(null)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 truncate">
                «{trackForAddToPlaylist.title}» • {trackForAddToPlaylist.artist}
              </p>

              <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 py-1">
                {playlists.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Нет плейлистов. Создайте первый ниже.
                  </p>
                ) : (
                  playlists.map((pl) => {
                    const isAdded = pl.trackIds.includes(trackForAddToPlaylist.id);
                    return (
                      <button
                        key={pl.id}
                        onClick={() => {
                          if (isAdded) {
                            removeTrackFromPlaylist(pl.id, trackForAddToPlaylist.id);
                          } else {
                            addTrackToPlaylist(pl.id, trackForAddToPlaylist.id);
                          }
                          setPlaylists(getPlaylists());
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-colors cursor-pointer ${
                          isAdded
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/[0.02] border-white/[0.06] text-slate-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ListMusic className="w-4 h-4 shrink-0 text-slate-400" />
                          <span className="truncate font-medium">{pl.name}</span>
                        </div>
                        {isAdded && <Check className="w-4 h-4 shrink-0 text-cyan-400" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Inline create playlist */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                <input
                  type="text"
                  value={newPlaylistTitle}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newPlaylistTitle.trim()) {
                      const pl = createPlaylist(newPlaylistTitle);
                      addTrackToPlaylist(pl.id, trackForAddToPlaylist.id);
                      setPlaylists(getPlaylists());
                      setNewPlaylistTitle('');
                    }
                  }}
                  placeholder="Новый плейлист..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
                <button
                  disabled={!newPlaylistTitle.trim()}
                  onClick={() => {
                    if (newPlaylistTitle.trim()) {
                      const pl = createPlaylist(newPlaylistTitle);
                      addTrackToPlaylist(pl.id, trackForAddToPlaylist.id);
                      setPlaylists(getPlaylists());
                      setNewPlaylistTitle('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Создать
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Modal */}
      {trackToDelete &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-[#090a0f] border border-white/[0.1] p-5 shadow-2xl flex flex-col gap-3 animate-slide-up">
              <h3 className="text-sm font-bold text-white">Удалить композицию?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                «{trackToDelete.title}» будет удалена из локального хранилища.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setTrackToDelete(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-lg shadow-rose-600/20 active:scale-95"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

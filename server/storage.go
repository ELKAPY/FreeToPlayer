package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Storage struct {
	mu         sync.RWMutex
	baseDir    string
	audioDir   string
	coversDir  string
	libFile    string
	stateFile  string
	prefFile   string
	lastLibMod time.Time
	tracks     map[string]Track
	order      []string
	state      PlaybackState
	prefs      VersionPreferences
}

func NewStorage(baseDir string) (*Storage, error) {
	audioDir := filepath.Join(baseDir, "audio")
	coversDir := filepath.Join(baseDir, "covers")

	if err := os.MkdirAll(audioDir, 0755); err != nil {
		return nil, fmt.Errorf("create audio dir: %w", err)
	}
	if err := os.MkdirAll(coversDir, 0755); err != nil {
		return nil, fmt.Errorf("create covers dir: %w", err)
	}

	s := &Storage{
		baseDir:   baseDir,
		audioDir:  audioDir,
		coversDir: coversDir,
		libFile:   filepath.Join(baseDir, "library.json"),
		stateFile: filepath.Join(baseDir, "state.json"),
		prefFile:  filepath.Join(baseDir, "version_preferences.json"),
		tracks:    make(map[string]Track),
		order:     make([]string, 0),
		state: PlaybackState{
			Volume:     0.8,
			RepeatMode: "all",
			IsShuffle:  false,
			Queue:      make([]string, 0),
		},
		prefs: VersionPreferences{
			Preferred: make(map[string]TrackVersion),
			Disliked:  make(map[string][]string),
		},
	}

	s.mu.Lock()
	s.loadLibraryLocked()
	s.loadPrefsLocked()
	s.mu.Unlock()

	s.loadState()

	// Clean up any orphaned audio files left behind by past replacements or interrupted downloads
	go s.CleanupOrphanAudioFiles()

	return s, nil
}

func generateID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%d-%s", time.Now().Unix(), hex.EncodeToString(b))
}

func (s *Storage) loadLibraryLocked() {
	fi, err := os.Stat(s.libFile)
	if err != nil {
		return
	}
	s.lastLibMod = fi.ModTime()

	data, err := os.ReadFile(s.libFile)
	if err != nil {
		return
	}

	var tracks []Track
	if err := json.Unmarshal(data, &tracks); err != nil {
		return
	}

	s.tracks = make(map[string]Track)
	s.order = make([]string, 0, len(tracks))
	for _, t := range tracks {
		s.tracks[t.ID] = t
		s.order = append(s.order, t.ID)
	}
}

func (s *Storage) saveLibraryLocked() error {
	tracks := make([]Track, 0, len(s.order))
	for _, id := range s.order {
		if t, ok := s.tracks[id]; ok {
			tracks = append(tracks, t)
		}
	}

	data, err := json.MarshalIndent(tracks, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(s.libFile, data, 0644); err != nil {
		return err
	}

	if fi, err := os.Stat(s.libFile); err == nil {
		s.lastLibMod = fi.ModTime()
	}
	return nil
}

func (s *Storage) loadState() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.stateFile)
	if err != nil {
		return
	}

	var st PlaybackState
	if err := json.Unmarshal(data, &st); err == nil {
		s.state = st
	}
}

func (s *Storage) saveStateLocked() error {
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.stateFile, data, 0644)
}

func (s *Storage) SaveState(st PlaybackState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state = st
	return s.saveStateLocked()
}

func (s *Storage) GetState() PlaybackState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

func (s *Storage) GetTracks() []Track {
	s.mu.Lock()
	defer s.mu.Unlock()

	if fi, err := os.Stat(s.libFile); err == nil {
		if fi.ModTime().After(s.lastLibMod) {
			s.loadLibraryLocked()
		}
	}

	tracks := make([]Track, 0, len(s.order))
	for _, id := range s.order {
		if t, ok := s.tracks[id]; ok {
			tracks = append(tracks, t)
		}
	}
	return tracks
}

func (s *Storage) GetTrack(id string) (Track, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if fi, err := os.Stat(s.libFile); err == nil {
		if fi.ModTime().After(s.lastLibMod) {
			s.loadLibraryLocked()
		}
	}

	t, ok := s.tracks[id]
	return t, ok
}

func (s *Storage) AddTrack(track Track, coverBytes []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()

	if len(coverBytes) > 0 {
		coverPath := filepath.Join(s.coversDir, fmt.Sprintf("%s.%s", track.ID, track.CoverExt))
		_ = os.WriteFile(coverPath, coverBytes, 0644)
	}

	s.tracks[track.ID] = track
	s.order = append([]string{track.ID}, s.order...) // latest first

	return s.saveLibraryLocked()
}

func (s *Storage) UpdateTrackDuration(id string, duration float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if t, ok := s.tracks[id]; ok {
		if t.Duration <= 0 && duration > 0 {
			t.Duration = duration
			s.tracks[id] = t
			_ = s.saveLibraryLocked()
		}
	}
}

func (s *Storage) UpdateTrackMetadata(id, title, artist, album string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()

	t, ok := s.tracks[id]
	if !ok {
		return fmt.Errorf("track not found")
	}

	if title != "" {
		t.Title = title
	}
	if artist != "" {
		t.Artist = artist
	}
	if album != "" {
		t.Album = album
	}

	s.tracks[id] = t
	return s.saveLibraryLocked()
}

func (s *Storage) UpdateTrackCover(id string, coverBytes []byte, ext string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()
	t, ok := s.tracks[id]
	if !ok {
		return fmt.Errorf("track not found")
	}

	if len(coverBytes) > 0 {
		if ext == "" {
			ext = "jpg"
		}
		coverPath := filepath.Join(s.coversDir, fmt.Sprintf("%s.%s", id, ext))
		if err := os.WriteFile(coverPath, coverBytes, 0644); err != nil {
			return err
		}
		t.HasCover = true
		t.CoverExt = ext
		t.CoverUpdatedAt = time.Now().Unix()
		s.tracks[id] = t
		return s.saveLibraryLocked()
	}
	return nil
}

func (s *Storage) ReplaceTrackFile(id string, audioData []byte, duration float64, coverBytes []byte) (*Track, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()
	t, ok := s.tracks[id]
	if !ok {
		return nil, fmt.Errorf("track not found")
	}

	ext := filepath.Ext(t.Filename)
	if ext == "" {
		ext = ".mp3"
	}
	newFilename := fmt.Sprintf("%s_%d%s", t.ID, time.Now().Unix(), ext)
	newAudioPath := filepath.Join(s.audioDir, newFilename)

	if err := os.WriteFile(newAudioPath, audioData, 0644); err != nil {
		return nil, err
	}

	// Delete old file immediately; if locked by active playback, retry in background once released
	oldAudioPath := filepath.Join(s.audioDir, t.Filename)
	if oldAudioPath != newAudioPath {
		if err := os.Remove(oldAudioPath); err != nil {
			go func(oldPath string) {
				for attempt := 0; attempt < 6; attempt++ {
					time.Sleep(1 * time.Second)
					if err := os.Remove(oldPath); err == nil || os.IsNotExist(err) {
						break
					}
				}
			}(oldAudioPath)
		}
	}

	t.Filename = newFilename
	t.FileSize = int64(len(audioData))
	if duration > 0 {
		t.Duration = duration
	}

	if len(coverBytes) > 500 {
		coverExt := "jpg"
		coverPath := filepath.Join(s.coversDir, fmt.Sprintf("%s.%s", id, coverExt))
		_ = os.WriteFile(coverPath, coverBytes, 0644)
		t.HasCover = true
		t.CoverExt = coverExt
	}

	s.tracks[id] = t
	if err := s.saveLibraryLocked(); err != nil {
		return nil, err
	}

	// Also update state.json if this track is currently active so state persists across restart
	if s.state.CurrentTrackID == id || (s.state.CurrentTrack != nil && s.state.CurrentTrack.ID == id) {
		s.state.CurrentTrack = &t
		_ = s.saveStateLocked()
	}

	return &t, nil
}

func (s *Storage) ReorderTracks(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()

	newOrder := make([]string, 0, len(ids))
	idSet := make(map[string]bool)
	for _, id := range ids {
		if _, ok := s.tracks[id]; ok && !idSet[id] {
			newOrder = append(newOrder, id)
			idSet[id] = true
		}
	}
	for _, id := range s.order {
		if !idSet[id] {
			newOrder = append(newOrder, id)
		}
	}
	s.order = newOrder
	return s.saveLibraryLocked()
}

func (s *Storage) SetStorageDir(newDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	clean := filepath.Clean(newDir)
	if err := os.MkdirAll(clean, 0755); err != nil {
		return err
	}
	s.audioDir = clean
	return nil
}

func (s *Storage) DeleteTrack(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.loadLibraryLocked()

	t, ok := s.tracks[id]
	if ok {
		audioPath := filepath.Join(s.audioDir, t.Filename)
		for attempt := 0; attempt < 5; attempt++ {
			err := os.Remove(audioPath)
			if err == nil || os.IsNotExist(err) {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
	}

	// Purge all possible extensions
	for _, ext := range []string{".mp3", ".wav", ".flac", ".m4a", ".ogg"} {
		_ = os.Remove(filepath.Join(s.audioDir, id+ext))
	}
	for _, ext := range []string{".jpg", ".png", ".webp"} {
		_ = os.Remove(filepath.Join(s.coversDir, id+ext))
	}

	delete(s.tracks, id)

	newOrder := make([]string, 0, len(s.order))
	for _, oid := range s.order {
		if oid != id {
			newOrder = append(newOrder, oid)
		}
	}
	s.order = newOrder

	// Remove from playback state if present
	if s.state.CurrentTrackID == id {
		s.state.CurrentTrackID = ""
		s.state.CurrentTime = 0
		s.state.IsPlaying = false
	}
	newQueue := make([]string, 0, len(s.state.Queue))
	for _, qId := range s.state.Queue {
		if qId != id {
			newQueue = append(newQueue, qId)
		}
	}
	s.state.Queue = newQueue
	_ = s.saveStateLocked()

	// Blacklist in deleted_tracks.json
	deletedFile := filepath.Join(s.baseDir, "deleted_tracks.json")
	var deletedList []string
	if dBytes, err := os.ReadFile(deletedFile); err == nil {
		_ = json.Unmarshal(dBytes, &deletedList)
	}
	found := false
	for _, dId := range deletedList {
		if dId == id {
			found = true
			break
		}
	}
	if !found {
		deletedList = append(deletedList, id)
	}
	if outBytes, err := json.MarshalIndent(deletedList, "", "  "); err == nil {
		_ = os.WriteFile(deletedFile, outBytes, 0644)
	}

	return s.saveLibraryLocked()
}

func (s *Storage) GetAudioPath(filename string) string {
	return filepath.Join(s.audioDir, filename)
}

func (s *Storage) GetCoverPath(id string, ext string) string {
	return filepath.Join(s.coversDir, fmt.Sprintf("%s.%s", id, ext))
}

func (s *Storage) GetStats() StorageStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var totalBytes int64
	for _, t := range s.tracks {
		totalBytes += t.FileSize
	}

	return StorageStats{
		TotalTracks: len(s.tracks),
		TotalBytes:  totalBytes,
		StorageDir:  s.audioDir,
	}
}

func (s *Storage) loadPrefsLocked() {
	if s.prefs.Preferred == nil {
		s.prefs.Preferred = make(map[string]TrackVersion)
	}
	if s.prefs.Disliked == nil {
		s.prefs.Disliked = make(map[string][]string)
	}
	data, err := os.ReadFile(s.prefFile)
	if err != nil {
		return
	}
	var loaded VersionPreferences
	if err := json.Unmarshal(data, &loaded); err == nil {
		if loaded.Preferred != nil {
			s.prefs.Preferred = loaded.Preferred
		}
		if loaded.Disliked != nil {
			s.prefs.Disliked = loaded.Disliked
		}
	}
}

func (s *Storage) savePrefsLocked() error {
	data, err := json.MarshalIndent(s.prefs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.prefFile, data, 0644)
}

func (s *Storage) GetVersionPreferences() VersionPreferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.prefs
}

func (s *Storage) SetPreferredVersion(songKey string, version TrackVersion) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.prefs.Preferred == nil {
		s.prefs.Preferred = make(map[string]TrackVersion)
	}
	version.IsPreferred = true
	s.prefs.Preferred[songKey] = version
	return s.savePrefsLocked()
}

func (s *Storage) RemovePreferredVersion(songKey string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.prefs.Preferred != nil {
		delete(s.prefs.Preferred, songKey)
	}
	return s.savePrefsLocked()
}

func (s *Storage) AddDislikedVersion(songKey string, versionIDOrType string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.prefs.Disliked == nil {
		s.prefs.Disliked = make(map[string][]string)
	}
	list := s.prefs.Disliked[songKey]
	for _, item := range list {
		if item == versionIDOrType {
			return nil
		}
	}
	s.prefs.Disliked[songKey] = append(list, versionIDOrType)

	// If preferred version was this disliked one, remove it
	if pref, ok := s.prefs.Preferred[songKey]; ok {
		if pref.ID == versionIDOrType || pref.VersionType == versionIDOrType {
			delete(s.prefs.Preferred, songKey)
		}
	}

	return s.savePrefsLocked()
}

func (s *Storage) CleanupOrphanAudioFiles() {
	s.mu.RLock()
	knownFiles := make(map[string]bool)
	for _, t := range s.tracks {
		if t.Filename != "" {
			knownFiles[t.Filename] = true
		}
	}
	audioDir := s.audioDir
	s.mu.RUnlock()

	entries, err := os.ReadDir(audioDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".tmp") {
			_ = os.Remove(filepath.Join(audioDir, name))
			continue
		}
		if !knownFiles[name] {
			// Orphaned file not present in library.json -> delete it
			_ = os.Remove(filepath.Join(audioDir, name))
		}
	}
}

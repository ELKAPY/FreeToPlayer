package main

import "time"

type Track struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	Artist          string    `json:"artist"`
	Album           string    `json:"album"`
	Year            int       `json:"year"`
	Genre           string    `json:"genre,omitempty"`
	Duration        float64   `json:"duration"` // in seconds
	Format          string    `json:"format"`   // FLAC, WAV, MP3, M4A, OGG, etc.
	IsLossless      bool      `json:"isLossless"`
	FileSize        int64     `json:"fileSize"`
	HasCover        bool      `json:"hasCover"`
	CoverExt        string    `json:"coverExt,omitempty"`
	CoverURL        string    `json:"coverUrl,omitempty"`
	CoverUpdatedAt  int64     `json:"coverUpdatedAt,omitempty"`
	OnlineStreamURL string    `json:"onlineStreamUrl,omitempty"`
	Filename        string    `json:"filename"`
	OriginalName    string    `json:"originalName"`
	CreatedAt       time.Time `json:"createdAt"`
}

type PlaybackState struct {
	CurrentTrackID          string    `json:"currentTrackId"`
	CurrentTrack            *Track    `json:"currentTrack,omitempty"`
	CurrentTime             float64   `json:"currentTime"` // position in seconds
	Volume                  float64   `json:"volume"`      // 0.0 - 1.0
	IsPlaying               bool      `json:"isPlaying"`
	IsMuted                 bool      `json:"isMuted"`
	RepeatMode              string    `json:"repeatMode"` // "off", "all", "one"
	IsShuffle               bool      `json:"isShuffle"`
	Queue                   []string  `json:"queue"`
	QueueTracks             []Track   `json:"queueTracks,omitempty"`
	EQPreset                string    `json:"eqPreset,omitempty"`
	EQGains                 []float64 `json:"eqGains,omitempty"`
	IsNormalizationEnabled  bool      `json:"isNormalizationEnabled"`
	CrossfadeSeconds        int       `json:"crossfadeSeconds,omitempty"`
	SelectedAudioDevice     string    `json:"selectedAudioDevice,omitempty"`
	SelectedAudioDeviceName string    `json:"selectedAudioDeviceName,omitempty"`
	Theme                   string    `json:"theme,omitempty"`
	IsDiscordEnabled        bool      `json:"isDiscordEnabled"`
	DefaultMusicSource      string    `json:"defaultMusicSource,omitempty"`
}

type StorageStats struct {
	TotalTracks int    `json:"totalTracks"`
	TotalBytes  int64  `json:"totalBytes"`
	StorageDir  string `json:"storageDir"`
}

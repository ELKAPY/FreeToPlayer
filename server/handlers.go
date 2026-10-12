package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type API struct {
	storage *Storage
}

func NewAPI(storage *Storage) *API {
	return &API{storage: storage}
}

func (a *API) handleTracks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tracks := a.storage.GetTracks()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(tracks)
}

func (a *API) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1024 MB max memory for multi-part parse
	if err := r.ParseMultipartForm(1024 << 20); err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	formFiles := r.MultipartForm.File["files"]
	if len(formFiles) == 0 {
		// fallback to "file"
		formFiles = r.MultipartForm.File["file"]
	}

	if len(formFiles) == 0 {
		http.Error(w, "No files uploaded", http.StatusBadRequest)
		return
	}

	uploadedTracks := make([]Track, 0, len(formFiles))

	for _, fileHeader := range formFiles {
		src, err := fileHeader.Open()
		if err != nil {
			continue
		}

		id := generateID()
		ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
		if ext == "" {
			ext = ".mp3"
		}
		filename := id + ext
		destPath := a.storage.GetAudioPath(filename)

		dst, err := os.Create(destPath)
		if err != nil {
			src.Close()
			continue
		}

		_, err = io.Copy(dst, src)
		src.Close()
		dst.Close()

		if err != nil {
			_ = os.Remove(destPath)
			continue
		}

		// Extract metadata & cover
		track, coverBytes, coverExt := ExtractMetadata(destPath, fileHeader.Filename)
		track.ID = id
		track.Filename = filename
		track.CoverExt = coverExt
		track.CreatedAt = time.Now()

		if err := a.storage.AddTrack(track, coverBytes); err == nil {
			uploadedTracks = append(uploadedTracks, track)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"uploaded": uploadedTracks,
		"count":    len(uploadedTracks),
	})
}

func (a *API) handleStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	track, ok := a.storage.GetTrack(id)
	if !ok {
		http.NotFound(w, r)
		return
	}

	audioPath := a.storage.GetAudioPath(track.Filename)
	f, err := os.Open(audioPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ext := filepath.Ext(track.Filename)
	contentType := SniffContentType(ext)

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	// Allow partial range caching so seeking and chunk streaming are instant without re-downloading entire file
	w.Header().Set("Cache-Control", "private, max-age=3600")

	http.ServeContent(w, r, track.OriginalName, fi.ModTime(), f)
}

func (a *API) handleCover(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cover/")
	track, ok := a.storage.GetTrack(id)

	var f *os.File
	var ext string

	if ok && track.HasCover && track.CoverExt != "" {
		coverPath := a.storage.GetCoverPath(track.ID, track.CoverExt)
		if file, err := os.Open(coverPath); err == nil {
			f = file
			ext = strings.ToLower(track.CoverExt)
		}
	}

	// Robust fallback: search covers directory for any matching extension
	if f == nil {
		for _, e := range []string{"jpg", "jpeg", "png", "webp"} {
			cp := filepath.Join(a.storage.coversDir, fmt.Sprintf("%s.%s", id, e))
			if file, err := os.Open(cp); err == nil {
				f = file
				ext = e
				break
			}
		}
	}

	if f == nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	mime := "image/jpeg"
	if ext == "png" {
		mime = "image/png"
	} else if ext == "webp" {
		mime = "image/webp"
	}

	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	http.ServeContent(w, r, "cover."+ext, fi.ModTime(), f)
}

func (a *API) handleDeleteTrack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/tracks/")
	if err := a.storage.DeleteTrack(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (a *API) handleState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		st := a.storage.GetState()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(st)

	case http.MethodPost:
		var st PlaybackState
		if err := json.NewDecoder(r.Body).Decode(&st); err != nil {
			http.Error(w, "Invalid body", http.StatusBadRequest)
			return
		}
		if err := a.storage.SaveState(st); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *API) handleUpdateDuration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/duration/")
	durStr := r.URL.Query().Get("seconds")
	sec, err := strconv.ParseFloat(durStr, 64)
	if err != nil || sec <= 0 {
		http.Error(w, "Invalid seconds", http.StatusBadRequest)
		return
	}

	a.storage.UpdateTrackDuration(id, sec)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (a *API) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := a.storage.GetStats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

func (a *API) handleOpenStorage(w http.ResponseWriter, r *http.Request) {
	audioDir := a.storage.GetStats().StorageDir
	cmd := exec.Command("explorer.exe", audioDir)
	_ = cmd.Start()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"
)

func (a *API) handleUpdateTrack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/edit-track/")
	var body struct {
		Title  string `json:"title"`
		Artist string `json:"artist"`
		Album  string `json:"album"`
		Year   int    `json:"year"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if err := a.storage.UpdateTrackMetadata(id, body.Title, body.Artist, body.Album, body.Year); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (a *API) handleReorder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var ids []string
	if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if err := a.storage.ReorderTracks(ids); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (a *API) handleSetStorage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	if err := a.storage.SetStorageDir(body.Path); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (a *API) handleExportM3U8(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Filename string `json:"filename"`
		Content  string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	userProfile := os.Getenv("USERPROFILE")
	if userProfile == "" {
		userProfile, _ = os.UserHomeDir()
	}
	downloadsDir := filepath.Join(userProfile, "Downloads")
	if _, err := os.Stat(downloadsDir); err != nil {
		downloadsDir = userProfile
	}

	fn := body.Filename
	if fn == "" {
		fn = "FreeToPlayer_Playlist.m3u8"
	}
	if !strings.HasSuffix(strings.ToLower(fn), ".m3u8") {
		fn += ".m3u8"
	}

	targetPath := filepath.Join(downloadsDir, fn)
	if err := os.WriteFile(targetPath, []byte(body.Content), 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"path":    targetPath,
	})
}

func (a *API) handleYandexSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	exePath, err := os.Executable()
	baseDir := filepath.Dir(exePath)
	if err != nil || filepath.Base(baseDir) == "server" {
		baseDir, _ = os.Getwd()
		if filepath.Base(baseDir) == "server" {
			baseDir = filepath.Join(baseDir, "..")
		}
	}

	scriptPath := filepath.Join(baseDir, "sync_yandex_live.py")
	if _, err := os.Stat(scriptPath); err != nil {
		cwd, _ := os.Getwd()
		alt := filepath.Join(cwd, "sync_yandex_live.py")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			scriptPath = alt
			baseDir = cwd
		} else {
			scriptPath = filepath.Join(baseDir, "sync_merged_to_dj.py")
		}
	}

	// Clean previous status
	statusFile := filepath.Join(baseDir, "data", "yandex_sync_status.json")
	_ = os.Remove(statusFile)

	pythonExe := findPythonExecutable()
	cmd := exec.Command(pythonExe, scriptPath)
	cmd.Dir = baseDir
	// Run silently in background with zero popup windows
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}

	if err := cmd.Start(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Синхронизация с Яндекс Музыкой запущена в фоне",
	})
}

func (a *API) handleYandexStatus(w http.ResponseWriter, r *http.Request) {
	exePath, err := os.Executable()
	baseDir := filepath.Dir(exePath)
	if err != nil || filepath.Base(baseDir) == "server" {
		baseDir, _ = os.Getwd()
		if filepath.Base(baseDir) == "server" {
			baseDir = filepath.Join(baseDir, "..")
		}
	}

	statusFile := filepath.Join(baseDir, "data", "yandex_sync_status.json")
	data, err := os.ReadFile(statusFile)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "idle",
			"done":   true,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

func findPythonExecutable() string {
	candidates := []string{"python", "python3", "py"}
	for _, c := range candidates {
		if path, err := exec.LookPath(c); err == nil {
			return path
		}
	}
	return "python"
}

func (a *API) handleYouTubeSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	exePath, err := os.Executable()
	baseDir := filepath.Dir(exePath)
	if err != nil || filepath.Base(baseDir) == "server" {
		baseDir, _ = os.Getwd()
		if filepath.Base(baseDir) == "server" {
			baseDir = filepath.Join(baseDir, "..")
		}
	}

	scriptPath := filepath.Join(baseDir, "sync_youtube_live.py")
	if _, err := os.Stat(scriptPath); err != nil {
		// Look in current working directory
		cwd, _ := os.Getwd()
		alt := filepath.Join(cwd, "sync_youtube_live.py")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			scriptPath = alt
			baseDir = cwd
		} else {
			http.Error(w, "Файл sync_youtube_live.py не найден в директории приложения", http.StatusNotFound)
			return
		}
	}

	// Clean previous status
	statusFile := filepath.Join(baseDir, "data", "youtube_sync_status.json")
	_ = os.Remove(statusFile)

	pythonExe := findPythonExecutable()
	cmd := exec.Command(pythonExe, scriptPath)
	cmd.Dir = baseDir
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}

	if err := cmd.Start(); err != nil {
		http.Error(w, "Ошибка запуска Python: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Синхронизация YouTube Music запущена в фоне",
	})
}

func (a *API) handleYouTubeStatus(w http.ResponseWriter, r *http.Request) {
	exePath, err := os.Executable()
	baseDir := filepath.Dir(exePath)
	if err != nil || filepath.Base(baseDir) == "server" {
		baseDir, _ = os.Getwd()
		if filepath.Base(baseDir) == "server" {
			baseDir = filepath.Join(baseDir, "..")
		}
	}

	statusFile := filepath.Join(baseDir, "data", "youtube_sync_status.json")
	data, err := os.ReadFile(statusFile)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "idle",
			"done":   true,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

func (a *API) handleYouTubeConfig(w http.ResponseWriter, r *http.Request) {
	exePath, err := os.Executable()
	baseDir := filepath.Dir(exePath)
	if err != nil || filepath.Base(baseDir) == "server" {
		baseDir, _ = os.Getwd()
		if filepath.Base(baseDir) == "server" {
			baseDir = filepath.Join(baseDir, "..")
		}
	}

	cfgFile := filepath.Join(baseDir, "data", "youtube_config.json")
	cookiesFile := filepath.Join(baseDir, "youtube_cookies.txt")

	hasCookies := false
	if fi, err := os.Stat(cookiesFile); err == nil && fi.Size() > 50 {
		hasCookies = true
	}

	if r.Method == http.MethodPost {
		var body struct {
			PlaylistURL string `json:"playlist_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = os.MkdirAll(filepath.Dir(cfgFile), 0755)
		data, _ := json.MarshalIndent(map[string]interface{}{
			"playlist_url": strings.TrimSpace(body.PlaylistURL),
		}, "", "  ")
		_ = os.WriteFile(cfgFile, data, 0644)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"playlist_url": strings.TrimSpace(body.PlaylistURL),
			"hasCookies":   hasCookies,
		})
		return
	}

	// GET
	playlistURL := ""
	if data, err := os.ReadFile(cfgFile); err == nil {
		var cfg struct {
			PlaylistURL string `json:"playlist_url"`
		}
		if err := json.Unmarshal(data, &cfg); err == nil {
			playlistURL = cfg.PlaylistURL
		}
	}
	if playlistURL == "" {
		if data, err := os.ReadFile(filepath.Join(baseDir, "youtube_playlist.txt")); err == nil {
			playlistURL = strings.TrimSpace(string(data))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"playlist_url": playlistURL,
		"hasCookies":   hasCookies,
	})
}

// ============================================================================
// BUILT-IN ACCOUNT LOGIN & PROFILE HANDLERS (YANDEX & YOUTUBE)
// ============================================================================

func (a *API) handleYandexLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	appDir := filepath.Dir(a.storage.baseDir)
	exePath, err := os.Executable()
	if err != nil {
		exePath = "FreeToPlayer.exe"
	}

	cmd := exec.Command(exePath, "--login-yandex")
	cmd.Dir = appDir
	if err := cmd.Start(); err != nil {
		// Fallback to dj-server.exe
		cmd = exec.Command("dj-server.exe", "--login-yandex")
		cmd.Dir = appDir
		_ = cmd.Start()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Окно входа в Яндекс Музыку открыто",
	})
}

func (a *API) handleYandexAccount(w http.ResponseWriter, r *http.Request) {
	token := getYandexToken(a.storage.baseDir)
	info, err := getYandexAccountInfo(token)
	if err != nil || info == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"isAuthorized": false,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(info)
}

func (a *API) handleYandexLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dataDir := a.storage.baseDir
	appDir := filepath.Dir(dataDir)

	// Remove token files
	_ = os.Remove(filepath.Join(appDir, "yandex_token.txt"))
	_ = os.Remove(filepath.Join(dataDir, "yandex_token.txt"))
	_ = os.Remove("yandex_token.txt")
	_ = os.Remove("../yandex_token.txt")

	// Reset cached token in memory
	yandexTokenCache = ""

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Вы вышли из Яндекс Музыки",
	})
}

func (a *API) handleYandexSaveToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	dataDir := a.storage.baseDir
	appDir := filepath.Dir(dataDir)

	token := strings.TrimSpace(body.Token)
	if token != "" {
		_ = os.WriteFile(filepath.Join(appDir, "yandex_token.txt"), []byte(token), 0644)
		_ = os.WriteFile(filepath.Join(dataDir, "yandex_token.txt"), []byte(token), 0644)
		_ = os.WriteFile("yandex_token.txt", []byte(token), 0644)
		yandexTokenCache = token
	}

	info, _ := getYandexAccountInfo(token)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"account": info,
	})
}

func (a *API) handleYouTubeLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	appDir := filepath.Dir(a.storage.baseDir)
	exePath, err := os.Executable()
	if err != nil {
		exePath = "FreeToPlayer.exe"
	}

	cmd := exec.Command(exePath, "--login-youtube")
	cmd.Dir = appDir
	if err := cmd.Start(); err != nil {
		// Fallback to dj-server.exe
		cmd = exec.Command("dj-server.exe", "--login-youtube")
		cmd.Dir = appDir
		_ = cmd.Start()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Окно входа в YouTube Music открыто",
	})
}

func (a *API) handleYouTubeAccount(w http.ResponseWriter, r *http.Request) {
	dataDir := a.storage.baseDir
	appDir := filepath.Dir(dataDir)

	cookiesFile := filepath.Join(appDir, "youtube_cookies.txt")
	hasCookies := false
	if fi, err := os.Stat(cookiesFile); err == nil && fi.Size() > 50 {
		hasCookies = true
	} else if fi, err := os.Stat(filepath.Join(dataDir, "youtube_cookies.txt")); err == nil && fi.Size() > 50 {
		hasCookies = true
	} else if fi, err := os.Stat("youtube_cookies.txt"); err == nil && fi.Size() > 50 {
		hasCookies = true
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"isAuthorized": hasCookies,
		"hasCookies":   hasCookies,
	})
}

func (a *API) handleYouTubeLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dataDir := a.storage.baseDir
	appDir := filepath.Dir(dataDir)

	_ = os.Remove(filepath.Join(appDir, "youtube_cookies.txt"))
	_ = os.Remove(filepath.Join(dataDir, "youtube_cookies.txt"))
	_ = os.Remove("youtube_cookies.txt")
	_ = os.Remove("../youtube_cookies.txt")

	// Also clean youtube profile
	_ = os.RemoveAll(filepath.Join(dataDir, "youtube_profile"))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Вы вышли из YouTube Music",
	})
}

var (
	reBracketsMatch = regexp.MustCompile(`\[.*?\]|\(.*?\)|<.*?>`)
	reYearDigits    = regexp.MustCompile(`\b(19|20)\d{2}\b`)
	reNoiseMatch    = regexp.MustCompile(`(?i)\b(remaster(ed)?|deluxe|version|edition|mono|stereo|live|explicit|clean|radio edit|original mix|acoustic|single|ep|lp|feat|ft|featuring)\b`)
)

func searchDeezerCovers(query string) ([]OnlineTrack, error) {
	client := &http.Client{Timeout: 2 * time.Second}
	reqURL := fmt.Sprintf("https://api.deezer.com/search?q=%s&limit=6", url.QueryEscape(query))
	resp, err := client.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("deezer returned status %d", resp.StatusCode)
	}

	var root struct {
		Data []struct {
			ID     int64  `json:"id"`
			Title  string `json:"title"`
			Artist struct {
				Name string `json:"name"`
			} `json:"artist"`
			Album struct {
				Title    string `json:"title"`
				CoverXL  string `json:"cover_xl"`
				CoverBig string `json:"cover_big"`
				CoverMed string `json:"cover_medium"`
			} `json:"album"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return nil, err
	}

	var list []OnlineTrack
	for _, item := range root.Data {
		cov := item.Album.CoverXL
		if cov == "" {
			cov = item.Album.CoverBig
		}
		if cov == "" {
			cov = item.Album.CoverMed
		}
		if cov != "" {
			list = append(list, OnlineTrack{
				ID:         fmt.Sprintf("deezer-%d", item.ID),
				Title:      item.Title,
				Artist:     item.Artist.Name,
				Album:      item.Album.Title,
				CoverURL:   cov,
				Source:     "deezer",
				SourceName: "Deezer",
			})
		}
	}
	return list, nil
}

func normalizeForMatch(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = reBracketsMatch.ReplaceAllString(s, " ")
	s = reYearDigits.ReplaceAllString(s, " ")
	s = reNoiseMatch.ReplaceAllString(s, " ")

	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "ä", "a", "â", "a", "ã", "a", "å", "a",
		"é", "e", "è", "e", "ë", "e", "ê", "e",
		"í", "i", "ì", "i", "ï", "i", "î", "i",
		"ó", "o", "ò", "o", "ö", "o", "ô", "o", "õ", "o", "ø", "o",
		"ú", "u", "ù", "u", "ü", "u", "û", "u",
		"ñ", "n", "ç", "c", "ÿ", "y", "ý", "y",
		"ё", "е",
	)
	s = replacer.Replace(s)

	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func isConfidentMatch(tArtist, tTitle, cArtist, cTitle string) bool {
	na1 := normalizeForMatch(tArtist)
	nt1 := normalizeForMatch(tTitle)
	na2 := normalizeForMatch(cArtist)
	nt2 := normalizeForMatch(cTitle)

	if nt1 == "" || nt2 == "" {
		return false
	}

	titleMatch := (nt1 == nt2) || strings.Contains(nt1, nt2) || strings.Contains(nt2, nt1)
	if !titleMatch {
		w1 := strings.Fields(nt1)
		w2 := strings.Fields(nt2)
		if len(w1) > 0 && len(w2) > 0 {
			overlap := 0
			for _, x := range w1 {
				for _, y := range w2 {
					if x == y {
						overlap++
						break
					}
				}
			}
			if float64(overlap)/float64(len(w1)) >= 0.70 || float64(overlap)/float64(len(w2)) >= 0.70 {
				titleMatch = true
			}
		}
	}

	if !titleMatch {
		return false
	}

	if na1 == "" {
		return true
	}

	artistMatch := (na1 == na2) || strings.Contains(na1, na2) || strings.Contains(na2, na1)
	if !artistMatch {
		wA1 := strings.Fields(na1)
		wA2 := strings.Fields(na2)
		for _, x := range wA1 {
			if len(x) > 2 {
				for _, y := range wA2 {
					if x == y {
						artistMatch = true
						break
					}
				}
			}
			if artistMatch {
				break
			}
		}
	}

	if !artistMatch && (strings.Contains(nt2, na1) || strings.Contains(nt1, na2)) {
		artistMatch = true
	}

	return artistMatch
}

func (a *API) handleAutoCovers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	trackID := strings.TrimSpace(r.URL.Query().Get("trackId"))
	if trackID == "" {
		trackID = strings.TrimSpace(r.URL.Query().Get("trackID"))
	}
	if trackID == "" {
		var b struct {
			TrackID string `json:"trackId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&b)
		trackID = strings.TrimSpace(b.TrackID)
	}

	allTracks := a.storage.GetTracks()
	var targets []Track

	if trackID != "" {
		for _, t := range allTracks {
			if t.ID == trackID {
				targets = append(targets, t)
				break
			}
		}
	} else {
		for _, t := range allTracks {
			if !t.HasCover {
				targets = append(targets, t)
			}
		}
	}

	token := getYandexToken(a.storage.baseDir)
	client := &http.Client{Timeout: 5 * time.Second}
	var updated []Track
	var uMu sync.Mutex
	var uWg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for _, t := range targets {
		if strings.TrimSpace(t.Title) == "" {
			continue
		}
		tCopy := t
		uWg.Add(1)
		go func(track Track) {
			defer uWg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			query := fmt.Sprintf("%s %s", track.Artist, track.Title)
			var candidates []OnlineTrack
			var cMu sync.Mutex
			var cWg sync.WaitGroup

			// 1. Primary sources: Deezer (1000x1000 HD) + Yandex
			cWg.Add(1)
			go func() {
				defer cWg.Done()
				if dzList, err := searchDeezerCovers(query); err == nil {
					cMu.Lock()
					candidates = append(candidates, dzList...)
					cMu.Unlock()
				}
			}()

			if token != "" {
				cWg.Add(1)
				go func() {
					defer cWg.Done()
					if yaList, err := searchYandexTracks(query, token); err == nil {
						cMu.Lock()
						candidates = append(candidates, yaList...)
						cMu.Unlock()
					}
				}()
			}

			cWg.Wait()

			// Check if primary sources found a confident match
			var matchedCoverURL string
			for _, cand := range candidates {
				if cand.CoverURL != "" && isConfidentMatch(track.Artist, track.Title, cand.Artist, cand.Title) {
					matchedCoverURL = cand.CoverURL
					break
				}
			}

			// 2. Secondary fallback: SoundCloud / Hitmo only if primary didn't match
			if matchedCoverURL == "" {
				var fbCandidates []OnlineTrack
				var fbMu sync.Mutex
				var fbWg sync.WaitGroup

				fbWg.Add(1)
				go func() {
					defer fbWg.Done()
					if scList, err := a.searchSoundCloudTracks(query); err == nil {
						fbMu.Lock()
						fbCandidates = append(fbCandidates, scList...)
						fbMu.Unlock()
					}
				}()

				fbWg.Add(1)
				go func() {
					defer fbWg.Done()
					if hList, err := searchHitmo(query); err == nil {
						fbMu.Lock()
						fbCandidates = append(fbCandidates, hList...)
						fbMu.Unlock()
					}
				}()

				fbWg.Wait()

				for _, cand := range fbCandidates {
					if cand.CoverURL != "" && isConfidentMatch(track.Artist, track.Title, cand.Artist, cand.Title) {
						matchedCoverURL = cand.CoverURL
						break
					}
				}
			}

			if matchedCoverURL != "" {
				creq, err := http.NewRequest("GET", matchedCoverURL, nil)
				if err == nil {
					creq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FreeToPlayer")
					cresp, cerr := client.Do(creq)
					if cerr == nil && cresp.StatusCode == http.StatusOK {
						cdata, rErr := io.ReadAll(cresp.Body)
						cresp.Body.Close()
						if rErr == nil && len(cdata) > 500 {
							if err := a.storage.UpdateTrackCover(track.ID, cdata, "jpg"); err == nil {
								if ut, ok := a.storage.GetTrack(track.ID); ok {
									uMu.Lock()
									updated = append(updated, ut)
									uMu.Unlock()
								}
							}
						}
					}
				}
			}
		}(tCopy)
	}

	uDone := make(chan struct{})
	go func() {
		uWg.Wait()
		close(uDone)
	}()

	select {
	case <-uDone:
	case <-time.After(3 * time.Second):
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"updatedCount": len(updated),
		"tracks":       updated,
	})
}

func (a *API) handleSearchCovers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	trackID := strings.TrimSpace(r.URL.Query().Get("trackId"))
	query := strings.TrimSpace(r.URL.Query().Get("q"))

	if query == "" && trackID != "" {
		if t, ok := a.storage.GetTrack(trackID); ok {
			query = fmt.Sprintf("%s %s", t.Artist, t.Title)
		}
	}
	if query == "" {
		http.Error(w, "Missing query or trackId", http.StatusBadRequest)
		return
	}

	var candidates []OnlineTrack
	var mu sync.Mutex
	var wg sync.WaitGroup

	// 1. Deezer (1000x1000 HD)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if dzList, err := searchDeezerCovers(query); err == nil {
			mu.Lock()
			candidates = append(candidates, dzList...)
			mu.Unlock()
		}
	}()

	// 2. Yandex
	token := getYandexToken(a.storage.baseDir)
	if token != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if yaList, err := searchYandexTracks(query, token); err == nil {
				mu.Lock()
				candidates = append(candidates, yaList...)
				mu.Unlock()
			}
		}()
	}

	// 3. SoundCloud
	wg.Add(1)
	go func() {
		defer wg.Done()
		if scList, err := a.searchSoundCloudTracks(query); err == nil {
			mu.Lock()
			candidates = append(candidates, scList...)
			mu.Unlock()
		}
	}()

	// 4. Hitmo
	wg.Add(1)
	go func() {
		defer wg.Done()
		if hList, err := searchHitmo(query); err == nil {
			mu.Lock()
			candidates = append(candidates, hList...)
			mu.Unlock()
		}
	}()

	wg.Wait()

	seen := make(map[string]bool)
	type CoverItem struct {
		URL        string `json:"url"`
		Title      string `json:"title"`
		Artist     string `json:"artist"`
		SourceName string `json:"sourceName"`
	}
	var results []CoverItem

	for _, c := range candidates {
		if c.CoverURL == "" || seen[c.CoverURL] {
			continue
		}
		seen[c.CoverURL] = true
		sName := c.SourceName
		if sName == "" {
			sName = c.Source
		}
		results = append(results, CoverItem{
			URL:        c.CoverURL,
			Title:      c.Title,
			Artist:     c.Artist,
			SourceName: sName,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"query":  query,
		"covers": results,
		"count":  len(results),
	})
}

func (a *API) handleSetTrackCover(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		TrackID     string `json:"trackId"`
		CoverURL    string `json:"coverUrl"`
		CoverBase64 string `json:"coverBase64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TrackID == "" {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	var cdata []byte
	ext := "jpg"

	if body.CoverBase64 != "" {
		raw := body.CoverBase64
		if idx := strings.Index(raw, ","); idx != -1 {
			raw = raw[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err != nil || len(decoded) < 100 {
			http.Error(w, "Invalid base64 image data", http.StatusBadRequest)
			return
		}
		cdata = decoded
	} else if body.CoverURL != "" {
		client := &http.Client{Timeout: 15 * time.Second}
		creq, err := http.NewRequest("GET", body.CoverURL, nil)
		if err != nil {
			http.Error(w, "Invalid cover URL", http.StatusBadRequest)
			return
		}
		creq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FreeToPlayer")
		cresp, err := client.Do(creq)
		if err != nil || cresp.StatusCode != http.StatusOK {
			http.Error(w, "Failed to download cover", http.StatusBadRequest)
			return
		}
		defer cresp.Body.Close()
		cdata, _ = io.ReadAll(cresp.Body)
		if len(cdata) < 500 {
			http.Error(w, "Downloaded cover is too small or invalid", http.StatusBadRequest)
			return
		}
	} else {
		http.Error(w, "Must provide coverUrl or coverBase64", http.StatusBadRequest)
		return
	}

	if err := a.storage.UpdateTrackCover(body.TrackID, cdata, ext); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	updatedTrack, ok := a.storage.GetTrack(body.TrackID)
	if !ok {
		http.Error(w, "Track not found after update", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"track":   updatedTrack,
	})
}

func (a *API) handleReplaceVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		LocalTrackID string       `json:"localTrackId"`
		Version      TrackVersion `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.LocalTrackID == "" {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	localTrack, hasLocal := a.storage.GetTrack(body.LocalTrackID)

	actualAudioURL := body.Version.AudioURL
	if actualAudioURL == "" {
		actualAudioURL = body.Version.StreamURL
	}
	// Extract target URL if stream proxy URL was passed
	if strings.Contains(actualAudioURL, "url=") {
		if u, err := url.Parse(actualAudioURL); err == nil {
			if targetURL := u.Query().Get("url"); targetURL != "" {
				actualAudioURL = targetURL
			}
		}
	}

	var audioData []byte

	// 1. If source is local track
	if body.Version.Source == "local" || strings.HasPrefix(body.Version.StreamURL, "/api/stream/") || strings.HasPrefix(actualAudioURL, "/api/stream/") {
		sourceID := body.Version.ID
		if strings.HasPrefix(actualAudioURL, "/api/stream/") {
			sourceID = strings.TrimPrefix(actualAudioURL, "/api/stream/")
		} else if strings.HasPrefix(body.Version.StreamURL, "/api/stream/") {
			sourceID = strings.TrimPrefix(body.Version.StreamURL, "/api/stream/")
		}
		sourceTrack, ok := a.storage.GetTrack(sourceID)
		if !ok {
			http.Error(w, "Source local track not found", http.StatusNotFound)
			return
		}
		data, err := os.ReadFile(a.storage.GetAudioPath(sourceTrack.Filename))
		if err != nil {
			http.Error(w, "Failed to read source audio: "+err.Error(), http.StatusInternalServerError)
			return
		}
		audioData = data
	} else if body.Version.Source == "soundcloud" || strings.HasPrefix(body.Version.ID, "sc_") || strings.Contains(body.Version.StreamURL, "stream-sc") || strings.Contains(actualAudioURL, "api-v2.soundcloud.com") {
		// 2. SoundCloud source
		targetURL := body.Version.AudioURL
		auth := ""
		if u, err := url.Parse(body.Version.StreamURL); err == nil {
			if qURL := u.Query().Get("url"); qURL != "" {
				targetURL = qURL
			}
			auth = u.Query().Get("auth")
		}
		trackID := strings.TrimPrefix(body.Version.ID, "sc_")
		data, err := a.downloadSoundCloudAudio(targetURL, auth, trackID)
		if err == nil && len(data) > 1000 {
			audioData = data
		}

		if len(audioData) < 1000 {
			qFallback := fmt.Sprintf("%s %s", body.Version.Artist, body.Version.Title)
			if scList, scErr := a.searchSoundCloudTracks(qFallback); scErr == nil && len(scList) > 0 {
				fbSC := scList[0]
				fbAuth := ""
				fbTarget := fbSC.AudioURL
				if u, err := url.Parse(fbSC.StreamURL); err == nil {
					if qURL := u.Query().Get("url"); qURL != "" {
						fbTarget = qURL
					}
					fbAuth = u.Query().Get("auth")
				}
				fbData, fbErr := a.downloadSoundCloudAudio(fbTarget, fbAuth, strings.TrimPrefix(fbSC.ID, "sc_"))
				if fbErr == nil && len(fbData) > 1000 {
					audioData = fbData
				}
			}
		}
	} else if body.Version.Source == "youtube" || strings.HasPrefix(body.Version.ID, "yt-") || strings.Contains(body.Version.StreamURL, "stream-yt") {
		// 3. YouTube Music source
		videoID := body.Version.AudioURL
		if videoID == "" || strings.HasPrefix(videoID, "http") {
			if u, err := url.Parse(body.Version.StreamURL); err == nil {
				if qID := u.Query().Get("id"); qID != "" {
					videoID = qID
				}
			}
		}
		if videoID == "" {
			videoID = strings.TrimPrefix(body.Version.ID, "yt-")
		}

		data, err := a.downloadYouTubeAudio(videoID)
		if err == nil && len(data) > 1000 {
			audioData = data
		}
	} else if body.Version.Source == "yandex" || strings.HasPrefix(actualAudioURL, "yandex://") {
		// 4. Yandex Music source
		tok := getYandexToken(a.storage.baseDir)
		if tok != "" {
			direct, err := getYandexDirectMP3(body.Version.ID, tok)
			if err == nil && direct != "" {
				client := &http.Client{Timeout: 60 * time.Second}
				resp, err := client.Get(direct)
				if err == nil && resp.StatusCode == http.StatusOK {
					d, rErr := io.ReadAll(resp.Body)
					resp.Body.Close()
					if rErr == nil && len(d) > 1000 {
						audioData = d
					}
				} else if resp != nil {
					resp.Body.Close()
				}
			}
		}
	} else {
		// 5. Hitmo, VK, Audius, or direct HTTP URL
		if strings.HasPrefix(actualAudioURL, "http://") || strings.HasPrefix(actualAudioURL, "https://") {
			client := &http.Client{Timeout: 60 * time.Second}
			req, err := http.NewRequest("GET", actualAudioURL, nil)
			if err == nil {
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
				req.Header.Set("Accept", "*/*")
				if strings.Contains(actualAudioURL, "hitmo") {
					req.Header.Set("Referer", "https://rus.hitmotop.com/")
				}
				resp, err := client.Do(req)
				if err == nil && resp.StatusCode == http.StatusOK {
					data, rErr := io.ReadAll(resp.Body)
					resp.Body.Close()
					if rErr == nil && len(data) > 1000 {
						audioData = data
					}
				} else if resp != nil {
					resp.Body.Close()
				}
			}
		}
	}

	// 6. Intelligent universal fallback: If primary download source failed, search and download from SoundCloud or YouTube
	if len(audioData) < 1000 {
		qSong := fmt.Sprintf("%s %s", body.Version.Artist, body.Version.Title)
		if strings.TrimSpace(qSong) == "" {
			qSong = body.Version.Title
		}

		// Try SoundCloud search & download
		if scList, scErr := a.searchSoundCloudTracks(qSong); scErr == nil && len(scList) > 0 {
			fbSC := scList[0]
			fbAuth := ""
			fbTarget := fbSC.AudioURL
			if u, err := url.Parse(fbSC.StreamURL); err == nil {
				if qURL := u.Query().Get("url"); qURL != "" {
					fbTarget = qURL
				}
				fbAuth = u.Query().Get("auth")
			}
			if fbData, fbErr := a.downloadSoundCloudAudio(fbTarget, fbAuth, strings.TrimPrefix(fbSC.ID, "sc_")); fbErr == nil && len(fbData) > 1000 {
				audioData = fbData
			}
		}

		// If still empty, try YouTube search & download
		if len(audioData) < 1000 {
			if ytList, ytErr := a.searchYouTubeTracks(qSong); ytErr == nil && len(ytList) > 0 {
				fbYT := ytList[0]
				ytVid := strings.TrimPrefix(fbYT.ID, "yt-")
				if fbData, fbErr := a.downloadYouTubeAudio(ytVid); fbErr == nil && len(fbData) > 1000 {
					audioData = fbData
				}
			}
		}
	}

	if len(audioData) < 1000 {
		http.Error(w, "Failed to download replacement audio data", http.StatusBadGateway)
		return
	}

	// Download cover if provided
	var coverBytes []byte
	if body.Version.CoverURL != "" {
		coverClient := &http.Client{Timeout: 5 * time.Second}
		creq, _ := http.NewRequest("GET", body.Version.CoverURL, nil)
		creq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		creq.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
		if strings.Contains(body.Version.CoverURL, "hitm") {
			creq.Header.Set("Referer", "https://rus.hitmotop.com/")
		}
		cresp, cerr := coverClient.Do(creq)
		if cerr == nil && cresp.StatusCode == http.StatusOK {
			cdata, _ := io.ReadAll(cresp.Body)
			cresp.Body.Close()
			if len(cdata) > 500 {
				coverBytes = cdata
			}
		}
	}

	var updatedTrack *Track
	if hasLocal {
		up, err := a.storage.ReplaceTrackFile(localTrack.ID, audioData, body.Version.Duration, coverBytes)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		updatedTrack = up
	} else {
		id := fmt.Sprintf("%d", time.Now().UnixNano())
		ext := ".mp3"
		filename := fmt.Sprintf("%s%s", id, ext)
		newAudioPath := filepath.Join(a.storage.audioDir, filename)
		if err := os.WriteFile(newAudioPath, audioData, 0644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		newTr := Track{
			ID:           id,
			Title:        body.Version.Title,
			Artist:       body.Version.Artist,
			Album:        body.Version.Album,
			Duration:     body.Version.Duration,
			Format:       "MP3",
			Filename:     filename,
			OriginalName: body.Version.Title + ".mp3",
			CreatedAt:    time.Now(),
		}
		if len(coverBytes) > 0 {
			_ = a.storage.UpdateTrackCover(id, coverBytes, "jpg")
			newTr.HasCover = true
		}
		_ = a.storage.AddTrack(newTr, coverBytes)
		updatedTrack = &newTr
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"track":   updatedTrack,
	})
}

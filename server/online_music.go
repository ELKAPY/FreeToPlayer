package main

import (
	"compress/gzip"
	"context"
	"crypto/md5"
	"encoding/hex"
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
	"syscall"
	"time"
)

type OnlineTrack struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Artist     string  `json:"artist"`
	Album      string  `json:"album,omitempty"`
	Year       int     `json:"year,omitempty"`
	Duration   float64 `json:"duration"`
	DurStr     string  `json:"durStr"`
	CoverURL   string  `json:"coverUrl"`
	AudioURL   string  `json:"audioUrl"`
	StreamURL  string  `json:"streamUrl"`
	Source     string  `json:"source"`
	SourceName string  `json:"sourceName"`
	Version    string  `json:"version,omitempty"`
}

var (
	reTrackItem = regexp.MustCompile(`(?s)<li[^>]*class="[^"]*tracks__item[^"]*"[^>]*>(.*?)</li>`)
	reTitle     = regexp.MustCompile(`(?s)<div[^>]*class="[^"]*track__title[^"]*"[^>]*>(.*?)</div>`)
	reDesc      = regexp.MustCompile(`(?s)<div[^>]*class="[^"]*track__desc[^"]*"[^>]*>(.*?)</div>`)
	reDownload  = regexp.MustCompile(`(?s)href="(/get/music/[^"]+\.mp3)"`)
	reCover     = regexp.MustCompile(`url\('([^']+)'\)`)
	reTime      = regexp.MustCompile(`(?s)<div[^>]*class="[^"]*track__fulltime[^"]*"[^>]*>(.*?)</div>`)
	reTag       = regexp.MustCompile(`<[^>]+>`)
)

func cleanText(s string) string {
	s = reTag.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	return strings.TrimSpace(s)
}

func parseDurationSec(s string) float64 {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) == 2 {
		var m, sec int
		fmt.Sscanf(parts[0], "%d", &m)
		fmt.Sscanf(parts[1], "%d", &sec)
		return float64(m*60 + sec)
	}
	return 0
}

func hashStr(s string) string {
	h := md5.Sum([]byte(s))
	return hex.EncodeToString(h[:])
}

func searchHitmo(query string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)
	scriptPath := findPythonScript("", "hitmo_search.py")

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, query)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}

	out, err := cmd.Output()
	if err == nil && len(out) > 0 {
		_ = json.Unmarshal(out, &results)
	}
	if len(results) > 0 {
		return results, nil
	}

	return searchHitmoDirect(query)
}

func searchHitmoDirect(query string) ([]OnlineTrack, error) {
	client := &http.Client{Timeout: 4 * time.Second}
	reqURL := "https://rus.hitmotop.com/search?q=" + url.QueryEscape(query)

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Referer", "https://rus.hitmotop.com/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var reader io.Reader = resp.Body
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Encoding")), "gzip") {
		gzReader, gzErr := gzip.NewReader(resp.Body)
		if gzErr == nil {
			defer gzReader.Close()
			reader = gzReader
		}
	}

	bodyBytes, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	html := string(bodyBytes)

	items := reTrackItem.FindAllStringSubmatch(html, 40)
	results := make([]OnlineTrack, 0)

	for _, item := range items {
		block := item[1]

		dlMatch := reDownload.FindStringSubmatch(block)
		if len(dlMatch) < 2 {
			continue
		}
		audioPath := dlMatch[1]
		audioURL := "https://rus.hitmotop.com" + audioPath

		var title, artist, durStr, coverURL string

		if m := reTitle.FindStringSubmatch(block); len(m) > 1 {
			title = cleanText(m[1])
		}
		if m := reDesc.FindStringSubmatch(block); len(m) > 1 {
			artist = cleanText(m[1])
		}
		if m := reTime.FindStringSubmatch(block); len(m) > 1 {
			durStr = cleanText(m[1])
		}
		if m := reCover.FindStringSubmatch(block); len(m) > 1 {
			coverURL = m[1]
		}

		if title == "" {
			title = "Без названия"
		}
		if artist == "" {
			artist = "Неизвестный исполнитель"
		}

		uniqueID := "online_" + hashStr(audioPath)
		streamProxyURL := fmt.Sprintf("/api/online/stream?url=%s&artist=%s&title=%s", url.QueryEscape(audioURL), url.QueryEscape(artist), url.QueryEscape(title))

		results = append(results, OnlineTrack{
			ID:         uniqueID,
			Title:      title,
			Artist:     artist,
			Duration:   parseDurationSec(durStr),
			DurStr:     durStr,
			CoverURL:   coverURL,
			AudioURL:   audioURL,
			StreamURL:  streamProxyURL,
			Source:     "hitmo",
			SourceName: "Hitmo",
		})
	}

	return results, nil
}

var proxyStreamClient = &http.Client{
	Timeout: 45 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  true,
	},
}

func (a *API) handleOnlineStream(w http.ResponseWriter, r *http.Request) {
	audioURL := r.URL.Query().Get("url")
	if audioURL == "" {
		http.Error(w, "Missing url", http.StatusBadRequest)
		return
	}

	req, err := http.NewRequest(r.Method, audioURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://rus.hitmotop.com/")

	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := proxyStreamClient.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			_ = resp.Body.Close()
		}
		artist := strings.TrimSpace(r.URL.Query().Get("artist"))
		title := strings.TrimSpace(r.URL.Query().Get("title"))
		if artist != "" || title != "" {
			q := strings.TrimSpace(artist + " " + title)
			if scTracks, scErr := a.searchSoundCloudTracks(q); scErr == nil && len(scTracks) > 0 {
				sc := scTracks[0]
				r.URL.RawQuery = "url=" + url.QueryEscape(sc.AudioURL)
				a.handleOnlineStreamSC(w, r)
				return
			}
			if ytTracks, ytErr := a.searchYouTubeTracks(q); ytErr == nil && len(ytTracks) > 0 {
				ytVid := strings.TrimPrefix(ytTracks[0].ID, "yt-")
				r.URL.RawQuery = "id=" + url.QueryEscape(ytVid)
				a.handleOnlineStreamYT(w, r)
				return
			}
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
		} else {
			http.Error(w, "Stream unavailable", http.StatusBadGateway)
		}
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=1800")
	w.WriteHeader(resp.StatusCode)

	flusher, canFlush := w.(http.Flusher)

	// Step 1: Immediate flush of first small header chunk (4KB) for instant playback start
	firstBuf := make([]byte, 4096)
	fn, fErr := resp.Body.Read(firstBuf)
	if fn > 0 {
		_, _ = w.Write(firstBuf[:fn])
		if canFlush {
			flusher.Flush()
		}
	}
	if fErr != nil {
		return
	}

	// Step 2: Stream remaining audio in progressive 32KB chunks
	buf := make([]byte, 32768)
	for {
		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
		}
		if rErr != nil {
			break
		}
	}
}

func (a *API) handleOnlineDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var item OnlineTrack
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil || (item.AudioURL == "" && item.ID == "") {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	actualAudioURL := item.AudioURL
	if strings.HasPrefix(actualAudioURL, "yandex://") || item.Source == "yandex" {
		tok := getYandexToken(a.storage.baseDir)
		if tok == "" {
			http.Error(w, "Yandex Music token missing in yandex_token.txt", http.StatusBadRequest)
			return
		}
		direct, err := getYandexDirectMP3(item.ID, tok)
		if err != nil {
			http.Error(w, "Failed to resolve Yandex stream: "+err.Error(), http.StatusBadGateway)
			return
		}
		actualAudioURL = direct
	} else if item.Source == "deezer" && item.Artist != "" && item.Title != "" {
		// Try to find full-length track on Hitmo or SoundCloud
		q := fmt.Sprintf("%s %s", item.Artist, item.Title)
		if hTracks, err := searchHitmo(q); err == nil && len(hTracks) > 0 && hTracks[0].AudioURL != "" {
			actualAudioURL = hTracks[0].AudioURL
		} else if scTracks, err := a.searchSoundCloudTracks(q); err == nil && len(scTracks) > 0 && scTracks[0].AudioURL != "" {
			actualAudioURL = scTracks[0].AudioURL
		}
	}

	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequest("GET", actualAudioURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	if strings.Contains(actualAudioURL, "hitmotop") {
		req.Header.Set("Referer", "https://rus.hitmotop.com/")
	}

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		http.Error(w, "Failed to download audio", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	trackID := fmt.Sprintf("%d-%s", time.Now().Unix(), hashStr(actualAudioURL)[:8])
	targetMP3 := filepath.Join(a.storage.audioDir, trackID+".mp3")

	f, err := os.Create(targetMP3)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	nBytes, err := io.Copy(f, resp.Body)
	_ = f.Close()
	if err != nil || nBytes < 1000 {
		_ = os.Remove(targetMP3)
		http.Error(w, "Failed to write audio", http.StatusInternalServerError)
		return
	}

	// Download cover if provided
	var coverBytes []byte
	hasCover := false
	if item.CoverURL != "" {
		creq, _ := http.NewRequest("GET", item.CoverURL, nil)
		creq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		cresp, cerr := client.Do(creq)
		if cerr == nil && cresp.StatusCode == http.StatusOK {
			cdata, _ := io.ReadAll(cresp.Body)
			_ = cresp.Body.Close()
			if len(cdata) > 500 {
				coverBytes = cdata
				hasCover = true
			}
		}
	}

	albumName := item.Album
	if albumName == "" {
		albumName = "Онлайн загрузка"
	}
	year := item.Year
	if year <= 0 {
		year = time.Now().Year()
	}

	newTrack := Track{
		ID:           trackID,
		Title:        item.Title,
		Artist:       item.Artist,
		Album:        albumName,
		Year:         year,
		Duration:     item.Duration,
		Format:       "MP3",
		IsLossless:   false,
		FileSize:     nBytes,
		HasCover:     hasCover,
		CoverExt:     "jpg",
		Filename:     trackID + ".mp3",
		OriginalName: fmt.Sprintf("%s - %s.mp3", item.Artist, item.Title),
		CreatedAt:    time.Now(),
	}

	if err := a.storage.AddTrack(newTrack, coverBytes); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"track":   newTrack,
	})
}

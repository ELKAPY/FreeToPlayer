package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var radioStreamClient = &http.Client{
	Timeout: 0,
	Transport: &http.Transport{
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		DisableCompression: true,
		MaxIdleConns:        100,
		IdleConnTimeout:     90 * time.Second,
	},
}

type RadioStation struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	StreamURL   string   `json:"streamUrl"`
	Favicon     string   `json:"favicon"`
	Country     string   `json:"country"`
	CountryCode string   `json:"countryCode"`
	Tags        []string `json:"tags"`
	Codec       string   `json:"codec"`
	Bitrate     int      `json:"bitrate"`
	Votes       int      `json:"votes"`
}

var radioBrowserHosts = []string{
	"all.api.radio-browser.info",
	"de1.api.radio-browser.info",
	"at1.api.radio-browser.info",
	"nl1.api.radio-browser.info",
}

func getRadioBrowserURL(path string) string {
	host := radioBrowserHosts[0]
	return fmt.Sprintf("https://%s%s", host, path)
}

func parseRadioStations(data []byte) []RadioStation {
	var rawList []struct {
		StationUUID string `json:"stationuuid"`
		Name        string `json:"name"`
		URL         string `json:"url"`
		URLResolved string `json:"url_resolved"`
		Favicon     string `json:"favicon"`
		Country     string `json:"country"`
		CountryCode string `json:"countrycode"`
		Tags        string `json:"tags"`
		Codec       string `json:"codec"`
		Bitrate     any    `json:"bitrate"`
		Votes       any    `json:"votes"`
	}

	if err := json.Unmarshal(data, &rawList); err != nil {
		return []RadioStation{}
	}

	stations := make([]RadioStation, 0, len(rawList))
	for _, s := range rawList {
		targetURL := s.URLResolved
		if targetURL == "" {
			targetURL = s.URL
		}
		if targetURL == "" {
			continue
		}

		name := strings.TrimSpace(s.Name)
		if name == "" {
			name = "Радиостанция"
		}

		rawTags := strings.Split(s.Tags, ",")
		tags := make([]string, 0, len(rawTags))
		for _, t := range rawTags {
			clean := strings.TrimSpace(t)
			if clean != "" && len(clean) < 25 {
				tags = append(tags, clean)
			}
		}

		bitrate := 0
		switch b := s.Bitrate.(type) {
		case float64:
			bitrate = int(b)
		case int:
			bitrate = b
		case string:
			bitrate, _ = strconv.Atoi(b)
		}

		votes := 0
		switch v := s.Votes.(type) {
		case float64:
			votes = int(v)
		case int:
			votes = v
		case string:
			votes, _ = strconv.Atoi(v)
		}

		// Always route radio streams through local proxy to bypass mixed-content and CORS blocks in WebView2
		streamProxy := "/api/online/radio/stream?url=" + url.QueryEscape(targetURL)

		stations = append(stations, RadioStation{
			ID:          s.StationUUID,
			Name:        name,
			URL:         targetURL,
			StreamURL:   streamProxy,
			Favicon:     s.Favicon,
			Country:     s.Country,
			CountryCode: s.CountryCode,
			Tags:        tags,
			Codec:       s.Codec,
			Bitrate:     bitrate,
			Votes:       votes,
		})
	}

	return stations
}

func fetchRadioStations(baseDir, path string) ([]RadioStation, error) {
	reqURL := getRadioBrowserURL(path)

	// 1. Try background Python requests helper (for resilient SSL & proxies on Windows 11)
	scriptPath := findPythonScript(baseDir, "radio_search.py")
	if abs, err := filepath.Abs(scriptPath); err == nil {
		scriptPath = abs
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, path)
	cmd.Dir = filepath.Dir(scriptPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	out, err := cmd.CombinedOutput()
	if err == nil && len(out) > 10 {
		stations := parseRadioStations(out)
		if len(stations) > 0 {
			return stations, nil
		}
	}

	// 2. Direct HTTP fallback
	client := &http.Client{Timeout: 8 * time.Second}
	req, errFallback := http.NewRequest("GET", reqURL, nil)
	if errFallback != nil {
		if err != nil {
			return []RadioStation{}, fmt.Errorf("python exec (%s %s) failed: %v, out: %s", scriptPath, path, err, string(out))
		}
		return []RadioStation{}, errFallback
	}
	req.Header.Set("User-Agent", "FreeToPlayer/1.0")
	req.Header.Set("Accept", "application/json")

	resp, errDo := client.Do(req)
	if errDo != nil {
		if err != nil {
			return []RadioStation{}, fmt.Errorf("python exec (%s %s) failed: %v, out: %s", scriptPath, path, err, string(out))
		}
		return []RadioStation{}, errDo
	}
	defer resp.Body.Close()

	body, errRead := io.ReadAll(resp.Body)
	if errRead != nil {
		return []RadioStation{}, errRead
	}

	return parseRadioStations(body), nil
}

func (a *API) handleRadioTop(w http.ResponseWriter, r *http.Request) {
	stations, err := fetchRadioStations(a.storage.baseDir, "/json/stations/topclick/40")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stations)
}

func (a *API) handleRadioByGenre(w http.ResponseWriter, r *http.Request) {
	tag := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tag")))
	if tag == "" {
		tag = "rock"
	}
	path := fmt.Sprintf("/json/stations/bytag/%s?limit=40&order=clickcount&reverse=true", url.PathEscape(tag))
	stations, err := fetchRadioStations(a.storage.baseDir, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stations)
}

func (a *API) handleRadioByCountry(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	if code == "" {
		code = "RU"
	}
	path := fmt.Sprintf("/json/stations/bycountrycodeexact/%s?limit=40&order=clickcount&reverse=true", url.PathEscape(code))
	stations, err := fetchRadioStations(a.storage.baseDir, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stations)
}

func (a *API) handleRadioSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]RadioStation{})
		return
	}
	path := fmt.Sprintf("/json/stations/search?name=%s&limit=40&order=clickcount&reverse=true", url.QueryEscape(query))
	stations, err := fetchRadioStations(a.storage.baseDir, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stations)
}

func (a *API) handleRadioStream(w http.ResponseWriter, r *http.Request) {
	streamURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if streamURL == "" {
		http.Error(w, "Missing url", http.StatusBadRequest)
		return
	}

	// Support Range requests from HTML5 Audio
	rangeHeader := r.Header.Get("Range")

	req, err := http.NewRequest(r.Method, streamURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Icy-MetaData", "1")
	req.Header.Set("Accept", "*/*")
	if rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	// Use stream client with TLS InsecureSkipVerify for live icecast/shoutcast streams
	resp, err := radioStreamClient.Do(req)
	if err != nil {
		http.Error(w, "Stream connection failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// If source redirected or returned m3u8 playlist, handle or pass through
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		if strings.HasSuffix(strings.ToLower(streamURL), ".m3u8") || strings.Contains(strings.ToLower(streamURL), "m3u8") {
			contentType = "application/vnd.apple.mpegurl"
		} else if strings.HasSuffix(strings.ToLower(streamURL), ".aac") {
			contentType = "audio/aac"
		} else if strings.HasSuffix(strings.ToLower(streamURL), ".ogg") {
			contentType = "audio/ogg"
		} else {
			contentType = "audio/mpeg"
		}
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Connection", "keep-alive")
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		w.Header().Set("Content-Range", cr)
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}

	w.WriteHeader(resp.StatusCode)

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 16384)
	for {
		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			_, wErr := w.Write(buf[:n])
			if wErr != nil {
				break
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if rErr != nil {
			break
		}
	}
}

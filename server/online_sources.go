package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type OnlineAlbum struct {
	ID         string        `json:"id"`
	Title      string        `json:"title"`
	Artist     string        `json:"artist"`
	Year       int           `json:"year"`
	TrackCount int           `json:"trackCount"`
	CoverURL   string        `json:"coverUrl"`
	Source     string        `json:"source"`
	SourceName string        `json:"sourceName"`
	Tracks     []OnlineTrack `json:"tracks,omitempty"`
}

type TrackVersion struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Artist       string  `json:"artist"`
	Album        string  `json:"album"`
	Duration     float64 `json:"duration"`
	DurStr       string  `json:"durStr"`
	CoverURL     string  `json:"coverUrl"`
	StreamURL    string  `json:"streamUrl"`
	AudioURL     string  `json:"audioUrl"`
	Source       string  `json:"source"`
	SourceName   string  `json:"sourceName"`
	VersionType  string  `json:"versionType"`
	VersionLabel string  `json:"versionLabel"`
	Similarity   int     `json:"similarity"`
	IsPreferred  bool    `json:"isPreferred"`
	IsDisliked   bool    `json:"isDisliked"`
}

type VersionPreferences struct {
	Preferred map[string]TrackVersion `json:"preferred"` // songKey -> TrackVersion
	Disliked  map[string][]string     `json:"disliked"`  // songKey -> slice of trackIDs / versionTypes
}

var (
	yandexTokenCache string
	yandexTokenOnce  sync.Once
)

func getYandexToken(baseDir string) string {
	yandexTokenOnce.Do(func() {
		// 1. Env variable
		if tok := os.Getenv("YANDEX_MUSIC_TOKEN"); tok != "" {
			yandexTokenCache = strings.TrimSpace(tok)
			return
		}
		// 2. Try looking in baseDir/.. (dj/yandex_token.txt)
		candidates := []string{
			filepath.Join(baseDir, "..", "yandex_token.txt"),
			filepath.Join(baseDir, "yandex_token.txt"),
			"yandex_token.txt",
			"../yandex_token.txt",
		}
		for _, cand := range candidates {
			if data, err := os.ReadFile(cand); err == nil {
				tok := strings.TrimSpace(string(data))
				if tok != "" {
					yandexTokenCache = tok
					return
				}
			}
		}
	})
	return yandexTokenCache
}

var (
	vkTokenCache string
	vkTokenOnce  sync.Once
)

func getVKToken(baseDir string) string {
	vkTokenOnce.Do(func() {
		if tok := os.Getenv("VK_ACCESS_TOKEN"); tok != "" {
			vkTokenCache = strings.TrimSpace(tok)
			return
		}
		candidates := []string{
			filepath.Join(baseDir, "..", "vk_token.txt"),
			filepath.Join(baseDir, "vk_token.txt"),
			"vk_token.txt",
			"../vk_token.txt",
		}
		for _, cand := range candidates {
			if data, err := os.ReadFile(cand); err == nil {
				tok := strings.TrimSpace(string(data))
				if tok != "" {
					vkTokenCache = tok
					return
				}
			}
		}
	})
	return vkTokenCache
}

func formatID(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return fmt.Sprintf("%.0f", val)
	case int:
		return fmt.Sprintf("%d", val)
	case int64:
		return fmt.Sprintf("%d", val)
	case json.Number:
		return val.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

// Yandex Music API client
func searchYandexTracks(query, token string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)

	client := &http.Client{Timeout: 8 * time.Second}
	// Fetch up to 100 tracks (page 0 gives rich catalog)
	reqURL := fmt.Sprintf("https://api.music.yandex.net/search?text=%s&type=track&page=0", url.QueryEscape(query))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return results, nil
	}
	if token != "" {
		req.Header.Set("Authorization", "OAuth "+token)
	}
	req.Header.Set("User-Agent", "YandexMusic/FreeToPlayer (Windows NT 10.0; Win64; x64)")

	resp, err := client.Do(req)
	if err != nil {
		return results, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return results, nil
	}

	var root struct {
		Result struct {
			Tracks *struct {
				Results []struct {
					ID         any    `json:"id"`
					Title      string `json:"title"`
					Version    string `json:"version"`
					DurationMs any    `json:"durationMs"`
					CoverURI   string `json:"coverUri"`
					Artists    []struct {
						Name string `json:"name"`
					} `json:"artists"`
					Albums []struct {
						Title string `json:"title"`
						Year  int    `json:"year"`
					} `json:"albums"`
				} `json:"results"`
			} `json:"tracks"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return results, nil
	}

	if root.Result.Tracks == nil || len(root.Result.Tracks.Results) == 0 {
		return results, nil
	}

	for _, t := range root.Result.Tracks.Results {
		trackID := formatID(t.ID)
		if trackID == "" || trackID == "<nil>" {
			continue
		}

		artists := make([]string, 0, len(t.Artists))
		for _, a := range t.Artists {
			artists = append(artists, a.Name)
		}
		artistName := strings.Join(artists, ", ")
		if artistName == "" {
			artistName = "Неизвестный исполнитель"
		}

		title := t.Title
		if title == "" {
			title = "Без названия"
		}
		if t.Version != "" {
			title = fmt.Sprintf("%s (%s)", title, t.Version)
		}

		albumTitle := ""
		year := 0
		if len(t.Albums) > 0 {
			albumTitle = t.Albums[0].Title
			year = t.Albums[0].Year
		}

		coverURL := ""
		if t.CoverURI != "" {
			coverURL = "https://" + strings.ReplaceAll(t.CoverURI, "%%", "400x400")
		}

		var durSec float64
		switch d := t.DurationMs.(type) {
		case float64:
			durSec = d / 1000.0
		case int:
			durSec = float64(d) / 1000.0
		case json.Number:
			if n, err := d.Float64(); err == nil {
				durSec = n / 1000.0
			}
		}

		durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)

		results = append(results, OnlineTrack{
			ID:         "ya_" + trackID,
			Title:      title,
			Artist:     artistName,
			Album:      albumTitle,
			Year:       year,
			Duration:   durSec,
			DurStr:     durStr,
			CoverURL:   coverURL,
			AudioURL:   "yandex://" + trackID,
			StreamURL:  "/api/online/stream-yandex?id=" + trackID,
			Source:     "yandex",
			SourceName: "Яндекс Музыка",
			Version:    t.Version,
		})
	}

	return results, nil
}

func runOnlineAlbumsHelper(baseDir, action string, args ...string) ([]byte, error) {
	scriptPath := findPythonScript(baseDir, "online_albums.py")
	if abs, err := filepath.Abs(scriptPath); err == nil {
		scriptPath = abs
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmdArgs := append([]string{scriptPath, action}, args...)
	cmd := exec.CommandContext(ctx, getPythonExe(), cmdArgs...)
	cmd.Dir = filepath.Dir(scriptPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	return cmd.Output()
}

func searchYandexAlbums(baseDir, query, token string) ([]OnlineAlbum, error) {
	albums := make([]OnlineAlbum, 0)
	if token == "" {
		return albums, nil
	}

	// 1. Try background Python helper (yandex_music client has resilient SSL session)
	if out, err := runOnlineAlbumsHelper(baseDir, "search_yandex", query, token); err == nil && len(out) > 0 {
		var pyAlbums []OnlineAlbum
		if err := json.Unmarshal(out, &pyAlbums); err == nil && len(pyAlbums) > 0 {
			return pyAlbums, nil
		}
	}

	// 2. Direct HTTP fallback
	client := &http.Client{Timeout: 8 * time.Second}
	reqURL := fmt.Sprintf("https://api.music.yandex.net/search?text=%s&type=album&page=0", url.QueryEscape(query))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return albums, nil
	}
	req.Header.Set("Authorization", "OAuth "+token)
	req.Header.Set("User-Agent", "YandexMusic/FreeToPlayer")

	resp, err := client.Do(req)
	if err != nil {
		return albums, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return albums, nil
	}

	var root struct {
		Result struct {
			Albums *struct {
				Results []struct {
					ID         any    `json:"id"`
					Title      string `json:"title"`
					Year       int    `json:"year"`
					TrackCount int    `json:"trackCount"`
					CoverURI   string `json:"coverUri"`
					Artists    []struct {
						Name string `json:"name"`
					} `json:"artists"`
				} `json:"results"`
			} `json:"albums"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return albums, nil
	}

	if root.Result.Albums == nil || len(root.Result.Albums.Results) == 0 {
		return albums, nil
	}

	for _, a := range root.Result.Albums.Results {
		albID := formatID(a.ID)
		if albID == "" || albID == "<nil>" {
			continue
		}

		artists := make([]string, 0, len(a.Artists))
		for _, art := range a.Artists {
			artists = append(artists, art.Name)
		}
		artistName := strings.Join(artists, ", ")
		if artistName == "" {
			artistName = "Разные исполнители"
		}

		coverURL := ""
		if a.CoverURI != "" {
			coverURL = "https://" + strings.ReplaceAll(a.CoverURI, "%%", "400x400")
		}

		albums = append(albums, OnlineAlbum{
			ID:         "ya_alb_" + albID,
			Title:      a.Title,
			Artist:     artistName,
			Year:       a.Year,
			TrackCount: a.TrackCount,
			CoverURL:   coverURL,
			Source:     "yandex",
			SourceName: "Яндекс Музыка",
		})
	}

	return albums, nil
}

func getYandexAlbumWithTracks(baseDir, albumID, token string) (*OnlineAlbum, error) {
	if token == "" {
		return nil, fmt.Errorf("no yandex token")
	}

	// 1. Try background Python helper
	if out, err := runOnlineAlbumsHelper(baseDir, "get_yandex", albumID, token); err == nil && len(out) > 0 {
		var alb OnlineAlbum
		if err := json.Unmarshal(out, &alb); err == nil && len(alb.Tracks) > 0 {
			return &alb, nil
		}
	}

	// 2. Direct HTTP fallback
	cleanID := strings.TrimPrefix(albumID, "ya_alb_")
	client := &http.Client{Timeout: 10 * time.Second}
	reqURL := fmt.Sprintf("https://api.music.yandex.net/albums/%s/with-tracks", cleanID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "OAuth "+token)
	req.Header.Set("User-Agent", "YandexMusic/FreeToPlayer")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var root struct {
		Result struct {
			ID         any    `json:"id"`
			Title      string `json:"title"`
			Year       int    `json:"year"`
			TrackCount int    `json:"trackCount"`
			CoverURI   string `json:"coverUri"`
			Artists    []struct {
				Name string `json:"name"`
			} `json:"artists"`
			Volumes [][]struct {
				ID         any    `json:"id"`
				Title      string `json:"title"`
				Version    string `json:"version"`
				DurationMs int    `json:"durationMs"`
				CoverURI   string `json:"coverUri"`
				Artists    []struct {
					Name string `json:"name"`
				} `json:"artists"`
			} `json:"volumes"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return nil, err
	}

	res := root.Result
	albCover := ""
	if res.CoverURI != "" {
		albCover = "https://" + strings.ReplaceAll(res.CoverURI, "%%", "400x400")
	}

	albArtists := make([]string, 0, len(res.Artists))
	for _, art := range res.Artists {
		albArtists = append(albArtists, art.Name)
	}
	albArtistName := strings.Join(albArtists, ", ")

	album := &OnlineAlbum{
		ID:         "ya_alb_" + fmt.Sprintf("%v", res.ID),
		Title:      res.Title,
		Artist:     albArtistName,
		Year:       res.Year,
		TrackCount: res.TrackCount,
		CoverURL:   albCover,
		Source:     "yandex",
		SourceName: "Яндекс Музыка",
		Tracks:     make([]OnlineTrack, 0),
	}

	for _, vol := range res.Volumes {
		for _, t := range vol {
			trackID := fmt.Sprintf("%v", t.ID)
			tArtists := make([]string, 0, len(t.Artists))
			for _, a := range t.Artists {
				tArtists = append(tArtists, a.Name)
			}
			tArtist := strings.Join(tArtists, ", ")
			if tArtist == "" {
				tArtist = albArtistName
			}

			trackTitle := t.Title
			if t.Version != "" {
				trackTitle = fmt.Sprintf("%s (%s)", trackTitle, t.Version)
			}

			durSec := float64(t.DurationMs) / 1000.0
			durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)

			tCover := albCover
			if t.CoverURI != "" {
				tCover = "https://" + strings.ReplaceAll(t.CoverURI, "%%", "400x400")
			}

			album.Tracks = append(album.Tracks, OnlineTrack{
				ID:         "ya_" + trackID,
				Title:      trackTitle,
				Artist:     tArtist,
				Album:      res.Title,
				Year:       res.Year,
				Duration:   durSec,
				DurStr:     durStr,
				CoverURL:   tCover,
				AudioURL:   "yandex://" + trackID,
				StreamURL:  "/api/online/stream-yandex?id=" + trackID,
				Source:     "yandex",
				SourceName: "Яндекс Музыка",
				Version:    t.Version,
			})
		}
	}

	return album, nil
}

func searchDeezerAlbums(baseDir, query string) ([]OnlineAlbum, error) {
	albums := make([]OnlineAlbum, 0)

	// 1. Try background Python helper (avoids Windows 11 TCP/TLS block on deezer.com)
	if out, err := runOnlineAlbumsHelper(baseDir, "search_deezer", query); err == nil && len(out) > 0 {
		var pyAlbums []OnlineAlbum
		if err := json.Unmarshal(out, &pyAlbums); err == nil && len(pyAlbums) > 0 {
			return pyAlbums, nil
		}
	}

	// 2. Direct HTTP fallback
	client := &http.Client{Timeout: 8 * time.Second}
	reqURL := fmt.Sprintf("https://api.deezer.com/search/album?q=%s&limit=25", url.QueryEscape(query))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return albums, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return albums, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return albums, fmt.Errorf("deezer returned %d", resp.StatusCode)
	}

	var root struct {
		Data []struct {
			ID       int64  `json:"id"`
			Title    string `json:"title"`
			CoverXL  string `json:"cover_xl"`
			CoverBig string `json:"cover_big"`
			CoverMed string `json:"cover_medium"`
			NbTracks int    `json:"nb_tracks"`
			Artist   struct {
				Name string `json:"name"`
			} `json:"artist"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return albums, err
	}

	for _, item := range root.Data {
		cov := item.CoverXL
		if cov == "" {
			cov = item.CoverBig
		}
		if cov == "" {
			cov = item.CoverMed
		}
		artistName := strings.TrimSpace(item.Artist.Name)
		if artistName == "" {
			artistName = "Разные исполнители"
		}

		albums = append(albums, OnlineAlbum{
			ID:         fmt.Sprintf("dz_alb_%d", item.ID),
			Title:      item.Title,
			Artist:     artistName,
			TrackCount: item.NbTracks,
			CoverURL:   cov,
			Source:     "deezer",
			SourceName: "Deezer",
		})
	}

	return albums, nil
}

func getDeezerAlbumWithTracks(baseDir, albumID string) (*OnlineAlbum, error) {
	// 1. Try background Python helper
	if out, err := runOnlineAlbumsHelper(baseDir, "get_deezer", albumID); err == nil && len(out) > 0 {
		var alb OnlineAlbum
		if err := json.Unmarshal(out, &alb); err == nil && len(alb.Tracks) > 0 {
			return &alb, nil
		}
	}

	// 2. Direct HTTP fallback
	cleanID := strings.TrimPrefix(albumID, "dz_alb_")
	client := &http.Client{Timeout: 10 * time.Second}
	reqURL := fmt.Sprintf("https://api.deezer.com/album/%s", cleanID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("deezer returned %d", resp.StatusCode)
	}

	var root struct {
		ID          int64  `json:"id"`
		Title       string `json:"title"`
		ReleaseDate string `json:"release_date"`
		CoverXL     string `json:"cover_xl"`
		CoverBig    string `json:"cover_big"`
		CoverMed    string `json:"cover_medium"`
		NbTracks    int    `json:"nb_tracks"`
		Artist      struct {
			Name string `json:"name"`
		} `json:"artist"`
		Tracks struct {
			Data []struct {
				ID       int64  `json:"id"`
				Title    string `json:"title"`
				Duration int    `json:"duration"`
				Preview  string `json:"preview"`
				Artist   struct {
					Name string `json:"name"`
				} `json:"artist"`
			} `json:"data"`
		} `json:"tracks"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return nil, err
	}

	cov := root.CoverXL
	if cov == "" {
		cov = root.CoverBig
	}
	if cov == "" {
		cov = root.CoverMed
	}
	albArtist := strings.TrimSpace(root.Artist.Name)
	if albArtist == "" {
		albArtist = "Разные исполнители"
	}

	year := 0
	if len(root.ReleaseDate) >= 4 {
		year, _ = strconv.Atoi(root.ReleaseDate[:4])
	}

	album := &OnlineAlbum{
		ID:         fmt.Sprintf("dz_alb_%d", root.ID),
		Title:      root.Title,
		Artist:     albArtist,
		Year:       year,
		TrackCount: root.NbTracks,
		CoverURL:   cov,
		Source:     "deezer",
		SourceName: "Deezer",
		Tracks:     make([]OnlineTrack, 0, len(root.Tracks.Data)),
	}

	for _, t := range root.Tracks.Data {
		trackArtist := strings.TrimSpace(t.Artist.Name)
		if trackArtist == "" {
			trackArtist = albArtist
		}
		durSec := float64(t.Duration)
		durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
		trackID := fmt.Sprintf("%d", t.ID)

		streamURL := "/api/online/stream-deezer?id=" + trackID +
			"&title=" + url.QueryEscape(t.Title) +
			"&artist=" + url.QueryEscape(trackArtist)
		if t.Preview != "" {
			streamURL += "&preview=" + url.QueryEscape(t.Preview)
		}

		audioURL := t.Preview
		if audioURL == "" {
			audioURL = streamURL
		}

		album.Tracks = append(album.Tracks, OnlineTrack{
			ID:         "dz_" + trackID,
			Title:      t.Title,
			Artist:     trackArtist,
			Album:      root.Title,
			Year:       year,
			Duration:   durSec,
			DurStr:     durStr,
			CoverURL:   cov,
			AudioURL:   audioURL,
			StreamURL:  streamURL,
			Source:     "deezer",
			SourceName: "Deezer",
		})
	}

	return album, nil
}

func searchAudiusAlbums(baseDir, query string) ([]OnlineAlbum, error) {
	albums := make([]OnlineAlbum, 0)

	// 1. Try background Python helper
	if out, err := runOnlineAlbumsHelper(baseDir, "search_audius", query); err == nil && len(out) > 0 {
		var pyAlbums []OnlineAlbum
		if err := json.Unmarshal(out, &pyAlbums); err == nil && len(pyAlbums) > 0 {
			return pyAlbums, nil
		}
	}

	// 2. Direct HTTP fallback
	client := &http.Client{Timeout: 6 * time.Second}
	reqURL := fmt.Sprintf("https://discoveryprovider.audius.co/v1/playlists/search?query=%s&app_name=FreeToPlayer", url.QueryEscape(query))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return albums, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return albums, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return albums, fmt.Errorf("audius returned %d", resp.StatusCode)
	}

	var root struct {
		Data []struct {
			ID           string `json:"id"`
			PlaylistName string `json:"playlist_name"`
			TrackCount   int    `json:"track_count"`
			Artwork      struct {
				Img1000 string `json:"1000x1000"`
				Img480  string `json:"480x480"`
				Img150  string `json:"150x150"`
			} `json:"artwork"`
			User struct {
				Name string `json:"name"`
			} `json:"user"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return albums, err
	}

	for _, item := range root.Data {
		cov := item.Artwork.Img480
		if cov == "" {
			cov = item.Artwork.Img1000
		}
		if cov == "" {
			cov = item.Artwork.Img150
		}
		artist := strings.TrimSpace(item.User.Name)
		if artist == "" {
			artist = "Audius Creator"
		}

		albums = append(albums, OnlineAlbum{
			ID:         "aud_alb_" + item.ID,
			Title:      item.PlaylistName,
			Artist:     artist,
			TrackCount: item.TrackCount,
			CoverURL:   cov,
			Source:     "audius",
			SourceName: "Audius",
		})
	}

	return albums, nil
}

func getAudiusAlbumWithTracks(baseDir, albumID string) (*OnlineAlbum, error) {
	// 1. Try background Python helper
	if out, err := runOnlineAlbumsHelper(baseDir, "get_audius", albumID); err == nil && len(out) > 0 {
		var alb OnlineAlbum
		if err := json.Unmarshal(out, &alb); err == nil && len(alb.Tracks) > 0 {
			return &alb, nil
		}
	}

	// 2. Direct HTTP fallback
	cleanID := strings.TrimPrefix(albumID, "aud_alb_")
	client := &http.Client{Timeout: 10 * time.Second}
	reqURL := fmt.Sprintf("https://discoveryprovider.audius.co/v1/playlists/%s/tracks?app_name=FreeToPlayer", cleanID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("audius returned %d", resp.StatusCode)
	}

	var root struct {
		Data []struct {
			ID       any    `json:"id"`
			Title    string `json:"title"`
			Duration any    `json:"duration"`
			User     *struct {
				Name string `json:"name"`
			} `json:"user"`
			Artwork *struct {
				Size150  string `json:"150x150"`
				Size480  string `json:"480x480"`
				Size1000 string `json:"1000x1000"`
			} `json:"artwork"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return nil, err
	}

	album := &OnlineAlbum{
		ID:         albumID,
		Title:      "Audius Playlist",
		Artist:     "Audius",
		TrackCount: len(root.Data),
		Source:     "audius",
		SourceName: "Audius",
		Tracks:     make([]OnlineTrack, 0, len(root.Data)),
	}

	for _, t := range root.Data {
		trackID := formatID(t.ID)
		if trackID == "" || trackID == "<nil>" {
			continue
		}
		cov := ""
		if t.Artwork != nil {
			cov = t.Artwork.Size480
			if cov == "" {
				cov = t.Artwork.Size1000
			}
			if cov == "" {
				cov = t.Artwork.Size150
			}
		}
		if album.CoverURL == "" && cov != "" {
			album.CoverURL = cov
		}
		tArtist := "Audius Artist"
		if t.User != nil && strings.TrimSpace(t.User.Name) != "" {
			tArtist = strings.TrimSpace(t.User.Name)
		}
		if album.Artist == "Audius" && tArtist != "Audius Artist" {
			album.Artist = tArtist
		}

		var durSec float64
		switch d := t.Duration.(type) {
		case float64:
			durSec = d
		case int:
			durSec = float64(d)
		case json.Number:
			if n, err := d.Float64(); err == nil {
				durSec = n
			}
		}

		durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
		streamRaw := fmt.Sprintf("https://discoveryprovider.audius.co/v1/tracks/%s/stream?app_name=FreeToPlayer", trackID)
		streamProxy := "/api/online/stream?url=" + url.QueryEscape(streamRaw)

		album.Tracks = append(album.Tracks, OnlineTrack{
			ID:         "aud_" + trackID,
			Title:      t.Title,
			Artist:     tArtist,
			Album:      album.Title,
			Duration:   durSec,
			DurStr:     durStr,
			CoverURL:   cov,
			AudioURL:   streamRaw,
			StreamURL:  streamProxy,
			Source:     "audius",
			SourceName: "Audius",
		})
	}

	return album, nil
}

func getYandexDirectMP3(trackID, token string) (string, error) {
	cleanID := strings.TrimPrefix(trackID, "ya_")
	client := &http.Client{Timeout: 10 * time.Second}

	reqURL := fmt.Sprintf("https://api.music.yandex.net/tracks/%s/download-info", cleanID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "OAuth "+token)
	req.Header.Set("User-Agent", "YandexMusic/FreeToPlayer")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var root struct {
		Result []struct {
			Codec           string `json:"codec"`
			BitrateInKbps   int    `json:"bitrateInKbps"`
			DownloadInfoURL string `json:"downloadInfoUrl"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return "", err
	}

	if len(root.Result) == 0 {
		return "", fmt.Errorf("no download info available")
	}

	// Choose best mp3 or first item
	var bestURL string
	maxBitrate := -1
	for _, item := range root.Result {
		if item.Codec == "mp3" && item.BitrateInKbps > maxBitrate {
			maxBitrate = item.BitrateInKbps
			bestURL = item.DownloadInfoURL
		}
	}
	if bestURL == "" {
		bestURL = root.Result[0].DownloadInfoURL
	}

	// Fetch XML
	xreq, err := http.NewRequest("GET", bestURL, nil)
	if err != nil {
		return "", err
	}
	xreq.Header.Set("Authorization", "OAuth "+token)
	xreq.Header.Set("User-Agent", "YandexMusic/FreeToPlayer")

	xresp, err := client.Do(xreq)
	if err != nil {
		return "", err
	}
	defer xresp.Body.Close()

	var xmlData struct {
		XMLName xml.Name `xml:"download-info"`
		Host    string   `xml:"host"`
		Path    string   `xml:"path"`
		Ts      string   `xml:"ts"`
		S       string   `xml:"s"`
	}

	if err := xml.NewDecoder(xresp.Body).Decode(&xmlData); err != nil {
		return "", err
	}

	// MD5 calculation: secret "XGRDFqqUZBzsgGridASE" + path[1:] + s
	signSecret := "XGRDFqqUZBzsgGridASE"
	signTarget := signSecret + strings.TrimPrefix(xmlData.Path, "/") + xmlData.S
	h := md5.Sum([]byte(signTarget))
	sign := hex.EncodeToString(h[:])

	directURL := fmt.Sprintf("https://%s/get-mp3/%s/%s%s", xmlData.Host, sign, xmlData.Ts, xmlData.Path)
	return directURL, nil
}

// Audius open search
func searchAudiusTracks(query string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)
	client := &http.Client{Timeout: 3 * time.Second}
	reqURL := fmt.Sprintf("https://discoveryprovider.audius.co/v1/tracks/search?query=%s&app_name=FreeToPlayer", url.QueryEscape(query))

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return results, nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return results, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return results, nil
	}

	var root struct {
		Data []struct {
			ID       any    `json:"id"`
			Title    string `json:"title"`
			Duration any    `json:"duration"`
			User     *struct {
				Name string `json:"name"`
			} `json:"user"`
			Artwork  *struct {
				Size150 string `json:"150x150"`
				Size480 string `json:"480x480"`
			} `json:"artwork"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return results, nil
	}

	for _, t := range root.Data {
		trackID := formatID(t.ID)
		if trackID == "" || trackID == "<nil>" {
			continue
		}

		cover := ""
		if t.Artwork != nil {
			if t.Artwork.Size480 != "" {
				cover = t.Artwork.Size480
			} else {
				cover = t.Artwork.Size150
			}
		}

		artistName := "Неизвестный исполнитель"
		if t.User != nil && strings.TrimSpace(t.User.Name) != "" {
			artistName = strings.TrimSpace(t.User.Name)
		}

		title := strings.TrimSpace(t.Title)
		if title == "" {
			title = "Без названия"
		}

		var durSec float64
		switch d := t.Duration.(type) {
		case float64:
			durSec = d
		case int:
			durSec = float64(d)
		case json.Number:
			if n, err := d.Float64(); err == nil {
				durSec = n
			}
		}

		durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
		streamRaw := fmt.Sprintf("https://discoveryprovider.audius.co/v1/tracks/%s/stream?app_name=FreeToPlayer", trackID)
		streamProxy := "/api/online/stream?url=" + url.QueryEscape(streamRaw)

		results = append(results, OnlineTrack{
			ID:         "aud_" + trackID,
			Title:      title,
			Artist:     artistName,
			Duration:   durSec,
			DurStr:     durStr,
			CoverURL:   cover,
			AudioURL:   streamRaw,
			StreamURL:  streamProxy,
			Source:     "audius",
			SourceName: "Audius",
		})
	}

	return results, nil
}

// VK Music API search
func searchVKTracks(query, token string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)
	if token == "" {
		return results, nil
	}

	client := &http.Client{Timeout: 8 * time.Second}
	reqURL := fmt.Sprintf("https://api.vk.com/method/audio.search?q=%s&access_token=%s&v=5.131&count=25", url.QueryEscape(query), token)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return results, nil
	}
	req.Header.Set("User-Agent", "VKAndroidApp/8.25-16323")

	resp, err := client.Do(req)
	if err != nil {
		return results, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return results, nil
	}

	var root struct {
		Response struct {
			Items []struct {
				ID       any    `json:"id"`
				OwnerID  any    `json:"owner_id"`
				Artist   string `json:"artist"`
				Title    string `json:"title"`
				Duration int    `json:"duration"`
				URL      string `json:"url"`
				Thumb    *struct {
					Photo300 string `json:"photo_300"`
					Photo135 string `json:"photo_135"`
				} `json:"thumb"`
			} `json:"items"`
		} `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&root); err != nil {
		return results, nil
	}

	for _, it := range root.Response.Items {
		if it.URL == "" {
			continue
		}
		cover := ""
		if it.Thumb != nil {
			if it.Thumb.Photo300 != "" {
				cover = it.Thumb.Photo300
			} else {
				cover = it.Thumb.Photo135
			}
		}

		tid := fmt.Sprintf("vk_%v_%v", it.OwnerID, it.ID)
		durSec := float64(it.Duration)
		durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
		streamProxy := "/api/online/stream?url=" + url.QueryEscape(it.URL)

		results = append(results, OnlineTrack{
			ID:         tid,
			Title:      it.Title,
			Artist:     it.Artist,
			Duration:   durSec,
			DurStr:     durStr,
			CoverURL:   cover,
			AudioURL:   it.URL,
			StreamURL:  streamProxy,
			Source:     "vk",
			SourceName: "VK Музыка",
		})
	}

	return results, nil
}

var (
	pythonExePath string
	pythonExeOnce sync.Once
)

func getPythonExe() string {
	pythonExeOnce.Do(func() {
		candidates := []string{}
		if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
			candidates = append(candidates,
				filepath.Join(localApp, "Python", "bin", "python.exe"),
				filepath.Join(localApp, "Python", "pythoncore-3.14-64", "python.exe"),
				filepath.Join(localApp, "Programs", "Python", "Python312", "python.exe"),
			)
		}
		candidates = append(candidates, "python", "python3")

		for _, c := range candidates {
			if strings.Contains(c, "\\") {
				if _, err := os.Stat(c); err != nil {
					continue
				}
			}
			cmd := exec.Command(c, "-c", "import bs4, requests; print('OK')")
			cmd.SysProcAttr = &syscall.SysProcAttr{
				HideWindow:    true,
				CreationFlags: 0x08000000,
			}
			out, err := cmd.Output()
			if err == nil && strings.Contains(string(out), "OK") {
				pythonExePath = c
				return
			}
		}
		pythonExePath = "python"
	})
	return pythonExePath
}

func findPythonScript(baseDir, name string) string {
	candidates := []string{
		filepath.Join(baseDir, "server", name),
		filepath.Join(baseDir, name),
		filepath.Join(baseDir, "..", "server", name),
		filepath.Join(baseDir, "..", name),
		filepath.Join("server", name),
		name,
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "server", name),
			filepath.Join(exeDir, name),
			filepath.Join(exeDir, "..", "server", name),
			filepath.Join(exeDir, "..", name),
		)
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return name
}

// SoundCloud search client via background Python helper (OpenSSL TLS avoids Cloudflare handshake timeout)
func (a *API) searchSoundCloudTracks(query string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)
	scriptPath := findPythonScript(a.storage.baseDir, "soundcloud_search.py")

	ctx, cancel := context.WithTimeout(context.Background(), 4500*time.Millisecond)
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
	return results, nil
}

func (a *API) resolveSoundCloudDirectURL(targetURL, auth string, trackIDOpt ...string) string {
	if strings.Contains(targetURL, "sndcdn.com") || strings.Contains(targetURL, ".mp3") {
		return targetURL
	}
	trackID := ""
	if len(trackIDOpt) > 0 {
		trackID = trackIDOpt[0]
	}
	scriptPath := findPythonScript(a.storage.baseDir, "soundcloud_stream.py")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, targetURL, auth, trackID)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	out, err := cmd.Output()
	if err == nil {
		res := strings.TrimSpace(string(out))
		if strings.HasPrefix(res, "http") {
			return res
		}
	}

	const clientID = "F4NBFDqtGCLXXsV1EvDyDg27XXRYDdKh"
	if targetURL != "" && (strings.Contains(targetURL, "api-v2.soundcloud.com") || strings.Contains(targetURL, "api.soundcloud.com")) {
		sep := "?"
		if strings.Contains(targetURL, "?") {
			sep = "&"
		}
		resolveURL := fmt.Sprintf("%s%sclient_id=%s", targetURL, sep, clientID)
		if auth != "" {
			resolveURL += "&track_authorization=" + url.QueryEscape(auth)
		}
		client := &http.Client{Timeout: 4 * time.Second}
		req, _ := http.NewRequest("GET", resolveURL, nil)
		if req != nil {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
			req.Header.Set("Accept", "application/json, text/plain, */*")
			if resp, err := client.Do(req); err == nil && resp.StatusCode == http.StatusOK {
				var data struct {
					URL string `json:"url"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&data)
				resp.Body.Close()
				if data.URL != "" {
					return data.URL
				}
			}
		}
	}

	cleanTID := strings.TrimPrefix(trackID, "sc_")
	if cleanTID != "" {
		tURL := fmt.Sprintf("https://api-v2.soundcloud.com/tracks/%s?client_id=%s", cleanTID, clientID)
		client := &http.Client{Timeout: 4 * time.Second}
		req, _ := http.NewRequest("GET", tURL, nil)
		if req != nil {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
			if resp, err := client.Do(req); err == nil && resp.StatusCode == http.StatusOK {
				var tData struct {
					TrackAuth string `json:"track_authorization"`
					Media     struct {
						Transcodings []struct {
							Format struct {
								Protocol string `json:"protocol"`
							} `json:"format"`
							URL string `json:"url"`
						} `json:"transcodings"`
					} `json:"media"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&tData)
				resp.Body.Close()

				var progURL string
				for _, m := range tData.Media.Transcodings {
					if m.Format.Protocol == "progressive" && m.URL != "" {
						progURL = m.URL
						break
					}
				}
				if progURL == "" && len(tData.Media.Transcodings) > 0 {
					progURL = tData.Media.Transcodings[0].URL
				}
				if progURL != "" {
					sep := "?"
					if strings.Contains(progURL, "?") {
						sep = "&"
					}
					ru := fmt.Sprintf("%s%sclient_id=%s", progURL, sep, clientID)
					if tData.TrackAuth != "" {
						ru += "&track_authorization=" + url.QueryEscape(tData.TrackAuth)
					}
					r2, err2 := http.NewRequest("GET", ru, nil)
					if err2 == nil {
						r2.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
						if resp2, err3 := client.Do(r2); err3 == nil && resp2.StatusCode == http.StatusOK {
							var direct struct {
								URL string `json:"url"`
							}
							_ = json.NewDecoder(resp2.Body).Decode(&direct)
							resp2.Body.Close()
							if direct.URL != "" {
								return direct.URL
							}
						}
					}
				}
			}
		}
	}

	return ""
}

// SoundCloud progressive audio stream handler
func (a *API) handleOnlineStreamSC(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	auth := r.URL.Query().Get("auth")
	trackID := r.URL.Query().Get("id")
	if targetURL == "" && trackID == "" {
		http.Error(w, "Missing url or id", http.StatusBadRequest)
		return
	}

	directURL := a.resolveSoundCloudDirectURL(targetURL, auth, trackID)
	if directURL == "" {
		http.Error(w, "Failed to resolve SoundCloud stream", http.StatusBadGateway)
		return
	}

	reqProxy, err := http.NewRequest(r.Method, directURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	reqProxy.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		reqProxy.Header.Set("Range", rangeHeader)
	}

	respProxy, err := proxyStreamClient.Do(reqProxy)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer respProxy.Body.Close()

	for k, vv := range respProxy.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=1800")
	w.WriteHeader(respProxy.StatusCode)

	flusher, canFlush := w.(http.Flusher)

	// Immediate flush of first 4KB chunk for instant start
	firstBuf := make([]byte, 4096)
	fn, fErr := respProxy.Body.Read(firstBuf)
	if fn > 0 {
		_, _ = w.Write(firstBuf[:fn])
		if canFlush {
			flusher.Flush()
		}
	}
	if fErr != nil {
		return
	}

	buf := make([]byte, 32768)
	for {
		n, rErr := respProxy.Body.Read(buf)
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

func (a *API) downloadSoundCloudAudio(targetURL, auth, trackID string) ([]byte, error) {
	cleanTID := strings.TrimPrefix(trackID, "sc_")
	scriptPath := findPythonScript(a.storage.baseDir, "soundcloud_stream.py")

	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("sc_dl_%s_%d.mp3", cleanTID, time.Now().UnixNano()))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, "--download", targetURL, auth, cleanTID, tmpFile)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	_ = cmd.Run()

	if info, err := os.Stat(tmpFile); err == nil && info.Size() > 1000 {
		data, rErr := os.ReadFile(tmpFile)
		_ = os.Remove(tmpFile)
		if rErr == nil {
			return data, nil
		}
	}
	_ = os.Remove(tmpFile)

	// Fallback to direct URL resolution + HTTP
	directURL := a.resolveSoundCloudDirectURL(targetURL, auth, cleanTID)
	if directURL != "" {
		client := &http.Client{Timeout: 30 * time.Second}
		req, err := http.NewRequest("GET", directURL, nil)
		if err == nil {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
			req.Header.Set("Accept", "*/*")
			resp, err := client.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				data, rErr := io.ReadAll(resp.Body)
				resp.Body.Close()
				if rErr == nil && len(data) > 1000 {
					return data, nil
				}
			} else if resp != nil {
				resp.Body.Close()
			}
		}
	}

	return nil, fmt.Errorf("failed to download soundcloud audio for track %s", cleanTID)
}

func (a *API) resolveYouTubeDirectURL(videoID string) string {
	cleanID := strings.TrimPrefix(videoID, "yt-")
	if cleanID == "" {
		return ""
	}
	if strings.HasPrefix(cleanID, "http") && (strings.Contains(cleanID, "googlevideo.com") || strings.Contains(cleanID, ".mp3")) {
		return cleanID
	}
	scriptPath := findPythonScript(a.storage.baseDir, "youtube_stream.py")
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, cleanID)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	out, err := cmd.Output()
	if err == nil {
		res := strings.TrimSpace(string(out))
		if strings.HasPrefix(res, "http") {
			return res
		}
	}
	return ""
}

func (a *API) downloadYouTubeAudio(videoID string) ([]byte, error) {
	cleanID := strings.TrimPrefix(videoID, "yt-")
	if cleanID == "" {
		return nil, fmt.Errorf("empty video id")
	}

	scriptPath := findPythonScript(a.storage.baseDir, "youtube_stream.py")
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("yt_dl_%s_%d.mp3", cleanID, time.Now().UnixNano()))
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, "--download", cleanID, tmpFile)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	_ = cmd.Run()

	if info, err := os.Stat(tmpFile); err == nil && info.Size() > 1000 {
		data, rErr := os.ReadFile(tmpFile)
		_ = os.Remove(tmpFile)
		if rErr == nil {
			return data, nil
		}
	}
	_ = os.Remove(tmpFile)

	// Fallback: try resolving stream URL and downloading via HTTP
	audioURL := a.resolveYouTubeDirectURL(cleanID)
	if audioURL != "" {
		client := &http.Client{Timeout: 20 * time.Second}
		req, err := http.NewRequest("GET", audioURL, nil)
		if err == nil {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
			req.Header.Set("Accept", "*/*")
			resp, err := client.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				data, rErr := io.ReadAll(resp.Body)
				resp.Body.Close()
				if rErr == nil && len(data) > 1000 {
					return data, nil
				}
			} else if resp != nil {
				resp.Body.Close()
			}
		}
	}

	return nil, fmt.Errorf("failed to download youtube audio for %s", cleanID)
}

func (a *API) handleOnlineStreamYT(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vid := strings.TrimSpace(r.URL.Query().Get("id"))
	if vid == "" {
		http.Error(w, "Missing video id", http.StatusBadRequest)
		return
	}

	audioURL := a.resolveYouTubeDirectURL(vid)
	if audioURL == "" {
		client := &http.Client{Timeout: 3 * time.Second}
		instances := []string{
			"https://invidious.f5.si",
			"https://inv.nadeko.net",
			"https://invidious.projectsegfau.lt",
		}
		for _, inst := range instances {
			infoURL := fmt.Sprintf("%s/api/v1/videos/%s", inst, vid)
			resp, err := client.Get(infoURL)
			if err != nil || resp.StatusCode != http.StatusOK {
				if resp != nil {
					resp.Body.Close()
				}
				continue
			}
			var data struct {
				AdaptiveFormats []struct {
					Type string `json:"type"`
					URL  string `json:"url"`
				} `json:"adaptiveFormats"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
				resp.Body.Close()
				for _, f := range data.AdaptiveFormats {
					if strings.Contains(f.Type, "audio") && f.URL != "" {
						audioURL = f.URL
						break
					}
				}
				if audioURL != "" {
					break
				}
			} else {
				resp.Body.Close()
			}
		}
	}

	if audioURL == "" {
		http.Error(w, "Could not resolve audio stream for YouTube video", http.StatusBadGateway)
		return
	}

	reqProxy, err := http.NewRequest(r.Method, audioURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	reqProxy.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		reqProxy.Header.Set("Range", rangeHeader)
	}

	respProxy, err := proxyStreamClient.Do(reqProxy)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer respProxy.Body.Close()

	for k, vv := range respProxy.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=1800")
	w.WriteHeader(respProxy.StatusCode)

	flusher, canFlush := w.(http.Flusher)

	// Immediate flush of first 4KB chunk for instant start
	firstBuf := make([]byte, 4096)
	fn, fErr := respProxy.Body.Read(firstBuf)
	if fn > 0 {
		_, _ = w.Write(firstBuf[:fn])
		if canFlush {
			flusher.Flush()
		}
	}
	if fErr != nil {
		return
	}

	buf := make([]byte, 32768)
	for {
		n, rErr := respProxy.Body.Read(buf)
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

func (a *API) searchYouTubeTracks(query string) ([]OnlineTrack, error) {
	results := make([]OnlineTrack, 0)
	scriptPath := findPythonScript(a.storage.baseDir, "youtube_search.py")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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

	return searchYouTubeTracksDirect(query)
}

func searchYouTubeTracksDirect(query string) ([]OnlineTrack, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	instances := []string{
		"https://api.piped.private.coffee",
		"https://invidious.f5.si",
	}

	for _, base := range instances {
		if strings.Contains(base, "invidious") {
			reqURL := fmt.Sprintf("%s/api/v1/search?q=%s&type=video", base, url.QueryEscape(query))
			req, err := http.NewRequest("GET", reqURL, nil)
			if err != nil {
				continue
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode != http.StatusOK {
				if resp != nil {
					resp.Body.Close()
				}
				continue
			}

			var items []struct {
				Title           string `json:"title"`
				Author          string `json:"author"`
				VideoID         string `json:"videoId"`
				LengthSeconds   int    `json:"lengthSeconds"`
				VideoThumbnails []struct {
					URL string `json:"url"`
				} `json:"videoThumbnails"`
			}
			err = json.NewDecoder(resp.Body).Decode(&items)
			resp.Body.Close()
			if err != nil || len(items) == 0 {
				continue
			}

			var tracks []OnlineTrack
			for _, it := range items {
				if it.VideoID == "" {
					continue
				}
				durSec := float64(it.LengthSeconds)
				durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
				coverURL := fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", it.VideoID)
				if len(it.VideoThumbnails) > 0 && it.VideoThumbnails[0].URL != "" {
					coverURL = it.VideoThumbnails[0].URL
				}
				artist := strings.TrimSpace(it.Author)
				title := strings.TrimSpace(it.Title)
				if strings.Contains(title, " - ") || strings.Contains(title, " — ") {
					delim := " - "
					if strings.Contains(title, " — ") {
						delim = " — "
					}
					parts := strings.SplitN(title, delim, 2)
					candA := strings.TrimSpace(parts[0])
					candT := strings.TrimSpace(parts[1])
					if candA != "" && (reUserArtist.MatchString(artist) || strings.Contains(strings.ToLower(artist), "topic") || strings.Contains(strings.ToLower(candA), strings.ToLower(query)) || strings.Contains(strings.ToLower(query), strings.ToLower(candA))) {
						artist = candA
						title = candT
					}
				}

				tracks = append(tracks, OnlineTrack{
					ID:         "yt-" + it.VideoID,
					Title:      title,
					Artist:     artist,
					Duration:   durSec,
					DurStr:     durStr,
					CoverURL:   coverURL,
					AudioURL:   it.VideoID,
					StreamURL:  "/api/online/stream-yt?id=" + it.VideoID,
					Source:     "youtube",
					SourceName: "YouTube Music",
				})
			}
			if len(tracks) > 0 {
				return tracks, nil
			}
		} else {
			reqURL := fmt.Sprintf("%s/search?q=%s&filter=music_songs", base, url.QueryEscape(query))
			req, err := http.NewRequest("GET", reqURL, nil)
			if err != nil {
				continue
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode != http.StatusOK {
				if resp != nil {
					resp.Body.Close()
				}
				continue
			}

			var root struct {
				Items []struct {
					URL          string `json:"url"`
					Title        string `json:"title"`
					UploaderName string `json:"uploaderName"`
					Duration     int    `json:"duration"`
					Thumbnail    string `json:"thumbnail"`
				} `json:"items"`
			}
			err = json.NewDecoder(resp.Body).Decode(&root)
			resp.Body.Close()
			if err != nil || len(root.Items) == 0 {
				continue
			}

			var tracks []OnlineTrack
			for _, it := range root.Items {
				vid := ""
				if idx := strings.Index(it.URL, "v="); idx != -1 {
					vid = it.URL[idx+2:]
				}
				if vid == "" {
					continue
				}
				durSec := float64(it.Duration)
				durStr := fmt.Sprintf("%d:%02d", int(durSec)/60, int(durSec)%60)
				coverURL := it.Thumbnail
				if coverURL == "" {
					coverURL = fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", vid)
				}
				artist := strings.TrimSpace(it.UploaderName)
				title := strings.TrimSpace(it.Title)
				if strings.Contains(title, " - ") || strings.Contains(title, " — ") {
					delim := " - "
					if strings.Contains(title, " — ") {
						delim = " — "
					}
					parts := strings.SplitN(title, delim, 2)
					candA := strings.TrimSpace(parts[0])
					candT := strings.TrimSpace(parts[1])
					if candA != "" && (reUserArtist.MatchString(artist) || strings.Contains(strings.ToLower(artist), "topic") || strings.Contains(strings.ToLower(candA), strings.ToLower(query)) || strings.Contains(strings.ToLower(query), strings.ToLower(candA))) {
						artist = candA
						title = candT
					}
				}

				tracks = append(tracks, OnlineTrack{
					ID:         "yt-" + vid,
					Title:      title,
					Artist:     artist,
					Duration:   durSec,
					DurStr:     durStr,
					CoverURL:   coverURL,
					AudioURL:   vid,
					StreamURL:  "/api/online/stream-yt?id=" + vid,
					Source:     "youtube",
					SourceName: "YouTube Music",
				})
			}
			if len(tracks) > 0 {
				return tracks, nil
			}
		}
	}
	return nil, fmt.Errorf("no youtube search results")
}

func searchYouTubeTracks(query string) ([]OnlineTrack, error) {
	return searchYouTubeTracksDirect(query)
}

// Smart deduplication key generator for artist tracks
// Strips noise, but STRICTLY PRESERVES numerals and parts (I, II, III, 2, 3, Pt 1, etc.)
var (
	reLeadingArticles = regexp.MustCompile(`(?i)^(the|a|an)\s+`)
	reYears           = regexp.MustCompile(`(?i)[(\[](19|20)\d{2}[)\]]|\b(19|20)\d{2}\b`)
	reRemasterNoise   = regexp.MustCompile(`(?i)\b(remastered|remaster|deluxe|expanded|bonus\s*track|album\s*version|original\s*mix|radio\s*edit|hq|hd|audio|official|explicit|clean)\b`)
	reBracketsOnly    = regexp.MustCompile(`(?i)\[[\s\w]*remaster[\s\w]*\]|\([\s\w]*remaster[\s\w]*\)|\([\s\w]*radio\s*edit[\s\w]*\)`)
	reRomanNumeral    = regexp.MustCompile(`(?i)\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b`)
	reNumberSuffix    = regexp.MustCompile(`\b([1-9]|10)\b`)
	rePartIndicator   = regexp.MustCompile(`(?i)\b(part|pt|vol|volume|chapter|act)\s*([0-9]+|[ivx]+)\b`)
	reUserArtist      = regexp.MustCompile(`(?i)^(user[\s_-]*\d*|unknown|unknown\s*artist|неизвестный(\s*исполнитель)?)$`)
	reUserPrefix      = regexp.MustCompile(`(?i)^user[\s_-]*\d+\b`)
)

func cleanArtistAndTitle(rawArtist, rawTitle string) (string, string) {
	artist := strings.TrimSpace(rawArtist)
	title := strings.TrimSpace(rawTitle)

	if reUserArtist.MatchString(artist) || reUserPrefix.MatchString(artist) {
		if strings.Contains(title, " - ") {
			parts := strings.SplitN(title, " - ", 2)
			candA := strings.TrimSpace(parts[0])
			candT := strings.TrimSpace(parts[1])
			if candA != "" && !reUserArtist.MatchString(candA) && !reUserPrefix.MatchString(candA) {
				artist = candA
				title = candT
			} else {
				artist = ""
			}
		} else {
			artist = ""
		}
	}

	if artist == "" && strings.Contains(title, " - ") {
		parts := strings.SplitN(title, " - ", 2)
		candA := strings.TrimSpace(parts[0])
		candT := strings.TrimSpace(parts[1])
		if candA != "" && !reUserArtist.MatchString(candA) && !reUserPrefix.MatchString(candA) {
			artist = candA
			title = candT
		}
	}

	return artist, title
}

func getSongCanonicalKey(artist, title string) string {
	a := strings.ToLower(strings.TrimSpace(artist))
	t := strings.ToLower(strings.TrimSpace(title))

	// Remove leading articles
	t = reLeadingArticles.ReplaceAllString(t, "")

	// Remove technical remaster noise & release years before sequence detection
	t = reBracketsOnly.ReplaceAllString(t, "")
	t = reYears.ReplaceAllString(t, "")
	t = reRemasterNoise.ReplaceAllString(t, "")

	// Check for sequence indicator (e.g. "II", "III", "2", "Part 2")
	seqTag := ""
	if m := rePartIndicator.FindStringSubmatch(t); len(m) > 0 {
		seqTag = strings.ToLower(strings.ReplaceAll(m[0], " ", ""))
	} else if m := reRomanNumeral.FindAllString(t, -1); len(m) > 0 {
		// Take the last roman numeral as sequence marker
		seqTag = strings.ToLower(m[len(m)-1])
	} else if m := reNumberSuffix.FindAllString(t, -1); len(m) > 0 {
		seqTag = m[len(m)-1]
	}

	// Clean remaining punctuation and whitespace
	t = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= 'а' && r <= 'я') {
			return r
		}
		if r == ' ' {
			return ' '
		}
		return -1
	}, t)

	cleanTitle := strings.Join(strings.Fields(t), " ")
	if seqTag != "" && !strings.Contains(cleanTitle, seqTag) {
		cleanTitle = cleanTitle + "::" + seqTag
	}

	return fmt.Sprintf("%s::%s", a, cleanTitle)
}

// Version classification
func classifyTrackVersion(title string) (versionType, versionLabel string) {
	low := strings.ToLower(title)

	if strings.Contains(low, "reverb") || strings.Contains(low, "реверб") {
		if strings.Contains(low, "slowed") || strings.Contains(low, "замедлен") {
			return "reverbed", "Slowed + Reverb"
		}
		return "reverbed", "Reverb"
	}
	if strings.Contains(low, "slowed") || strings.Contains(low, "замедлен") {
		return "slowed", "Slowed"
	}
	if strings.Contains(low, "live") || strings.Contains(low, "concert") || strings.Contains(low, "концерт") || strings.Contains(low, "лайв") {
		return "live", "Live"
	}
	if strings.Contains(low, "acoustic") || strings.Contains(low, "акустик") || strings.Contains(low, "unplugged") {
		return "acoustic", "Акустика"
	}
	if strings.Contains(low, "remix") || strings.Contains(low, "ремикс") || strings.Contains(low, "club mix") || strings.Contains(low, "extended") {
		return "remix", "Ремикс"
	}
	if strings.Contains(low, "instrumental") || strings.Contains(low, "инструментал") || strings.Contains(low, "караоке") || strings.Contains(low, "минус") {
		return "instrumental", "Инструментал"
	}
	if strings.Contains(low, "orchestr") || strings.Contains(low, "оркестр") || strings.Contains(low, "symphon") {
		return "orchestral", "Оркестр"
	}
	if strings.Contains(low, "demo") || strings.Contains(low, "демо") {
		return "demo", "Демо"
	}
	if strings.Contains(low, "cover") || strings.Contains(low, "кавер") {
		return "cover", "Кавер"
	}

	return "original", "Оригинал"
}

func cleanForSimilarity(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	// Deduplicate doubled letters and normalize common typo like "yelow" -> "yellow"
	s = strings.ReplaceAll(s, "yelow", "yellow")
	s = reLeadingArticles.ReplaceAllString(s, "")
	s = reBracketsOnly.ReplaceAllString(s, "")
	s = reYears.ReplaceAllString(s, "")
	s = reRemasterNoise.ReplaceAllString(s, "")
	return strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= 'а' && r <= 'я') {
			return r
		}
		return ' '
	}, s)), " ")
}

func calculateSearchRelevance(query string, title, artist string, isArtistSearch bool) int {
	cleanQuery := strings.ToLower(cleanForSimilarity(query))
	cleanArtist := strings.ToLower(cleanForSimilarity(artist))
	cleanTitle := strings.ToLower(cleanForSimilarity(title))

	if cleanQuery == "" {
		return 0
	}

	// Priority 1: Exact matches
	if cleanArtist == cleanQuery {
		return 1000
	}
	if cleanTitle == cleanQuery {
		return 900
	}

	// If in "Artists" mode or searching specifically by artist
	if isArtistSearch {
		if strings.HasPrefix(cleanArtist, cleanQuery) {
			return 850
		}
		if strings.Contains(cleanArtist, cleanQuery) {
			return 750
		}

		// Check word token overlap in artist
		qWords := strings.Fields(cleanQuery)
		aWords := strings.Fields(cleanArtist)
		matched := 0
		for _, qw := range qWords {
			for _, aw := range aWords {
				if qw == aw || strings.HasPrefix(aw, qw) || strings.HasPrefix(qw, aw) {
					matched++
					break
				}
			}
		}
		if len(qWords) > 0 && matched > 0 {
			return 500 + (matched * 200) / len(qWords)
		}

		// Low fallback if artist doesn't match
		return 50
	}

	// General search relevance:
	score := 0
	aWords := strings.Fields(cleanArtist)
	isExactWordInArtist := false
	for _, aw := range aWords {
		if aw == cleanQuery {
			isExactWordInArtist = true
			break
		}
	}

	if cleanArtist == cleanQuery {
		score = 1000
	} else if isExactWordInArtist {
		score = 900
	} else if strings.HasPrefix(cleanArtist, cleanQuery+" ") || strings.HasSuffix(cleanArtist, " "+cleanQuery) || strings.Contains(cleanArtist, " "+cleanQuery+" ") {
		score = 800
	} else if strings.HasPrefix(cleanArtist, cleanQuery) {
		score = 650
	} else if strings.Contains(cleanArtist, cleanQuery) {
		score = 500
	}

	if cleanTitle == cleanQuery {
		score = max(score, 750)
	} else if strings.HasPrefix(cleanTitle, cleanQuery) {
		score = max(score, 650)
	} else if strings.Contains(cleanTitle, cleanQuery) {
		score = max(score, 550)
	}

	// Word overlap
	qWords := strings.Fields(cleanQuery)
	allWords := strings.Fields(cleanArtist + " " + cleanTitle)
	matched := 0
	for _, qw := range qWords {
		for _, w := range allWords {
			if qw == w || strings.HasPrefix(w, qw) {
				matched++
				break
			}
		}
	}
	if len(qWords) > 0 && matched > 0 {
		overlapScore := (matched * 400) / len(qWords)
		score = max(score, overlapScore)
	}

	// Penalty for accidental substring in artist (e.g. TraXXXman when searching xxxmanera)
	if !strings.Contains(cleanArtist, cleanQuery) && !isExactWordInArtist && score < 700 {
		score -= 100
	}

	return score
}

func calculateSimilarity(targetTitle, targetArtist, candTitle, candArtist string) int {
	tTitle := cleanForSimilarity(targetTitle)
	tArtist := cleanForSimilarity(targetArtist)
	cTitle := cleanForSimilarity(candTitle)
	cArtist := cleanForSimilarity(candArtist)

	if tTitle == "" || cTitle == "" {
		return 0
	}

	// 1. Artist Score (0 to 100)
	artistScore := 0
	if tArtist == cArtist {
		artistScore = 100
	} else if strings.Contains(cArtist, tArtist) || strings.Contains(tArtist, cArtist) {
		artistScore = 85
	} else {
		tWords := strings.Fields(tArtist)
		cWords := strings.Fields(cArtist)
		matches := 0
		for _, tw := range tWords {
			for _, cw := range cWords {
				if tw == cw {
					matches++
					break
				}
			}
		}
		if len(tWords) > 0 && matches > 0 {
			artistScore = (matches * 70) / len(tWords)
		}
	}

	// 2. Title Score (0 to 100)
	titleScore := 0
	if tTitle == cTitle {
		titleScore = 100
	} else if strings.HasPrefix(cTitle, tTitle) || strings.HasPrefix(tTitle, cTitle) {
		titleScore = 90
	} else if strings.Contains(cTitle, tTitle) || strings.Contains(tTitle, cTitle) {
		titleScore = 80
	} else {
		tWords := strings.Fields(tTitle)
		cWords := strings.Fields(cTitle)
		matches := 0
		for _, tw := range tWords {
			for _, cw := range cWords {
				if tw == cw {
					matches++
					break
				}
			}
		}
		if len(tWords) > 0 && matches > 0 {
			titleScore = (matches * 75) / len(tWords)
		}
	}

	if tArtist == "" {
		return titleScore
	}

	// Weighted total: Title 65%, Artist 35%
	total := int(float64(titleScore)*0.65 + float64(artistScore)*0.35)
	if total > 100 {
		total = 100
	}
	return total
}

func searchDeezerTracks(baseDir, query string) ([]OnlineTrack, error) {
	tracks := make([]OnlineTrack, 0)
	if out, err := runOnlineAlbumsHelper(baseDir, "search_deezer_tracks", query); err == nil && len(out) > 0 {
		var pyTracks []OnlineTrack
		if err := json.Unmarshal(out, &pyTracks); err == nil && len(pyTracks) > 0 {
			return pyTracks, nil
		}
	}
	return tracks, nil
}

func (a *API) handleOnlineSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]OnlineTrack{})
		return
	}

	source := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("source")))
	if source == "" {
		source = "all"
	}

	results := make([]OnlineTrack, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup

	token := getYandexToken(a.storage.baseDir)
	vkToken := getVKToken(a.storage.baseDir)

	// 1. Hitmo
	if source == "all" || source == "hitmo" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchHitmo(query)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 2. Yandex (works with or without token, token gives 320kbps full catalog)
	if source == "all" || source == "yandex" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchYandexTracks(query, token)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 3. SoundCloud
	if source == "all" || source == "soundcloud" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := a.searchSoundCloudTracks(query)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 4. VK Music
	if (source == "all" || source == "vk") && vkToken != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchVKTracks(query, vkToken)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 5. YouTube Music
	if source == "all" || source == "youtube" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchYouTubeTracks(query)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 6. Audius
	if source == "all" || source == "audius" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchAudiusTracks(query)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	// 7. Deezer Tracks (world catalog with 1000x1000 HD covers)
	if source == "all" || source == "deezer" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracks, err := searchDeezerTracks(a.storage.baseDir, query)
			if err == nil && len(tracks) > 0 {
				mu.Lock()
				results = append(results, tracks...)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	isArtistSearch := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("type"))) == "artist" || strings.ToLower(strings.TrimSpace(r.URL.Query().Get("mode"))) == "artist"

	// Rank results by similarity & search relevance to query
	sort.SliceStable(results, func(i, j int) bool {
		si := calculateSearchRelevance(query, results[i].Title, results[i].Artist, isArtistSearch)
		sj := calculateSearchRelevance(query, results[j].Title, results[j].Artist, isArtistSearch)
		if si != sj {
			return si > sj
		}
		simI := calculateSimilarity(query, query, results[i].Title, results[i].Artist)
		simJ := calculateSimilarity(query, query, results[j].Title, results[j].Artist)
		return simI > simJ
	})

	// Pagination support (limit and offset)
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o > 0 {
			if o >= len(results) {
				results = []OnlineTrack{}
			} else {
				results = results[o:]
			}
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l < len(results) {
			results = results[:l]
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(results)
}

func (a *API) handleOnlineAlbums(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]OnlineAlbum{})
		return
	}

	source := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("source")))
	if source == "" {
		source = "all"
	}

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results []OnlineAlbum
	)

	// 1. Deezer Albums (always available, vast catalog)
	if source == "all" || source == "deezer" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if dzAlbums, err := searchDeezerAlbums(a.storage.baseDir, query); err == nil && len(dzAlbums) > 0 {
				mu.Lock()
				results = append(results, dzAlbums...)
				mu.Unlock()
			}
		}()
	}

	// 2. Yandex Albums (if token is available)
	if source == "all" || source == "yandex" {
		token := getYandexToken(a.storage.baseDir)
		if token != "" {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if yaAlbums, err := searchYandexAlbums(a.storage.baseDir, query, token); err == nil && len(yaAlbums) > 0 {
					mu.Lock()
					results = append(results, yaAlbums...)
					mu.Unlock()
				}
			}()
		}
	}

	// 3. Audius Albums / Playlists
	if source == "all" || source == "audius" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if audAlbums, err := searchAudiusAlbums(a.storage.baseDir, query); err == nil && len(audAlbums) > 0 {
				mu.Lock()
				results = append(results, audAlbums...)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	if results == nil {
		results = []OnlineAlbum{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(results)
}

func (a *API) handleOnlineAlbumTracks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	albumID := strings.TrimSpace(r.URL.Query().Get("id"))
	if albumID == "" {
		http.Error(w, "Missing id", http.StatusBadRequest)
		return
	}

	if strings.HasPrefix(albumID, "dz_alb_") {
		alb, err := getDeezerAlbumWithTracks(a.storage.baseDir, albumID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(alb)
		return
	}

	if strings.HasPrefix(albumID, "aud_alb_") {
		alb, err := getAudiusAlbumWithTracks(a.storage.baseDir, albumID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(alb)
		return
	}

	if strings.HasPrefix(albumID, "ya_alb_") {
		token := getYandexToken(a.storage.baseDir)
		if token == "" {
			http.Error(w, "Yandex Music token missing in yandex_token.txt", http.StatusBadRequest)
			return
		}
		alb, err := getYandexAlbumWithTracks(a.storage.baseDir, albumID, token)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(alb)
		return
	}

	http.Error(w, "Album not found", http.StatusNotFound)
}

func (a *API) handleArtistPhoto(w http.ResponseWriter, r *http.Request) {
	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	if artist == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"photo": ""})
		return
	}

	photo := ""
	if out, err := runOnlineAlbumsHelper(a.storage.baseDir, "get_artist_photo", artist); err == nil && len(out) > 0 {
		var res struct {
			Photo string `json:"photo"`
		}
		if err := json.Unmarshal(out, &res); err == nil {
			photo = res.Photo
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"photo": photo})
}

func (a *API) handleOnlineStreamDeezer(w http.ResponseWriter, r *http.Request) {
	title := strings.TrimSpace(r.URL.Query().Get("title"))
	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	preview := strings.TrimSpace(r.URL.Query().Get("preview"))

	// 1. Try finding full track on Hitmo or SoundCloud for complete listening experience
	if artist != "" && title != "" {
		q := fmt.Sprintf("%s %s", artist, title)
		if hTracks, err := searchHitmo(q); err == nil && len(hTracks) > 0 {
			targetAudio := hTracks[0].AudioURL
			if targetAudio != "" {
				r.URL.RawQuery = "url=" + url.QueryEscape(targetAudio)
				a.handleOnlineStream(w, r)
				return
			}
		}
		if scTracks, err := a.searchSoundCloudTracks(q); err == nil && len(scTracks) > 0 {
			sc := scTracks[0]
			if sc.AudioURL != "" {
				r.URL.RawQuery = "url=" + url.QueryEscape(sc.AudioURL)
				a.handleOnlineStreamSC(w, r)
				return
			}
		}
	}

	// 2. Fallback to Deezer preview CDN stream
	if preview != "" {
		r.URL.RawQuery = "url=" + url.QueryEscape(preview)
		a.handleOnlineStream(w, r)
		return
	}

	http.Error(w, "Audio source not found", http.StatusNotFound)
}

func (a *API) handleOnlineStreamYandex(w http.ResponseWriter, r *http.Request) {
	trackID := strings.TrimSpace(r.URL.Query().Get("id"))
	if trackID == "" {
		http.Error(w, "Missing id", http.StatusBadRequest)
		return
	}

	token := getYandexToken(a.storage.baseDir)
	if token == "" {
		http.Error(w, "Yandex Music token missing in yandex_token.txt", http.StatusBadRequest)
		return
	}

	directURL, err := getYandexDirectMP3(trackID, token)
	if err != nil {
		http.Error(w, "Failed to resolve direct MP3: "+err.Error(), http.StatusBadGateway)
		return
	}

	req, err := http.NewRequest(r.Method, directURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := proxyStreamClient.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
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

	// Immediate flush of first 4KB chunk for instant start
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

// Artist Flow: Deduplicated stream where "The Unforgiven", "The Unforgiven II", "The Unforgiven III" are distinct
func (a *API) handleArtistFlow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	if artist == "" {
		http.Error(w, "Missing artist", http.StatusBadRequest)
		return
	}

	allTracks := make([]OnlineTrack, 0)
	seenKeys := make(map[string]bool)

	// 1. Add local tracks of this artist first
	localTracks := a.storage.GetTracks()
	artistLow := strings.ToLower(artist)
	for _, lt := range localTracks {
		if strings.Contains(strings.ToLower(lt.Artist), artistLow) || strings.Contains(artistLow, strings.ToLower(lt.Artist)) {
			key := getSongCanonicalKey(artist, lt.Title)
			if !seenKeys[key] {
				seenKeys[key] = true
				allTracks = append(allTracks, OnlineTrack{
					ID:         lt.ID,
					Title:      lt.Title,
					Artist:     lt.Artist,
					Album:      lt.Album,
					Year:       lt.Year,
					Duration:   lt.Duration,
					DurStr:     fmt.Sprintf("%d:%02d", int(lt.Duration)/60, int(lt.Duration)%60),
					CoverURL:   "",
					AudioURL:   lt.ID,
					StreamURL:  "/api/stream/" + lt.ID,
					Source:     "local",
					SourceName: "Локальная медиатека",
				})
			}
		}
	}

	token := getYandexToken(a.storage.baseDir)
	onlineFound := make([]OnlineTrack, 0)
	var wg sync.WaitGroup
	var mu sync.Mutex

	// 2. Fetch from Yandex
	if token != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			yTracks, err := searchYandexTracks(artist, token)
			if err == nil {
				mu.Lock()
				onlineFound = append(onlineFound, yTracks...)
				mu.Unlock()
			}
		}()
	}

	// 3. Fetch from Hitmo
	wg.Add(1)
	go func() {
		defer wg.Done()
		hTracks, err := searchHitmo(artist)
		if err == nil {
			mu.Lock()
			onlineFound = append(onlineFound, hTracks...)
			mu.Unlock()
		}
	}()

	wg.Wait()

	// Apply smart deduplication to online tracks
	for _, ot := range onlineFound {
		key := getSongCanonicalKey(artist, ot.Title)
		if !seenKeys[key] {
			seenKeys[key] = true
			allTracks = append(allTracks, ot)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"artist": artist,
		"tracks": allTracks,
		"total":  len(allTracks),
	})
}

// Version Finder: searches for versions (live, reverbed, acoustic, remix, slowed, etc.)
// Requirement: "версии откуда берётся надо подписывать" -> Source & SourceName are signed on each version!
func (a *API) handleTrackVersions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawTitle := strings.TrimSpace(r.URL.Query().Get("title"))
	rawArtist := strings.TrimSpace(r.URL.Query().Get("artist"))
	if rawTitle == "" {
		http.Error(w, "Missing title", http.StatusBadRequest)
		return
	}

	artist, title := cleanArtistAndTitle(rawArtist, rawTitle)

	// Clean base song title for searches
	cleanBaseTitle := reRemasterNoise.ReplaceAllString(title, "")
	cleanBaseTitle = reBracketsOnly.ReplaceAllString(cleanBaseTitle, "")
	cleanBaseTitle = strings.TrimSpace(cleanBaseTitle)
	if strings.Contains(cleanBaseTitle, " - ") && artist != "" {
		parts := strings.SplitN(cleanBaseTitle, " - ", 2)
		if strings.EqualFold(strings.TrimSpace(parts[0]), artist) {
			cleanBaseTitle = strings.TrimSpace(parts[1])
		}
	}
	if cleanBaseTitle == "" {
		cleanBaseTitle = title
	}

	songKey := getSongCanonicalKey(artist, cleanBaseTitle)
	prefs := a.storage.GetVersionPreferences()
	dislikedList := prefs.Disliked[songKey]
	dislikedSet := make(map[string]bool)
	for _, d := range dislikedList {
		dislikedSet[d] = true
	}
	prefVersion, hasPref := prefs.Preferred[songKey]

	var fullArtistTitle string
	if artist != "" {
		fullArtistTitle = fmt.Sprintf("%s %s", artist, cleanBaseTitle)
	}

	token := getYandexToken(a.storage.baseDir)
	vkToken := getVKToken(a.storage.baseDir)
	rawTracks := make([]OnlineTrack, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Also check local tracks
	localTracks := a.storage.GetTracks()
	baseKey := getSongCanonicalKey(artist, cleanBaseTitle)
	for _, lt := range localTracks {
		ltA, ltT := cleanArtistAndTitle(lt.Artist, lt.Title)
		if getSongCanonicalKey(ltA, ltT) == baseKey || strings.Contains(strings.ToLower(lt.Title), strings.ToLower(cleanBaseTitle)) || strings.Contains(strings.ToLower(ltT), strings.ToLower(cleanBaseTitle)) {
			_, vLabel := classifyTrackVersion(lt.Title)
			rawTracks = append(rawTracks, OnlineTrack{
				ID:         lt.ID,
				Title:      lt.Title,
				Artist:     lt.Artist,
				Album:      lt.Album,
				Year:       lt.Year,
				Duration:   lt.Duration,
				DurStr:     fmt.Sprintf("%d:%02d", int(lt.Duration)/60, int(lt.Duration)%60),
				CoverURL:   "",
				AudioURL:   lt.ID,
				StreamURL:  "/api/stream/" + lt.ID,
				Source:     "local",
				SourceName: "Локальная медиатека",
				Version:    vLabel,
			})
		}
	}

	// 1. Query SoundCloud (Resilient to VPN, vast catalog of remixes, live & slowed+reverb)
	var scQueries []string
	if fullArtistTitle != "" {
		scQueries = append(scQueries, fullArtistTitle)
	}
	scQueries = append(scQueries, cleanBaseTitle, fmt.Sprintf("%s remix", cleanBaseTitle), fmt.Sprintf("%s slowed reverb", cleanBaseTitle))
	for _, q := range scQueries {
		qCopy := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			scList, err := a.searchSoundCloudTracks(qCopy)
			if err == nil && len(scList) > 0 {
				mu.Lock()
				rawTracks = append(rawTracks, scList...)
				mu.Unlock()
			}
		}()
	}

	// 2. Query Hitmo: чистое название на первом месте, затем автор + название, затем ремиксы
	var hitmoQueries []string
	hitmoQueries = append(hitmoQueries, cleanBaseTitle)
	if fullArtistTitle != "" {
		hitmoQueries = append(hitmoQueries, fullArtistTitle)
	}
	hitmoQueries = append(hitmoQueries, fmt.Sprintf("%s remix", cleanBaseTitle))
	for _, q := range hitmoQueries {
		qCopy := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			hList, err := searchHitmo(qCopy)
			if err == nil && len(hList) > 0 {
				mu.Lock()
				rawTracks = append(rawTracks, hList...)
				mu.Unlock()
			}
		}()
	}

	// 3. Query YouTube Music: чистое название, автор + название, live, remix
	var ytQueries []string
	ytQueries = append(ytQueries, cleanBaseTitle)
	if fullArtistTitle != "" {
		ytQueries = append(ytQueries, fullArtistTitle)
	}
	ytQueries = append(ytQueries, fmt.Sprintf("%s remix", cleanBaseTitle), fmt.Sprintf("%s live", cleanBaseTitle))
	for _, q := range ytQueries {
		qCopy := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			ytList, err := a.searchYouTubeTracks(qCopy)
			if err == nil && len(ytList) > 0 {
				mu.Lock()
				rawTracks = append(rawTracks, ytList...)
				mu.Unlock()
			}
		}()
	}

	// 4. Query Audius: чистое название и автор + название
	var audiusQueries []string
	audiusQueries = append(audiusQueries, cleanBaseTitle)
	if fullArtistTitle != "" {
		audiusQueries = append(audiusQueries, fullArtistTitle)
	}
	for _, q := range audiusQueries {
		qCopy := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			audList, err := searchAudiusTracks(qCopy)
			if err == nil && len(audList) > 0 {
				mu.Lock()
				rawTracks = append(rawTracks, audList...)
				mu.Unlock()
			}
		}()
	}

	// 5. Query Yandex if token available
	if token != "" {
		var yQueries []string
		yQueries = append(yQueries, cleanBaseTitle)
		if fullArtistTitle != "" {
			yQueries = append(yQueries, fullArtistTitle)
		}
		for _, q := range yQueries {
			qCopy := q
			wg.Add(1)
			go func() {
				defer wg.Done()
				yList, err := searchYandexTracks(qCopy, token)
				if err == nil && len(yList) > 0 {
					mu.Lock()
					rawTracks = append(rawTracks, yList...)
					mu.Unlock()
				}
			}()
		}
	}

	// 6. Query VK Music if vkToken available
	if vkToken != "" {
		var vkQueries []string
		vkQueries = append(vkQueries, cleanBaseTitle)
		if fullArtistTitle != "" {
			vkQueries = append(vkQueries, fullArtistTitle)
		}
		for _, q := range vkQueries {
			qCopy := q
			wg.Add(1)
			go func() {
				defer wg.Done()
				vkList, err := searchVKTracks(qCopy, vkToken)
				if err == nil && len(vkList) > 0 {
					mu.Lock()
					rawTracks = append(rawTracks, vkList...)
					mu.Unlock()
				}
			}()
		}
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(8 * time.Second):
	}

	// Convert and categorize into TrackVersion, deduplicating only exact identical ID
	seenIDs := make(map[string]bool)
	versions := make([]TrackVersion, 0)

	for _, t := range rawTracks {
		if seenIDs[t.ID] {
			continue
		}
		seenIDs[t.ID] = true

		// Clean candidate author if it is a generic User...
		cArtist, cTitle := cleanArtistAndTitle(t.Artist, t.Title)
		if cArtist != "" && (t.Artist == "" || reUserArtist.MatchString(t.Artist) || reUserPrefix.MatchString(t.Artist)) {
			t.Artist = cArtist
			t.Title = cTitle
		}

		vType, vLabel := classifyTrackVersion(t.Title)
		isDis := dislikedSet[t.ID] || dislikedSet[vType]
		isPref := hasPref && prefVersion.ID == t.ID

		sim := calculateSimilarity(cleanBaseTitle, artist, t.Title, t.Artist)
		cleanBase := normalizeForMatch(cleanBaseTitle)
		cleanCand := normalizeForMatch(t.Title)

		passesFilter := isPref
		if !passesFilter {
			if strings.Contains(cleanCand, cleanBase) || strings.Contains(cleanBase, cleanCand) || sim >= 25 {
				passesFilter = true
			} else {
				wBase := strings.Fields(cleanBase)
				wCand := strings.Fields(cleanCand)
				if len(wBase) > 0 && len(wCand) > 0 {
					commonWords := 0
					for _, wb := range wBase {
						for _, wc := range wCand {
							if wb == wc {
								commonWords++
								break
							}
						}
					}
					if (commonWords * 2) >= len(wBase) {
						passesFilter = true
					}
				}
			}
		}

		if !passesFilter {
			continue
		}

		sourceName := t.SourceName
		if sourceName == "" {
			switch t.Source {
			case "youtube":
				sourceName = "YouTube Music"
			case "soundcloud":
				sourceName = "SoundCloud"
			case "vk":
				sourceName = "VK Музыка"
			case "yandex":
				sourceName = "Яндекс Музыка"
			case "hitmo":
				sourceName = "Hitmo"
			case "audius":
				sourceName = "Audius"
			case "local":
				sourceName = "Локальная медиатека"
			default:
				sourceName = "Онлайн источник"
			}
		}

		versions = append(versions, TrackVersion{
			ID:           t.ID,
			Title:        t.Title,
			Artist:       t.Artist,
			Album:        t.Album,
			Duration:     t.Duration,
			DurStr:       t.DurStr,
			CoverURL:     t.CoverURL,
			StreamURL:    t.StreamURL,
			AudioURL:     t.AudioURL,
			Source:       t.Source,
			SourceName:   sourceName,
			VersionType:  vType,
			VersionLabel: vLabel,
			Similarity:   sim,
			IsPreferred:  isPref,
			IsDisliked:   isDis,
		})
	}

	// Sort versions: preferred first, then non-disliked by similarity descending, then disliked last
	sort.SliceStable(versions, func(i, j int) bool {
		vi, vj := versions[i], versions[j]
		if vi.IsPreferred != vj.IsPreferred {
			return vi.IsPreferred
		}
		if vi.IsDisliked != vj.IsDisliked {
			return !vi.IsDisliked
		}
		if vi.Similarity != vj.Similarity {
			return vi.Similarity > vj.Similarity
		}
		if (vi.VersionType == "original") != (vj.VersionType == "original") {
			return vi.VersionType == "original"
		}
		return false
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"songKey":      songKey,
		"title":        cleanBaseTitle,
		"artist":       artist,
		"versions":     versions,
		"hasPreferred": hasPref,
		"preferred":    prefVersion,
	})
}

func (a *API) handleVersionPreferences(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	prefs := a.storage.GetVersionPreferences()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(prefs)
}

func (a *API) handleSetPreferredVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		SongKey string       `json:"songKey"`
		Artist  string       `json:"artist"`
		Title   string       `json:"title"`
		Remove  bool         `json:"remove"`
		Version TrackVersion `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	key := body.SongKey
	if key == "" {
		key = getSongCanonicalKey(body.Artist, body.Title)
	}

	currentPref, hasCurrent := a.storage.GetVersionPreferences().Preferred[key]
	// If explicitly asked to remove, or if this version is already the preferred one -> toggle it off!
	if body.Remove || (hasCurrent && currentPref.ID == body.Version.ID) {
		_ = a.storage.RemovePreferredVersion(key)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"removed": true,
			"songKey": key,
		})
		return
	}

	if err := a.storage.SetPreferredVersion(key, body.Version); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"removed": false,
		"songKey": key,
	})
}

// Dislike a version: records the dislike, and immediately resolves an alternative version!
func (a *API) handleDislikeVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		SongKey     string `json:"songKey"`
		Artist      string `json:"artist"`
		Title       string `json:"title"`
		TrackID     string `json:"trackId"`
		VersionType string `json:"versionType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	key := body.SongKey
	if key == "" {
		key = getSongCanonicalKey(body.Artist, body.Title)
	}

	valToDislike := body.TrackID
	if valToDislike == "" {
		valToDislike = body.VersionType
	}

	if err := a.storage.AddDislikedVersion(key, valToDislike); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"disliked": valToDislike,
		"songKey":  key,
	})
}

// Lyrics API endpoint with multi-tier search and clean query resolution
func (a *API) handleLyrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawTitle := strings.TrimSpace(r.URL.Query().Get("title"))
	rawArtist := strings.TrimSpace(r.URL.Query().Get("artist"))
	dur := strings.TrimSpace(r.URL.Query().Get("duration"))
	if rawTitle == "" {
		http.Error(w, "Missing title", http.StatusBadRequest)
		return
	}

	scriptPath := findPythonScript(a.storage.baseDir, "lyrics_search.py")
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, getPythonExe(), scriptPath, rawArtist, rawTitle, dur)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}

	out, err := cmd.Output()
	if err == nil && len(out) > 0 {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(out)
		return
	}

	http.Error(w, "Lyrics not found", http.StatusNotFound)
}

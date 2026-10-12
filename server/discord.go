package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	DISCORD_CLIENT_ID = "1557295851452502146" // FreeToPlayer App ID
	DEFAULT_APP_ICON  = "https://cdn.discordapp.com/app-icons/1557295851452502146/448dcfc85d9c459ac0d28369601d8495.png"
)

type DiscordRPC struct {
	mu          sync.Mutex
	cacheMu     sync.Mutex
	coverCache  map[string]string
	pipe        *os.File
	enabled     bool
	baseDir     string
	lastTitle   string
	lastArtist  string
	lastPlaying bool
	startTime   int64
}

var globalDiscord = &DiscordRPC{
	coverCache: make(map[string]string),
}

func (d *DiscordRPC) SetBaseDir(dir string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.baseDir = dir
}

func (d *DiscordRPC) SetEnabled(enable bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.enabled = enable
	if !enable && d.pipe != nil {
		_ = d.pipe.Close()
		d.pipe = nil
		d.lastTitle = ""
		d.lastArtist = ""
		d.lastPlaying = false
	}
}

func (d *DiscordRPC) sendAndRead(opcode uint32, payload []byte) (uint32, []byte, error) {
	if d.pipe == nil {
		return 0, nil, fmt.Errorf("not connected")
	}

	buf := new(bytes.Buffer)
	_ = binary.Write(buf, binary.LittleEndian, opcode)
	_ = binary.Write(buf, binary.LittleEndian, uint32(len(payload)))
	buf.Write(payload)
	if _, err := d.pipe.Write(buf.Bytes()); err != nil {
		return 0, nil, err
	}

	header := make([]byte, 8)
	if _, err := io.ReadFull(d.pipe, header); err != nil {
		return 0, nil, err
	}
	respOpcode := binary.LittleEndian.Uint32(header[0:4])
	respLen := binary.LittleEndian.Uint32(header[4:8])

	respPayload := make([]byte, respLen)
	if _, err := io.ReadFull(d.pipe, respPayload); err != nil {
		return 0, nil, err
	}

	return respOpcode, respPayload, nil
}

func (d *DiscordRPC) connect() error {
	if d.pipe != nil {
		return nil
	}

	for i := 0; i < 10; i++ {
		pipePath := fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i)
		f, err := os.OpenFile(pipePath, os.O_RDWR, 0)
		if err == nil {
			d.pipe = f

			handshake := map[string]any{
				"v":         1,
				"client_id": DISCORD_CLIENT_ID,
			}
			hsBytes, _ := json.Marshal(handshake)
			_, _, err := d.sendAndRead(0, hsBytes)
			if err != nil {
				_ = d.pipe.Close()
				d.pipe = nil
				continue
			}

			return nil
		}
	}

	return fmt.Errorf("discord client not running")
}

func (d *DiscordRPC) UpdateActivity(title, artist, coverUrl string, isPlaying bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return
	}

	if !isPlaying {
		if d.pipe != nil {
			activity := map[string]any{
				"cmd": "SET_ACTIVITY",
				"args": map[string]any{
					"pid":      os.Getpid(),
					"activity": nil,
				},
				"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
			}
			data, _ := json.Marshal(activity)
			_, _, _ = d.sendAndRead(1, data)
		}
		d.lastPlaying = false
		return
	}

	if err := d.connect(); err != nil {
		return
	}

	if d.lastTitle != title || d.lastArtist != artist || !d.lastPlaying {
		d.startTime = time.Now().Unix()
		d.lastTitle = title
		d.lastArtist = artist
		d.lastPlaying = true
	}

	cleanTitle := title
	if cleanTitle == "" {
		cleanTitle = "Музыка"
	}

	cleanArtist := artist
	if cleanArtist == "" {
		cleanArtist = "FreeToPlayer"
	}

	// Resolve public image URL so Discord CDN can render album art
	resolvedCover := coverUrl
	if resolvedCover == "" || (!strings.HasPrefix(resolvedCover, "http://") && !strings.HasPrefix(resolvedCover, "https://")) {
		cacheKey := strings.ToLower(cleanArtist + " - " + cleanTitle)
		d.cacheMu.Lock()
		if cached, ok := d.coverCache[cacheKey]; ok && cached != "" {
			resolvedCover = cached
		}
		d.cacheMu.Unlock()

		// Quick online cover lookup if not cached
		if resolvedCover == "" && cleanArtist != "FreeToPlayer" && cleanTitle != "Музыка" {
			q := cleanArtist + " " + cleanTitle
			// 1. Try Deezer (HD 1000x1000 album covers)
			if dzTracks, err := searchDeezerTracks(d.baseDir, q); err == nil && len(dzTracks) > 0 && dzTracks[0].CoverURL != "" {
				resolvedCover = dzTracks[0].CoverURL
				d.cacheMu.Lock()
				d.coverCache[cacheKey] = resolvedCover
				d.cacheMu.Unlock()
			} else {
				// 2. Try Yandex Music
				token := getYandexToken(d.baseDir)
				if token != "" {
					if yaTracks, err := searchYandexTracks(q, token); err == nil && len(yaTracks) > 0 && yaTracks[0].CoverURL != "" {
						resolvedCover = yaTracks[0].CoverURL
						d.cacheMu.Lock()
						d.coverCache[cacheKey] = resolvedCover
						d.cacheMu.Unlock()
					}
				}
			}
		}
	}

	if resolvedCover == "" {
		resolvedCover = DEFAULT_APP_ICON
	}

	assets := map[string]any{
		"large_image": resolvedCover,
		"large_text":  cleanTitle,
		"small_image": DEFAULT_APP_ICON,
		"small_text":  "FreeToPlayer",
	}

	activity := map[string]any{
		"cmd": "SET_ACTIVITY",
		"args": map[string]any{
			"pid": os.Getpid(),
			"activity": map[string]any{
				"details": cleanTitle,
				"state":   "Исполнитель: " + cleanArtist,
				"assets":  assets,
				"timestamps": map[string]any{
					"start": d.startTime,
				},
			},
		},
		"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
	}

	data, _ := json.Marshal(activity)
	if _, _, err := d.sendAndRead(1, data); err != nil {
		if d.pipe != nil {
			_ = d.pipe.Close()
			d.pipe = nil
		}
	}
}

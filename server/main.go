package main

//go:generate goversioninfo -icon=../app_icon.ico

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

//go:embed all:dist
var embeddedClient embed.FS

var globalHWND uintptr

func enableHighDPI() {
	user32 := windows.NewLazySystemDLL("user32.dll")
	setDpiContext := user32.NewProc("SetProcessDpiAwarenessContext")
	if err := setDpiContext.Find(); err == nil {
		// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
		_, _, _ = setDpiContext.Call(uintptr(0xfffffffffffffffc))
		return
	}
	shcore := windows.NewLazySystemDLL("shcore.dll")
	setProcessDpi := shcore.NewProc("SetProcessDpiAwareness")
	if err := setProcessDpi.Find(); err == nil {
		// PROCESS_PER_MONITOR_DPI_AWARE = 2
		_, _, _ = setProcessDpi.Call(2)
		return
	}
	setDpiAware := user32.NewProc("SetProcessDPIAware")
	if err := setDpiAware.Find(); err == nil {
		_, _, _ = setDpiAware.Call()
	}
}

type NetworkInterfaceInfo struct {
	Name      string `json:"name"`
	IP        string `json:"ip"`
	IsPrimary bool   `json:"isPrimary"`
	Type      string `json:"type"`      // "wifi", "ethernet", "virtual", "lan"
	IsVirtual bool   `json:"isVirtual"`
}

func isVirtualNetwork(ifaceName string, ip net.IP) bool {
	name := strings.ToLower(ifaceName)
	badKeywords := []string{
		"radmin", "hamachi", "vethernet", "virtual", "vmnet", "vmware",
		"vbox", "virtualbox", "wsl", "tap", "tun", "zerotier",
		"tailscale", "docker", "hyper-v", "loopback", "npcap", "teredo",
	}
	for _, kw := range badKeywords {
		if strings.Contains(name, kw) {
			return true
		}
	}

	ip4 := ip.To4()
	if ip4 == nil {
		return true
	}

	// 26.0.0.0/8 - Radmin VPN
	if ip4[0] == 26 {
		return true
	}
	// 25.0.0.0/8 - Hamachi
	if ip4[0] == 25 {
		return true
	}
	// 100.64.0.0/10 - Tailscale / CGNAT (100.64.0.0 - 100.127.255.255)
	if ip4[0] == 100 && (ip4[1] >= 64 && ip4[1] <= 127) {
		return true
	}
	// 169.254.0.0/16 - Link-local APIPA
	if ip4[0] == 169 && ip4[1] == 254 {
		return true
	}
	// 192.168.56.0/24 - VirtualBox host-only
	if ip4[0] == 192 && ip4[1] == 168 && ip4[2] == 56 {
		return true
	}

	return false
}

func getOutboundIP() net.IP {
	// UDP connect to public DNS resolves Windows routing table to current physical adapter
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 600*time.Millisecond)
	if err != nil {
		conn, err = net.DialTimeout("udp", "1.1.1.1:80", 600*time.Millisecond)
	}
	if err == nil {
		defer conn.Close()
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		ip4 := localAddr.IP.To4()
		if ip4 != nil && !ip4.IsLoopback() && !isVirtualNetwork("", ip4) {
			return ip4
		}
	}
	return nil
}

func getNetworkInterfaces() []NetworkInterfaceInfo {
	var results []NetworkInterfaceInfo
	outbound := getOutboundIP()

	ifaces, err := net.Interfaces()
	if err != nil {
		return results
	}

	type scoredItem struct {
		info  NetworkInterfaceInfo
		score int
	}

	var items []scoredItem

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}

			isVirt := isVirtualNetwork(iface.Name, ip4)
			lowerName := strings.ToLower(iface.Name)

			ifType := "lan"
			if strings.Contains(lowerName, "wi-fi") || strings.Contains(lowerName, "wireless") || strings.Contains(lowerName, "wlan") || strings.Contains(lowerName, "беспровод") {
				ifType = "wifi"
			} else if strings.Contains(lowerName, "ethernet") || strings.Contains(lowerName, "сетевое") || strings.Contains(lowerName, "подключение") {
				ifType = "ethernet"
			} else if isVirt {
				ifType = "virtual"
			}

			score := 10
			if ip4[0] == 192 && ip4[1] == 168 {
				score = 150
			} else if ip4[0] == 10 {
				score = 120
			} else if ip4[0] == 172 && (ip4[1] >= 16 && ip4[1] <= 31) {
				score = 100
			}

			if ifType == "wifi" {
				score += 60
			} else if ifType == "ethernet" {
				score += 40
			}

			if outbound != nil && ip4.Equal(outbound) {
				score += 500
			}

			if isVirt {
				score -= 1000
			}

			items = append(items, scoredItem{
				info: NetworkInterfaceInfo{
					Name:      iface.Name,
					IP:        ip4.String(),
					IsPrimary: false,
					Type:      ifType,
					IsVirtual: isVirt,
				},
				score: score,
			})
		}
	}

	// Sort items descending by score
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].score > items[i].score {
				items[i], items[j] = items[j], items[i]
			}
		}
	}

	seenIPs := make(map[string]bool)
	for i, it := range items {
		if seenIPs[it.info.IP] {
			continue
		}
		seenIPs[it.info.IP] = true
		if i == 0 {
			it.info.IsPrimary = true
		}
		results = append(results, it.info)
	}

	return results
}

func getLocalIPAddresses() []string {
	interfaces := getNetworkInterfaces()
	var ips []string
	for _, iface := range interfaces {
		ips = append(ips, iface.IP)
	}
	return ips
}

func init() {
	// Register Windows AppUserModelID identity for taskbar, notifications, and media overlay (SMTC)
	initAppIdentity()

	// Disable browser disk HTTP caching so replaced audio files update immediately, enable audio features
	_ = os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-http-cache --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=NUL --enable-features=SpeakerSelection --app-name=\"FreeToPlayer\" --app-id=FreeToPlayer.App")

	// Fix Windows registry MIME issues
	_ = mime.AddExtensionType(".js", "application/javascript")
	_ = mime.AddExtensionType(".mjs", "application/javascript")
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".json", "application/json")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".html", "text/html; charset=utf-8")
	_ = mime.AddExtensionType(".flac", "audio/flac")
	_ = mime.AddExtensionType(".wav", "audio/wav")
	_ = mime.AddExtensionType(".mp3", "audio/mpeg")
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, Accept")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// spaHandlerFS serves embedded frontend static files or falls back to index.html
func spaHandlerFS(fileSys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fileSys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)
		cleanPath = strings.TrimPrefix(cleanPath, "/")
		if cleanPath == "" || cleanPath == "." {
			cleanPath = "index.html"
		}

		f, err := fileSys.Open(cleanPath)
		if err != nil {
			// If file not found, serve index.html for client-side routing
			indexFile, err := fileSys.Open("index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer indexFile.Close()

			stat, _ := indexFile.Stat()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if readSeeker, ok := indexFile.(io.ReadSeeker); ok {
				http.ServeContent(w, r, "index.html", stat.ModTime(), readSeeker)
			} else {
				data, _ := io.ReadAll(indexFile)
				_, _ = w.Write(data)
			}
			return
		}
		_ = f.Close()

		ext := path.Ext(cleanPath)
		if m := mime.TypeByExtension(ext); m != "" {
			w.Header().Set("Content-Type", m)
		}

		fileServer.ServeHTTP(w, r)
	})
}

func main() {
	enableHighDPI()

	serverOnly := flag.Bool("server-only", false, "Run in headless server mode without native window")
	loginYandex := flag.Bool("login-yandex", false, "Open native Yandex Music login window")
	loginYouTube := flag.Bool("login-youtube", false, "Open native YouTube Music login window")
	flag.Parse()

	// Locate data directory
	exePath, err := os.Executable()
	var baseDir string
	if err == nil {
		baseDir = filepath.Dir(exePath)
	} else {
		baseDir, _ = os.Getwd()
	}

	dataDir := filepath.Join(baseDir, "data")
	// If running from server/ directory, place data in parent dj/data
	if filepath.Base(baseDir) == "server" {
		dataDir = filepath.Join(baseDir, "..", "data")
	}

	// Handle dedicated native login windows
	if *loginYandex {
		runYandexLoginWindow(baseDir, dataDir)
		return
	}
	if *loginYouTube {
		runYouTubeLoginWindow(baseDir, dataDir)
		return
	}

	// Clean up stale WebView2 HTTP disk cache so replaced audio files are never blocked by old cached files
	oldCacheDir := filepath.Join(dataDir, "app_profile", "EBWebView", "Default", "Cache", "Cache_Data")
	_ = os.RemoveAll(oldCacheDir)

	storage, err := NewStorage(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	globalDiscord.SetBaseDir(dataDir)
	api := NewAPI(storage)

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/tracks", api.handleTracks)
	mux.HandleFunc("/api/upload", api.handleUpload)
	mux.HandleFunc("/api/state", api.handleState)
	mux.HandleFunc("/api/stats", api.handleStats)
	mux.HandleFunc("/api/open-storage", api.handleOpenStorage)
	mux.HandleFunc("/api/set-storage", api.handleSetStorage)
	mux.HandleFunc("/api/export-m3u8", api.handleExportM3U8)
	mux.HandleFunc("/api/yandex/sync", api.handleYandexSync)
	mux.HandleFunc("/api/yandex/status", api.handleYandexStatus)
	mux.HandleFunc("/api/yandex/login", api.handleYandexLogin)
	mux.HandleFunc("/api/yandex/account", api.handleYandexAccount)
	mux.HandleFunc("/api/yandex/logout", api.handleYandexLogout)
	mux.HandleFunc("/api/yandex/token", api.handleYandexSaveToken)
	mux.HandleFunc("/api/youtube/sync", api.handleYouTubeSync)
	mux.HandleFunc("/api/youtube/status", api.handleYouTubeStatus)
	mux.HandleFunc("/api/youtube/config", api.handleYouTubeConfig)
	mux.HandleFunc("/api/youtube/login", api.handleYouTubeLogin)
	mux.HandleFunc("/api/youtube/account", api.handleYouTubeAccount)
	mux.HandleFunc("/api/youtube/logout", api.handleYouTubeLogout)
	mux.HandleFunc("/api/online/search", api.handleOnlineSearch)
	mux.HandleFunc("/api/online/albums", api.handleOnlineAlbums)
	mux.HandleFunc("/api/online/album-tracks", api.handleOnlineAlbumTracks)
	mux.HandleFunc("/api/online/radio/top", api.handleRadioTop)
	mux.HandleFunc("/api/online/radio/genre", api.handleRadioByGenre)
	mux.HandleFunc("/api/online/radio/country", api.handleRadioByCountry)
	mux.HandleFunc("/api/online/radio/search", api.handleRadioSearch)
	mux.HandleFunc("/api/online/radio/stream", api.handleRadioStream)
	mux.HandleFunc("/api/online/stream-yandex", api.handleOnlineStreamYandex)
	mux.HandleFunc("/api/online/stream-deezer", api.handleOnlineStreamDeezer)
	mux.HandleFunc("/api/online/stream-sc", api.handleOnlineStreamSC)
	mux.HandleFunc("/api/online/stream-yt", api.handleOnlineStreamYT)
	mux.HandleFunc("/api/online/stream", api.handleOnlineStream)
	mux.HandleFunc("/api/online/download", api.handleOnlineDownload)
	mux.HandleFunc("/api/online/artist-flow", api.handleArtistFlow)
	mux.HandleFunc("/api/online/versions", api.handleTrackVersions)
	mux.HandleFunc("/api/lyrics", api.handleLyrics)
	mux.HandleFunc("/api/versions/preferences", api.handleVersionPreferences)
	mux.HandleFunc("/api/versions/preferred", api.handleSetPreferredVersion)
	mux.HandleFunc("/api/versions/dislike", api.handleDislikeVersion)
	mux.HandleFunc("/api/tracks/auto-covers", api.handleAutoCovers)
	mux.HandleFunc("/api/tracks/search-covers", api.handleSearchCovers)
	mux.HandleFunc("/api/tracks/set-cover", api.handleSetTrackCover)
	mux.HandleFunc("/api/tracks/replace-version", api.handleReplaceVersion)
	mux.HandleFunc("/api/reorder", api.handleReorder)
	mux.HandleFunc("/api/edit-track/", api.handleUpdateTrack)
	mux.HandleFunc("/api/audio-devices", api.handleAudioDevices)
	mux.HandleFunc("/api/discord", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Title     string `json:"title"`
			Artist    string `json:"artist"`
			CoverURL  string `json:"coverUrl"`
			IsPlaying bool   `json:"isPlaying"`
			Enabled   bool   `json:"enabled"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		globalDiscord.SetEnabled(body.Enabled)
		if body.Enabled {
			globalDiscord.UpdateActivity(body.Title, body.Artist, body.CoverURL, body.IsPlaying)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Window management routes
	mux.HandleFunc("/api/window/mini", func(w http.ResponseWriter, r *http.Request) {
		enterMiniPlayerWin32(globalHWND)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/window/restore", func(w http.ResponseWriter, r *http.Request) {
		exitMiniPlayerWin32(globalHWND)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/window/pin", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Pin bool `json:"pin"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		setAlwaysOnTopWin32(globalHWND, body.Pin)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/window/drag", func(w http.ResponseWriter, r *http.Request) {
		startDragWin32(globalHWND)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/window/tray", func(w http.ResponseWriter, r *http.Request) {
		minimizeToTray(globalHWND)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/window/restore-tray", func(w http.ResponseWriter, r *http.Request) {
		restoreFromTray(globalHWND)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	mux.HandleFunc("/api/network-info", func(w http.ResponseWriter, r *http.Request) {
		interfaces := getNetworkInterfaces()
		var ips []string
		primaryIP := "127.0.0.1"

		for _, iface := range interfaces {
			ips = append(ips, iface.IP)
			if iface.IsPrimary {
				primaryIP = iface.IP
			}
		}

		if primaryIP == "127.0.0.1" && len(ips) > 0 {
			primaryIP = ips[0]
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"port":       29888,
			"primaryIp":  primaryIP,
			"ips":        ips,
			"interfaces": interfaces,
			"mobileUrl":  fmt.Sprintf("http://%s:29888/mobile", primaryIP),
			"webUrl":     fmt.Sprintf("http://%s:29888", primaryIP),
		})
	})

	mux.HandleFunc("/api/stream/", func(w http.ResponseWriter, r *http.Request) {
		api.handleStream(w, r)
	})
	mux.HandleFunc("/api/cover/", func(w http.ResponseWriter, r *http.Request) {
		api.handleCover(w, r)
	})
	mux.HandleFunc("/api/duration/", func(w http.ResponseWriter, r *http.Request) {
		api.handleUpdateDuration(w, r)
	})
	mux.HandleFunc("/api/tracks/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			api.handleDeleteTrack(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})

	// Check and serve mobile client static files at /mobile/
	mobileDirs := []string{
		filepath.Join(baseDir, "android", "mobile-web", "dist"),
		filepath.Join(baseDir, "..", "android", "mobile-web", "dist"),
		filepath.Join(baseDir, "android", "app", "src", "main", "assets", "public"),
		filepath.Join(baseDir, "..", "android", "app", "src", "main", "assets", "public"),
	}
	var mobileStaticDir string
	for _, md := range mobileDirs {
		if info, err := os.Stat(md); err == nil && info.IsDir() {
			mobileStaticDir = md
			break
		}
	}
	if mobileStaticDir != "" {
		mux.Handle("/mobile/", http.StripPrefix("/mobile", http.FileServer(http.Dir(mobileStaticDir))))
		mux.HandleFunc("/mobile", func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "/mobile/", http.StatusMovedPermanently)
		})
	}

	// Serve embedded client
	distFS, err := fs.Sub(embeddedClient, "dist")
	if err == nil {
		mux.Handle("/", spaHandlerFS(distFS))
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprintf(w, "<h2>FreeToPlayer is running.</h2>")
		})
	}

	handler := withCORS(mux)

	// Listen on 0.0.0.0:29888 so mobile devices (Android) on local Wi-Fi can connect
	listener, err := net.Listen("tcp", "0.0.0.0:29888")
	if err != nil {
		// Fallback to loopback if 0.0.0.0 is restricted
		listener, err = net.Listen("tcp", "127.0.0.1:29888")
		if err != nil {
			listener, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				log.Fatalf("Failed to bind listener: %v", err)
			}
		}
	}

	server := &http.Server{Handler: handler}
	go func() {
		_ = server.Serve(listener)
	}()

	actualPort := "29888"
	if tcpAddr, ok := listener.Addr().(*net.TCPAddr); ok {
		actualPort = fmt.Sprintf("%d", tcpAddr.Port)
	}

	appURL := fmt.Sprintf("http://127.0.0.1:%s", actualPort)
	log.Printf("==================================================")
	log.Printf("FreeToPlayer Core Engine started!")
	log.Printf("PC Desktop URL:  %s", appURL)
	localIPs := getLocalIPAddresses()
	for _, ip := range localIPs {
		log.Printf("Android/Phone:   http://%s:%s/mobile", ip, actualPort)
	}
	log.Printf("==================================================")

	if *serverOnly {
		select {} // Block forever in server-only mode
	}

	// Create native Windows desktop application window
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     true,
		DataPath:  filepath.Join(dataDir, "app_profile"),
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "FreeToPlayer",
			Width:  1240,
			Height: 840,
			IconId: 1,
			Center: true,
		},
	})

	if w == nil {
		log.Printf("WebView2 initialization failed, falling back to server mode: %s", appURL)
		select {}
	}
	defer w.Destroy()

	globalHWND = uintptr(w.Window())
	hwnd := globalHWND

	// Apply dark theme to native Windows titlebar
	setDarkWindowTitleBar(hwnd)
	setWindowAppID(hwnd)

	// Initialize system tray integration
	initTray(hwnd)
	defer removeTray(hwnd)

	// Restore previous window size and position
	restoreWindowState(hwnd, dataDir)

	// Save window state periodically
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if !isFullscreen {
				saveWindowState(hwnd, dataDir)
			}
		}
	}()

	// Bind toggleFullscreen to JavaScript window.toggleFullscreen()
	_ = w.Bind("toggleFullscreen", func() bool {
		return toggleFullscreenWin32(hwnd)
	})

	// Bind mini-player controls (frameless popup + drag)
	_ = w.Bind("enterMiniPlayer", func() {
		enterMiniPlayerWin32(hwnd)
	})
	_ = w.Bind("exitMiniPlayer", func() {
		exitMiniPlayerWin32(hwnd)
	})
	_ = w.Bind("startWindowDrag", func() {
		startDragWin32(hwnd)
	})
	_ = w.Bind("setWindowCaptionColor", func(hexColor string) {
		setWindowCaptionColorWin32(hwnd, hexColor)
	})

	// Bind setAlwaysOnTop to JavaScript window.setAlwaysOnTop(bool)
	_ = w.Bind("setAlwaysOnTop", func(enable bool) bool {
		return setAlwaysOnTopWin32(hwnd, enable)
	})

	// Bind setWindowSize to JavaScript window.setWindowSize(w, h)
	_ = w.Bind("setWindowSize", func(width, height int) {
		setWindowSizeWin32(hwnd, int32(width), int32(height))
	})

	// Bind Discord RPC controls
	_ = w.Bind("setDiscordEnabled", func(enable bool) {
		globalDiscord.SetEnabled(enable)
	})
	_ = w.Bind("updateDiscordStatus", func(title, artist, coverUrl string, isPlaying bool) {
		globalDiscord.UpdateActivity(title, artist, coverUrl, isPlaying)
	})

	// Bind system tray controls
	_ = w.Bind("minimizeToTray", func() {
		minimizeToTray(hwnd)
	})
	_ = w.Bind("restoreFromTray", func() {
		restoreFromTray(hwnd)
	})

	w.Navigate(appURL)

	// Run desktop application window event loop
	w.Run()

	// Save final window state on exit
	saveWindowState(hwnd, dataDir)
}

package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const CurrentAppVersion = "1.0.1"
const GitHubRepoOwner = "ELKAPY"
const GitHubRepoName = "FreeToPlayer"

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseName    string `json:"releaseName"`
	ReleaseNotes   string `json:"releaseNotes"`
	DownloadURL    string `json:"downloadUrl"`
	FileName       string `json:"fileName"`
	FileSize       int64  `json:"fileSize"`
	PublishedAt    string `json:"publishedAt"`
}

type UpdateProgress struct {
	Status     string  `json:"status"` // "idle", "checking", "downloading", "ready", "installing", "error"
	Percent    float64 `json:"percent"`
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Message    string  `json:"message"`
	Error      string  `json:"error,omitempty"`
}

var (
	updaterStateMutex sync.Mutex
	updaterProgress   = UpdateProgress{
		Status:  "idle",
		Message: "Готов к проверке",
	}
	cachedUpdateInfo *UpdateInfo
)

func setUpdateProgress(status, message string, pct float64, dl, total int64, errStr string) {
	updaterStateMutex.Lock()
	defer updaterStateMutex.Unlock()
	updaterProgress.Status = status
	updaterProgress.Message = message
	updaterProgress.Percent = pct
	updaterProgress.Downloaded = dl
	updaterProgress.Total = total
	updaterProgress.Error = errStr
}

// Compare semantic versions (e.g. "1.0.1" vs "1.0.2")
func isNewerVersion(current, latest string) bool {
	cParts := parseVersionParts(current)
	lParts := parseVersionParts(latest)

	for i := 0; i < len(cParts) || i < len(lParts); i++ {
		cVal := 0
		if i < len(cParts) {
			cVal = cParts[i]
		}
		lVal := 0
		if i < len(lParts) {
			lVal = lParts[i]
		}
		if lVal > cVal {
			return true
		}
		if lVal < cVal {
			return false
		}
	}
	return false
}

func parseVersionParts(v string) []int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	parts := strings.Split(v, ".")
	nums := make([]int, 0, len(parts))
	for _, p := range parts {
		// Cut any suffix like "-beta"
		if idx := strings.IndexAny(p, "-+"); idx != -1 {
			p = p[:idx]
		}
		n, _ := strconv.Atoi(p)
		nums = append(nums, n)
	}
	return nums
}

func checkGitHubRelease() (*UpdateInfo, error) {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", GitHubRepoOwner, GitHubRepoName)

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "FreeToPlayer-Updater/"+CurrentAppVersion)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned HTTP %d", resp.StatusCode)
	}

	var rel struct {
		TagName      string `json:"tag_name"`
		Name         string `json:"name"`
		Body         string `json:"body"`
		PublishedAt  string `json:"published_at"`
		Assets       []struct {
			Name               string `json:"name"`
			Size               int64  `json:"size"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}

	latestVer := strings.TrimPrefix(rel.TagName, "v")
	hasUpdate := isNewerVersion(CurrentAppVersion, latestVer)

	// Pick asset: prioritize FreeToPlayer.exe, fallback to zip
	dlURL := ""
	fileName := ""
	var fileSize int64 = 0

	for _, a := range rel.Assets {
		if strings.EqualFold(a.Name, "FreeToPlayer.exe") {
			dlURL = a.BrowserDownloadURL
			fileName = a.Name
			fileSize = a.Size
			break
		}
	}
	if dlURL == "" {
		for _, a := range rel.Assets {
			if strings.HasSuffix(strings.ToLower(a.Name), ".zip") {
				dlURL = a.BrowserDownloadURL
				fileName = a.Name
				fileSize = a.Size
				break
			}
		}
	}

	info := &UpdateInfo{
		CurrentVersion: CurrentAppVersion,
		LatestVersion:  latestVer,
		HasUpdate:      hasUpdate,
		ReleaseName:    rel.Name,
		ReleaseNotes:   rel.Body,
		DownloadURL:    dlURL,
		FileName:       fileName,
		FileSize:       fileSize,
		PublishedAt:    rel.PublishedAt,
	}

	cachedUpdateInfo = info
	return info, nil
}

// HTTP handler to check for updates
func (a *API) handleCheckUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	setUpdateProgress("checking", "Проверка обновлений на GitHub...", 0, 0, 0, "")

	info, err := checkGitHubRelease()
	if err != nil {
		setUpdateProgress("error", "Не удалось проверить обновления: "+err.Error(), 0, 0, 0, err.Error())
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if info.HasUpdate {
		setUpdateProgress("idle", fmt.Sprintf("Доступна новая версия: v%s", info.LatestVersion), 0, 0, 0, "")
	} else {
		setUpdateProgress("idle", "У вас установлена самая последняя версия", 0, 0, 0, "")
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"update":  info,
	})
}

// HTTP handler to get current updater progress
func (a *API) handleUpdateProgress(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	updaterStateMutex.Lock()
	prog := updaterProgress
	updaterStateMutex.Unlock()
	_ = json.NewEncoder(w).Encode(prog)
}

// HTTP handler to download and apply update
func (a *API) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if cachedUpdateInfo == nil || cachedUpdateInfo.DownloadURL == "" {
		http.Error(w, "Сначала проверьте наличие обновлений", http.StatusBadRequest)
		return
	}

	go performDownloadAndApply(a.storage.baseDir, cachedUpdateInfo)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Загрузка обновления начата",
	})
}

func performDownloadAndApply(baseDir string, info *UpdateInfo) {
	setUpdateProgress("downloading", "Загрузка новой версии...", 0, 0, info.FileSize, "")

	currentExe, err := os.Executable()
	if err != nil {
		currentExe = filepath.Join(baseDir, "FreeToPlayer.exe")
	}

	tempNewExe := currentExe + ".update.tmp"
	_ = os.Remove(tempNewExe)

	client := &http.Client{
		Timeout: 5 * time.Minute,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	resp, err := client.Get(info.DownloadURL)
	if err != nil {
		setUpdateProgress("error", "Ошибка скачивания: "+err.Error(), 0, 0, 0, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		setUpdateProgress("error", fmt.Sprintf("Ошибка сервера при скачивании: HTTP %d", resp.StatusCode), 0, 0, 0, "Bad status")
		return
	}

	totalBytes := resp.ContentLength
	if totalBytes <= 0 {
		totalBytes = info.FileSize
	}

	out, err := os.OpenFile(tempNewExe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		setUpdateProgress("error", "Не удалось создать файл для обновления: "+err.Error(), 0, 0, 0, err.Error())
		return
	}

	buf := make([]byte, 64*1024)
	var downloaded int64 = 0

	for {
		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			_, wErr := out.Write(buf[:n])
			if wErr != nil {
				out.Close()
				_ = os.Remove(tempNewExe)
				setUpdateProgress("error", "Ошибка записи на диск: "+wErr.Error(), 0, 0, 0, wErr.Error())
				return
			}
			downloaded += int64(n)
			var pct float64 = 0
			if totalBytes > 0 {
				pct = (float64(downloaded) / float64(totalBytes)) * 100.0
			}
			setUpdateProgress("downloading", fmt.Sprintf("Загрузка обновления: %.1f%% (%d / %d MB)", pct, downloaded/(1024*1024), totalBytes/(1024*1024)), pct, downloaded, totalBytes, "")
		}
		if rErr != nil {
			if rErr == io.EOF {
				break
			}
			out.Close()
			_ = os.Remove(tempNewExe)
			setUpdateProgress("error", "Сбой соединения: "+rErr.Error(), 0, 0, 0, rErr.Error())
			return
		}
	}
	out.Close()

	setUpdateProgress("ready", "Обновление готово к установке!", 100.0, downloaded, totalBytes, "")
}

// HTTP handler to restart app with updated binary
func (a *API) handleRestartAndApply(w http.ResponseWriter, r *http.Request) {
	currentExe, err := os.Executable()
	if err != nil {
		currentExe = filepath.Join(a.storage.baseDir, "FreeToPlayer.exe")
	}

	tempNewExe := currentExe + ".update.tmp"
	if fi, err := os.Stat(tempNewExe); err != nil || fi.Size() < 1000000 {
		http.Error(w, "Файл обновления не найден или поврежден", http.StatusBadRequest)
		return
	}

	// Create self-replacing batch script that waits for current process exit, swaps binaries and launches fresh app
	updaterBat := filepath.Join(filepath.Dir(currentExe), "freetoplayer_updater.bat")
	currentPID := os.Getpid()

	batContent := fmt.Sprintf(`@echo off
chcp 65001 > nul
echo FreeToPlayer Auto-Updater
echo Ожидание завершения предыдущего процесса...
timeout /t 1 /nobreak > nul

:wait_loop
tasklist /fi "PID eq %d" 2>nul | find /i "%d" >nul
if not errorlevel 1 (
    timeout /t 1 /nobreak > nul
    goto wait_loop
)

echo Замена исполняемого файла на версию %s...
move /y "%s" "%s" > nul

echo Запуск обновленного FreeToPlayer...
start "" "%s"

del "%%~f0"
`, currentPID, currentPID, cachedUpdateInfo.LatestVersion, tempNewExe, currentExe, currentExe)

	if err := os.WriteFile(updaterBat, []byte(batContent), 0755); err != nil {
		http.Error(w, "Не удалось создать скрипт установки: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Перезапуск приложения...",
	})

	go func() {
		time.Sleep(500 * time.Millisecond)
		cmd := exec.Command("cmd.exe", "/c", updaterBat)
		cmd.Dir = filepath.Dir(currentExe)
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000,
		}
		_ = cmd.Start()
		os.Exit(0)
	}()
}

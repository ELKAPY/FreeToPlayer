package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"unsafe"
	"golang.org/x/sys/windows"
)

type SavedWindowState struct {
	X           int32 `json:"x"`
	Y           int32 `json:"y"`
	Width       int32 `json:"width"`
	Height      int32 `json:"height"`
	IsMaximized bool  `json:"isMaximized"`
}

func getWindowStateFile(baseDir string) string {
	return filepath.Join(baseDir, "window_state.json")
}

func saveWindowState(hwnd uintptr, baseDir string) {
	if hwnd == 0 {
		return
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	getWindowPlacement := user32.NewProc("GetWindowPlacement")
	isZoomed := user32.NewProc("IsZoomed")

	var wp WindowPlacement
	wp.Length = uint32(unsafe.Sizeof(wp))
	_, _, _ = getWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp)))
	zoomed, _, _ := isZoomed.Call(hwnd)

	st := SavedWindowState{
		X:           wp.RcNormalPosition.Left,
		Y:           wp.RcNormalPosition.Top,
		Width:       wp.RcNormalPosition.Right - wp.RcNormalPosition.Left,
		Height:      wp.RcNormalPosition.Bottom - wp.RcNormalPosition.Top,
		IsMaximized: zoomed != 0,
	}

	if st.Width < 400 || st.Height < 300 {
		return
	}

	data, err := json.MarshalIndent(st, "", "  ")
	if err == nil {
		_ = os.WriteFile(getWindowStateFile(baseDir), data, 0644)
	}
}

func restoreWindowState(hwnd uintptr, baseDir string) {
	if hwnd == 0 {
		return
	}
	file := getWindowStateFile(baseDir)
	data, err := os.ReadFile(file)
	if err != nil {
		return
	}

	var st SavedWindowState
	if err := json.Unmarshal(data, &st); err != nil {
		return
	}

	if st.Width < 600 || st.Height < 400 {
		return
	}

	user32 := windows.NewLazySystemDLL("user32.dll")
	setWindowPos := user32.NewProc("SetWindowPos")
	showWindow := user32.NewProc("ShowWindow")

	_, _, _ = setWindowPos.Call(
		hwnd,
		0,
		uintptr(st.X),
		uintptr(st.Y),
		uintptr(st.Width),
		uintptr(st.Height),
		uintptr(SWP_NOZORDER|SWP_FRAMECHANGED),
	)

	if st.IsMaximized {
		const SW_MAXIMIZE = 3
		_, _, _ = showWindow.Call(hwnd, SW_MAXIMIZE)
	}
}

package main

import (
	"os"
	"path/filepath"
	"unsafe"
	"golang.org/x/sys/windows"
)

const (
	DWMWA_USE_IMMERSIVE_DARK_MODE = 20
	DWMWA_BORDER_COLOR            = 34
	DWMWA_CAPTION_COLOR           = 35
	DWMWA_TEXT_COLOR              = 36

	WM_SETICON      = 0x0080
	ICON_SMALL      = 0
	ICON_BIG        = 1
	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x00000010
)

func setDarkWindowTitleBar(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	dwmapi := windows.NewLazySystemDLL("dwmapi.dll")
	setAttr := dwmapi.NewProc("DwmSetWindowAttribute")
	if setAttr.Find() == nil {
		// 1. Enable Immersive Dark Mode
		darkMode := int32(1)
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_USE_IMMERSIVE_DARK_MODE),
			uintptr(unsafe.Pointer(&darkMode)),
			uintptr(unsafe.Sizeof(darkMode)),
		)

		// 2. Set Border Color to #07080C (removes top/edge lines on Windows 11)
		borderColor := uint32(0x000C0807)
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_BORDER_COLOR),
			uintptr(unsafe.Pointer(&borderColor)),
			uintptr(unsafe.Sizeof(borderColor)),
		)

		// 3. Set Caption Color to #07080C (BGR: 0x000C0807)
		captionColor := uint32(0x000C0807)
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_CAPTION_COLOR),
			uintptr(unsafe.Pointer(&captionColor)),
			uintptr(unsafe.Sizeof(captionColor)),
		)

		// 4. Set Titlebar Text Color to light slate
		textColor := uint32(0x00E2E8F0)
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_TEXT_COLOR),
			uintptr(unsafe.Pointer(&textColor)),
			uintptr(unsafe.Sizeof(textColor)),
		)
	}

	// Set window icon to app_icon.ico
	setWindowIcon(hwnd)
}

func setWindowIcon(hwnd uintptr) {
	user32 := windows.NewLazySystemDLL("user32.dll")
	sendMessage := user32.NewProc("SendMessageW")
	getModuleHandle := user32.NewProc("GetModuleHandleW")
	loadIcon := user32.NewProc("LoadIconW")
	loadImage := user32.NewProc("LoadImageW")

	if sendMessage.Find() != nil {
		return
	}

	// 1. Try loading from embedded resource in FreeToPlayer.exe
	if getModuleHandle.Find() == nil && loadIcon.Find() == nil {
		hMod, _, _ := getModuleHandle.Call(0)
		hResIcon, _, _ := loadIcon.Call(hMod, uintptr(1))
		if hResIcon != 0 {
			_, _, _ = sendMessage.Call(hwnd, WM_SETICON, ICON_BIG, hResIcon)
			_, _, _ = sendMessage.Call(hwnd, WM_SETICON, ICON_SMALL, hResIcon)
			return
		}
	}

	// 2. Fallback to app_icon.ico file
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	dir := filepath.Dir(exePath)
	iconPath := filepath.Join(dir, "app_icon.ico")
	if _, err := os.Stat(iconPath); err != nil {
		iconPath = filepath.Join(dir, "..", "app_icon.ico")
		if _, err := os.Stat(iconPath); err != nil {
			return
		}
	}

	iconPtr, err := windows.UTF16PtrFromString(iconPath)
	if err != nil {
		return
	}

	if loadImage.Find() == nil {
		hBig, _, _ := loadImage.Call(0, uintptr(unsafe.Pointer(iconPtr)), IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
		hSmall, _, _ := loadImage.Call(0, uintptr(unsafe.Pointer(iconPtr)), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)

		if hBig != 0 {
			_, _, _ = sendMessage.Call(hwnd, WM_SETICON, ICON_BIG, hBig)
		}
		if hSmall != 0 {
			_, _, _ = sendMessage.Call(hwnd, WM_SETICON, ICON_SMALL, hSmall)
		}
	}
}

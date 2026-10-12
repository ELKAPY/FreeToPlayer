package main

import (
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	NIM_ADD          = 0x00000000
	NIM_MODIFY       = 0x00000001
	NIM_DELETE       = 0x00000002
	NIF_MESSAGE      = 0x00000001
	NIF_ICON         = 0x00000002
	NIF_TIP          = 0x00000004
	WM_TRAYICON      = 0x8064 // WM_APP + 100
	WM_LBUTTONUP     = 0x0202
	WM_LBUTTONDBLCLK = 0x0203
	WM_RBUTTONUP     = 0x0205
	GWLP_WNDPROC     = 0xFFFFFFFC // -4 in 32-bit/64-bit signed representation
	SW_HIDE          = 0
	SW_SHOW          = 5
)

type NOTIFYICONDATAW struct {
	CbSize            uint32
	HWnd              uintptr
	UID               uint32
	UFlags            uint32
	UCallbackMessage  uint32
	HIcon             uintptr
	SzTip             [128]uint16
	DwState           uint32
	DwStateMask       uint32
	SzInfo            [256]uint16
	UTimeoutOrVersion uint32
	SzInfoTitle       [64]uint16
	DwInfoFlags       uint32
	GuidItem          windows.GUID
	HBalloonIcon      uintptr
}

var (
	trayMu         sync.Mutex
	trayHWND       uintptr
	trayIconActive bool
	origWndProc    uintptr
	trayNotifyData NOTIFYICONDATAW
)

func getAppIconHandle() uintptr {
	user32 := windows.NewLazySystemDLL("user32.dll")
	getModuleHandle := user32.NewProc("GetModuleHandleW")
	loadIcon := user32.NewProc("LoadIconW")
	loadImage := user32.NewProc("LoadImageW")

	if getModuleHandle.Find() == nil && loadIcon.Find() == nil {
		hMod, _, _ := getModuleHandle.Call(0)
		hResIcon, _, _ := loadIcon.Call(hMod, uintptr(1))
		if hResIcon != 0 {
			return hResIcon
		}
	}

	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		iconPath := filepath.Join(dir, "app_icon.ico")
		if _, err := os.Stat(iconPath); err != nil {
			iconPath = filepath.Join(dir, "..", "app_icon.ico")
		}
		if iconPtr, err := windows.UTF16PtrFromString(iconPath); err == nil && loadImage.Find() == nil {
			hSmall, _, _ := loadImage.Call(0, uintptr(unsafe.Pointer(iconPtr)), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
			if hSmall != 0 {
				return hSmall
			}
		}
	}
	return 0
}

func trayWndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	user32 := windows.NewLazySystemDLL("user32.dll")
	callWindowProc := user32.NewProc("CallWindowProcW")

	switch msg {
	case WM_TRAYICON:
		switch lParam {
		case WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_RBUTTONUP:
			restoreFromTray(hwnd)
			return 0
		}
	}

	if origWndProc != 0 && callWindowProc.Find() == nil {
		res, _, _ := callWindowProc.Call(origWndProc, hwnd, uintptr(msg), wParam, lParam)
		return res
	}

	defWindowProc := user32.NewProc("DefWindowProcW")
	res, _, _ := defWindowProc.Call(hwnd, uintptr(msg), wParam, lParam)
	return res
}

func initTray(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	trayHWND = hwnd

	user32 := windows.NewLazySystemDLL("user32.dll")
	setWindowLongPtr := user32.NewProc("SetWindowLongPtrW")
	if setWindowLongPtr.Find() != nil {
		setWindowLongPtr = user32.NewProc("SetWindowLongW")
	}

	cb := syscall.NewCallback(trayWndProc)
	oldProc, _, _ := setWindowLongPtr.Call(hwnd, uintptr(GWLP_WNDPROC), cb)
	if oldProc != 0 {
		origWndProc = oldProc
	}
}

func minimizeToTray(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	trayMu.Lock()
	defer trayMu.Unlock()

	user32 := windows.NewLazySystemDLL("user32.dll")
	showWindow := user32.NewProc("ShowWindow")
	shell32 := windows.NewLazySystemDLL("shell32.dll")
	shellNotifyIcon := shell32.NewProc("Shell_NotifyIconW")

	_, _, _ = showWindow.Call(hwnd, SW_HIDE)

	if !trayIconActive && shellNotifyIcon.Find() == nil {
		hIcon := getAppIconHandle()

		trayNotifyData = NOTIFYICONDATAW{
			CbSize:           uint32(unsafe.Sizeof(trayNotifyData)),
			HWnd:             hwnd,
			UID:              1001,
			UFlags:           NIF_MESSAGE | NIF_ICON | NIF_TIP,
			UCallbackMessage: WM_TRAYICON,
			HIcon:            hIcon,
		}

		tipStr, _ := windows.UTF16FromString("FreeToPlayer (играет в фоне)")
		copy(trayNotifyData.SzTip[:], tipStr)

		res, _, _ := shellNotifyIcon.Call(NIM_ADD, uintptr(unsafe.Pointer(&trayNotifyData)))
		if res != 0 {
			trayIconActive = true
		}
	}
}

func restoreFromTray(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	trayMu.Lock()
	defer trayMu.Unlock()

	user32 := windows.NewLazySystemDLL("user32.dll")
	showWindow := user32.NewProc("ShowWindow")
	setForegroundWindow := user32.NewProc("SetForegroundWindow")
	shell32 := windows.NewLazySystemDLL("shell32.dll")
	shellNotifyIcon := shell32.NewProc("Shell_NotifyIconW")

	if trayIconActive && shellNotifyIcon.Find() == nil {
		_, _, _ = shellNotifyIcon.Call(NIM_DELETE, uintptr(unsafe.Pointer(&trayNotifyData)))
		trayIconActive = false
	}

	_, _, _ = showWindow.Call(hwnd, SW_RESTORE)
	_, _, _ = setForegroundWindow.Call(hwnd)
}

func removeTray(hwnd uintptr) {
	trayMu.Lock()
	defer trayMu.Unlock()

	if trayIconActive {
		shell32 := windows.NewLazySystemDLL("shell32.dll")
		shellNotifyIcon := shell32.NewProc("Shell_NotifyIconW")
		if shellNotifyIcon.Find() == nil {
			_, _, _ = shellNotifyIcon.Call(NIM_DELETE, uintptr(unsafe.Pointer(&trayNotifyData)))
			trayIconActive = false
		}
	}
}

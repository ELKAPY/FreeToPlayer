package main

import (
	"strconv"
	"strings"
	"unsafe"
	"golang.org/x/sys/windows"
)

const (
	GWL_STYLE           = -16
	WS_OVERLAPPEDWINDOW = 0x00CF0000
	WS_POPUP            = 0x80000000
	WS_VISIBLE          = 0x10000000
	SWP_NOSIZE          = 0x0001
	SWP_NOMOVE          = 0x0002
	SWP_NOZORDER        = 0x0004
	SWP_FRAMECHANGED    = 0x0020
	SWP_SHOWWINDOW      = 0x0040
	MONITOR_DEFAULTTONEAREST = 2
	SW_RESTORE          = 9
	SM_CXSCREEN         = 0
	SM_CYSCREEN         = 1
)

type RECT struct {
	Left, Top, Right, Bottom int32
}

type MONITORINFO struct {
	CbSize    uint32
	RcMonitor RECT
	RcWork    RECT
	DwFlags   uint32
}

type WindowPlacement struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    [2]int32
	PtMaxPosition    [2]int32
	RcNormalPosition RECT
}

var (
	isFullscreen        bool
	savedPlacement      WindowPlacement
	savedStyle          int32
	lastCaptionColorHex string = "#07080C"
)

func toggleFullscreenWin32(hwnd uintptr) bool {
	if hwnd == 0 {
		return false
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	getWindowLong := user32.NewProc("GetWindowLongW")
	setWindowLong := user32.NewProc("SetWindowLongW")
	getWindowPlacement := user32.NewProc("GetWindowPlacement")
	setWindowPlacement := user32.NewProc("SetWindowPlacement")
	setWindowPos := user32.NewProc("SetWindowPos")
	monitorFromWindow := user32.NewProc("MonitorFromWindow")
	getMonitorInfo := user32.NewProc("GetMonitorInfoW")

	gwlStyle := uintptr(uint32(0xFFFFFFF0)) // GWL_STYLE = -16

	if !isFullscreen {
		style, _, _ := getWindowLong.Call(hwnd, gwlStyle)
		savedStyle = int32(style)

		savedPlacement.Length = uint32(unsafe.Sizeof(savedPlacement))
		_, _, _ = getWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedPlacement)))

		hMon, _, _ := monitorFromWindow.Call(hwnd, uintptr(MONITOR_DEFAULTTONEAREST))
		var mi MONITORINFO
		mi.CbSize = uint32(unsafe.Sizeof(mi))
		_, _, _ = getMonitorInfo.Call(hMon, uintptr(unsafe.Pointer(&mi)))

		wsPopup := int32(-0x80000000)
		newStyle := (savedStyle & ^int32(WS_OVERLAPPEDWINDOW)) | wsPopup
		_, _, _ = setWindowLong.Call(hwnd, gwlStyle, uintptr(newStyle))

		w := mi.RcMonitor.Right - mi.RcMonitor.Left
		h := mi.RcMonitor.Bottom - mi.RcMonitor.Top
		_, _, _ = setWindowPos.Call(
			hwnd,
			0, // HWND_TOP
			uintptr(mi.RcMonitor.Left),
			uintptr(mi.RcMonitor.Top),
			uintptr(w),
			uintptr(h),
			uintptr(SWP_NOZORDER|SWP_FRAMECHANGED),
		)

		isFullscreen = true
		return true
	} else {
		_, _, _ = setWindowLong.Call(hwnd, gwlStyle, uintptr(savedStyle))
		_, _, _ = setWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedPlacement)))
		_, _, _ = setWindowPos.Call(
			hwnd,
			0,
			0, 0, 0, 0,
			uintptr(SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_FRAMECHANGED|SWP_SHOWWINDOW),
		)

		setDarkWindowTitleBar(hwnd)
		if lastCaptionColorHex != "" {
			setWindowCaptionColorWin32(hwnd, lastCaptionColorHex)
		}

		redrawWindow := user32.NewProc("RedrawWindow")
		if redrawWindow.Find() == nil {
			_, _, _ = redrawWindow.Call(
				hwnd,
				0,
				0,
				uintptr(0x0400|0x0001|0x0100), // RDW_FRAME | RDW_INVALIDATE | RDW_UPDATENOW
			)
		}

		isFullscreen = false
		return false
	}
}

// enterMiniPlayerWin32 restores out of maximized state, removes borders, and shrinks to compact floating 340x72 widget
func enterMiniPlayerWin32(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	sendMessage := user32.NewProc("SendMessageW")
	setWindowLong := user32.NewProc("SetWindowLongW")
	setWindowPos := user32.NewProc("SetWindowPos")
	getSystemMetrics := user32.NewProc("GetSystemMetrics")

	// 1. Force break out of maximized/zoomed state synchronously
	_, _, _ = sendMessage.Call(hwnd, 0x0112, 0xF120, 0) // WM_SYSCOMMAND, SC_RESTORE

	// 2. Remove caption and borders: pure borderless popup
	gwlStyle := uintptr(uint32(0xFFFFFFF0))
	wsPopup := int32(-0x80000000) | int32(WS_VISIBLE)
	_, _, _ = setWindowLong.Call(hwnd, gwlStyle, uintptr(wsPopup))

	// 3. Position at bottom-right corner of screen
	scrW, _, _ := getSystemMetrics.Call(SM_CXSCREEN)
	scrH, _, _ := getSystemMetrics.Call(SM_CYSCREEN)

	width := int32(340)
	height := int32(72)
	x := int32(scrW) - width - 40
	y := int32(scrH) - height - 80
	if x < 0 {
		x = 100
	}
	if y < 0 {
		y = 100
	}

	topmost := uintptr(uint32(0xFFFFFFFF)) // HWND_TOPMOST = -1
	_, _, _ = setWindowPos.Call(
		hwnd,
		topmost,
		uintptr(x),
		uintptr(y),
		uintptr(width),
		uintptr(height),
		uintptr(SWP_FRAMECHANGED|SWP_SHOWWINDOW),
	)
}

// exitMiniPlayerWin32 restores standard 1240x840 window centered on screen
func exitMiniPlayerWin32(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	setWindowLong := user32.NewProc("SetWindowLongW")
	setWindowPos := user32.NewProc("SetWindowPos")
	getSystemMetrics := user32.NewProc("GetSystemMetrics")

	// Restore standard window style with caption
	gwlStyle := uintptr(uint32(0xFFFFFFF0))
	style := int32(WS_OVERLAPPEDWINDOW | WS_VISIBLE)
	_, _, _ = setWindowLong.Call(hwnd, gwlStyle, uintptr(style))

	scrW, _, _ := getSystemMetrics.Call(SM_CXSCREEN)
	scrH, _, _ := getSystemMetrics.Call(SM_CYSCREEN)

	w := int32(1240)
	h := int32(840)
	x := (int32(scrW) - w) / 2
	y := (int32(scrH) - h) / 2
	if x < 0 {
		x = 50
	}
	if y < 0 {
		y = 50
	}

	notopmost := uintptr(uint32(0xFFFFFFFE)) // HWND_NOTOPMOST = -2
	_, _, _ = setWindowPos.Call(
		hwnd,
		notopmost,
		uintptr(x),
		uintptr(y),
		uintptr(w),
		uintptr(h),
		uintptr(SWP_FRAMECHANGED|SWP_SHOWWINDOW),
	)

	setDarkWindowTitleBar(hwnd)
}

// startDragWin32 enables dragging the borderless window with the mouse
func startDragWin32(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	releaseCapture := user32.NewProc("ReleaseCapture")
	sendMessage := user32.NewProc("SendMessageW")

	_, _, _ = releaseCapture.Call()
	// WM_NCLBUTTONDOWN = 0x00A1, HTCAPTION = 2
	_, _, _ = sendMessage.Call(hwnd, 0x00A1, 2, 0)
}

func setAlwaysOnTopWin32(hwnd uintptr, enable bool) bool {
	if hwnd == 0 {
		return false
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	setWindowPos := user32.NewProc("SetWindowPos")

	var insertAfter uintptr = uintptr(uint32(0xFFFFFFFE)) // HWND_NOTOPMOST = -2
	if enable {
		insertAfter = uintptr(uint32(0xFFFFFFFF)) // HWND_TOPMOST = -1
	}

	_, _, _ = setWindowPos.Call(
		hwnd,
		insertAfter,
		0, 0, 0, 0,
		uintptr(SWP_NOMOVE|SWP_NOSIZE|SWP_FRAMECHANGED),
	)
	return enable
}

func setWindowSizeWin32(hwnd uintptr, width, height int32) {
	if hwnd == 0 {
		return
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	setWindowPos := user32.NewProc("SetWindowPos")
	_, _, _ = setWindowPos.Call(
		hwnd,
		0,
		0, 0,
		uintptr(width),
		uintptr(height),
		uintptr(SWP_NOMOVE|SWP_NOZORDER|SWP_FRAMECHANGED),
	)
}

func setWindowCaptionColorWin32(hwnd uintptr, hexColor string) {
	if hwnd == 0 {
		return
	}
	rawHex := strings.TrimPrefix(hexColor, "#")
	if len(rawHex) != 6 {
		return
	}
	lastCaptionColorHex = "#" + rawHex

	r, _ := strconv.ParseUint(rawHex[0:2], 16, 8)
	g, _ := strconv.ParseUint(rawHex[2:4], 16, 8)
	b, _ := strconv.ParseUint(rawHex[4:6], 16, 8)

	// BGR COLORREF format
	captionColor := uint32(b)<<16 | uint32(g)<<8 | uint32(r)

	dwmapi := windows.NewLazySystemDLL("dwmapi.dll")
	setAttr := dwmapi.NewProc("DwmSetWindowAttribute")
	if setAttr.Find() == nil {
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_CAPTION_COLOR),
			uintptr(unsafe.Pointer(&captionColor)),
			uintptr(unsafe.Sizeof(captionColor)),
		)
		_, _, _ = setAttr.Call(
			hwnd,
			uintptr(DWMWA_BORDER_COLOR),
			uintptr(unsafe.Pointer(&captionColor)),
			uintptr(unsafe.Sizeof(captionColor)),
		)
	}
}

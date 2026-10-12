package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

type AudioDeviceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type WAVEOUTCAPSW struct {
	Mid           uint16
	Pid           uint16
	DriverVersion uint32
	Pname         [32]uint16
	Formats       uint32
	Channels      uint16
	Reserved      uint16
	Support       uint32
}

func (a *API) handleAudioDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	devices := []AudioDeviceInfo{
		{ID: "default", Name: "По умолчанию (Системное устройство)"},
	}

	// Query Win32 winmm.dll directly (instant, zero process creation, zero powershell windows)
	winmm := windows.NewLazySystemDLL("winmm.dll")
	getNumDevs := winmm.NewProc("waveOutGetNumDevs")
	getDevCaps := winmm.NewProc("waveOutGetDevCapsW")

	if getNumDevs.Find() == nil && getDevCaps.Find() == nil {
		n, _, _ := getNumDevs.Call()
		seen := make(map[string]bool)
		for i := uintptr(0); i < n; i++ {
			var caps WAVEOUTCAPSW
			res, _, _ := getDevCaps.Call(i, uintptr(unsafe.Pointer(&caps)), unsafe.Sizeof(caps))
			if res == 0 {
				name := strings.TrimSpace(windows.UTF16ToString(caps.Pname[:]))
				if name != "" && !strings.Contains(strings.ToLower(name), "microphone") && !strings.Contains(strings.ToLower(name), "микрофон") {
					if !seen[name] {
						seen[name] = true
						devices = append(devices, AudioDeviceInfo{
							ID:   name,
							Name: name,
						})
					}
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devices)
}

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	AppUserModelID = "FreeToPlayer.App"
	AppDisplayName = "FreeToPlayer"
)

var (
	CLSID_ShellLink = windows.GUID{
		Data1: 0x00021401, Data2: 0x0000, Data3: 0x0000,
		Data4: [8]byte{0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46},
	}
	IID_IShellLinkW = windows.GUID{
		Data1: 0x000214f9, Data2: 0x0000, Data3: 0x0000,
		Data4: [8]byte{0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46},
	}
	IID_IPersistFile = windows.GUID{
		Data1: 0x0000010b, Data2: 0x0000, Data3: 0x0000,
		Data4: [8]byte{0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46},
	}
	IID_IPropertyStore = windows.GUID{
		Data1: 0x886d8eeb, Data2: 0x8cf2, Data3: 0x4446,
		Data4: [8]byte{0x8d, 0x02, 0xcd, 0xba, 0x1d, 0xbd, 0xcf, 0x99},
	}
	PKEY_AppUserModel_ID = PROPERTYKEY{
		Fmtid: windows.GUID{
			Data1: 0x9f4c2855, Data2: 0x9f79, Data3: 0x4b39,
			Data4: [8]byte{0xa8, 0xd0, 0xe1, 0xd4, 0x2d, 0xe1, 0xd5, 0xf3},
		},
		Pid: 5,
	}
)

type PROPERTYKEY struct {
	Fmtid windows.GUID
	Pid   uint32
}

type PROPVARIANT struct {
	Vt         uint16
	WReserved1 uint16
	WReserved2 uint16
	WReserved3 uint16
	Val        uintptr
	Val2       uintptr
}

type IUnknownVtbl struct {
	QueryInterface uintptr
	AddRef         uintptr
	Release        uintptr
}

type IShellLinkWVtbl struct {
	IUnknownVtbl
	GetPath             uintptr
	GetIDList           uintptr
	SetIDList           uintptr
	GetDescription      uintptr
	SetDescription      uintptr
	GetWorkingDirectory uintptr
	SetWorkingDirectory uintptr
	GetArguments        uintptr
	SetArguments        uintptr
	GetHotkey           uintptr
	SetHotkey           uintptr
	GetShowCmd          uintptr
	SetShowCmd          uintptr
	GetIconLocation     uintptr
	SetIconLocation     uintptr
	SetRelativePath     uintptr
	Resolve             uintptr
	SetPath             uintptr
}

type IPersistFileVtbl struct {
	IUnknownVtbl
	GetClassID    uintptr
	IsDirty       uintptr
	Load          uintptr
	Save          uintptr
	SaveCompleted uintptr
	GetCurFile    uintptr
}

type IPropertyStoreVtbl struct {
	IUnknownVtbl
	GetCount uintptr
	GetAt    uintptr
	GetValue uintptr
	SetValue uintptr
	Commit   uintptr
}

func initAppIdentity() {
	// 1. Set explicit AppUserModelID on the process
	shell32 := windows.NewLazySystemDLL("shell32.dll")
	setAppID := shell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
	if setAppID.Find() == nil {
		appID, _ := windows.UTF16PtrFromString(AppUserModelID)
		_, _, _ = setAppID.Call(uintptr(unsafe.Pointer(appID)))
	}

	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
		exePath = filepath.Join(exePath, "FreeToPlayer.exe")
	}

	// 2. Register AppUserModelIDs in Windows Registry
	for _, id := range []string{AppUserModelID, "msedgewebview2.exe", "FreeToPlayer.exe", "DJPlayer.App"} {
		keyPath := `Software\Classes\AppUserModelId\` + id
		if k, _, err := registry.CreateKey(registry.CURRENT_USER, keyPath, registry.SET_VALUE); err == nil {
			_ = k.SetStringValue("DisplayName", AppDisplayName)
			_ = k.SetStringValue("IconUri", exePath+",0")
			_ = k.SetDWordValue("ShowInSettings", 1)
			k.Close()
		}
	}

	// 3. Register Application Association in Registry
	for _, app := range []string{"FreeToPlayer.exe", "msedgewebview2.exe"} {
		appPath := `Software\Classes\Applications\` + app
		if ak, _, err := registry.CreateKey(registry.CURRENT_USER, appPath, registry.SET_VALUE); err == nil {
			_ = ak.SetStringValue("FriendlyAppName", AppDisplayName)
			_ = ak.SetStringValue("ApplicationCompany", AppDisplayName)
			ak.Close()
		}
	}

	// 4. Ensure Start Menu shortcut exists with System.AppUserModel.ID
	createStartMenuShortcut(exePath)
}

func createStartMenuShortcut(exePath string) {
	ole32 := windows.NewLazySystemDLL("ole32.dll")
	coInit := ole32.NewProc("CoInitialize")
	coCreate := ole32.NewProc("CoCreateInstance")

	_, _, _ = coInit.Call(0)

	var pLink *struct{ Vtbl *IShellLinkWVtbl }
	hr, _, _ := coCreate.Call(
		uintptr(unsafe.Pointer(&CLSID_ShellLink)),
		0,
		1, // CLSCTX_INPROC_SERVER
		uintptr(unsafe.Pointer(&IID_IShellLinkW)),
		uintptr(unsafe.Pointer(&pLink)),
	)
	if hr != 0 || pLink == nil {
		return
	}
	defer syscall.SyscallN(pLink.Vtbl.Release, uintptr(unsafe.Pointer(pLink)))

	exePathW, _ := windows.UTF16PtrFromString(exePath)
	workDirW, _ := windows.UTF16PtrFromString(filepath.Dir(exePath))
	descW, _ := windows.UTF16PtrFromString(AppDisplayName)

	syscall.SyscallN(pLink.Vtbl.SetPath, uintptr(unsafe.Pointer(pLink)), uintptr(unsafe.Pointer(exePathW)))
	syscall.SyscallN(pLink.Vtbl.SetWorkingDirectory, uintptr(unsafe.Pointer(pLink)), uintptr(unsafe.Pointer(workDirW)))
	syscall.SyscallN(pLink.Vtbl.SetDescription, uintptr(unsafe.Pointer(pLink)), uintptr(unsafe.Pointer(descW)))
	syscall.SyscallN(pLink.Vtbl.SetIconLocation, uintptr(unsafe.Pointer(pLink)), uintptr(unsafe.Pointer(exePathW)), 0)

	// Set System.AppUserModel.ID property to "msedgewebview2.exe" for Windows SMTC
	var pPropStore *struct{ Vtbl *IPropertyStoreVtbl }
	r1, _, _ := syscall.SyscallN(
		pLink.Vtbl.QueryInterface,
		uintptr(unsafe.Pointer(pLink)),
		uintptr(unsafe.Pointer(&IID_IPropertyStore)),
		uintptr(unsafe.Pointer(&pPropStore)),
	)
	if r1 == 0 && pPropStore != nil {
		defer syscall.SyscallN(pPropStore.Vtbl.Release, uintptr(unsafe.Pointer(pPropStore)))
		appIDW, _ := windows.UTF16PtrFromString("msedgewebview2.exe")
		pv := PROPVARIANT{
			Vt:  31, // VT_LPWSTR
			Val: uintptr(unsafe.Pointer(appIDW)),
		}
		syscall.SyscallN(
			pPropStore.Vtbl.SetValue,
			uintptr(unsafe.Pointer(pPropStore)),
			uintptr(unsafe.Pointer(&PKEY_AppUserModel_ID)),
			uintptr(unsafe.Pointer(&pv)),
		)
		syscall.SyscallN(pPropStore.Vtbl.Commit, uintptr(unsafe.Pointer(pPropStore)))
	}

	// Save to %APPDATA%\Microsoft\Windows\Start Menu\Programs\FreeToPlayer.lnk
	var pPersist *struct{ Vtbl *IPersistFileVtbl }
	r1, _, _ = syscall.SyscallN(
		pLink.Vtbl.QueryInterface,
		uintptr(unsafe.Pointer(pLink)),
		uintptr(unsafe.Pointer(&IID_IPersistFile)),
		uintptr(unsafe.Pointer(&pPersist)),
	)
	if r1 == 0 && pPersist != nil {
		defer syscall.SyscallN(pPersist.Vtbl.Release, uintptr(unsafe.Pointer(pPersist)))
		appData := os.Getenv("APPDATA")
		shortcutPath := filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs\FreeToPlayer.lnk`)
		pathW, _ := windows.UTF16PtrFromString(shortcutPath)
		_, _, _ = syscall.SyscallN(pPersist.Vtbl.Save, uintptr(unsafe.Pointer(pPersist)), uintptr(unsafe.Pointer(pathW)), 1)
	}
}

func setWindowAppID(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	shell32 := windows.NewLazySystemDLL("shell32.dll")
	shGetProp := shell32.NewProc("SHGetPropertyStoreForWindow")
	if shGetProp.Find() != nil {
		return
	}

	var pPropStore *struct{ Vtbl *IPropertyStoreVtbl }
	hr, _, _ := shGetProp.Call(
		hwnd,
		uintptr(unsafe.Pointer(&IID_IPropertyStore)),
		uintptr(unsafe.Pointer(&pPropStore)),
	)
	if hr == 0 && pPropStore != nil {
		defer syscall.SyscallN(pPropStore.Vtbl.Release, uintptr(unsafe.Pointer(pPropStore)))
		appIDW, _ := windows.UTF16PtrFromString(AppUserModelID)
		pv := PROPVARIANT{
			Vt:  31, // VT_LPWSTR
			Val: uintptr(unsafe.Pointer(appIDW)),
		}
		syscall.SyscallN(
			pPropStore.Vtbl.SetValue,
			uintptr(unsafe.Pointer(pPropStore)),
			uintptr(unsafe.Pointer(&PKEY_AppUserModel_ID)),
			uintptr(unsafe.Pointer(&pv)),
		)
		syscall.SyscallN(pPropStore.Vtbl.Commit, uintptr(unsafe.Pointer(pPropStore)))
	}
}

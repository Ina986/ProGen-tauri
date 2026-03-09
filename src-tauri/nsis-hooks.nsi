; Force refresh Windows icon cache after install/update
; This ensures updated app icons are immediately visible

!define SHCNE_ASSOCCHANGED 0x08000000
!define SHCNF_IDLIST 0x0000

!macro NSIS_HOOK_POSTINSTALL
  ; Notify Windows that file associations (and icons) have changed
  System::Call 'shell32::SHChangeNotify(i ${SHCNE_ASSOCCHANGED}, i ${SHCNF_IDLIST}, p 0, p 0)'

  ; Delete icon cache files to force Windows to rebuild them
  IfFileExists "$LOCALAPPDATA\IconCache.db" 0 +2
    Delete "$LOCALAPPDATA\IconCache.db"

  ; Also clear the newer Windows 10/11 icon cache folder
  IfFileExists "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" 0 +2
    Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db"

  ; Restart Explorer to apply icon changes immediately
  nsExec::ExecToLog 'ie4uinit.exe -show'
!macroend

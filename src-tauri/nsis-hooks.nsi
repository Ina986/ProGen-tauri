; Force refresh Windows icon cache after install/update

!macro NSIS_HOOK_POSTINSTALL
  ; Notify Windows that file associations (and icons) have changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'

  ; Delete icon cache files to force Windows to rebuild them
  IfFileExists "$LOCALAPPDATA\IconCache.db" 0 +2
    Delete "$LOCALAPPDATA\IconCache.db"

  ; Refresh icon cache
  nsExec::ExecToLog 'ie4uinit.exe -show'
!macroend

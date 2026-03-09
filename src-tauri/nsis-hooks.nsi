; Force refresh Windows icon cache after install/update

!macro NSIS_HOOK_POSTINSTALL
  ; Delete legacy icon cache
  IfFileExists "$LOCALAPPDATA\IconCache.db" 0 +2
    Delete "$LOCALAPPDATA\IconCache.db"

  ; Delete Windows 10/11 icon cache files (iconcache_*.db)
  IfFileExists "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" 0 +2
    Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db"

  ; Delete thumbcache too (may contain icon thumbnails)
  IfFileExists "$LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db" 0 +2
    Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"

  ; Notify Windows that icons have changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'

  ; Force icon cache rebuild
  nsExec::ExecToLog 'ie4uinit.exe -show'
!macroend

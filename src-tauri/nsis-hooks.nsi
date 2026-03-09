; Force refresh Windows icon cache after install/update

!macro NSIS_HOOK_POSTINSTALL
  ; Kill Explorer to release icon cache locks
  nsExec::ExecToLog 'taskkill /F /IM explorer.exe'

  ; Delete legacy icon cache (Windows 7/8)
  Delete "$LOCALAPPDATA\IconCache.db"

  ; Delete Windows 10/11 icon cache files
  Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db"
  Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"

  ; Clear icon cache via Windows utility
  nsExec::ExecToLog 'ie4uinit.exe -ClearIconCache'

  ; Restart Explorer
  nsExec::ExecToLog 'explorer.exe'

  ; Wait for Explorer to start
  Sleep 1000

  ; Notify Windows that icons have changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'
!macroend

; Force refresh Windows icon cache after install/update

!macro NSIS_HOOK_POSTINSTALL
  ; Delete the app's old .ico from install dir to force replacement
  IfFileExists "$INSTDIR\icon.ico" 0 +2
    Delete "$INSTDIR\icon.ico"

  ; Delete legacy icon cache (Windows 7/8)
  IfFileExists "$LOCALAPPDATA\IconCache.db" 0 +2
    Delete "$LOCALAPPDATA\IconCache.db"

  ; Delete Windows 10/11 icon cache files
  IfFileExists "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" 0 +2
    Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db"

  ; Notify Windows that file associations and icons have changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'

  ; Rebuild icon cache
  nsExec::ExecToLog 'ie4uinit.exe -ClearIconCache'
  nsExec::ExecToLog 'ie4uinit.exe -show'
!macroend

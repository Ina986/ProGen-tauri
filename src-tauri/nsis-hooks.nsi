; Force refresh Windows icon after install/update

!macro NSIS_HOOK_PREINSTALL
  ; Delete existing shortcuts so they get recreated with the new icon
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"

  ; Delete icon cache so Windows re-reads icons from the new exe
  IfFileExists "$LOCALAPPDATA\IconCache.db" 0 +2
    Delete "$LOCALAPPDATA\IconCache.db"

  IfFileExists "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" 0 +2
    Delete "$LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Recreate desktop shortcut (needed for silent update mode)
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Recreate Start Menu shortcut
  CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Notify Windows that icons have changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'

  ; Notify about the specific exe icon change
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, t "$INSTDIR\${MAINBINARYNAME}.exe", i 0)'
!macroend

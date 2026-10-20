Unicode true
!ifdef XIP_UNCOMPRESSED
SetCompress off
!endif
Name "xImporter"
OutFile "@@OUT@@"
InstallDir "$APPDATA\Adobe\CEP\extensions\xImporter"
RequestExecutionLevel user
ShowInstDetails show

Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

VIProductVersion "@@VI_VERSION@@"
VIAddVersionKey "ProductName" "xImporter"
VIAddVersionKey "FileVersion" "@@VI_VERSION@@"
VIAddVersionKey "FileDescription" "Instalador interno de xImporter (sin Authenticode)"
VIAddVersionKey "LegalCopyright" "Uso interno"

Section "Instalar"
@@FILES@@
  ; REG_SZ text "1". A numeric DWORD is ignored by some Premiere versions.
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
  CreateDirectory "$PROFILE\Movies\xImporter"
  WriteUninstaller "$INSTDIR\Uninstall-xImporter.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter" "DisplayName" "xImporter"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter" "UninstallString" "$\"$INSTDIR\Uninstall-xImporter.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter" "DisplayVersion" "@@VERSION@@"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter" "NoRepair" 1
  MessageBox MB_OK "xImporter quedó en la carpeta de extensiones de tu usuario. Cierra Premiere Pro por completo y ábrelo de nuevo. Luego elige Ventana > Extensiones > xImporter."
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\xImporter"
SectionEnd

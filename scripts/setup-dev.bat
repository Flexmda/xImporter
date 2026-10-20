@echo off
setlocal
REM Unsigned CEP load for Premiere 2022+. PlayerDebugMode must be the string 1.
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f

set "HERE=%~dp0"
if exist "%HERE%panel\CSXS\manifest.xml" (
  set "PANEL=%HERE%panel"
  set "MODE=copy"
) else (
  set "PANEL=%HERE%..\panel"
  set "MODE=junction"
)

if not exist "%PANEL%\CSXS\manifest.xml" (
  echo No se encontro el panel en "%PANEL%".
  exit /b 1
)

set "EXTROOT=%APPDATA%\Adobe\CEP\extensions"
set "EXT=%EXTROOT%\xImporter"
if not exist "%EXTROOT%" mkdir "%EXTROOT%"

if /I "%MODE%"=="junction" (
  if exist "%EXT%" rmdir "%EXT%"
  mklink /J "%EXT%" "%PANEL%"
  if errorlevel 1 exit /b 1
) else (
  if exist "%EXT%" rmdir /S /Q "%EXT%"
  mkdir "%EXT%"
  robocopy "%PANEL%" "%EXT%" /E /NFL /NDL /NJH /NJS /nc /ns /np
  if errorlevel 8 exit /b 1
)

echo PlayerDebugMode=1 for CSXS.11 and CSXS.12.
echo Panel: %EXT%
echo Quit Premiere Pro completely, then open it again.
echo Window ^> Extensions ^> xImporter
exit /b 0

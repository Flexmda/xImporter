# QA checklist

Run this on three machines: Mac Intel, Mac Apple Silicon, and Windows 10 or 11 x64. Linux checks below already passed in the agent. A green Linux run is not a Premiere import.

Out of scope on every machine: payments, licenses, HWID, paid certificates, notarization, and Authenticode.

## Already verified on Linux

- `npm run lint` (`node --check` and `bash -n`).
- `npm test`: progress, binary selection (Intel, Rosetta, Windows ARM `E-BIN-01`), download modes and resolutions, macOS cancel (`SIGTERM` to the process group, then `SIGKILL` after 3s) and Windows cancel (`taskkill /T /F`), Spanish panel strings, the `xImporter` bin script, the yt-dlp SHA-256 updater, and the portal OS matrix.
- Script self-tests: `fetch-binaries.sh`, `package.sh`, `install-mac.sh`, `sign-zxp.sh` (exits without a fake signature), `build-pkg.sh` (exits 2 with no `.pkg`, because `pkgbuild` is missing), `build-exe.sh`.
- `scripts/build-exe.sh` produced a real unsigned NSIS `dist/xImporter-0.1.0-win-x64.exe` (not committed). `file` reported a PE32 GUI Nullsoft installer.
- Checksums matched for the pinned yt-dlp, ffmpeg, and Deno downloads. `file` on Linux: mac-x64 yt-dlp universal, ffmpeg and deno Mach-O x86_64; win-x64 all three PE32+ x86-64. Executing them here exits 126. `lipo` and `codesign` are not installed.
- Astro build of `web/` embeds version `0.1.0`. In Chrome on Linux the homepage shows the three installer buttons. The guide lists the `.pkg` and `.exe` before the zip. The Windows button opens `/downloads/xImporter-0.1.0-win-x64.exe` and 404s, because the installers are not published. No Firebase project was created and nothing was deployed.

## Installers Jose still runs

### Mac Intel — `xImporter-<version>-mac-x64.pkg`

Build on a Mac with `scripts/fetch-binaries.sh mac-x64` then `scripts/build-pkg.sh mac-x64`, or start the GitHub Actions workflow `mac installers` with `workflow_dispatch` (it does not run on merge).

- [ ] First open: right-click the pkg and choose Open. On macOS 15 or later, System Settings > Privacy & Security > Open Anyway also works. The pkg is unsigned.
- [ ] The installer asks for the Mac password and does not open Terminal.
- [ ] The panel is at `/Library/Application Support/Adobe/CEP/extensions/xImporter`.
- [ ] `yt-dlp`, `ffmpeg`, and `deno` in `bin/mac-x64` are executable, have no quarantine, and `codesign -dv` shows an ad-hoc signature. `codesign -v` exits 0.
- [ ] `lipo -archs`: `x86_64 arm64` for yt-dlp, `x86_64` for ffmpeg and deno. Do not `lipo -thin` yt-dlp.
- [ ] `defaults read com.adobe.CSXS.11 PlayerDebugMode` and the same for `com.adobe.CSXS.12` both print `1` (a string).
- [ ] Quit Premiere, open a project, and choose Ventana > Extensiones > xImporter.

### Mac Apple Silicon — `xImporter-<version>-mac-arm64.pkg`

Same steps with `mac-arm64`. Open Premiere as a native app, not with Rosetta.

- [ ] `lipo -archs`: `x86_64 arm64` for yt-dlp, `arm64` for ffmpeg and deno.
- [ ] With Premiere opened under Rosetta, the panel still runs and shows the Spanish warning to open Premiere natively. It uses `bin/mac-x64` in that case.

### Windows x64 — `xImporter-<version>-win-x64.exe`

`scripts/build-exe.sh` (NSIS). No Authenticode.

- [ ] If SmartScreen blocks it: Más información > Ejecutar de todas formas.
- [ ] The panel is at `%APPDATA%\Adobe\CEP\extensions\xImporter`.
- [ ] `PlayerDebugMode` is `REG_SZ` `1` under `HKCU\Software\Adobe\CSXS.11` and `CSXS.12`.
- [ ] `Uninstall-xImporter.exe` removes the extension folder and the uninstall key. It leaves `PlayerDebugMode` in place.
- [ ] Windows ARM is unsupported. The panel must show the Spanish `E-BIN-01` message, and the portal must not offer a Windows ARM installer.

## Panel, on each of the three machines

Use a short clip you have rights to download.

- [ ] YouTube, TikTok, and Facebook URLs are accepted. Another host is rejected in the panel before a download starts.
- [ ] Video MP4 at 1080 (default), 720, and Auto. Auto does not scale. 2160 shows the 4K warning and still downloads.
- [ ] Audio WAV and audio MP3 hide the resolution control. WAV is PCM 16-bit 48 kHz. MP3 does not transcode video.
- [ ] The file lands in `~/Movies/xImporter` (on Windows, the user profile Movies folder).
- [ ] The open project gains a root bin named exactly `xImporter`. A second import reuses that bin. The status line says `Importado en xImporter.`
- [ ] Progress is in Spanish and updates about four times a second.
- [ ] Cancelar stops the download. On Mac the process group gets SIGTERM, then SIGKILL after 3 seconds. On Windows the process tree is `taskkill /T /F`. Only `.xip-work` is deleted. The status says `Cancelado.`
- [ ] A second download while one is running is rejected.
- [ ] Actualizar yt-dlp writes a checksum-verified binary into the user data folder only (`~/Library/Application Support/xImporter/bin/…` or `%LOCALAPPDATA%\xImporter\bin\win-x64`). ffmpeg and Deno stay packaged. A bad checksum is not installed. The next download uses the updated yt-dlp.

## Secondary installs

- [ ] Mac zip: `chmod +x install-mac.sh` and `./install-mac.sh` copies into the user CEP folder (`~/Library/Application Support/Adobe/CEP/extensions/xImporter`), not `/Library`.
- [ ] Windows zip: `setup-dev.bat` copies into `%APPDATA%\Adobe\CEP\extensions\xImporter` and sets the same registry values.
- [ ] Self-signed `.zxp` from `scripts/sign-zxp.sh` on a Mac or Windows, using Adobe `ZXPSignCmd`. The `.p12` stays out of git. PlayerDebugMode is still required. This was not generated on Linux.

## Still not done

No merge, no deploy, and no published installers. The portal’s download links 404 until someone copies the built `.pkg` and `.exe` into `web/public/downloads/` and deploys Hosting to a new project (`ximporter-dev`, not `flex-osx`).

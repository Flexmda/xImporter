# Testing xImporter

xImporter is an internal CEP panel. It reads a URL, downloads an MP4 (H.264/AAC, up to 1080p) into `~/Movies/xImporter` with the bundled yt-dlp, ffmpeg, and Deno, and imports that file into the open Premiere project.

Jose's Mac is Intel. On that machine Node reports `process.arch === "x64"`, and the panel loads `panel/bin/mac-x64/`. Apple Silicon (`arm64`) uses `panel/bin/mac-arm64/`. Windows x64 uses `panel/bin/win-x64/` and the `.exe` names. There is no license check and no paid signature. Binaries are ad-hoc signed with `codesign -s -`.

If Premiere on an Apple Silicon Mac is opened under Rosetta, Node reports `x64` and `sysctl.proc_translated` is `1`. The panel still loads `bin/mac-x64/` (those binaries run under Rosetta) and shows a warning to open Premiere natively. An Intel Mac has `proc_translated` `0`, or `sysctl` fails, and gets the same folder with no warning. Windows ARM and any other platform raise `E-BIN-01` with the platform name.

A complete set of the three binaries in the user data folder wins over the copy inside the extension: `~/Library/Application Support/xImporter/bin/<folder>/` on macOS, `%LOCALAPPDATA%\xImporter\bin\win-x64\` on Windows. A partial user folder is ignored. Updates belong there so a signed extension folder is not modified.

## Install on the Intel Mac

From the zip `xImporter-<version>-mac-x64.zip`:

1. Unzip it.
2. In Terminal, from the unzipped folder:

```sh
chmod +x install-mac.sh
./install-mac.sh
```

Spanish steps for that same install are in `INSTALAR.txt` inside the zip.

From a git checkout on the Intel Mac, the default target is already `mac-x64`:

```sh
scripts/fetch-binaries.sh
./install-mac.sh
```

`scripts/fetch-binaries.sh mac-x64` is the same thing written out. `./install-mac.sh` then:

1. Copies `panel/` to `~/Library/Application Support/Adobe/CEP/extensions/xImporter` (a copy, not a symlink).
2. Writes `PlayerDebugMode` as the string `1` for `com.adobe.CSXS.11` and `com.adobe.CSXS.12`. Premiere 2022–2024 use CEP 11. Premiere 2025 (25.x) uses CEP 12.
3. Clears `com.apple.quarantine` on the installed panel.
4. Runs `chmod +x`, `codesign -s - --force`, and `codesign -v` on `yt-dlp`, `ffmpeg`, and `deno`.
5. Creates `~/Movies/xImporter`.

Quit Premiere completely, open it again, open a project, then choose **Window > Extensions > xImporter**.

`scripts/setup-dev.sh` is only for a checkout: it symlinks the repo's `panel/` into the extensions folder and sets the same debug flags. It does not copy, sign, or create `~/Movies/xImporter`. Use `install-mac.sh` for the install Jose runs.

If the menu item is missing:

- `defaults read com.adobe.CSXS.11 PlayerDebugMode` and the same command for `com.adobe.CSXS.12` should both print `1`.
- Confirm the copy: `ls "$HOME/Library/Application Support/Adobe/CEP/extensions/xImporter/bin/mac-x64"`.
- CEP logs: `/Library/Logs/CSXS/` (the system Library).

The panel's `.debug` file uses port `8860` if you attach a debugger later. Debug mode does not require that.

## Fetch

`scripts/fetch-binaries.sh [mac-arm64|mac-x64]` downloads into `panel/bin/<target>/`. With no argument it follows the host CPU (`uname -m`: `x86_64` → `mac-x64`, `arm64` → `mac-arm64`).

| File | mac-x64 (Intel) | mac-arm64 (Apple Silicon) | win-x64 |
| --- | --- | --- | --- |
| `yt-dlp` | Official `yt-dlp_macos` 2026.08.19, universal | The same universal file | Official `yt-dlp.exe` 2026.08.19 |
| `ffmpeg` | Martin Riedl static 9.0.2, macOS amd64 | Martin Riedl static 9.0.2, macOS arm64 | Gyan static essentials 9.0.2 (`ffmpeg.exe`) |
| `deno` | Official `deno-x86_64-apple-darwin` 2.9.7 | Official `deno-aarch64-apple-darwin` 2.9.7 | Official `deno-x86_64-pc-windows-msvc` 2.9.7 |

ffmpeg.org does not ship macOS builds. Both Martin Riedl 9.0.2 builds include x264, so those binaries are GPL. The panel runs ffmpeg as a separate process. Do not commit the downloaded files.

The script checks SHA-256 before install, then `chmod +x`. On macOS it also runs `xattr -dr com.apple.quarantine` and `codesign -s - --force`. On Linux it skips those two and says so. Re-signing with an ad-hoc signature replaces the vendor signature. That is intentional for this internal install.

`yt-dlp_macos` is universal (x86_64 and arm64). Leave it whole. `lipo -thin` can break the PyInstaller archive appended to that executable.

Build a zip after the fetch:

```sh
scripts/package.sh mac-x64
```

Output: `dist/xImporter-<version>-mac-x64.zip`. It contains `install-mac.sh`, `INSTALAR.txt`, and `panel/` with only that target's binaries. `dist/` is gitignored.

## Checklist

Intel, after `scripts/fetch-binaries.sh mac-x64` (or inside the installed extension):

```sh
file panel/bin/mac-x64/yt-dlp panel/bin/mac-x64/ffmpeg panel/bin/mac-x64/deno
lipo -archs panel/bin/mac-x64/yt-dlp
lipo -archs panel/bin/mac-x64/ffmpeg
lipo -archs panel/bin/mac-x64/deno
codesign -v panel/bin/mac-x64/yt-dlp
codesign -v panel/bin/mac-x64/ffmpeg
codesign -v panel/bin/mac-x64/deno
```

Expected on Intel:

- `file` reports Mach-O. `ffmpeg` and `deno` are x86_64. `yt-dlp` is a universal Mach-O.
- `lipo -archs` prints `x86_64 arm64` for `yt-dlp`, and `x86_64` for `ffmpeg` and `deno`.
- `codesign -v` exits 0 and prints nothing. `codesign -dv --verbose=2` shows `Signature=adhoc`.

Apple Silicon, with `scripts/fetch-binaries.sh mac-arm64`, the same commands under `panel/bin/mac-arm64/`:

- `lipo -archs` prints `x86_64 arm64` for `yt-dlp`, and `arm64` for `ffmpeg` and `deno`.

Windows, after `scripts/fetch-binaries.sh win-x64`:

```sh
file panel/bin/win-x64/yt-dlp.exe panel/bin/win-x64/ffmpeg.exe panel/bin/win-x64/deno.exe
```

Expected: `file` reports `PE32+ executable (console) x86-64` for all three. There is no Authenticode signature in this milestone. `lipo` does not apply.

## Try a download

1. Open a Premiere project. The import looks for a root bin named `xImporter` and creates it if it is missing. A second import reuses that bin.
2. Open **Window > Extensions > xImporter**.
3. Paste an `http` or `https` URL from YouTube, TikTok, or Facebook of a short clip you have the rights to download.
4. Choose **Video MP4**, **Audio WAV**, or **Audio MP3**. For video, choose 4K, 1080p, 720p, or Auto. Audio hides the resolution. 4K shows a warning.
5. Press **Descargar**. **Cancelar** stops the process tree.
6. The status line is in Spanish (`Descargando · NN% · velocidad · Faltan m:ss`, then `Uniendo`, `Convirtiendo a H.264`, `Importando`).
7. The file should be in `~/Movies/xImporter`.
8. The same file should appear in the Project panel, inside the `xImporter` bin. The status line should say `Importado en xImporter.`

The download is one yt-dlp process, spawned with `shell: false`. The URL is its own argument. yt-dlp is started with `--newline`, a progress template marked `XIP`, `--ffmpeg-location` pointed at the bundled ffmpeg, and `--js-runtimes deno:<bundled deno>`. Video mode prefers H.264/AAC at the chosen height (720, 1080, or 2160) and remuxes to MP4. Auto prefers H.264/AAC at any height so a compatible stream is copied. If the probe does not see H.264 video and AAC audio, the panel transcodes with the bundled ffmpeg (`libx264` and AAC at 320 kbps / 48 kHz, scaling down only when a height was chosen, or copying H.264 and converting only the audio). Audio WAV is PCM 16-bit 48 kHz. Audio MP3 uses `--audio-quality 0`. Files land in a `.xip-work` folder and are moved up into `~/Movies/xImporter` when the printed path is inside that folder.

Cancel on macOS sends SIGTERM to the process group and SIGKILL after 3 seconds. Cancel on Windows runs `taskkill /T /F /PID`. Either way the panel deletes only `.xip-work`. A second download while one is running is rejected.

YouTube needs a network path so Deno can run yt-dlp's JavaScript challenge scripts.

## What was tested without Premiere

These checks run on Linux (`npm test` / `npm run lint`):

- `node --check` and `bash -n` on the shell scripts
- Engine tests, including Darwin `x64` resolving and spawning `bin/mac-x64`, Rosetta (`sysctl.proc_translated` = 1) warning plus the same folder, Windows `.exe` paths, and the user-data bin preferred only when yt-dlp, ffmpeg, and deno are all present
- Mode and resolution arguments (video 720/1080/2160/auto, WAV PCM, MP3), progress lines, and cancel (`SIGTERM` then `SIGKILL` on the process group; `taskkill /T /F` on Windows) with the work folder as the only deletion
- `scripts/fetch-binaries.sh --self-test` (checksum match and mismatch, `chmod +x`, host target)
- `scripts/package.sh --self-test` (zip name, only the requested binaries, Spanish `INSTALAR.txt`, executable `install-mac.sh`)
- `install-mac.sh --self-test` (copy into a temp home, executable bits, `Movies/xImporter`)

`scripts/fetch-binaries.sh mac-x64` and `scripts/fetch-binaries.sh win-x64` were run here. The checksums matched, and `scripts/package.sh mac-x64` wrote `dist/xImporter-0.1.0-mac-x64.zip` (not committed). `file` on Linux reported:

- `yt-dlp`: Mach-O universal binary, x86_64 and arm64
- `ffmpeg`: Mach-O 64-bit x86_64 executable
- `deno`: Mach-O 64-bit x86_64 executable

`file` on the Windows download reported `PE32+ executable (console) x86-64` for `yt-dlp.exe`, `ffmpeg.exe`, and `deno.exe`. None of these binaries run on Linux. They are not committed.

## What was not tested in Premiere

This environment has no Premiere Pro, and `lipo` and `codesign` are not installed, so those checks did not run. `install-mac.sh` without `--self-test` refuses to run anywhere but macOS, so PlayerDebugMode was not written here.

Jose still needs to confirm on his Intel Mac:

- The panel appears under Window > Extensions after `./install-mac.sh`
- `lipo -archs` is `x86_64` for ffmpeg and deno, and `x86_64 arm64` for yt-dlp
- `codesign -v` exits 0
- A real download, including Deno for YouTube, and `app.project.importFiles` putting the file in the Project panel

Do not treat a green Linux test run as proof that Premiere imported the file.

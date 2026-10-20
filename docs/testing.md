# Testing xImporter (milestone 1)

xImporter is an internal CEP panel. It reads a URL, downloads an MP4 (H.264/AAC, up to 1080p) into `~/Movies/xImporter` with the bundled yt-dlp, ffmpeg, and Deno, and imports that file into the open Premiere project.

This milestone does not include payments, licenses, HWID checks, a public website, paid certificates, notarization, or Authenticode. The fetch script ad-hoc signs binaries (`codesign -s -`) so a debug install on the Mac can run them. That signature is not a Developer ID signature.

## What was tested without Premiere

The spike was written on Linux. These checks ran there:

- `npm run lint` (`node --check` on the panel and script sources, `bash -n` on the shell scripts)
- `npm test` (engine, progress parser, yt-dlp arguments, codec decision, ExtendScript string escaping, manifest contract, gitignore)
- `scripts/fetch-binaries.sh --self-test` (checksum match and mismatch, `chmod +x`)
- `scripts/fetch-binaries.sh` itself, which downloads the three macOS arm64 binaries and checks the pinned SHA-256 sums

`scripts/setup-dev.sh` was syntax-checked. On Linux it prints the `defaults write` commands and changes nothing.

`file` on that Linux download reported:

- `yt-dlp`: Mach-O universal binary, x86_64 and arm64
- `ffmpeg`: Mach-O 64-bit arm64 executable
- `deno`: Mach-O 64-bit arm64 executable

Running `ffmpeg -version` on Linux exited 126 (`cannot execute binary file: Exec format error`). The binaries were not committed.

## What was not tested in Premiere

This environment has no Premiere Pro and cannot run Apple Silicon binaries. `lipo` and `codesign` are not installed here, so those two checks did not run. Jose needs to test the real chain on his Apple Silicon Mac:

- `PlayerDebugMode` for CSXS 11 and CSXS 12, and the panel showing up under Window > Extensions
- Node inside the panel (`--enable-nodejs` and `--mixed-context`)
- A real yt-dlp download, including Deno for YouTube
- ffmpeg actually producing or accepting H.264/AAC
- `app.project.importFiles` putting the file in the Project panel
- `lipo -archs` and `codesign -v` (those tools are not on the Linux machine)

Do not treat a green Linux test run as proof that Premiere imported the file.

## Load the panel in debug mode

On the Mac, from the repo root:

```sh
scripts/fetch-binaries.sh
scripts/setup-dev.sh
```

`setup-dev.sh` does two things:

1. Writes `PlayerDebugMode` as the string `1` for `com.adobe.CSXS.11` and `com.adobe.CSXS.12`. Premiere 2022–2024 use CEP 11. Premiere 2025 (25.x) uses CEP 12. An integer `1` is ignored by some versions, so the script forces a string.
2. Symlinks this repo's `panel/` directory to `~/Library/Application Support/Adobe/CEP/extensions/xImporter`.

Quit Premiere completely (not only the project), open it again, open or create a project, then choose **Window > Extensions > xImporter**.

If the menu item is missing:

- Run `defaults read com.adobe.CSXS.11 PlayerDebugMode` and the same command for `com.adobe.CSXS.12`. Both should print `1`.
- Confirm the symlink: `ls -l "$HOME/Library/Application Support/Adobe/CEP/extensions/xImporter/CSXS/manifest.xml"`.
- CEP logs: `/Library/Logs/CSXS/` (the system Library, not only `~/Library`).
- Open Premiere as a native Apple Silicon app. Under Rosetta, Node reports `x64` and this milestone has no `mac-x64` binaries.

The panel's `.debug` file uses port `8860` if you attach a debugger later. Debug mode does not require that.

## Fetch the binaries

`scripts/fetch-binaries.sh` fills `panel/bin/mac-arm64/` only:

| File | Source | Pinned version |
| --- | --- | --- |
| `yt-dlp` | Official `yt-dlp_macos` from GitHub | 2026.08.19 |
| `ffmpeg` | Martin Riedl static release zip | 9.0.2 arm64 |
| `deno` | Official `deno-aarch64-apple-darwin` | 2.9.7 |

ffmpeg.org does not ship macOS builds. The Martin Riedl 9.0.2 build is static and includes x264, so that binary is GPL. The panel runs it as a separate process. A later milestone can switch to an LGPL build. Do not commit the downloaded files; `panel/bin/mac-arm64/*` is gitignored except `.gitkeep`.

The script checks SHA-256 before install. Then it runs `chmod +x`. On macOS it also runs `xattr -dr com.apple.quarantine` and `codesign -s - --force`. On Linux it skips those two and says so. Re-signing with an ad-hoc signature replaces whatever signature the vendor shipped. That is intentional for this internal debug spike.

`yt-dlp_macos` is a universal binary (x86_64 and arm64). Leave it whole. `lipo -thin` can break the PyInstaller archive appended to that executable.

## Checklist on the Mac

From the repo root, after `scripts/fetch-binaries.sh`:

```sh
file panel/bin/mac-arm64/yt-dlp panel/bin/mac-arm64/ffmpeg panel/bin/mac-arm64/deno
lipo -archs panel/bin/mac-arm64/yt-dlp
lipo -archs panel/bin/mac-arm64/ffmpeg
lipo -archs panel/bin/mac-arm64/deno
codesign -v panel/bin/mac-arm64/yt-dlp
codesign -v panel/bin/mac-arm64/ffmpeg
codesign -v panel/bin/mac-arm64/deno
```

Expected:

- `file` reports Mach-O. `ffmpeg` and `deno` are arm64. `yt-dlp` is a universal Mach-O (x86_64 and arm64), which is what the official `yt-dlp_macos` build is.
- `lipo -archs` prints `x86_64 arm64` for `yt-dlp`, and `arm64` for `ffmpeg` and `deno`.
- `codesign -v` exits 0 and prints nothing. `codesign -dv --verbose=2` shows `Signature=adhoc`. A Developer ID or notarization check is out of scope and should not be expected to pass.

`panel/bin/mac-x64/` and `panel/bin/win-x64/` are empty placeholders.

## Try a download

1. Open a Premiere project. The import targets the project root.
2. Open **Window > Extensions > xImporter**.
3. Paste an `http` or `https` URL of a short clip you have the rights to download. The panel does not check accounts or licenses.
4. Press **Download**.
5. The status line should move through parsed progress (`Downloading · NN% · speed · ETA`) and then `Importing`.
6. The MP4 should be in `~/Movies/xImporter`.
7. The same file should appear in the Project panel.

The download is one yt-dlp process, spawned with `shell: false`. The URL is its own argument. yt-dlp is started with `--newline`, a progress template marked `XIP`, `--ffmpeg-location` pointed at the bundled ffmpeg, and `--js-runtimes deno:<bundled deno>`. The format list prefers H.264/AAC at 1080p or below and remuxes to MP4. If ffmpeg's probe does not see H.264 video and AAC audio, the panel transcodes with the bundled ffmpeg (`libx264` and AAC, or it copies the H.264 stream and converts only the audio).

YouTube needs a network path so Deno can run yt-dlp's JavaScript challenge scripts. A private, age-gated, or region-blocked video will fail in the log; that is yt-dlp, not the import step.

## Run the Linux checks again

```sh
npm run lint
npm test
```

`npm test` does not download the binaries. Use `scripts/fetch-binaries.sh` for that.

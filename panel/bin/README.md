# Bundled binaries

`mac-arm64/`, `mac-x64/`, and `win-x64/` stay in git so the layout is stable. Their executables are gitignored.

```sh
scripts/fetch-binaries.sh            # mac-arm64, mac-x64, or win-x64 from this machine
scripts/fetch-binaries.sh mac-x64    # Intel Mac
scripts/fetch-binaries.sh mac-arm64  # Apple Silicon
scripts/fetch-binaries.sh win-x64    # Windows x64
```

Mac folders receive `yt-dlp`, `ffmpeg`, and `deno`. `win-x64/` receives the `.exe` names. On Darwin, Node's `process.arch` of `x64` selects `mac-x64`, and `arm64` selects `mac-arm64`. On Windows, `x64` selects `win-x64`.

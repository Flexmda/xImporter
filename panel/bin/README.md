# Bundled binaries

`mac-arm64/`, `mac-x64/`, and `win-x64/` stay in git so the layout is stable. Their executables are gitignored.

```sh
scripts/fetch-binaries.sh            # mac-arm64 or mac-x64 from this machine's CPU
scripts/fetch-binaries.sh mac-x64    # Intel Mac
scripts/fetch-binaries.sh mac-arm64  # Apple Silicon
```

Each command writes `yt-dlp`, `ffmpeg`, and `deno` into that folder. `win-x64/` is still empty. On Darwin, Node's `process.arch` of `x64` selects `mac-x64`, and `arm64` selects `mac-arm64`.

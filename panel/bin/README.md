# Bundled binaries

`mac-arm64/`, `mac-x64/`, and `win-x64/` are created in git so the layout is stable. Their executables are gitignored.

Milestone 1 downloads only the Apple Silicon set, into `mac-arm64/`:

```sh
scripts/fetch-binaries.sh
```

That script places `yt-dlp`, `ffmpeg`, and `deno` there. The other two folders are reserved for later milestones.

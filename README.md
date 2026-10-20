# xImporter

Internal Adobe Premiere Pro panel for Jose's agency. Milestone 1 is a technical spike: a CEP extension that downloads a URL to `~/Movies/xImporter` as MP4 (H.264/AAC, up to 1080p) and imports the file into the open project.

This milestone does not include payments, licenses, HWID, paid code-signing certificates, notarization, or Authenticode.

How to load the panel and what still has to be tested on a Mac: [docs/testing.md](docs/testing.md).

## Layout

```text
panel/     CEP extension (CSXS manifest, client UI, ExtendScript, Node engine, bin/)
scripts/   fetch-binaries.sh (mac-arm64) and setup-dev.sh (PlayerDebugMode)
docs/      debug-load steps and the Mac checklist
web/       placeholder, not deployed
```

`panel/bin/mac-arm64/`, `mac-x64/`, and `win-x64/` are in the tree. Their executables are gitignored. This milestone only downloads the Apple Silicon set.

## Checks

```sh
npm run lint
npm test
```

On the Mac, from the repo root:

```sh
scripts/fetch-binaries.sh
scripts/setup-dev.sh
```

Then quit Premiere, reopen a project, and choose Window > Extensions > xImporter.

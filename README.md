# xImporter

Internal Adobe Premiere Pro panel for Jose's agency. It downloads a URL to `~/Movies/xImporter` as MP4 (H.264/AAC, up to 1080p) and imports the file into the open project.

No payments, licenses, HWID, paid code-signing certificates, notarization, or Authenticode.

How to install on a Mac, including Intel: [docs/testing.md](docs/testing.md).

## Layout

```text
panel/            CEP extension. bin/mac-x64 is what an Intel Mac loads.
scripts/          fetch-binaries.sh, package.sh, setup-dev.sh
install-mac.sh    copy the panel into the user CEP folder and sign the binaries
packaging/        Spanish INSTALAR.txt used inside the zip
docs/             load steps and the lipo checklist
web/              placeholder, not deployed
```

`panel/bin/mac-arm64/`, `mac-x64/`, and `win-x64/` are in the tree. Their executables are gitignored.

## Checks

```sh
npm run lint
npm test
```

On an Intel Mac, from a checkout:

```sh
scripts/fetch-binaries.sh mac-x64
./install-mac.sh
```

Or build a zip (after the binaries are downloaded):

```sh
scripts/package.sh mac-x64
```

That writes `dist/xImporter-<version>-mac-x64.zip`.

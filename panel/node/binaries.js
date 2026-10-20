"use strict";

var path = require("path");

function platformFolder(platform, arch) {
  if (platform === "darwin" && arch === "arm64") return "mac-arm64";
  if (platform === "darwin" && arch === "x64") return "mac-x64";
  if (platform === "win32" && arch === "x64") return "win-x64";
  return null;
}

function executableName(base, platform) {
  return platform === "win32" ? base + ".exe" : base;
}

function resolveBinaries(options) {
  var folder = platformFolder(options.platform, options.arch);
  if (!folder) {
    var unsupported = new Error("Unsupported platform " + options.platform + "/" + options.arch + ".");
    unsupported.code = "E-BIN-01";
    throw unsupported;
  }

  var dir = path.join(options.extensionRoot, "bin", folder);
  var names = ["yt-dlp", "ffmpeg", "deno"];
  var resolved = { dir: dir, folder: folder };

  for (var i = 0; i < names.length; i++) {
    var fileName = executableName(names[i], options.platform);
    var full = path.join(dir, fileName);
    if (!options.existsSync(full)) {
      var hint = "Missing " + full + ".";
      if (folder === "mac-arm64" || folder === "mac-x64") {
        hint += " From the repo root, run scripts/fetch-binaries.sh " + folder + ".";
      } else {
        hint += " Windows binaries are not downloaded by scripts/fetch-binaries.sh.";
      }
      var missing = new Error(hint);
      missing.code = "E-BIN-01";
      missing.path = full;
      throw missing;
    }
    resolved[names[i] === "yt-dlp" ? "ytDlp" : names[i]] = full;
  }

  return resolved;
}

module.exports = {
  platformFolder: platformFolder,
  executableName: executableName,
  resolveBinaries: resolveBinaries
};

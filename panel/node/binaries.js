"use strict";

var path = require("path");

var NAMES = ["yt-dlp", "ffmpeg", "deno"];

function platformFolder(platform, arch) {
  if (platform === "darwin" && arch === "arm64") return "mac-arm64";
  if (platform === "darwin" && arch === "x64") return "mac-x64";
  if (platform === "win32" && arch === "x64") return "win-x64";
  return null;
}

function executableName(base, platform) {
  return platform === "win32" ? base + ".exe" : base;
}

// sysctl.proc_translated is 1 when this process is running under Rosetta.
// A missing sysctl (Intel Mac, or not macOS) means "not translated".
function readProcTranslated(execFileSync) {
  try {
    var out = execFileSync("sysctl", ["-n", "sysctl.proc_translated"], {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true
    });
    return String(out).trim() === "1";
  } catch (err) {
    return false;
  }
}

function userDataRoot(options) {
  if (options.platform === "win32") {
    if (options.localAppData) return options.localAppData;
    if (options.homedir) return path.join(options.homedir, "AppData", "Local");
    return null;
  }
  if (!options.homedir) return null;
  return path.join(options.homedir, "Library", "Application Support");
}

function userBinDir(options) {
  var folder = platformFolder(options.platform, options.arch);
  var root = userDataRoot(options);
  if (!folder || !root) return null;
  return path.join(root, "xImporter", "bin", folder);
}

function filePath(dir, base, platform) {
  return path.join(dir, executableName(base, platform));
}

function unsupportedError(platform, arch) {
  var message;
  if (platform === "win32" && arch === "arm64") {
    message = "Windows ARM no está soportado. Usa Windows 10 u 11 de 64 bits (x64).";
  } else {
    message = "Plataforma no soportada: " + platform + "/" + arch + ". xImporter funciona en macOS (Apple Silicon e Intel) y en Windows x64.";
  }
  var err = new Error(message);
  err.code = "E-BIN-01";
  return err;
}

function missingError(full, folder) {
  var hint = "Falta el binario " + full + ". Desde la raíz del repositorio ejecuta scripts/fetch-binaries.sh " + folder + ".";
  var err = new Error(hint);
  err.code = "E-BIN-01";
  err.path = full;
  return err;
}

function rosettaWarning() {
  return "Premiere está corriendo con Rosetta. Se usarán los binarios de Mac Intel. Abre Premiere en modo nativo (Apple Silicon) para mejor rendimiento.";
}

function resolveBinaries(options) {
  options = options || {};
  var platform = options.platform;
  var arch = options.arch;
  var translated = false;
  if (platform === "darwin") {
    if (typeof options.translated === "boolean") {
      translated = options.translated;
    } else if (typeof options.execFileSync === "function") {
      translated = readProcTranslated(options.execFileSync);
    }
  }

  var folder = platformFolder(platform, arch);
  if (!folder) throw unsupportedError(platform, arch);

  var packaged = path.join(options.extensionRoot, "bin", folder);
  var userDir = userBinDir(options);
  var resolved = {
    dir: packaged,
    folder: folder,
    source: "packaged",
    translated: translated,
    warning: platform === "darwin" && arch === "x64" && translated ? rosettaWarning() : null
  };

  // Each binary is chosen on its own. An updated yt-dlp in the user folder
  // must win even when ffmpeg and deno are still the packaged copies.
  var userCount = 0;
  for (var i = 0; i < NAMES.length; i++) {
    var packagedFile = filePath(packaged, NAMES[i], platform);
    var userFile = userDir ? filePath(userDir, NAMES[i], platform) : null;
    var full = packagedFile;
    if (userFile && options.existsSync(userFile)) {
      full = userFile;
      userCount += 1;
    }
    if (!options.existsSync(full)) throw missingError(packagedFile, folder);
    resolved[NAMES[i] === "yt-dlp" ? "ytDlp" : NAMES[i]] = full;
  }

  if (userCount === NAMES.length) {
    resolved.source = "user";
    resolved.dir = userDir;
  } else if (userCount > 0) {
    resolved.source = "mixed";
  }

  return resolved;
}

module.exports = {
  platformFolder: platformFolder,
  executableName: executableName,
  readProcTranslated: readProcTranslated,
  userBinDir: userBinDir,
  resolveBinaries: resolveBinaries,
  rosettaWarning: rosettaWarning
};

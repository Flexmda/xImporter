"use strict";

// Downloads the official yt-dlp release into the user data bin and checks
// SHA2-256SUMS. ffmpeg and Deno stay with the panel. The binary is not committed.

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var crypto = require("crypto");

var binaries = require("./binaries.js");

var DEFAULT_SUMS_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
var DEFAULT_ASSET_BASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

function assetName(platform) {
  if (platform === "darwin") return "yt-dlp_macos";
  if (platform === "win32") return "yt-dlp.exe";
  return null;
}

function parseSha256Sums(text, fileName) {
  var lines = String(text || "").split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+/, "").replace(/\s+$/, "");
    if (!line || line.charAt(0) === "#") continue;
    var match = /^([a-fA-F0-9]{64})\s+\*?(\S+)\s*$/.exec(line);
    if (match && match[2] === fileName) return match[1].toLowerCase();
  }
  return null;
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function updateError(message) {
  var err = new Error(message);
  err.code = "E-UP-01";
  return err;
}

function requestOnce(url) {
  return new Promise(function(resolve, reject) {
    var lib = url.indexOf("https://") === 0 ? https : http;
    var req = lib.get(url, { headers: { "User-Agent": "xImporter" } }, function(res) {
      var status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve({ redirect: res.headers.location });
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(updateError("No se pudo descargar yt-dlp (HTTP " + status + ")."));
        return;
      }
      var chunks = [];
      res.on("data", function(chunk) { chunks.push(chunk); });
      res.on("end", function() { resolve({ body: Buffer.concat(chunks) }); });
      res.on("error", reject);
    });
    req.on("error", function() {
      reject(updateError("No se pudo descargar yt-dlp."));
    });
  });
}

function fetchBuffer(url, hops) {
  if (hops == null) hops = 0;
  if (hops > 5) return Promise.reject(updateError("Demasiadas redirecciones al descargar yt-dlp."));
  return requestOnce(url).then(function(result) {
    if (!result.redirect) return result.body;
    var next = result.redirect;
    if (next.indexOf("http://") !== 0 && next.indexOf("https://") !== 0) {
      next = new URL(next, url).href;
    }
    return fetchBuffer(next, hops + 1);
  });
}

function installName(platform) {
  return platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function prepareExecutable(dest, platform, spawnSync) {
  if (platform === "win32") return null;
  fs.chmodSync(dest, 493);
  if (platform !== "darwin" || typeof spawnSync !== "function") return null;
  try {
    spawnSync("xattr", ["-dr", "com.apple.quarantine", dest], { windowsHide: true });
  } catch (err) {
    // Quarantine clearing is macOS-only and optional for the checksum check.
  }
  var signed = null;
  try {
    signed = spawnSync("codesign", ["-s", "-", "--force", dest], { windowsHide: true });
  } catch (err2) {
    return "No se pudo firmar ad hoc el yt-dlp nuevo.";
  }
  if (signed && signed.status) return "No se pudo firmar ad hoc el yt-dlp nuevo.";
  return null;
}

function updateYtDlp(options) {
  options = options || {};
  var platform = options.platform;
  var name = assetName(platform);
  if (!name) return Promise.reject(updateError("La actualización de yt-dlp no está disponible en esta plataforma."));

  var folder = binaries.platformFolder(platform, options.arch);
  if (!folder) return Promise.reject(updateError("Plataforma no soportada para actualizar yt-dlp."));

  var userDir = binaries.userBinDir({
    platform: platform,
    arch: options.arch,
    homedir: options.homedir,
    localAppData: options.localAppData
  });
  if (!userDir) return Promise.reject(updateError("No hay carpeta de usuario para guardar yt-dlp."));

  var sumsUrl = options.sumsUrl || DEFAULT_SUMS_URL;
  var assetBase = options.assetBase || DEFAULT_ASSET_BASE;
  var assetUrl = assetBase.replace(/\/$/, "") + "/" + name;
  var get = options.fetchBuffer || fetchBuffer;
  var mkdirSync = options.mkdirSync || function(dir) {
    fs.mkdirSync(dir, { recursive: true });
  };

  return get(sumsUrl).then(function(sumsBody) {
    var expected = parseSha256Sums(sumsBody.toString("utf8"), name);
    if (!expected) throw updateError("SHA2-256SUMS no incluye " + name + ".");
    return get(assetUrl).then(function(body) {
      var actual = sha256Buffer(body);
      if (actual !== expected) {
        throw updateError("La suma SHA-256 de yt-dlp no coincide. No se instaló.");
      }
      mkdirSync(userDir);
      var finalPath = path.join(userDir, installName(platform));
      var tempPath = finalPath + ".download";
      fs.writeFileSync(tempPath, body);
      var rename = options.renameSync || fs.renameSync.bind(fs);
      rename(tempPath, finalPath);
      var warning = prepareExecutable(finalPath, platform, options.spawnSync);
      return {
        path: finalPath,
        sha256: actual,
        asset: name,
        warning: warning
      };
    });
  });
}

module.exports = {
  assetName: assetName,
  parseSha256Sums: parseSha256Sums,
  sha256Buffer: sha256Buffer,
  fetchBuffer: fetchBuffer,
  updateYtDlp: updateYtDlp,
  DEFAULT_SUMS_URL: DEFAULT_SUMS_URL,
  DEFAULT_ASSET_BASE: DEFAULT_ASSET_BASE
};

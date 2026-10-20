"use strict";

function parseProgressLine(line) {
  var trimmed = String(line).replace(/^\s+/, "").replace(/\r$/, "");
  var phase = null;
  var rest = null;
  if (trimmed.indexOf("download:XIP|") === 0) {
    phase = "download";
    rest = trimmed.substring("download:XIP|".length);
  } else if (trimmed.indexOf("postprocess:XIP|") === 0) {
    phase = "postprocess";
    rest = trimmed.substring("postprocess:XIP|".length);
  } else {
    return null;
  }

  var parts = rest.split("|");

  function num(value) {
    if (value == null) return null;
    var text = String(value).trim();
    if (!text || text === "NA" || text === "None" || text === "nan") return null;
    var n = Number(text);
    if (!isFinite(n)) return null;
    return n;
  }

  var downloaded = num(parts[1]);
  var total = num(parts[2]);
  var estimate = num(parts[3]);
  var denom = total != null ? total : estimate;
  var percent = null;
  if (downloaded != null && denom != null && denom > 0) {
    percent = (downloaded / denom) * 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
  }

  return {
    phase: phase,
    status: parts[0] || "",
    downloadedBytes: downloaded,
    totalBytes: total,
    totalBytesEstimate: estimate,
    speed: num(parts[4]),
    eta: num(parts[5]),
    percent: percent
  };
}

function isMediaPath(line) {
  if (!line) return false;
  if (line.indexOf("download:") === 0 || line.indexOf("postprocess:") === 0) return false;
  var isUnix = line.charAt(0) === "/";
  var isWin = /^[A-Za-z]:[\\/]/.test(line);
  if (!isUnix && !isWin) return false;
  return /\.(mp4|m4a|mkv|webm|mov|wav|mp3)$/i.test(line);
}

function findOutputPath(lines) {
  var found = null;
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i]).trim();
    if (isMediaPath(line)) found = line;
  }
  return found;
}

function createLineSplitter(onLine) {
  var pending = "";
  return {
    push: function(text) {
      pending += String(text);
      var parts = pending.split(/\r?\n/);
      pending = parts.pop();
      for (var i = 0; i < parts.length; i++) onLine(parts[i]);
    },
    flush: function() {
      if (pending.length) {
        onLine(pending);
        pending = "";
      }
    }
  };
}

function formatSpeed(bytesPerSec) {
  if (typeof bytesPerSec !== "number" || !isFinite(bytesPerSec) || bytesPerSec < 0) return "";
  if (bytesPerSec >= 1000000) return (bytesPerSec / 1000000).toFixed(1) + " MB/s";
  if (bytesPerSec >= 1000) return (bytesPerSec / 1000).toFixed(1) + " KB/s";
  return Math.round(bytesPerSec) + " B/s";
}

function formatEta(seconds) {
  var s = Math.max(0, Math.round(seconds));
  var m = Math.floor(s / 60);
  var rem = s % 60;
  return m + ":" + (rem < 10 ? "0" : "") + rem;
}

function formatProgress(progress) {
  if (!progress) return "";
  if (progress.phase === "transcode") return "Converting to H.264/AAC";
  var parts = [];
  parts.push(progress.phase === "postprocess" ? "Processing" : "Downloading");
  if (typeof progress.percent === "number") parts.push(progress.percent.toFixed(0) + "%");
  var speed = formatSpeed(progress.speed);
  if (speed) parts.push(speed);
  if (typeof progress.eta === "number" && progress.eta >= 0) parts.push("ETA " + formatEta(progress.eta));
  return parts.join(" · ");
}

module.exports = {
  parseProgressLine: parseProgressLine,
  isMediaPath: isMediaPath,
  findOutputPath: findOutputPath,
  createLineSplitter: createLineSplitter,
  formatSpeed: formatSpeed,
  formatEta: formatEta,
  formatProgress: formatProgress
};

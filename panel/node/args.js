"use strict";

// Prefer H.264 (avc1 or h264) and AAC. A height cap is applied for 720/1080/2160.
// Auto leaves the height uncapped so an already-compatible stream can be copied.
var DOWNLOAD_TEMPLATE = "download:XIP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";
var POSTPROCESS_TEMPLATE = "postprocess:XIP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

function normalizeMode(mode) {
  var text = String(mode || "").toLowerCase();
  if (text === "wav" || text === "audio-wav" || text === "audio") return "wav";
  if (text === "mp3" || text === "audio-mp3") return "mp3";
  return "video";
}

// null means "do not cap" (Auto). Anything unrecognized stays at 1080.
function heightCap(resolution) {
  if (resolution == null || resolution === "") return 1080;
  var text = String(resolution).toLowerCase();
  if (text === "auto") return null;
  if (text === "2160" || text === "4k") return 2160;
  if (text === "720") return 720;
  if (text === "1080") return 1080;
  return 1080;
}

function videoFormat(cap) {
  var height = cap ? "[height<=" + cap + "]" : "";
  return [
    "bv*" + height + "[vcodec^=avc1]+ba[acodec^=mp4a]",
    "bv*" + height + "[vcodec^=h264]+ba[acodec^=mp4a]",
    "bv*" + height + "[vcodec^=avc1]+ba[acodec^=aac]",
    "bv*" + height + "[vcodec^=h264]+ba[acodec^=aac]",
    "bv*" + height + "[vcodec^=avc1]+ba",
    "bv*" + height + "[vcodec^=h264]+ba",
    "bv*" + height + "+ba",
    cap ? "b" + height : "b"
  ].join("/");
}

var FORMAT = videoFormat(1080);

function buildYtDlpArgs(options) {
  var mode = normalizeMode(options.mode);
  var args = [
    "--no-config",
    "--no-update",
    "--no-playlist",
    "--no-mtime",
    "--newline",
    "--windows-filenames",
    "--trim-filenames", "80",
    "--ffmpeg-location", options.ffmpegPath,
    "--js-runtimes", "deno:" + options.denoPath,
    "--progress-template", DOWNLOAD_TEMPLATE,
    "--progress-template", POSTPROCESS_TEMPLATE
  ];

  if (mode === "video") {
    args.push("-f", videoFormat(heightCap(options.resolution)));
    args.push("--merge-output-format", "mp4", "--remux-video", "mp4");
  } else if (mode === "wav") {
    args.push("-f", "ba/b", "-x", "--audio-format", "wav");
    args.push("--postprocessor-args", "ExtractAudio:-acodec pcm_s16le -ar 48000");
  } else {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0");
  }

  args.push(
    "-P", options.outputDir,
    "-o", "%(title).80s [%(id)s].%(ext)s",
    "--no-simulate",
    "--print", "after_move:%(filepath)s",
    options.url
  );
  return args;
}

module.exports = {
  FORMAT: FORMAT,
  DOWNLOAD_TEMPLATE: DOWNLOAD_TEMPLATE,
  POSTPROCESS_TEMPLATE: POSTPROCESS_TEMPLATE,
  normalizeMode: normalizeMode,
  heightCap: heightCap,
  videoFormat: videoFormat,
  buildYtDlpArgs: buildYtDlpArgs
};

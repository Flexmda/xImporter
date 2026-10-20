"use strict";

// Prefer H.264 (avc1 or h264) and AAC, capped at 1080p, then any 1080p stream.
// There is no unlimited fallback: a taller-only source fails instead of importing 4K.
var FORMAT = [
  "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]",
  "bv*[height<=1080][vcodec^=h264]+ba[acodec^=mp4a]",
  "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=aac]",
  "bv*[height<=1080][vcodec^=h264]+ba[acodec^=aac]",
  "bv*[height<=1080][vcodec^=avc1]+ba",
  "bv*[height<=1080][vcodec^=h264]+ba",
  "bv*[height<=1080]+ba",
  "b[height<=1080]"
].join("/");

// Raw progress fields. The XIP marker is ours so the parser can ignore yt-dlp chatter.
var DOWNLOAD_TEMPLATE = "download:XIP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";
var POSTPROCESS_TEMPLATE = "postprocess:XIP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

function buildYtDlpArgs(options) {
  return [
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
    "--progress-template", POSTPROCESS_TEMPLATE,
    "-f", FORMAT,
    "--merge-output-format", "mp4",
    "--remux-video", "mp4",
    "-P", options.outputDir,
    "-o", "%(title).80s [%(id)s].%(ext)s",
    "--no-simulate",
    "--print", "after_move:%(filepath)s",
    options.url
  ];
}

module.exports = {
  FORMAT: FORMAT,
  DOWNLOAD_TEMPLATE: DOWNLOAD_TEMPLATE,
  POSTPROCESS_TEMPLATE: POSTPROCESS_TEMPLATE,
  buildYtDlpArgs: buildYtDlpArgs
};

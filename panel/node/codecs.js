"use strict";

function inspectCodecs(text) {
  var source = text || "";
  var video = /Video:\s*([A-Za-z0-9]+)/.exec(source);
  var audio = /Audio:\s*([A-Za-z0-9]+)/.exec(source);
  return {
    video: video ? video[1].toLowerCase() : null,
    audio: audio ? audio[1].toLowerCase() : null
  };
}

function isPremiereFriendly(codecs) {
  var video = codecs && codecs.video;
  var audio = codecs && codecs.audio;
  var videoOk = video === "h264" || video === "avc1";
  var audioOk = audio == null || audio === "aac" || audio === "mp4a";
  return Boolean(videoOk && audioOk);
}

// libx264 matches the static macOS ffmpeg this spike downloads (x264 is in that build).
// Hardware encoders are a later milestone. H.264 video with a different audio codec is copied.
function buildTranscodeArgs(input, output, codecs) {
  var videoCopy = codecs && (codecs.video === "h264" || codecs.video === "avc1");
  var args = ["-hide_banner", "-y", "-i", input];
  if (videoCopy) {
    args.push("-c:v", "copy");
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=-2:'min(1080,ih)'"
    );
  }
  args.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", output);
  return args;
}

module.exports = {
  inspectCodecs: inspectCodecs,
  isPremiereFriendly: isPremiereFriendly,
  buildTranscodeArgs: buildTranscodeArgs
};

"use strict";

// CommonJS on purpose. CEP 11 embeds Node 15 and CEP 12 embeds Node 17.
// The panel loads this file with an absolute require() from client/main.js.

var path = require("path");
var fs = require("fs");
var os = require("os");
var childProcess = require("child_process");

var argsMod = require("./args.js");
var binaries = require("./binaries.js");
var codecs = require("./codecs.js");
var progress = require("./progress.js");

function validateUrl(input) {
  var raw = String(input || "").trim();
  var url;
  try {
    url = new URL(raw);
  } catch (err) {
    return rejectUrl();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return rejectUrl();
  }
  return url.href;
}

function rejectUrl() {
  var invalid = new Error("The URL is not valid. Use an http or https link.");
  invalid.code = "E-URL-01";
  throw invalid;
}

function outputDirectory(homedir) {
  return path.join(homedir, "Movies", "xImporter");
}

function transcodePath(mediaPath) {
  var parsed = path.parse(mediaPath);
  return path.join(parsed.dir, parsed.name + ".h264.mp4");
}

function tail(text) {
  if (!text) return "";
  var lines = String(text).trim().split(/\r?\n/);
  return lines.slice(-12).join("\n");
}

function commandName(command) {
  return path.basename(String(command));
}

function runProcess(spawn, command, args, hooks) {
  hooks = hooks || {};
  return new Promise(function(resolve, reject) {
    var child;
    var opts = { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
    try {
      child = spawn(command, args, opts);
    } catch (err) {
      reject(err);
      return;
    }
    if (!child || !child.stdout || !child.stderr || typeof child.on !== "function") {
      reject(new Error("spawn did not return a process"));
      return;
    }

    var stdout = "";
    var stderr = "";
    var stdoutLines = [];
    var stderrLines = [];
    var stdoutSplit = progress.createLineSplitter(function(line) {
      stdoutLines.push(line);
      var parsed = progress.parseProgressLine(line);
      if (parsed && hooks.onProgress) hooks.onProgress(parsed);
      if (hooks.onLine) hooks.onLine(line, false);
    });
    var stderrSplit = progress.createLineSplitter(function(line) {
      stderrLines.push(line);
      if (hooks.onLine) hooks.onLine(line, true);
    });
    var settled = false;

    function finish(fn) {
      if (settled) return;
      settled = true;
      fn();
    }

    child.stdout.on("data", function(chunk) {
      var text = chunk.toString("utf8");
      if (stdout.length < 200000) stdout += text;
      stdoutSplit.push(text);
    });
    child.stderr.on("data", function(chunk) {
      var text = chunk.toString("utf8");
      if (stderr.length < 200000) stderr += text;
      stderrSplit.push(text);
    });
    child.on("error", function(err) {
      finish(function() { reject(err); });
    });
    child.on("close", function(code) {
      stdoutSplit.flush();
      stderrSplit.flush();
      finish(function() {
        if (code === 0) {
          resolve({
            code: code,
            stdout: stdout,
            stderr: stderr,
            stdoutLines: stdoutLines,
            stderrLines: stderrLines
          });
          return;
        }
        var err = new Error(commandName(command) + " failed (" + code + ")\n" + tail(stderr || stdout));
        err.code = "E-DL-01";
        err.exitCode = code;
        err.stdout = stdout;
        err.stderr = stderr;
        err.stdoutLines = stdoutLines;
        err.stderrLines = stderrLines;
        reject(err);
      });
    });
  });
}

function createEngine(deps) {
  deps = deps || {};
  var spawn = deps.spawn || childProcess.spawn;
  var platform = deps.platform || process.platform;
  var arch = deps.arch || process.arch;
  var extensionRoot = deps.extensionRoot || path.join(__dirname, "..");
  var homedir = deps.homedir || os.homedir();
  var existsSync = deps.existsSync || fs.existsSync.bind(fs);
  var mkdirSync = deps.mkdirSync || function(dir) {
    fs.mkdirSync(dir, { recursive: true });
  };

  function probeFile(ffmpegPath, mediaPath) {
    // ffmpeg -i exits 1 when it is only printing stream info. That still counts as a probe.
    return runProcess(spawn, ffmpegPath, ["-hide_banner", "-i", mediaPath], {}).then(function(result) {
      return codecs.inspectCodecs(result.stderr + "\n" + result.stdout);
    }, function(err) {
      var text = (err.stderr || "") + "\n" + (err.stdout || "");
      if (/Video:/.test(text) || /Audio:/.test(text)) return codecs.inspectCodecs(text);
      throw err;
    });
  }

  function download(url, hooks) {
    hooks = hooks || {};
    var cleanUrl;
    try {
      cleanUrl = validateUrl(url);
    } catch (err) {
      return Promise.reject(err);
    }

    var bins;
    try {
      bins = binaries.resolveBinaries({
        extensionRoot: extensionRoot,
        platform: platform,
        arch: arch,
        existsSync: existsSync
      });
    } catch (err) {
      return Promise.reject(err);
    }

    var outputDir = deps.outputDir || outputDirectory(homedir);
    try {
      mkdirSync(outputDir);
    } catch (err) {
      return Promise.reject(err);
    }

    var dlArgs = argsMod.buildYtDlpArgs({
      url: cleanUrl,
      ffmpegPath: bins.ffmpeg,
      denoPath: bins.deno,
      outputDir: outputDir
    });

    return runProcess(spawn, bins.ytDlp, dlArgs, hooks).then(function(result) {
      var media = progress.findOutputPath(result.stdoutLines);
      if (!media) {
        var missing = new Error("yt-dlp finished without reporting the file path.");
        missing.code = "E-DL-04";
        throw missing;
      }
      return probeFile(bins.ffmpeg, media).then(function(info) {
        if (codecs.isPremiereFriendly(info)) {
          return { filepath: media, transcoded: false, codecs: info };
        }
        var dest = transcodePath(media);
        if (hooks.onProgress) {
          hooks.onProgress({
            phase: "transcode",
            status: "converting",
            percent: null,
            speed: null,
            eta: null
          });
        }
        var tArgs = codecs.buildTranscodeArgs(media, dest, info);
        return runProcess(spawn, bins.ffmpeg, tArgs, hooks).then(function() {
          return { filepath: dest, transcoded: true, codecs: info };
        });
      });
    });
  }

  return {
    download: download,
    outputDirectory: function() {
      return outputDirectory(homedir);
    }
  };
}

module.exports = {
  createEngine: createEngine,
  validateUrl: validateUrl,
  outputDirectory: outputDirectory,
  transcodePath: transcodePath,
  runProcess: runProcess
};

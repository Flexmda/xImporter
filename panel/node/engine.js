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

// An injected platform that is not this machine's platform is a unit test.
// Probing sysctl there would be noise. The real panel leaves platform unset.
function translatedFlag(deps, platform) {
  if (typeof deps.translated === "boolean") return deps.translated;
  if (platform !== "darwin") return false;
  if (typeof deps.execFileSync === "function") {
    return binaries.readProcTranslated(deps.execFileSync);
  }
  if (deps.platform && deps.platform !== process.platform) return false;
  return binaries.readProcTranslated(childProcess.execFileSync);
}

var WORK_DIR_NAME = ".xip-work";

function cancelError() {
  var err = new Error("Cancelado.");
  err.code = "E-DL-CANCEL";
  return err;
}

function busyError() {
  var err = new Error("Ya hay una descarga en curso.");
  err.code = "E-DL-BUSY";
  return err;
}

function runProcess(spawn, command, args, hooks, session) {
  hooks = hooks || {};
  session = session || {};
  return new Promise(function(resolve, reject) {
    var child;
    var opts = { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
    if (session.group) opts.detached = true;
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
    if (session.onChild) session.onChild(child);

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
        if (session.isCancelled && session.isCancelled()) {
          reject(cancelError());
          return;
        }
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
  var useGroup = platform !== "win32";
  var active = null;
  var cancelRequested = false;

  function tracked(command, args, hooks) {
    return runProcess(spawn, command, args, hooks, {
      group: useGroup,
      onChild: function(child) { active = child; },
      isCancelled: function() { return cancelRequested; }
    });
  }

  function probeFile(ffmpegPath, mediaPath) {
    // ffmpeg -i exits 1 when it is only printing stream info. That still counts as a probe.
    return tracked(ffmpegPath, ["-hide_banner", "-i", mediaPath], {}).then(function(result) {
      return codecs.inspectCodecs(result.stderr + "\n" + result.stdout);
    }, function(err) {
      var text = (err.stderr || "") + "\n" + (err.stdout || "");
      if (/Video:/.test(text) || /Audio:/.test(text)) return codecs.inspectCodecs(text);
      throw err;
    });
  }

  function removeWork(dir) {
    var rm = deps.rmSync || fs.rmSync.bind(fs);
    try {
      rm(dir, { recursive: true, force: true });
    } catch (err) {
      // The task folder is the only thing cancel is allowed to delete.
    }
  }

  function releaseFile(media, outputDir, workDir) {
    var absMedia = path.resolve(media);
    var prefix = path.resolve(workDir) + path.sep;
    if (absMedia.indexOf(prefix) !== 0) return media;
    var dest = path.join(outputDir, path.basename(media));
    if (path.resolve(dest) === absMedia) return media;
    var rename = deps.renameSync || fs.renameSync.bind(fs);
    rename(media, dest);
    return dest;
  }

  function killTree(child) {
    if (!child) return Promise.resolve();
    var pid = child.pid;
    if (platform === "win32") {
      if (!pid) {
        try { if (child.kill) child.kill(); } catch (err) {}
        return Promise.resolve();
      }
      return new Promise(function(resolve) {
        var killer = null;
        try {
          killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
          });
        } catch (err) {
          try { if (child.kill) child.kill(); } catch (err2) {}
          resolve();
          return;
        }
        if (killer && killer.stdout && killer.stdout.on) killer.stdout.on("data", function() {});
        if (killer && killer.stderr && killer.stderr.on) killer.stderr.on("data", function() {});
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }
        if (killer && typeof killer.on === "function") {
          killer.on("close", finish);
          killer.on("error", finish);
        } else {
          finish();
        }
        try { if (child.kill) child.kill(); } catch (err3) {}
      });
    }

    var killGroup = deps.killGroup || function(groupPid, signal) {
      process.kill(groupPid, signal);
    };
    if (!pid) {
      try { if (child.kill) child.kill("SIGTERM"); } catch (err) {}
      return Promise.resolve();
    }
    return new Promise(function(resolve) {
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        resolve();
      }
      var grace = deps.killGraceMs == null ? 3000 : deps.killGraceMs;
      var timer = setTimeout(function() {
        try {
          killGroup(-pid, "SIGKILL");
        } catch (err) {
          try { if (child.kill) child.kill("SIGKILL"); } catch (err2) {}
        }
        finish();
      }, grace);
      if (typeof child.on === "function") {
        child.on("close", function() {
          clearTimeout(timer);
          finish();
        });
      }
      try {
        killGroup(-pid, "SIGTERM");
      } catch (err) {
        try { if (child.kill) child.kill("SIGTERM"); } catch (err2) {}
      }
    });
  }

  function cancel() {
    if (!active) return Promise.resolve(false);
    cancelRequested = true;
    return killTree(active).then(function() { return true; });
  }

  function download(url, hooks) {
    hooks = hooks || {};
    if (active) return Promise.reject(busyError());

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
        existsSync: existsSync,
        homedir: homedir,
        localAppData: deps.localAppData,
        translated: translatedFlag(deps, platform),
        execFileSync: deps.execFileSync
      });
    } catch (err) {
      return Promise.reject(err);
    }
    if (bins.warning && hooks.onWarning) hooks.onWarning(bins.warning);

    var outputDir = deps.outputDir || outputDirectory(homedir);
    var workDir = path.join(outputDir, WORK_DIR_NAME);
    var mode = argsMod.normalizeMode(hooks.mode);
    try {
      mkdirSync(outputDir);
      mkdirSync(workDir);
    } catch (err) {
      return Promise.reject(err);
    }

    active = { pid: null };
    cancelRequested = false;

    var dlArgs = argsMod.buildYtDlpArgs({
      url: cleanUrl,
      ffmpegPath: bins.ffmpeg,
      denoPath: bins.deno,
      outputDir: workDir,
      mode: mode,
      resolution: hooks.resolution
    });

    return tracked(bins.ytDlp, dlArgs, hooks).then(function(result) {
      var media = progress.findOutputPath(result.stdoutLines);
      if (!media) {
        var missing = new Error("yt-dlp finished without reporting the file path.");
        missing.code = "E-DL-04";
        throw missing;
      }
      media = releaseFile(media, outputDir, workDir);
      if (mode !== "video") {
        return { filepath: media, transcoded: false, mode: mode, codecs: null };
      }
      return probeFile(bins.ffmpeg, media).then(function(info) {
        if (codecs.isPremiereFriendly(info)) {
          return { filepath: media, transcoded: false, mode: mode, codecs: info };
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
        var tArgs = codecs.buildTranscodeArgs(media, dest, info, argsMod.heightCap(hooks.resolution));
        return tracked(bins.ffmpeg, tArgs, hooks).then(function() {
          return { filepath: dest, transcoded: true, mode: mode, codecs: info };
        });
      });
    }).then(function(value) {
      active = null;
      cancelRequested = false;
      return value;
    }, function(err) {
      var cancelled = cancelRequested || (err && err.code === "E-DL-CANCEL");
      active = null;
      cancelRequested = false;
      if (cancelled) {
        removeWork(workDir);
        if (err && err.code === "E-DL-CANCEL") throw err;
        throw cancelError();
      }
      throw err;
    });
  }

  return {
    download: download,
    cancel: cancel,
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
  runProcess: runProcess,
  WORK_DIR_NAME: WORK_DIR_NAME
};

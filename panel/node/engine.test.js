"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var assert = require("node:assert/strict");
var test = require("node:test");

var argsMod = require("./args.js");
var binaries = require("./binaries.js");
var codecs = require("./codecs.js");
var progress = require("./progress.js");
var jsx = require("./jsx.js");
var engineMod = require("./engine.js");

var root = path.join(__dirname, "..", "..");

function scripted(stdoutText, stderrText, code) {
  var stdoutHandlers = {};
  var stderrHandlers = {};
  var procHandlers = {};
  var proc = {
    stdout: { on: function(ev, fn) { stdoutHandlers[ev] = fn; } },
    stderr: { on: function(ev, fn) { stderrHandlers[ev] = fn; } },
    on: function(ev, fn) { procHandlers[ev] = fn; },
    kill: function() {}
  };
  setImmediate(function() {
    if (stdoutText && stdoutHandlers.data) stdoutHandlers.data(Buffer.from(stdoutText));
    if (stderrText && stderrHandlers.data) stderrHandlers.data(Buffer.from(stderrText));
    if (procHandlers.close) procHandlers.close(code);
  });
  return proc;
}

function fakeSpawn(handler) {
  var calls = [];
  function spawn(cmd, args, opts) {
    calls.push({ cmd: cmd, args: args, opts: opts });
    var plan = handler(cmd, args, opts);
    return scripted(plan.stdout || "", plan.stderr || "", plan.code);
  }
  spawn.calls = calls;
  return spawn;
}

function packagedExists(file) {
  return file.indexOf(path.join("/ext", "bin") + path.sep) === 0;
}

function testEngine(spawn) {
  return engineMod.createEngine({
    spawn: spawn,
    platform: "darwin",
    arch: "arm64",
    extensionRoot: "/ext",
    homedir: "/Users/jose",
    outputDir: "/Users/jose/Movies/xImporter",
    existsSync: packagedExists,
    mkdirSync: function() {}
  });
}

test("progress parser reads XIP fields and ignores junk", function() {
  var parsed = progress.parseProgressLine(
    "download:XIP|downloading|500|NA|2000|250000|4"
  );
  assert.equal(parsed.phase, "download");
  assert.equal(parsed.status, "downloading");
  assert.equal(parsed.downloadedBytes, 500);
  assert.equal(parsed.totalBytes, null);
  assert.equal(parsed.totalBytesEstimate, 2000);
  assert.equal(parsed.percent, 25);
  assert.equal(parsed.speed, 250000);
  assert.equal(parsed.eta, 4);
  assert.equal(progress.formatProgress(parsed), "Downloading · 25% · 250.0 KB/s · ETA 0:04");

  var done = progress.parseProgressLine("postprocess:XIP|finished|NA|NA|NA|NA|NA");
  assert.equal(done.phase, "postprocess");
  assert.equal(done.percent, null);
  assert.equal(progress.formatProgress(done), "Processing");
  assert.equal(progress.formatProgress({ phase: "transcode" }), "Converting to H.264/AAC");

  assert.equal(progress.parseProgressLine("WARNING: something XIP|nope"), null);
  assert.equal(progress.parseProgressLine(""), null);
});

test("line splitter keeps a partial line until the newline arrives", function() {
  var lines = [];
  var splitter = progress.createLineSplitter(function(line) { lines.push(line); });
  splitter.push("download:XIP|downloading|1");
  splitter.push("|2|NA|NA|1|1\r\nleft");
  assert.deepEqual(lines, ["download:XIP|downloading|1|2|NA|NA|1|1"]);
  splitter.flush();
  assert.deepEqual(lines[1], "left");
});

test("output path is the last absolute media path, not a progress line", function() {
  var found = progress.findOutputPath([
    "download:XIP|downloading|1|2|NA|1|1",
    "not a path",
    "/tmp/partial.mkv",
    "/Users/José Quiroz/Movies/xImporter/Año [abc].mp4",
    "C:\\Movies\\xImporter\\clip.mp4"
  ]);
  assert.equal(found, "C:\\Movies\\xImporter\\clip.mp4");
  assert.equal(progress.isMediaPath("/tmp/voice.wav"), true);
  assert.equal(progress.isMediaPath("/tmp/voice.mp3"), true);
  assert.equal(progress.findOutputPath(["/tmp/voice.wav"]), "/tmp/voice.wav");
});

test("yt-dlp args spawn without a shell and keep the URL as its own argument", function() {
  var url = "https://example.com/watch?v=abc;rm";
  var built = argsMod.buildYtDlpArgs({
    url: url,
    ffmpegPath: "/bin/ffmpeg",
    denoPath: "/bin/deno",
    outputDir: "/Users/jose/Movies/xImporter"
  });
  assert.equal(Array.isArray(built), true);
  assert.equal(built[built.length - 1], url);
  assert.equal(built.indexOf("--newline") !== -1, true);
  assert.equal(built.indexOf("--no-playlist") !== -1, true);
  assert.equal(built.indexOf(argsMod.DOWNLOAD_TEMPLATE) !== -1, true);
  assert.equal(built.indexOf(argsMod.POSTPROCESS_TEMPLATE) !== -1, true);
  assert.equal(built[built.indexOf("--ffmpeg-location") + 1], "/bin/ffmpeg");
  assert.equal(built[built.indexOf("--js-runtimes") + 1], "deno:/bin/deno");
  assert.equal(built[built.indexOf("-f") + 1], argsMod.FORMAT);
  assert.equal(built.indexOf("mp4") !== -1, true);
  assert.ok(argsMod.FORMAT.indexOf("height<=1080") !== -1);
  assert.ok(argsMod.FORMAT.indexOf("avc1") !== -1);
  assert.equal(built[built.indexOf("--print") + 1], "after_move:%(filepath)s");
  assert.equal(built[built.indexOf("--no-simulate")], "--no-simulate");
  built.forEach(function(arg) {
    if (arg !== url) assert.equal(arg.indexOf(url), -1);
  });

  var fourK = argsMod.buildYtDlpArgs({
    url: url,
    ffmpegPath: "/bin/ffmpeg",
    denoPath: "/bin/deno",
    outputDir: "/tmp/out",
    resolution: "2160"
  });
  assert.equal(fourK[fourK.indexOf("-f") + 1], argsMod.videoFormat(2160));
  assert.ok(fourK[fourK.indexOf("-f") + 1].indexOf("height<=2160") !== -1);
  assert.equal(fourK[fourK.length - 1], url);

  var auto = argsMod.buildYtDlpArgs({
    url: url,
    ffmpegPath: "/bin/ffmpeg",
    denoPath: "/bin/deno",
    outputDir: "/tmp/out",
    resolution: "auto"
  });
  var autoFormat = auto[auto.indexOf("-f") + 1];
  assert.equal(autoFormat.indexOf("height<="), -1);
  assert.equal(autoFormat.indexOf("bv*[vcodec^=avc1]"), 0);
  assert.equal(argsMod.heightCap("auto"), null);
  assert.equal(argsMod.heightCap("720"), 720);

  var wav = argsMod.buildYtDlpArgs({
    url: url,
    ffmpegPath: "/bin/ffmpeg",
    denoPath: "/bin/deno",
    outputDir: "/tmp/out",
    mode: "wav",
    resolution: "2160"
  });
  assert.equal(wav[wav.length - 1], url);
  assert.ok(wav.indexOf("--audio-format") !== -1);
  assert.equal(wav[wav.indexOf("--audio-format") + 1], "wav");
  assert.equal(wav[wav.indexOf("--postprocessor-args") + 1], "ExtractAudio:-acodec pcm_s16le -ar 48000");
  assert.equal(wav.indexOf("--merge-output-format"), -1);
  assert.equal(wav.indexOf("height<=2160"), -1);

  var mp3 = argsMod.buildYtDlpArgs({
    url: url,
    ffmpegPath: "/bin/ffmpeg",
    denoPath: "/bin/deno",
    outputDir: "/tmp/out",
    mode: "mp3"
  });
  assert.equal(mp3[mp3.indexOf("--audio-format") + 1], "mp3");
  assert.equal(mp3[mp3.indexOf("--audio-quality") + 1], "0");
  assert.equal(mp3[mp3.length - 1], url);
  assert.equal(argsMod.normalizeMode("audio"), "wav");
  assert.equal(argsMod.normalizeMode("audio-mp3"), "mp3");
});

test("binary folders follow platform and architecture", function() {
  assert.equal(binaries.platformFolder("darwin", "arm64"), "mac-arm64");
  assert.equal(binaries.platformFolder("darwin", "x64"), "mac-x64");
  assert.equal(binaries.platformFolder("win32", "x64"), "win-x64");
  assert.equal(binaries.platformFolder("linux", "x64"), null);
  assert.equal(binaries.executableName("ffmpeg", "win32"), "ffmpeg.exe");
  assert.equal(binaries.executableName("ffmpeg", "darwin"), "ffmpeg");

  var resolved = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "arm64",
    existsSync: function() { return true; }
  });
  assert.equal(resolved.ytDlp, path.join("/ext", "bin", "mac-arm64", "yt-dlp"));
  assert.equal(resolved.ffmpeg, path.join("/ext", "bin", "mac-arm64", "ffmpeg"));
  assert.equal(resolved.deno, path.join("/ext", "bin", "mac-arm64", "deno"));

  var intel = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "x64",
    existsSync: function() { return true; }
  });
  assert.equal(intel.folder, "mac-x64");
  assert.equal(intel.ytDlp, path.join("/ext", "bin", "mac-x64", "yt-dlp"));
  assert.equal(intel.ffmpeg, path.join("/ext", "bin", "mac-x64", "ffmpeg"));
  assert.equal(intel.deno, path.join("/ext", "bin", "mac-x64", "deno"));

  assert.throws(function() {
    binaries.resolveBinaries({
      extensionRoot: "/ext",
      platform: "linux",
      arch: "x64",
      existsSync: function() { return true; }
    });
  }, function(err) { return err.code === "E-BIN-01"; });

  assert.throws(function() {
    binaries.resolveBinaries({
      extensionRoot: "/ext",
      platform: "darwin",
      arch: "arm64",
      existsSync: function(file) { return file.indexOf("deno") === -1; }
    });
  }, function(err) {
    return err.code === "E-BIN-01" && err.path.indexOf("deno") !== -1 && err.message.indexOf("fetch-binaries.sh mac-arm64") !== -1;
  });
});

test("selector handles Rosetta, Intel, Windows, and the user bin", function() {
  function execTranslated(value) {
    return function(cmd, args) {
      assert.equal(cmd, "sysctl");
      assert.deepEqual(args, ["-n", "sysctl.proc_translated"]);
      if (value === "fail") throw new Error("sysctl failed");
      return value + "\n";
    };
  }

  assert.equal(binaries.readProcTranslated(execTranslated("1")), true);
  assert.equal(binaries.readProcTranslated(execTranslated("0")), false);
  assert.equal(binaries.readProcTranslated(execTranslated("fail")), false);

  var rosetta = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "x64",
    translated: true,
    existsSync: packagedExists
  });
  assert.equal(rosetta.folder, "mac-x64");
  assert.equal(rosetta.translated, true);
  assert.equal(rosetta.warning, binaries.rosettaWarning());
  assert.ok(rosetta.warning.indexOf("Rosetta") !== -1);
  assert.equal(rosetta.ytDlp, path.join("/ext", "bin", "mac-x64", "yt-dlp"));

  var intel = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "x64",
    execFileSync: execTranslated("0"),
    existsSync: packagedExists
  });
  assert.equal(intel.folder, "mac-x64");
  assert.equal(intel.translated, false);
  assert.equal(intel.warning, null);

  var win = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "win32",
    arch: "x64",
    existsSync: function() { return true; }
  });
  assert.equal(win.folder, "win-x64");
  assert.equal(win.warning, null);
  assert.equal(win.ytDlp, path.join("/ext", "bin", "win-x64", "yt-dlp.exe"));
  assert.equal(win.ffmpeg, path.join("/ext", "bin", "win-x64", "ffmpeg.exe"));
  assert.equal(win.deno, path.join("/ext", "bin", "win-x64", "deno.exe"));

  assert.throws(function() {
    binaries.resolveBinaries({
      extensionRoot: "/ext",
      platform: "win32",
      arch: "arm64",
      existsSync: function() { return true; }
    });
  }, function(err) {
    return err.code === "E-BIN-01" && err.message.indexOf("Windows ARM") !== -1;
  });

  assert.throws(function() {
    binaries.resolveBinaries({
      extensionRoot: "/ext",
      platform: "linux",
      arch: "x64",
      existsSync: function() { return true; }
    });
  }, function(err) {
    return err.code === "E-BIN-01" && err.message.indexOf("linux/x64") !== -1;
  });

  var userDir = binaries.userBinDir({
    platform: "darwin",
    arch: "arm64",
    homedir: "/Users/jose"
  });
  assert.equal(userDir, path.join("/Users/jose", "Library", "Application Support", "xImporter", "bin", "mac-arm64"));
  var winUser = binaries.userBinDir({
    platform: "win32",
    arch: "x64",
    localAppData: "C:\\Users\\jose\\AppData\\Local"
  });
  assert.equal(winUser, path.join("C:\\Users\\jose\\AppData\\Local", "xImporter", "bin", "win-x64"));

  var preferred = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "arm64",
    homedir: "/Users/jose",
    existsSync: function() { return true; }
  });
  assert.equal(preferred.source, "user");
  assert.equal(preferred.ytDlp, path.join(userDir, "yt-dlp"));

  var incomplete = binaries.resolveBinaries({
    extensionRoot: "/ext",
    platform: "darwin",
    arch: "arm64",
    homedir: "/Users/jose",
    existsSync: function(file) {
      if (file.indexOf(userDir) === 0 && file.indexOf("deno") !== -1) return false;
      return true;
    }
  });
  assert.equal(incomplete.source, "packaged");
  assert.equal(incomplete.deno, path.join("/ext", "bin", "mac-arm64", "deno"));

  assert.throws(function() {
    binaries.resolveBinaries({
      extensionRoot: "/ext",
      platform: "darwin",
      arch: "x64",
      homedir: "/Users/jose",
      existsSync: function() { return false; }
    });
  }, function(err) {
    return err.code === "E-BIN-01" && err.message.indexOf("fetch-binaries.sh mac-x64") !== -1;
  });
});

test("darwin x64 spawns bin/mac-x64", async function() {
  var spawn = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) {
      return { code: 0, stdout: "/tmp/out/clip.mp4\n" };
    }
    return { code: 1, stderr: "Video: h264\nAudio: aac\n" };
  });
  var engine = engineMod.createEngine({
    spawn: spawn,
    platform: "darwin",
    arch: "x64",
    extensionRoot: "/ext",
    homedir: "/Users/jose",
    outputDir: "/tmp/out",
    existsSync: packagedExists,
    mkdirSync: function() {}
  });
  var result = await engine.download("https://example.com/v");
  assert.equal(result.filepath, "/tmp/out/clip.mp4");
  assert.equal(spawn.calls[0].cmd, path.join("/ext", "bin", "mac-x64", "yt-dlp"));
  assert.equal(spawn.calls[1].cmd, path.join("/ext", "bin", "mac-x64", "ffmpeg"));
  assert.equal(spawn.calls[0].opts.shell, false);
});

test("Rosetta warns and still uses the Intel binaries", async function() {
  var warnings = [];
  var spawn = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) return { code: 0, stdout: "/tmp/out/clip.mp4\n" };
    return { code: 1, stderr: "Video: h264\nAudio: aac\n" };
  });
  var engine = engineMod.createEngine({
    spawn: spawn,
    platform: "darwin",
    arch: "x64",
    translated: true,
    extensionRoot: "/ext",
    homedir: "/Users/jose",
    outputDir: "/tmp/out",
    existsSync: packagedExists,
    mkdirSync: function() {}
  });
  await engine.download("https://example.com/v", {
    onWarning: function(message) { warnings.push(message); }
  });
  assert.deepEqual(warnings, [binaries.rosettaWarning()]);
  assert.equal(spawn.calls[0].cmd, path.join("/ext", "bin", "mac-x64", "yt-dlp"));
});

test("codec policy skips h264/aac and recodes the other cases", function() {
  assert.equal(codecs.isPremiereFriendly(codecs.inspectCodecs(
    "Stream #0:0: Video: h264 (High)\nStream #0:1: Audio: aac (LC)\n"
  )), true);
  var vp9 = codecs.inspectCodecs("Video: vp9\nAudio: opus\n");
  assert.equal(codecs.isPremiereFriendly(vp9), false);
  var recode = codecs.buildTranscodeArgs("/in.mp4", "/out.h264.mp4", vp9);
  assert.ok(recode.indexOf("libx264") !== -1);
  assert.ok(recode.indexOf("scale=-2:'min(1080,ih)'") !== -1);
  assert.equal(recode[recode.length - 1], "/out.h264.mp4");
  assert.equal(recode[recode.indexOf("-c:a") + 1], "aac");

  var audioOnly = codecs.inspectCodecs("Video: h264\nAudio: opus\n");
  var copy = codecs.buildTranscodeArgs("/in.mp4", "/out.h264.mp4", audioOnly);
  assert.equal(copy[copy.indexOf("-c:v") + 1], "copy");
  assert.equal(copy.indexOf("libx264"), -1);
  assert.equal(copy[copy.indexOf("-b:a") + 1], "320k");

  var fourK = codecs.buildTranscodeArgs("/in.mp4", "/out.h264.mp4", vp9, 2160);
  assert.ok(fourK.indexOf("scale=-2:'min(2160,ih)'") !== -1);
  var keepSize = codecs.buildTranscodeArgs("/in.mp4", "/out.h264.mp4", vp9, null);
  assert.equal(keepSize.indexOf("-vf"), -1);
});

test("import script escapes spaces, quotes, backslashes, and unicode", function() {
  var titled = jsx.importScript("/Users/José Quiroz/Movies/xImporter/Año niño.mp4");
  assert.equal(
    titled,
    'importDownloadedFile("/Users/José Quiroz/Movies/xImporter/Año niño.mp4")'
  );
  assert.equal(jsx.toJsxString("a\nb"), '"a\\nb"');
  var quoted = jsx.importScript('C:\\Movies\\say "hi".mp4');
  assert.equal(quoted.indexOf("importDownloadedFile("), 0);
  assert.ok(quoted.indexOf('say \\"hi\\"') !== -1);
  assert.ok(quoted.indexOf("C:\\\\Movies\\\\") !== -1);
});

test("rejects a URL that is not http(s) before spawning", async function() {
  var spawn = fakeSpawn(function() { return { code: 0 }; });
  var engine = testEngine(spawn);
  await assert.rejects(function() { return engine.download("file:///tmp/a.mp4"); }, function(err) {
    return err.code === "E-URL-01";
  });
  await assert.rejects(function() { return engine.download("   "); });
  assert.equal(spawn.calls.length, 0);
  assert.equal(engineMod.validateUrl("http://example.com/a"), "http://example.com/a");
});

test("download parses progress and imports the printed mp4 when codecs already match", async function() {
  var seen = [];
  var made = [];
  var spawn = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) {
      return {
        code: 0,
        stdout: [
          "download:XIP|downloading|250|1000|NA|250000|4",
          "postprocess:XIP|finished|NA|NA|NA|NA|NA",
          "/Users/jose/Movies/xImporter/Clip [abc].mp4"
        ].join("\n") + "\n"
      };
    }
    return {
      code: 1,
      stderr: "Input #0\nStream #0:0: Video: h264 (High)\nStream #0:1: Audio: aac (LC)\n"
    };
  });
  var engine = engineMod.createEngine({
    spawn: spawn,
    platform: "darwin",
    arch: "arm64",
    extensionRoot: "/ext",
    homedir: "/Users/jose",
    existsSync: packagedExists,
    mkdirSync: function(dir) { made.push(dir); }
  });
  var result = await engine.download("https://example.com/watch?v=abc", {
    onProgress: function(parsed) { seen.push(parsed); }
  });
  assert.equal(result.transcoded, false);
  assert.equal(result.filepath, "/Users/jose/Movies/xImporter/Clip [abc].mp4");
  assert.deepEqual(made, [
    path.join("/Users/jose", "Movies", "xImporter"),
    path.join("/Users/jose", "Movies", "xImporter", engineMod.WORK_DIR_NAME)
  ]);
  assert.equal(spawn.calls[0].args[spawn.calls[0].args.indexOf("-P") + 1], path.join("/Users/jose", "Movies", "xImporter", engineMod.WORK_DIR_NAME));
  assert.equal(spawn.calls.length, 2);
  assert.equal(spawn.calls[0].opts.shell, false);
  assert.deepEqual(spawn.calls[0].opts.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(spawn.calls[0].args[spawn.calls[0].args.length - 1], "https://example.com/watch?v=abc");
  assert.equal(spawn.calls[0].cmd, path.join("/ext", "bin", "mac-arm64", "yt-dlp"));
  assert.equal(spawn.calls[1].args[0], "-hide_banner");
  assert.ok(seen.some(function(item) { return item.percent === 25; }));
  assert.equal(engine.outputDirectory(), path.join("/Users/jose", "Movies", "xImporter"));
});

test("transcodes vp9 and copies h264 when only the audio must change", async function() {
  var vp9 = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) {
      return { code: 0, stdout: "/tmp/out/source.webm\n" };
    }
    if (args.indexOf("-c:v") !== -1) return { code: 0 };
    return { code: 1, stderr: "Video: vp9\nAudio: opus\n" };
  });
  var engine = testEngine(vp9);
  var result = await engine.download("https://example.com/v");
  assert.equal(result.transcoded, true);
  assert.equal(result.filepath, path.join("/tmp", "out", "source.h264.mp4"));
  assert.equal(vp9.calls.length, 3);
  assert.equal(vp9.calls[2].opts.shell, false);
  assert.ok(vp9.calls[2].args.indexOf("libx264") !== -1);

  var opus = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) {
      return { code: 0, stdout: "/tmp/out/source.mp4\n" };
    }
    if (args.indexOf("-c:v") !== -1) return { code: 0 };
    return { code: 1, stderr: "Video: h264\nAudio: opus\n" };
  });
  var copied = await testEngine(opus).download("https://example.com/v");
  assert.equal(copied.transcoded, true);
  assert.equal(opus.calls[2].args[opus.calls[2].args.indexOf("-c:v") + 1], "copy");
});

test("yt-dlp failure and a missing filepath do not look like success", async function() {
  var failed = fakeSpawn(function() {
    return { code: 1, stderr: "ERROR: unsupported url\n" };
  });
  await assert.rejects(function() {
    return testEngine(failed).download("https://example.com/v");
  }, function(err) {
    return err.code === "E-DL-01" && err.message.indexOf("unsupported url") !== -1;
  });

  var noPath = fakeSpawn(function() {
    return { code: 0, stdout: "download:XIP|finished|1|1|NA|NA|NA\n" };
  });
  await assert.rejects(function() {
    return testEngine(noPath).download("https://example.com/v");
  }, function(err) { return err.code === "E-DL-04"; });
  assert.equal(noPath.calls.length, 1);
});

function listenerMap() {
  var map = {};
  return {
    add: function(ev, fn) {
      if (!map[ev]) map[ev] = [];
      map[ev].push(fn);
    },
    emit: function(ev, arg) {
      var list = map[ev] ? map[ev].slice() : [];
      for (var i = 0; i < list.length; i++) list[i](arg);
    }
  };
}

function hangingSpawn() {
  var calls = [];
  function spawn(cmd, args, opts) {
    var stdout = listenerMap();
    var stderr = listenerMap();
    var proc = listenerMap();
    var record = { cmd: cmd, args: args, opts: opts };
    var child = {
      pid: 4242,
      stdout: { on: stdout.add },
      stderr: { on: stderr.add },
      on: proc.add,
      kill: function(sig) {
        record.killed = sig || "default";
        proc.emit("close", null);
      }
    };
    record.close = function(code) { proc.emit("close", code); };
    calls.push(record);
    if (cmd === "taskkill") {
      setImmediate(function() { proc.emit("close", 0); });
    }
    return child;
  }
  spawn.calls = calls;
  return spawn;
}

function engineForCancel(spawn, extra) {
  var removed = [];
  var options = {
    spawn: spawn,
    platform: "darwin",
    arch: "arm64",
    extensionRoot: "/ext",
    homedir: "/Users/jose",
    outputDir: "/tmp/out",
    existsSync: packagedExists,
    mkdirSync: function() {},
    rmSync: function(dir) { removed.push(dir); },
    killGraceMs: 20
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) { options[key] = extra[key]; });
  }
  var engine = engineMod.createEngine(options);
  engine.removed = removed;
  return engine;
}

test("audio modes do not recode video, and resolution changes the format and scale", async function() {
  var wavSpawn = fakeSpawn(function() {
    return { code: 0, stdout: "/tmp/out/voice.wav\n" };
  });
  var wavEngine = testEngine(wavSpawn);
  var wav = await wavEngine.download("https://example.com/a", { mode: "wav", resolution: "2160" });
  assert.equal(wav.filepath, "/tmp/out/voice.wav");
  assert.equal(wav.transcoded, false);
  assert.equal(wav.mode, "wav");
  assert.equal(wavSpawn.calls.length, 1);
  assert.equal(wavSpawn.calls[0].args[wavSpawn.calls[0].args.indexOf("--audio-format") + 1], "wav");
  assert.equal(wavSpawn.calls[0].opts.shell, false);
  assert.equal(wavSpawn.calls[0].opts.detached, true);

  var mp3Spawn = fakeSpawn(function() {
    return { code: 0, stdout: "/tmp/out/voice.mp3\n" };
  });
  var mp3 = await testEngine(mp3Spawn).download("https://example.com/a", { mode: "mp3" });
  assert.equal(mp3.filepath, "/tmp/out/voice.mp3");
  assert.equal(mp3Spawn.calls.length, 1);
  assert.equal(mp3Spawn.calls[0].args[mp3Spawn.calls[0].args.indexOf("--audio-quality") + 1], "0");

  var scaled = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) return { code: 0, stdout: "/tmp/out/source.webm\n" };
    if (args.indexOf("-c:v") !== -1) return { code: 0 };
    return { code: 1, stderr: "Video: vp9\nAudio: opus\n" };
  });
  var scaledResult = await testEngine(scaled).download("https://example.com/v", { resolution: "720" });
  assert.equal(scaledResult.transcoded, true);
  assert.equal(scaled.calls[0].args[scaled.calls[0].args.indexOf("-f") + 1], argsMod.videoFormat(720));
  assert.ok(scaled.calls[2].args.indexOf("scale=-2:'min(720,ih)'") !== -1);

  var autoSpawn = fakeSpawn(function(cmd, args) {
    if (args.indexOf("--newline") !== -1) return { code: 0, stdout: "/tmp/out/source.webm\n" };
    if (args.indexOf("-c:v") !== -1) return { code: 0 };
    return { code: 1, stderr: "Video: vp9\nAudio: opus\n" };
  });
  await testEngine(autoSpawn).download("https://example.com/v", { resolution: "auto" });
  assert.equal(autoSpawn.calls[0].args[autoSpawn.calls[0].args.indexOf("-f") + 1].indexOf("height<="), -1);
  assert.equal(autoSpawn.calls[2].args.indexOf("-vf"), -1);
});

test("cancel sends SIGTERM to the process group, then SIGKILL, and deletes only the work folder", async function() {
  var killed = [];
  var spawn = hangingSpawn();
  var engine = engineForCancel(spawn, {
    killGroup: function(pid, signal) {
      killed.push([pid, signal]);
      if (signal === "SIGKILL") spawn.calls[0].close(null);
    }
  });
  var pending = engine.download("https://example.com/v");
  var done = assert.rejects(function() { return pending; }, function(err) {
    return err.code === "E-DL-CANCEL" && err.message === "Cancelado.";
  });
  var cancelled = await engine.cancel();
  assert.equal(cancelled, true);
  await done;
  assert.deepEqual(killed, [[-4242, "SIGTERM"], [-4242, "SIGKILL"]]);
  assert.equal(spawn.calls[0].opts.detached, true);
  assert.equal(spawn.calls[0].opts.shell, false);
  assert.deepEqual(engine.removed, [path.join("/tmp/out", engineMod.WORK_DIR_NAME)]);
  assert.equal(await engine.cancel(), false);
});

test("a second download is rejected, and SIGTERM alone is enough when the child exits", async function() {
  var killed = [];
  var spawn = hangingSpawn();
  var engine = engineForCancel(spawn, {
    killGroup: function(pid, signal) {
      killed.push([pid, signal]);
      spawn.calls[0].close(null);
    }
  });
  var first = engine.download("https://example.com/v");
  await assert.rejects(function() { return engine.download("https://example.com/v"); }, function(err) {
    return err.code === "E-DL-BUSY";
  });
  assert.equal(spawn.calls.length, 1);
  var done = assert.rejects(function() { return first; }, function(err) {
    return err.code === "E-DL-CANCEL";
  });
  await engine.cancel();
  await done;
  assert.deepEqual(killed, [[-4242, "SIGTERM"]]);
});

test("Windows cancel runs taskkill /T /F on the process tree", async function() {
  var spawn = hangingSpawn();
  var engine = engineForCancel(spawn, { platform: "win32", arch: "x64" });
  var pending = engine.download("https://example.com/v");
  var done = assert.rejects(function() { return pending; }, function(err) {
    return err.code === "E-DL-CANCEL";
  });
  await engine.cancel();
  await done;
  assert.equal(spawn.calls[0].opts.detached, undefined);
  assert.equal(spawn.calls[1].cmd, "taskkill");
  assert.deepEqual(spawn.calls[1].args, ["/T", "/F", "/PID", "4242"]);
  assert.equal(spawn.calls[1].opts.shell, false);
  assert.deepEqual(engine.removed, [path.join("/tmp/out", engineMod.WORK_DIR_NAME)]);
});

test("manifest, debug flag, and gitignore match the spike contract", function() {
  var manifest = fs.readFileSync(path.join(root, "panel", "CSXS", "manifest.xml"), "utf8");
  assert.ok(manifest.indexOf('Version="11.0"') !== -1);
  assert.ok(manifest.indexOf('Name="PPRO" Version="[22.0,99.9]"') !== -1);
  assert.ok(manifest.indexOf('Name="CSXS" Version="11.0"') !== -1);
  assert.ok(manifest.indexOf("--enable-nodejs") !== -1);
  assert.ok(manifest.indexOf("--mixed-context") !== -1);
  assert.ok(manifest.indexOf("./client/index.html") !== -1);
  assert.ok(manifest.indexOf("./host/import.jsx") !== -1);
  assert.ok(manifest.indexOf(">xImporter<") !== -1);

  var debug = fs.readFileSync(path.join(root, "panel", ".debug"), "utf8");
  assert.ok(debug.indexOf("com.ximporter.panel") !== -1);
  assert.ok(debug.indexOf('Name="PPRO"') !== -1);

  var setup = fs.readFileSync(path.join(root, "scripts", "setup-dev.sh"), "utf8");
  assert.ok(setup.indexOf("defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1") !== -1);
  assert.ok(setup.indexOf("defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1") !== -1);

  var fetchScript = fs.readFileSync(path.join(root, "scripts", "fetch-binaries.sh"), "utf8");
  assert.ok(fetchScript.indexOf("0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202") !== -1);
  assert.ok(fetchScript.indexOf("95daaff11c116a52ad54785e7914c8e9c9cdcaba793c5ed929c74ca2d8e6259a") !== -1);
  assert.ok(fetchScript.indexOf("7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4") !== -1);
  assert.ok(fetchScript.indexOf("66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a") !== -1);
  assert.ok(fetchScript.indexOf("a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238") !== -1);
  assert.ok(fetchScript.indexOf("60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba") !== -1);
  assert.ok(fetchScript.indexOf("win-x64") !== -1);
  assert.ok(fetchScript.indexOf("xattr -dr com.apple.quarantine") !== -1);
  assert.ok(fetchScript.indexOf("codesign -s - --force") !== -1);

  var installer = fs.readFileSync(path.join(root, "install-mac.sh"), "utf8");
  assert.ok(installer.indexOf("defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1") !== -1);
  assert.ok(installer.indexOf("defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1") !== -1);
  assert.ok(installer.indexOf('xattr -dr com.apple.quarantine "$dest"') !== -1);
  assert.ok(installer.indexOf("codesign -s - --force") !== -1);
  assert.ok(installer.indexOf("codesign -v") !== -1);
  assert.ok(installer.indexOf("Library/Application Support/Adobe/CEP/extensions/xImporter") !== -1);
  assert.ok(installer.indexOf("Movies/xImporter") !== -1);

  var instalar = fs.readFileSync(path.join(root, "packaging", "INSTALAR.txt"), "utf8");
  assert.ok(instalar.indexOf("Descomprime") !== -1);
  assert.ok(instalar.indexOf("@@BIN_ARCH@@") !== -1);
  assert.ok(instalar.indexOf("x86_64 arm64") !== -1);

  ["mac-arm64", "mac-x64", "win-x64"].forEach(function(folder) {
    var ignored = cp.spawnSync("git", ["check-ignore", "-q", "panel/bin/" + folder + "/yt-dlp"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(ignored.status, 0, folder + " binaries should be gitignored");
    var keep = cp.spawnSync("git", ["check-ignore", "-q", "panel/bin/" + folder + "/.gitkeep"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(keep.status, 0, folder + " .gitkeep should stay in git");
  });
});

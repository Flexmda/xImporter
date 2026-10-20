"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var http = require("http");
var crypto = require("crypto");
var assert = require("node:assert/strict");
var test = require("node:test");

var updater = require("./update.js");

var BODY = Buffer.from("ximporter-yt-dlp");
var HASH = crypto.createHash("sha256").update(BODY).digest("hex");

function sumsText(name, hash) {
  return [
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  yt-dlp",
    hash + " *" + name,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other.bin"
  ].join("\n") + "\n";
}

test("SHA2-256SUMS parser finds the official asset names", function() {
  assert.equal(updater.parseSha256Sums(sumsText("yt-dlp_macos", HASH), "yt-dlp_macos"), HASH);
  assert.equal(updater.parseSha256Sums(sumsText("yt-dlp.exe", HASH), "yt-dlp.exe"), HASH);
  assert.equal(updater.parseSha256Sums(sumsText("yt-dlp_macos", HASH), "missing"), null);
  assert.equal(updater.parseSha256Sums("", "yt-dlp_macos"), null);
  assert.equal(updater.assetName("darwin"), "yt-dlp_macos");
  assert.equal(updater.assetName("win32"), "yt-dlp.exe");
  assert.equal(updater.assetName("linux"), null);
});

test("update writes a checksum-verified yt-dlp into the user bin", async function() {
  var home = fs.mkdtempSync(path.join(os.tmpdir(), "xip-up-"));
  var calls = [];
  var result = await updater.updateYtDlp({
    platform: "darwin",
    arch: "arm64",
    homedir: home,
    fetchBuffer: function(url) {
      calls.push(url);
      if (url.indexOf("SHA2-256SUMS") !== -1) return Promise.resolve(Buffer.from(sumsText("yt-dlp_macos", HASH)));
      if (url.indexOf("yt-dlp_macos") !== -1) return Promise.resolve(BODY);
      return Promise.reject(new Error("unexpected " + url));
    },
    spawnSync: function(cmd, args) {
      calls.push(cmd + " " + args.join(" "));
      return { status: 0 };
    }
  });
  var installed = path.join(home, "Library", "Application Support", "xImporter", "bin", "mac-arm64", "yt-dlp");
  assert.equal(result.path, installed);
  assert.equal(result.sha256, HASH);
  assert.equal(fs.readFileSync(installed).equals(BODY), true);
  assert.equal(fs.existsSync(installed + ".download"), false);
  assert.equal((fs.statSync(installed).mode & 0o111) !== 0, true);
  assert.ok(calls.some(function(item) { return item.indexOf("codesign -s - --force") === 0; }));
  assert.equal(updater.DEFAULT_SUMS_URL.indexOf("SHA2-256SUMS"), updater.DEFAULT_SUMS_URL.length - "SHA2-256SUMS".length);
});

test("a checksum mismatch does not install yt-dlp", async function() {
  var home = fs.mkdtempSync(path.join(os.tmpdir(), "xip-bad-"));
  var bad = "0000000000000000000000000000000000000000000000000000000000000000";
  await assert.rejects(function() {
    return updater.updateYtDlp({
      platform: "win32",
      arch: "x64",
      localAppData: path.join(home, "Local"),
      fetchBuffer: function(url) {
        if (url.indexOf("SHA2-256SUMS") !== -1) return Promise.resolve(Buffer.from(sumsText("yt-dlp.exe", bad)));
        return Promise.resolve(BODY);
      }
    });
  }, function(err) {
    return err.code === "E-UP-01" && err.message.indexOf("no coincide") !== -1;
  });
  var installed = path.join(home, "Local", "xImporter", "bin", "win-x64", "yt-dlp.exe");
  assert.equal(fs.existsSync(installed), false);
});

test("the downloader follows redirects before checking the sum", async function() {
  var body = BODY;
  var server = http.createServer(function(req, res) {
    if (req.url === "/SHA2-256SUMS") {
      res.writeHead(302, { Location: "/sums" });
      res.end();
      return;
    }
    if (req.url === "/sums") {
      res.end(HASH + "  yt-dlp_macos\n");
      return;
    }
    if (req.url === "/yt-dlp_macos") {
      res.writeHead(302, { Location: "/file" });
      res.end();
      return;
    }
    res.end(body);
  });
  await new Promise(function(resolve) { server.listen(0, "127.0.0.1", resolve); });
  var port = server.address().port;
  var base = "http://127.0.0.1:" + port;
  var home = fs.mkdtempSync(path.join(os.tmpdir(), "xip-http-"));
  try {
    var result = await updater.updateYtDlp({
      platform: "darwin",
      arch: "x64",
      homedir: home,
      sumsUrl: base + "/SHA2-256SUMS",
      assetBase: base,
      spawnSync: function() { return { status: 0 }; }
    });
    assert.equal(result.sha256, HASH);
    assert.equal(result.path.indexOf(path.join("bin", "mac-x64", "yt-dlp")) !== -1, true);
  } finally {
    await new Promise(function(resolve) { server.close(resolve); });
  }
});

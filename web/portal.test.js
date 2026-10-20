import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chooseDownload, describeDownload, installerChoices } from "./src/os.js";

var here = path.dirname(fileURLToPath(import.meta.url));
var root = path.join(here, "..");

test("OS detection matches the browser matrix", function() {
  assert.equal(chooseDownload({
    clientHints: true,
    platform: "macOS",
    architecture: "arm",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
  }), "mac-arm64");
  assert.equal(chooseDownload({
    clientHints: true,
    platform: "macOS",
    architecture: "x86",
    bitness: "64"
  }), "mac-x64");
  assert.equal(chooseDownload({
    clientHints: false,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15"
  }), "mac-both");
  assert.equal(chooseDownload({
    clientHints: false,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0"
  }), "mac-both");
  assert.equal(chooseDownload({
    clientHints: true,
    platform: "Windows",
    architecture: "x86",
    bitness: "64"
  }), "win-x64");
  assert.equal(chooseDownload({
    clientHints: true,
    platform: "Windows",
    architecture: "arm",
    bitness: "64"
  }), "win-arm");
  assert.equal(chooseDownload({
    mobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
  }), "mobile");
  assert.equal(chooseDownload({
    clientHints: false,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)"
  }), "all");
  assert.ok(describeDownload("mac-both", "9.9.9").indexOf("Acerca de este Mac") !== -1);
  assert.ok(describeDownload("win-arm", "9.9.9").indexOf("Windows ARM") !== -1);
  assert.equal(installerChoices("mac-arm64", "9.9.9")[0].href, "/downloads/xImporter-9.9.9-mac-arm64.pkg");
  assert.equal(installerChoices("mac-x64", "9.9.9")[0].href, "/downloads/xImporter-9.9.9-mac-x64.pkg");
  assert.equal(installerChoices("win-x64", "9.9.9")[0].href, "/downloads/xImporter-9.9.9-win-x64.exe");
  assert.equal(installerChoices("mac-both", "9.9.9").length, 2);
  assert.equal(installerChoices("all", "9.9.9").length, 3);
  assert.equal(installerChoices("win-arm", "9.9.9").length, 0);
  assert.equal(installerChoices("mobile", "9.9.9").length, 0);
});

test("install guide leads with the double-click installers", function() {
  var guide = fs.readFileSync(path.join(here, "src/pages/instalar.astro"), "utf8");
  var pkgAt = guide.indexOf("mac-arm64.pkg");
  var zipAt = guide.indexOf("Alternativa: zip");
  assert.ok(pkgAt !== -1);
  assert.ok(guide.indexOf("win-x64.exe") !== -1);
  assert.ok(guide.indexOf("Abrir de todas formas") !== -1);
  assert.ok(guide.indexOf("Ejecutar de todas formas") !== -1);
  assert.ok(zipAt !== -1 && pkgAt < zipAt);
});

test("firebase.json is Hosting-only and names no project", function() {
  var config = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  assert.equal(config.hosting.public, "web/dist");
  assert.equal(config.hosting.cleanUrls, true);
  assert.equal(config.hosting.rewrites, undefined);
  assert.equal(config.functions, undefined);
  assert.equal(config.firestore, undefined);
  assert.equal(fs.existsSync(path.join(root, ".firebaserc")), false);
  var readme = fs.readFileSync(path.join(here, "README.md"), "utf8");
  assert.ok(readme.indexOf("ximporter-dev") !== -1);
  assert.ok(readme.indexOf("ximporter-prod") !== -1);
  assert.ok(readme.indexOf("flex-osx") !== -1);
  assert.ok(readme.indexOf("No se creó ningún proyecto") !== -1);
});

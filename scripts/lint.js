"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var root = path.join(__dirname, "..");
var files = [];

function walk(dir) {
  fs.readdirSync(dir).forEach(function(name) {
    if (name === "node_modules" || name === "bin") return;
    var full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.slice(-3) === ".js") files.push(full);
  });
}

walk(path.join(root, "panel"));
walk(path.join(root, "scripts"));

var failed = false;

files.forEach(function(file) {
  var result = cp.spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  var rel = path.relative(root, file);
  if (result.status !== 0) {
    failed = true;
    process.stderr.write((result.stderr || result.stdout || rel + " failed") + "\n");
  } else {
    process.stdout.write("ok " + rel + "\n");
  }
});

["scripts/fetch-binaries.sh", "scripts/setup-dev.sh", "scripts/package.sh", "scripts/sign-zxp.sh", "install-mac.sh"].forEach(function(rel) {
  var result = cp.spawnSync("bash", ["-n", path.join(root, rel)], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write((result.stderr || rel + " failed") + "\n");
  } else {
    process.stdout.write("ok " + rel + "\n");
  }
});

process.exit(failed ? 1 : 0);

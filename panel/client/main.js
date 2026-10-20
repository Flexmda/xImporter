/*
 * CEP mixed-context entry. Node's require() from an HTML script needs an absolute path
 * (CEP cookbook: Node 7.7+ does not resolve a relative require from the page).
 */
(function() {
  var statusEl = document.getElementById("status");

  function show(text) {
    if (statusEl) statusEl.textContent = text;
  }

  if (typeof require !== "function") {
    show("Node.js is unavailable. The manifest must enable nodejs and mixed-context.");
    return;
  }

  var path = require("path");
  var engineMod = require(path.join(__dirname, "..", "node", "engine.js"));
  var jsx = require(path.join(__dirname, "..", "node", "jsx.js"));
  var progress = require(path.join(__dirname, "..", "node", "progress.js"));
  var engine = engineMod.createEngine();

  var input = document.getElementById("url");
  var button = document.getElementById("download");
  var logEl = document.getElementById("log");
  var cs = new CSInterface();

  var importMessages = {
    "OK": "Imported into the Project Bin.",
    "E-HOST-01": "Open a Premiere project, then try again.",
    "E-HOST-02": "Premiere could not import the file.",
    "EvalScript error.": "Premiere could not run the import script."
  };

  function appendLog(line) {
    var text = logEl.textContent + line + "\n";
    var lines = text.split("\n");
    if (lines.length > 40) text = lines.slice(lines.length - 40).join("\n");
    logEl.textContent = text;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function finish(message) {
    button.disabled = false;
    show(message);
  }

  function startDownload() {
    button.disabled = true;
    logEl.textContent = "";
    show("Starting");
    engine.download(input.value, {
      onProgress: function(parsed) {
        show(progress.formatProgress(parsed));
      },
      onLine: function(line, isErr) {
        if (!line || line.indexOf("XIP|") !== -1) return;
        appendLog((isErr ? "[err] " : "") + line);
      }
    }).then(function(result) {
      show("Importing");
      appendLog(result.filepath);
      var script = jsx.importScript(result.filepath);
      cs.evalScript(script, function(res) {
        var message = importMessages[res] || ("Import result: " + res);
        if (res === "E-HOST-02") message += " " + result.filepath;
        finish(message);
      });
    }).catch(function(err) {
      finish(err && err.message ? err.message : String(err));
    });
  }

  button.addEventListener("click", startDownload);
  input.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !button.disabled) startDownload();
  });
})();

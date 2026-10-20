/*
 * CEP mixed-context entry. Node's require() from an HTML script needs an absolute path
 * (CEP cookbook: Node 7.7+ does not resolve a relative require from the page).
 */
(function() {
  var statusEl = document.getElementById("status");
  var input = document.getElementById("url");
  var pasteButton = document.getElementById("paste");
  var modeEl = document.getElementById("mode");
  var resolutionRow = document.getElementById("resolution-row");
  var resolutionEl = document.getElementById("resolution");
  var warn4k = document.getElementById("warn-4k");
  var folderEl = document.getElementById("folder");
  var button = document.getElementById("download");
  var cancelButton = document.getElementById("cancel");
  var barFill = document.getElementById("bar-fill");
  var logEl = document.getElementById("log");

  var ALLOWED_HOSTS = ["youtube.com", "youtu.be", "tiktok.com", "facebook.com", "fb.watch"];

  function show(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setBar(percent) {
    if (!barFill) return;
    if (typeof percent !== "number") {
      barFill.style.width = "0";
      return;
    }
    var clamped = percent;
    if (clamped < 0) clamped = 0;
    if (clamped > 100) clamped = 100;
    barFill.style.width = clamped.toFixed(0) + "%";
  }

  if (typeof require !== "function") {
    show("Node.js no está disponible. El manifiesto debe activar nodejs y mixed-context.");
    if (button) button.disabled = true;
    if (pasteButton) pasteButton.disabled = true;
    return;
  }

  var path = require("path");
  var engineMod = require(path.join(__dirname, "..", "node", "engine.js"));
  var jsx = require(path.join(__dirname, "..", "node", "jsx.js"));
  var progress = require(path.join(__dirname, "..", "node", "progress.js"));
  var engine = engineMod.createEngine();
  var cs = new CSInterface();

  if (folderEl) folderEl.textContent = engine.outputDirectory();

  var importMessages = {
    "OK": "Importado en xImporter.",
    "E-HOST-01": "Abre un proyecto de Premiere antes de importar.",
    "E-HOST-02": "Premiere no pudo importar el archivo.",
    "EvalScript error.": "Premiere no pudo ejecutar el script de importación."
  };

  function hostAllowed(hostname) {
    var host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
      var name = ALLOWED_HOSTS[i];
      if (host === name) return true;
      if (host.length > name.length + 1 && host.slice(-(name.length + 1)) === "." + name) return true;
    }
    return false;
  }

  function appendLog(line) {
    var text = logEl.textContent + line + "\n";
    var lines = text.split("\n");
    if (lines.length > 40) text = lines.slice(lines.length - 40).join("\n");
    logEl.textContent = text;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setBusy(busy) {
    button.disabled = busy;
    pasteButton.disabled = busy;
    modeEl.disabled = busy;
    resolutionEl.disabled = busy;
    cancelButton.disabled = !busy;
  }

  function syncMode() {
    var audio = modeEl.value !== "video";
    resolutionRow.hidden = audio;
    warn4k.hidden = audio || resolutionEl.value !== "2160";
  }

  function finish(message) {
    setBusy(false);
    syncMode();
    show(message);
  }

  var lastPaint = 0;

  function showProgress(parsed) {
    var now = Date.now();
    var finished = parsed && parsed.status === "finished";
    if (!finished && now - lastPaint < 250) return;
    lastPaint = now;
    show(progress.formatProgressEs(parsed, modeEl.value));
    setBar(parsed ? parsed.percent : null);
  }

  function startDownload() {
    var raw = String(input.value || "").trim();
    var parsedUrl;
    try {
      parsedUrl = new URL(raw);
    } catch (err) {
      show("La URL no es válida o el sitio no está soportado.");
      return;
    }
    if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") || !hostAllowed(parsedUrl.hostname)) {
      show("La URL no es válida o el sitio no está soportado.");
      return;
    }

    setBusy(true);
    logEl.textContent = "";
    setBar(0);
    lastPaint = 0;
    show("Validando");
    engine.download(raw, {
      mode: modeEl.value,
      resolution: resolutionEl.value,
      onProgress: showProgress,
      onWarning: function(message) {
        appendLog(message);
        show(message);
      },
      onLine: function(line, isErr) {
        if (!line || line.indexOf("XIP|") !== -1) return;
        appendLog((isErr ? "[err] " : "") + line);
      }
    }).then(function(result) {
      show("Importando");
      setBar(100);
      appendLog(result.filepath);
      var script = jsx.importScript(result.filepath);
      cs.evalScript(script, function(res) {
        var message = importMessages[res] || ("Resultado de la importación: " + res);
        if (res === "E-HOST-02") message += " " + result.filepath;
        finish(message);
      });
    }).catch(function(err) {
      var code = err && err.code;
      if (code === "E-DL-CANCEL") {
        setBar(0);
        finish("Cancelado.");
        return;
      }
      if (code === "E-URL-01") {
        finish("La URL no es válida o el sitio no está soportado.");
        return;
      }
      if (code === "E-DL-BUSY") {
        finish("Ya hay una descarga en curso.");
        return;
      }
      if (code === "E-DL-04") {
        finish("La descarga terminó sin indicar el archivo.");
        return;
      }
      if (code === "E-DL-01") {
        appendLog(err.message || "");
        finish("No se pudo descargar.");
        return;
      }
      finish(err && err.message ? err.message : String(err));
    });
  }

  button.addEventListener("click", startDownload);
  cancelButton.addEventListener("click", function() {
    show("Cancelando…");
    engine.cancel();
  });
  pasteButton.addEventListener("click", function() {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      show("Pega la URL con el teclado.");
      return;
    }
    navigator.clipboard.readText().then(function(text) {
      input.value = text || "";
      show("URL pegada.");
    }).catch(function() {
      show("No se pudo leer el portapapeles. Pega la URL con el teclado.");
    });
  });
  input.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !button.disabled) startDownload();
  });
  modeEl.addEventListener("change", syncMode);
  resolutionEl.addEventListener("change", syncMode);
  syncMode();
})();

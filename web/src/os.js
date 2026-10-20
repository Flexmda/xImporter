export function chooseDownload(input) {
  var mobile = Boolean(input && input.mobile);
  var platform = String((input && input.platform) || "").toLowerCase();
  var architecture = String((input && input.architecture) || "").toLowerCase();
  var bitness = String((input && input.bitness) || "");
  var ua = String((input && input.userAgent) || "");

  if (mobile) return "mobile";

  if (input && input.clientHints) {
    var isWin = platform.indexOf("win") !== -1;
    var isMac = platform.indexOf("mac") !== -1;
    if (isWin && architecture.indexOf("arm") === 0) return "win-arm";
    if (isWin && bitness && bitness !== "64") return "unsupported";
    if (isWin) return "win-x64";
    if (isMac && architecture.indexOf("arm") === 0) return "mac-arm64";
    if (isMac && (architecture === "x86" || architecture === "x86_64")) return "mac-x64";
    if (isMac) return "mac-both";
  }

  if (/Mac OS X|Macintosh/.test(ua)) return "mac-both";
  if (/Windows/.test(ua)) return "win-x64";
  return "all";
}

export function describeDownload(kind, version) {
  var v = version || "0.0.0";
  if (kind === "mac-arm64") {
    return "Tu Mac es Apple Silicon. Instalador: xImporter-" + v + "-mac-arm64.pkg";
  }
  if (kind === "mac-x64") {
    return "Tu Mac es Intel. Instalador: xImporter-" + v + "-mac-x64.pkg";
  }
  if (kind === "mac-both") {
    return "Este navegador no distingue Intel de Apple Silicon. Menú Apple > Acerca de este Mac: si dice Chip Apple M, usa xImporter-" + v + "-mac-arm64.pkg. Si dice Procesador Intel, usa xImporter-" + v + "-mac-x64.pkg.";
  }
  if (kind === "win-x64") {
    return "Windows de 64 bits. Instalador: xImporter-" + v + "-win-x64.exe";
  }
  if (kind === "win-arm") {
    return "Windows ARM no está soportado. Hace falta Windows 10 u 11 de 64 bits (x64).";
  }
  if (kind === "unsupported") {
    return "Esta arquitectura no está soportada. xImporter funciona en macOS Intel, macOS Apple Silicon y Windows x64.";
  }
  if (kind === "mobile") {
    return "Descarga xImporter desde tu computadora. El panel se instala en Premiere, no en el teléfono.";
  }
  return "Instaladores: xImporter-" + v + "-mac-arm64.pkg, xImporter-" + v + "-mac-x64.pkg y xImporter-" + v + "-win-x64.exe.";
}

export function installerChoices(kind, version) {
  var v = version || "0.0.0";
  if (kind === "mac-arm64") {
    return [{ href: "/downloads/xImporter-" + v + "-mac-arm64.pkg", label: "Descargar para Apple Silicon" }];
  }
  if (kind === "mac-x64") {
    return [{ href: "/downloads/xImporter-" + v + "-mac-x64.pkg", label: "Descargar para Mac Intel" }];
  }
  if (kind === "mac-both") {
    return [
      { href: "/downloads/xImporter-" + v + "-mac-arm64.pkg", label: "Descargar para Apple Silicon" },
      { href: "/downloads/xImporter-" + v + "-mac-x64.pkg", label: "Descargar para Mac Intel" }
    ];
  }
  if (kind === "win-x64") {
    return [{ href: "/downloads/xImporter-" + v + "-win-x64.exe", label: "Descargar para Windows" }];
  }
  if (kind === "all") {
    return [
      { href: "/downloads/xImporter-" + v + "-mac-arm64.pkg", label: "Descargar para Apple Silicon" },
      { href: "/downloads/xImporter-" + v + "-mac-x64.pkg", label: "Descargar para Mac Intel" },
      { href: "/downloads/xImporter-" + v + "-win-x64.exe", label: "Descargar para Windows" }
    ];
  }
  return [];
}

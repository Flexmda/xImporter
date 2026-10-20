"use strict";

// ExtendScript receives this as source text through evalScript.
// Escape like a JS string so spaces, quotes, backslashes, and newlines stay inside one argument.
function toJsxString(value) {
  return "\"" + String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n") + "\"";
}

function importScript(filePath) {
  return "importDownloadedFile(" + toJsxString(filePath) + ")";
}

module.exports = {
  toJsxString: toJsxString,
  importScript: importScript
};

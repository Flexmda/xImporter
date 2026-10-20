/*
 * Small CEP bridge for this spike.
 * Premiere exposes window.__adobe_cep__. This file only wraps evalScript,
 * which is the call the panel needs to reach ExtendScript.
 */

function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
  if (typeof callback !== "function") callback = function() {};
  var cep = window.__adobe_cep__;
  if (!cep || typeof cep.evalScript !== "function") {
    callback("EvalScript error.");
    return;
  }
  cep.evalScript(script, callback);
};

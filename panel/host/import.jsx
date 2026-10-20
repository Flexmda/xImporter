/*
 * ExtendScript loaded by CEP through CSXS ScriptPath.
 * The panel calls importDownloadedFile() via CSInterface.evalScript.
 * Keep this file in ES3. Do not use $.fileName here: it is wrong in the first JSX file CEP loads.
 */

function importDownloadedFile(filePath) {
    if (!app || !app.project) {
        return "E-HOST-01";
    }
    var target = app.project.rootItem;
    var ok = false;
    try {
        ok = app.project.importFiles([filePath], true, target, false);
    } catch (err) {
        return "E-HOST-02";
    }
    if (!ok) {
        return "E-HOST-02";
    }
    return "OK";
}

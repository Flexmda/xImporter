/*
 * ExtendScript loaded by CEP through CSXS ScriptPath.
 * The panel calls importDownloadedFile() via CSInterface.evalScript.
 * Keep this file in ES3. Do not read the running script's path: that value is wrong in the first JSX file CEP loads.
 *
 * Imports go into a root bin named exactly xImporter. The search runs before createBin,
 * so calling this again does not create a second bin.
 */

function isImporterBin(item) {
    if (!item || item.name !== "xImporter") {
        return false;
    }
    if (typeof ProjectItemType !== "undefined" && item.type === ProjectItemType.BIN) {
        return true;
    }
    return item.type === 2;
}

function findOrCreateImporterBin(root) {
    var children = root.children;
    var i;
    if (children && typeof children.numItems === "number") {
        for (i = 0; i < children.numItems; i++) {
            if (isImporterBin(children[i])) {
                return children[i];
            }
        }
    }
    return root.createBin("xImporter");
}

function importDownloadedFile(filePath) {
    if (!app || !app.project || !app.project.rootItem) {
        return "E-HOST-01";
    }
    var target;
    try {
        target = findOrCreateImporterBin(app.project.rootItem);
    } catch (err) {
        return "E-HOST-02";
    }
    if (!target) {
        return "E-HOST-02";
    }
    var ok = false;
    try {
        ok = app.project.importFiles([filePath], true, target, false);
    } catch (err2) {
        return "E-HOST-02";
    }
    if (!ok) {
        return "E-HOST-02";
    }
    return "OK";
}

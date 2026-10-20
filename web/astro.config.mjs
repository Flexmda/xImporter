import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

var webRoot = path.dirname(fileURLToPath(import.meta.url));
var version = JSON.parse(readFileSync(path.join(webRoot, "..", "package.json"), "utf8")).version;

export default defineConfig({
  output: "static",
  trailingSlash: "never",
  vite: {
    define: {
      "import.meta.env.XIMPORTER_VERSION": JSON.stringify(version)
    }
  }
});

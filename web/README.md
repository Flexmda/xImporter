# Portal de xImporter

Sitio estático en Astro para Firebase Hosting. Explica la instalación y detecta el sistema. El botón principal baja el `.pkg` (Mac) o el `.exe` (Windows). Si el navegador no identifica el sistema, muestra los tres. No cobra y no activa licencias.

Los instaladores no están en git. Antes de un build de Hosting, cópialos a `web/public/downloads/` con el nombre que usa la portada (`xImporter-<version>-mac-arm64.pkg`, `xImporter-<version>-mac-x64.pkg`, `xImporter-<version>-win-x64.exe`). Esos archivos quedan ignorados. El zip y el `.zxp` son la alternativa y tampoco se publican desde aquí.

## Proyecto de Firebase que hay que crear

No se creó ningún proyecto en esta tarea y no se hizo deploy.

Hace falta un proyecto **nuevo**, distinto de `flex-osx`:

| Uso | Id sugerido | Qué activar |
| --- | --- | --- |
| Esta guía, cuando se publique | `ximporter-dev` | Solo Hosting |
| Más adelante, si se separan entornos | `ximporter-prod` | Solo Hosting |

Hosting estático no necesita el plan Blaze ni Cloud Functions. No hay `rewrites` hacia una API. No hay `.firebaserc` en el repositorio: el id se elige en la máquina de Jose cuando el proyecto exista (`firebase use --add`).

`firebase.json` (en la raíz del repo) publica el directorio `web/dist`.

Cuando el proyecto exista, y solo entonces:

```sh
cd web
npm ci
npm run build
cd ..
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use --add
npx -y firebase-tools@latest deploy --only hosting
```

Esos comandos no se ejecutaron aquí.

## Desarrollo local

```sh
cd web
npm ci
npm run dev
```

`npm run build` escribe `web/dist/`. Esa carpeta no se sube a git. Sin archivos en `web/public/downloads/`, los enlaces de la portada existen pero no hay binario que servir.

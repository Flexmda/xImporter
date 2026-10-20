# Portal de xImporter

Sitio estático en Astro para Firebase Hosting. Explica la instalación y detecta el sistema. El botón principal abre el `.pkg` (Mac) o el `.exe` (Windows) de la release pública `v1.0.0-beta`:

`https://github.com/Flexmda/xImporter/releases/download/v1.0.0-beta/<archivo>`

El repositorio es público, así que esa URL baja el archivo sin iniciar sesión. Si el navegador no identifica el sistema, la portada muestra los tres. No cobra y no activa licencias. La marca BETA está en el encabezado: esta versión no se ha probado en un Premiere real.

Hosting no copia los instaladores. El build solo publica la guía.

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

Desde la raíz del repositorio, el build de Hosting es:

```sh
cd web
npm ci
npm run build
```

Eso escribe `web/dist/` (la carpeta `public` de `firebase.json`). No se sube a git. El deploy de Firebase no se hace desde aquí.

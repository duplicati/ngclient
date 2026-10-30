# DuplicatiClient

### Prerequisites

- Node.js 24 (used by the publishing and browser-test workflows) - https://nodejs.org/en/download
- Bun 1.4.4 (see `packageManager` in `package.json`) - https://bun.sh/docs/installation

### Dependencies

- ShipUI - https://shipui.com/ - ([Docs](https://docs.shipui.com/), [GitHub](https://github.com/shipuicom/core))
- Angular 22 - https://angular.dev
- Dayjs - https://day.js.org/en/
- Phosphor Icons - https://phosphoricons.com/

### Run the project

Use Bun for dependency installation and updates. `bun.lock` is the only dependency
lockfile; local development, Docker, tests, and publishing install from it with
`bun install --frozen-lockfile`. Do not generate a separate npm lockfile.
After changing dependencies with `bun add` or `bun remove`, commit both
`package.json` and `bun.lock`.

Install dependencies and start the Angular development server:

```sh
bun install --frozen-lockfile
bun run start
```

Open http://localhost:4200. The default development configuration proxies backend
requests using `projects/ngclient/src/proxy-localhost.conf.mjs`. Run a local
Duplicati backend when using this configuration.

### Unit tests

Run the unit suite once, as in CI:

```sh
bun run test:build
bun run test:ci
```

Use `bun run test` for watch mode.

### Preview a production build

Build the application, then serve the generated files locally:

```sh
bun install --frozen-lockfile
bun run build:prod
bun run preview
```

The `build`, `build:dev`, and `build:prod` scripts generate fonts before Angular
starts and stop if font generation fails. CI, Docker, and publishing use these
same scripts. `bun run build:dev` builds the development configuration.

Open http://127.0.0.1:3000. The preview serves `dist/ngclient/browser` and
supports direct navigation to application routes such as `/login`. Missing
static files return 404 instead of the application HTML.

The preview is for local inspection of build output, not production deployment.
It does not rebuild files, proxy API requests, or forward WebSocket connections
to Duplicati. `/api` and `/notifications` requests return 404. Use the Angular
development server with its existing proxy configuration when working with a
local Duplicati backend.

The server binds to loopback by default. The underlying CLI's `HOST` and `PORT`
environment variables override the configured host and port; leave `HOST` unset
to keep the preview local.

### Browser tests

Browser tests run against the production build, not `ng serve`. Build once using
the commands in "Preview a production build", then run:

```sh
bunx playwright install --only-shell chromium
bun run test:e2e
```

Playwright starts and stops `bun run preview` itself. Leave port 3000 available.
Tests use isolated browser contexts and controlled API responses; no Duplicati
server or account is required. These are frontend browser integration tests,
not end-to-end tests of the backend. Vitest tests remain separate.

The Production Build workflow passes the built files to a Chromium test job;
the browser job does not rebuild the application. On failure, its artifacts
include the HTML report, traces, and screenshots. Node.js runs the Playwright
CLI; Bun remains the package manager and script launcher.

### Testing the client on windows

- Open windows on parallels then run backend on port 8200
  - `cd [BACKEND_PATH]\Executables\Duplicati.Server`
  - `dotnet run -- --webservice-password=helloworld --webservice-interface=any` (insert your test password)
- `npm run start:windows`
- Debug on your mac in `localhost:4200`

### Locale definitions

Edit `scripts/locale-catalog.ts` when changing supported locale identifiers,
selector labels, aliases, or locale data. It is the build-time source for the
runtime tables, Angular locale imports, Day.js registrations, and the locale
sections of `angular.json`. Existing aliases and regional fallbacks are explicit
in the catalog; language selection and provider lookup remain unchanged.

After editing the catalog or updating translation files, run:

```sh
bun run gen:locales
bun run check:locales
bun run test:locales
```

Commit the catalog and generated files together. `check:locales` verifies that
JSON/XLF translations and imported Angular/Day.js locale modules exist and that
the generated files are current. CI runs this check before building. The catalog
is used only during generation, so the application loads static tables and does
not need to generate configuration at startup.
### npm publication

The publishing workflow installs from `bun.lock`, builds with `bun run build:prod`,
and generates the distribution's `package.json` with `bun run gen:package-json`.
Node.js 24 and npm remain responsible for `npm publish --access public --provenance`
using the existing OIDC permissions, registry, and main-branch publication condition.
The published metadata does not include development dependencies or Bun-specific fields.

The Production Build workflow validates the generated package with `npm pack --dry-run`
after uploading the browser artifact. This checks packaging without publishing a version.

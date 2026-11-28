# DuplicatiClient

### Prerequisites

- Node.js 26 LTS (used by CI and publishing) - https://nodejs.org/en/download
- Bun 1.4.4 (see `packageManager` in `package.json`) - https://bun.sh/docs/installation

### Dependencies

- ShipUI - https://shipui.com/ - ([Docs](https://docs.shipui.com/), [GitHub](https://github.com/shipuicom/core))
- Angular 22 - https://angular.dev
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

### Optional real-server browser tests

The `live` mode uses the same Playwright configuration but starts its own local
Duplicati server, with a fresh data folder, random password and loopback ports.
It does not accept an existing server URL. The production UI and all API/WebSocket
traffic are real; the default browser tests continue to use controlled responses.

After building the production UI and installing Chromium as above, run:

```sh
PLAYWRIGHT_MODE=live DUPLICATI_SERVER_PATH=/absolute/path/to/duplicati-server bun run test:e2e
```

In PowerShell, set `$env:PLAYWRIGHT_MODE = 'live'` and
`$env:DUPLICATI_SERVER_PATH = 'C:/path/to/Duplicati.Server.exe'`, then run
`bun run test:e2e`. Use an extracted server executable with its runtime and support
files; a DLL alone is not supported. Clear the environment variables afterward to
return to the default suite.

To run the core live scenarios on GitHub, open the **Production Build** workflow,
select **Run workflow**, and enable **Run the real-server backup and restore
smoke suite**. The job verifies a pinned Duplicati release before running the
backup, restore, and job deletion specs against the production build.

The first test edits an existing job, saves from another editor page, checks the
server's stored settings and reloads the page. Round-trip cases start real
unencrypted and AES-encrypted local backups through the UI, change the source
files, then restore a selected folder and compare text and binary contents byte
for byte. One AES case uses a generated, stored passphrase. Another deletes the
original job and local DB, reloads the application, then enters the destination
URL and passphrase in the direct-restore screens. Recovery cases first leave the passphrase empty or enter an
incorrect value, check the real fileset/database-repair error, then return through
the UI to correct it and restore without reloading. AES cases check encrypted volume
suffixes. Version-deletion cases select only the middle of three versions, cancel before confirming,
then restore both surviving versions and compare text/binary contents. They check the
Compact option against task logs and actual data-volume removal. All cases use only
disposable fixture jobs/files; deletion and compaction touch only fixture-owned data.
Authentication-recovery cases configure one-minute access tokens in the stopped,
isolated server database, then wait for a real server-side 401. They cover WebSocket
and long-poll recovery, both with a successful refresh and with one deliberately
injected refresh HTTP 503. All other auth/status traffic reaches the real server.
They verify resumed subscriptions/state updates without a page reload. These four
cases each wait for actual token expiry; browser time is not simulated.
Destination-preservation cases compare the disposable server's stored URL with
API and UI saves, including unknown providers, unreadable URLs, repeated/encoded
parameters and masked credentials. They exercise mouse/keyboard saves and
description-only edits without connecting to any remote provider or running a backup.
These cases require a server containing the URL-masking fixes in Duplicati #7832,
#7860 and #7898; older servers can fail even when the client preserves the URL.
The worker stops its own server/proxy in teardown. Logs, isolated server data and
failure traces remain under `test-results` for diagnosis (normal Playwright output
cleanup applies on the next run). Abruptly terminating the runner may bypass teardown.

### Testing the client on windows

- Open windows on parallels then run backend on port 8200
  - `cd [BACKEND_PATH]\Executables\Duplicati.Server`
  - `dotnet run -- --webservice-password=helloworld --webservice-interface=any` (insert your test password)
- `npm run start:windows`
- Debug on your mac in `localhost:4200`

### Locale definitions

Edit `scripts/locale-catalog.ts` when changing supported locale identifiers,
selector labels, aliases, or locale data. It is the build-time source for the
runtime tables, Angular locale imports and the locale
sections of `angular.json`. Existing aliases and regional fallbacks are explicit
in the catalog; language selection and provider lookup remain unchanged.

After editing the catalog or updating translation files, run:

```sh
bun run gen:locales
bun run check:locales
bun run test:locales
```

Commit the catalog and generated files together. `check:locales` verifies that
JSON/XLF translations and imported Angular locale modules exist and that
the generated files are current. CI runs this check before building. The catalog
is used only during generation, so the application loads static tables and does
not need to generate configuration at startup.

### npm publication

The publishing workflow installs from `bun.lock`, builds with `bun run build:prod`,
and generates the distribution's `package.json` with `bun run gen:package-json`.
Node.js 26 and npm remain responsible for `npm publish --access public --provenance`
using the existing OIDC permissions, registry, and main-branch publication condition.
The published metadata does not include development dependencies or Bun-specific fields.

The Production Build workflow validates the generated package with `npm pack --dry-run`
after uploading the browser artifact. This checks packaging without publishing a version.

# DuplicatiClient

### Prerequisites

- Node.js 22 - https://formulae.brew.sh/formula/node
- bun latest - https://bun.sh/docs/installation (Could be removed as a dependency requires changing a few commands in the package.json scripts)

### Dependencies

- ShipUI - https://shipui.com/ - ([Docs](https://docs.shipui.com/), [GitHub](https://github.com/shipuicom/core))
- Angular 21 - https://angular.dev
- Dayjs - https://day.js.org/en/
- Phosphor Icons - https://phosphoricons.com/

### Run the project

### Preview a production build

Build the application, then serve the generated files locally:

```sh
bun install --frozen-lockfile
bun run gen:font
bun run ng -- build ngclient --configuration production
bun run preview
```

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

### Testing the client on windows

- Open windows on parallels then run backend on port 8200
  - `cd [BACKEND_PATH]\Executables\Duplicati.Server`
  - `dotnet run -- --webservice-password=helloworld --webservice-interface=any` (insert your test password)
- `npm run start:windows`
- Debug on your mac in `localhost:4200`

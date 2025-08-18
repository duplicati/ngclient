# DuplicatiClient

### Prerequisites

- Node.js 22 - https://formulae.brew.sh/formula/node
- bun latest - https://bun.sh/docs/installation

### Deps

- ShipUI - https://shipui.com/ - ([Docs](https://docs.shipui.com/))
- Angular 20 - https://angular.dev
- Dayjs - https://day.js.org/en/
- Phosphor Icons - https://phosphoricons.com/

### Run the project

### Testing the client on windows

- Open windows on parallels then run backend on port 8200
  - `cd [BACKEND_PATH]\Executables\net8\Duplicati.Server`
  - `dotnet run -- --webservice-password=helloworld --webservice-interface=any` (insert your test password)
- `npm run start:windows`
- Debug on your mac in `localhost:4200`

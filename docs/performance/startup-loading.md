# Selective startup route preloading

Measured on 2026-10-30. The application previously used PreloadAllModules. It now preloads the layout and home shell, then settings, restore landing and the general backup editor when authenticated. Other routes load when visited. Authentication guards and route paths are unchanged.

## Measurements

[Successful comparison run](https://github.com/JamBalaya56562/ngclient/actions/runs/40917142825).
Baseline: 6e94f1edcbfc8296a9cba3e97b6236c3f9cfb3bf (instrumentation only).
Candidate: 3bbb5f6e760a752b3ff14f3f3af41e8078610f3d.
The following documentation-only additions do not change the measured application.

Five alternating baseline/candidate pairs ran sequentially on one Ubuntu runner, Chromium 153.0.8010.12, AMD EPYC 9V74, about 15.6 GiB RAM. Each sample used a fresh context, disabled cache, 80 ms network latency, 750,000 bytes/s download and 250,000 bytes/s upload. Both production builds were served uncompressed by the same Bun server. Dependencies, browser installation and builds completed before measurement; no concurrent benchmark workers ran.

| Stage    | Cumulative static bytes before → after | Static requests before → after | Ready time median, ms before → after |
| -------- | -------------------------------------- | ------------------------------ | ------------------------------------ |
| login    | 2245366 → 1410514                      | 121 → 51                       | 2185.8 → 2187.0                      |
| home     | 2267505 → 1797387                      | 130 → 75                       | 193.2 → 188.4                        |
| settings | 2307917 → 1859225                      | 133 → 79                       | 73.7 → 69.7                          |
| restore  | 2308228 → 1859536                      | 134 → 80                       | 23.7 → 22.8                          |
| edit     | 2308228 → 1859536                      | 134 → 80                       | 51.2 → 52.9                          |

Login static transfer fell 37.2%; the complete measured journey fell 19.4%. Ready times were broadly unchanged in this small sample; these measurements do not establish a display latency improvement. The first editor visit median increased about 1.7 ms, within the observed sample ranges. Unvisited routes save downloads but their first foreground visit still needs their chunks.

Byte counts use CDP loadingFinished encodedDataLength for same-origin static resources, including protocol overhead. API and WebSocket responses are controlled fixtures, not live server timings; cumulative API request counts were identical (0, 5, 5, 5, 7). No backend bandwidth reduction is claimed. Each stage records readiness before a fixed two-second observation window, then waits for static requests to settle. Transfer counts include that observation window. Login readiness is measured from navigation; later stages from their triggering action. FCP is retained in the JSON as a separate browser metric.

The benchmark asserts login, authenticated home, settings, restore landing, backup editor and return home. The production Playwright suite additionally tests a cold editor URL and browser back/forward navigation. These are controlled browser checks, not a live Duplicati server or manual visual comparison.

## Reproduction

Both ordinary E2E tests and startup measurements use the root `playwright.config.ts`. `bun run test:e2e` selects ordinary E2E tests by default; `bun run measure:startup` explicitly selects `PLAYWRIGHT_MODE=startup`. Other mode values are rejected. The measurement mode selects only the benchmark, its build-switching server and JSON results, with traces and screenshots disabled. Ordinary E2E runs retain their existing server and failure diagnostics. Both suites are type-checked through `e2e/tsconfig.json`.

Use the Production Build workflow on this branch with startup_measurements=true, startup_baseline_run set to a successful baseline production workflow run ID, and startup_rounds=5. Production browser artifacts expire after one day, so rebuild the baseline when needed. The optional measurement job is disabled during ordinary CI.

For local comparison, build both revisions first, set STARTUP_BASELINE_DIR and STARTUP_CANDIDATE_DIR to their browser output directories, set STARTUP_VARIANTS=baseline,candidate and STARTUP_ROUNDS=5, then run bun run measure:startup. Avoid concurrent builds, tests or other substantial workloads. Results are written under tmp/startup-results. The CI startup-measurements artifact contains full resource records for 14 days; startup-loading.json preserves all ten sample summaries and ranges alongside this report.

## Validation

- Unit run 40917095985: 1,242 tests passed across 110 files, including 13 preloading strategy tests.
- Production run 40917142825: production build and 23 browser tests passed; all ten measurement scenarios passed.
- Strategy tests cover authentication, deferred loading, failed preload retry and subscription teardown. Existing guards continue to control foreground navigation.

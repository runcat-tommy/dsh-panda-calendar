# Changelog

All notable changes to **dsh-panda-calendar** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Release & marketplace compliance**: added `screenshots.json` (storefront screenshot declaration pointing at `assets/preview-*.jpg`) and `CHANGELOG.en.md` (the docs set is now bilingual end to end); added a GitHub Actions `test` workflow that runs the 64 unit tests on every push and PR (zero dependencies, no install step).
- **Short-lived weather cache**: `PandaWeather.fetchWeather` keeps the last 10 minutes of results in localStorage (keyed by rounded lat/lon + forecast days), so re-opening the tab or switching cities does not re-hit the network; the view serves the first load from cache, and the manual refresh forces fresh data.
- **Geo lookups follow the UI language**: `searchCity` / `reverseGeocode` / `locateByIp` / `locateCurrentCity` accept `opts.lang` (default zh, unchanged), and the view passes the active UI language — English UIs now get English city/country names from Open-Meteo / BigDataCloud / ip-api instead of hard-coded Chinese.

### Tests

- Added 8 weather tests (64 total): `lang` forwarding with zh defaults unchanged, cache hit without network, expired-entry refetch, `force` bypass, write-back after success, and safe operation without storage.

## [Unreleased]

### Changed

- **Compact "today" card**: the body is now a two-column grid (large date + lunar info on the left; festival/solar-term tags, holiday/makeup note and action buttons on the right), so wide cards no longer waste the right side; narrow screens (≤560px) collapse back to a single column.
- **Bigger calendar type**: day numbers 14→17px, weekday header 11→12px, lunar/festival sub-labels 10→11px and taller cells (58→68px).
- **Clearer weekend/holiday contrast**: statutory off-days and real weekends (Sat/Sun that are not makeup workdays) get a soft red tint with a bolder day number; makeup workdays (e.g. a compensated Saturday) keep the plain workday look (grey 班 mark, no tint) so they are not misleading.
- **Fixed Saturday/solar-term colors**: switched to the theme's `business` palette that actually exists at runtime (the previously used `state-info-*` variables are undefined in the host theme, so the Saturday blue had never rendered — the direct reason weekends were hard to tell apart from workdays).

### Tests

- Added 3 tests (67 total): `isRestDayCell` semantics (weekends and statutory off-days are rest, makeup workdays are not), the today card's two-column structure, and rest-day classification over the month grid.

## [1.1.0] - 2026-09-03

### Changed

- README.md / README.en.md: plugin preview screenshots added below the title (`assets/preview-zh.jpg`, `assets/preview-en.jpg`; referenced via GitHub raw URLs so they render on both GitHub and the npm page).
- README.md / README.en.md: a prominent 「简体中文 / English」 language switcher at the top; the repository homepage shows the Chinese edition by default, and the full English text in `README.en.md` is one click away.
- `package.json`: added `repository` (https://github.com/runcat-tommy/dsh-panda-calendar).
- GitHub repository details: description and topics filled in (including `dsh-plugin` and other DSH-plugin ecosystem topics).

### Release

- Public release completed: code pushed to GitHub + `v1.1.0` published on npm (0.1.0 was the initial trial run; this release fills in public-repo metadata and previews before the formal release flow).

## [0.1.0] - 2026-09-03

### Added (M0–M5 implementation complete)

- **Plugin skeleton (M0)**
  - ModuleLoader client bundle (`lib/client.js`, no build step) mirroring dsh-chinese-poetry.
  - `conversation.view` registration: id `panda-calendar`, order `30` (对话 0 / 轨迹 10 / 诗词 20 / 熊猫 30), locale-bound label.
  - No-op node host (`lib/index.js`) + `cordis.patch.yml` + `package.json` `dsh.client` wiring.
  - `npm test` stub suite (eval bundle + stubbed react/fetch/locale/slots, zero network).

- **Calendar core (M1)**
  - Offline lunar engine for **1900–2100** with generated data tables (from lunar-javascript/6tail, MIT) packed into `PANDA_LUNAR_PACK` / `PANDA_TERM_PACK`.
  - Solar↔lunar conversion, leap months, ganzhi year (春节 boundary) / month (节气 boundary) / day, zodiac, 24 solar terms, Chinese day names.
  - Validated day-by-day against lunar-javascript for 1900-01-31…2100-12-31 (0 mismatches).
  - Traditional Chinese festivals (春节/元宵/龙抬头/清明/端午/七夕/中元/中秋/重阳/腊八/小年/除夕) + international festivals (元旦/情人节/复活节/母亲节/父亲节/万圣节/感恩节/平安夜/圣诞节/劳动节/国庆节), zh+en.

- **Statutory holidays (M2)**
  - `PandaStatutory`: holiday-cn yearly feed (jsDelivr → GitHub raw → built-in snapshot), 7-day localStorage cache, rule fallback, offline snapshot for 2025/2026, 休/班 (off/make-up) normalization with day numbers and contiguous ranges.

- **Weather (M2/M4)**
  - `PandaWeather`: Open-Meteo forecast (current + 3-day) and geocoding city search (zh, country disambiguation), BigDataCloud reverse geocoding, ip-api.com IP fallback, WMO code → zh/en/icon table, 8 default Chinese cities.
  - Locate chain in the view: browser geolocation → reverse geocode → ip-api → default cities; weather auto-refreshes on city-list/tick changes.

- **View (M3/M5)**
  - Today card (lunar/ganzhi/zodiac/terms/festivals/statutory, Beijing-time note) + 6×7 month grid (休/班 badges, term/festival/lunar subtitles, today outline, focus ring).
  - Click any cell to inspect a day (cross-month jump), Back-to-today, month navigation clamped to 1900–2100.
  - City weather card with city search/add/remove/switch and refresh.
  - **Send to chat**: writes a composed day-summary text via `inputActions.setDraft` and switches to the Chat view (DOM fallback), per design R9 phase one.
  - zh/en dictionaries follow the dsh UI language; module-level VIEW_CACHE keeps per-session state across tab switches.

- **Docs & tooling**
  - `docs/01` feasibility, `02` Q&A, `03` initial design, `04` final design/implementation memo.
  - Reproducible generators: `tools/gen-engine-data.mjs` (engine tables + fixtures), `tools/inject-tables.mjs`, `tools/gen-holiday-snapshot.mjs`.
  - README.md / README.en.md / CHANGELOG.md / CHANGELOG.en.md / LICENSE (MIT).

### Fixed

- **上月/下月 unresponsive on first visit**: `useViewState` now seeds the module-level `VIEW_CACHE` with the initial value during `useState` initialisation, so functional updates (`setView(v => …)`) always have a base value even before the first explicit set.

### Added (0.1.0 enhancements shipped with 0.1.0)

- **Persist user city list + active city (survives plugin update / reinstall)**: `PandaWeather.loadCityState` / `saveCityState` on a single versioned localStorage record `pandaCalendar.cities.v1` = `{ list, active }`; view restores it on boot and persists on locate/add/remove; corrupt data degrades to null.
- **Manual locate button**: `PandaWeather.locateCurrentCity` (geolocation → reverse geocode, ip-api fallback); weather card offers 「📍 定位」 in both branches — locates, puts the city first, activates, persists and refreshes.
- **Plain-language "update holiday data" hint with copy button**: when the built-in snapshot lacks next year, the view shows a short hint with a copy-to-clipboard button for `node tools/gen-holiday-snapshot.mjs` and a "restart dsh web" reminder; driven by the pure predicate `PandaStatutory.snapshotHasYear(year)`.

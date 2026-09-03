# Changelog

All notable changes to **dsh-panda-calendar** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-03

### Changed

- README.md / README.en.md：标题下新增插件界面预览图（`assets/preview-zh.jpg`、`assets/preview-en.jpg`；以 GitHub raw 链接引用，GitHub 与 npm 页面均可见）。
- `package.json`：补充 `repository`（https://github.com/runcat-tommy/dsh-panda-calendar）。
- GitHub 仓库详情：完善 Description 与 Topics（含 `dsh-plugin` 等 DSH 插件生态主题）。

### 发布

- 完成插件公开发布：代码推送 GitHub + 发布 npm `v1.1.0`（0.1.0 为首发试运行版，本次补齐公开仓库元信息与预览图后正式走发布流程）。

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
  - README.md / README.en.md / CHANGELOG.md / LICENSE (MIT).

### Fixed

- **上月/下月 unresponsive on first visit**: `useViewState` now seeds the module-level `VIEW_CACHE` with the initial value during `useState` initialisation, so functional updates (`setView(v => …)`) always have a base value even before the first explicit set.

### Added (0.1.0 后置增强，随 0.1.0 一并发布)

- **Persist user city list + active city (survives plugin update / reinstall)**: `PandaWeather.loadCityState` / `saveCityState` on a single versioned localStorage record `pandaCalendar.cities.v1` = `{ list, active }`; view restores it on boot and persists on locate/add/remove; corrupt data degrades to null.
- **Manual locate button**: `PandaWeather.locateCurrentCity` (geolocation → reverse geocode, ip-api fallback); weather card offers 「📍 定位」 in both branches — locates, puts the city first, activates, persists and refreshes.
- **Plain-language "update holiday data" hint with copy button**: when the built-in snapshot lacks next year, the view shows a short hint with a copy-to-clipboard button for `node tools/gen-holiday-snapshot.mjs` and a "restart dsh web" reminder; driven by the pure predicate `PandaStatutory.snapshotHasYear(year)`.

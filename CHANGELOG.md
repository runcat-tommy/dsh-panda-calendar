# Changelog

All notable changes to **dsh-panda-calendar** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-09

### Added

- **「历史上的今天」**：今日卡片内新增可折叠小节（📜 历史上的今天），每日期内联展示约 3 条大事记 + 4~6 位精选名人诞辰（大陆断网/无法访问维基时也完整可用）。
  - 内置离线快照（366 天，含 2/29）由 `tools/gen-history-data.mjs` 依据中文维基百科编辑精选数据（CC BY-SA）生成，生成时经 opencc 统一为简体并做敏感度白名单精选（历史名人为先、过滤非人物噪声）；
  - 在线增强：网络可达中文维基时按日期拉取该日最新大事记（REST onthisday/selected，12h localStorage 缓存、单日期单次），失败静默回退到快照，大陆裸网用户始终走快照；
  - 诞辰始终来自白名单快照（维基实时诞辰流噪声大——混入「中国/南非」等国家词条，故不在运行时消费）。
- **发布与市场合规**：新增 `screenshots.json`（市场详情页截图声明，指向 `assets/preview-*.jpg`）与 `CHANGELOG.en.md`（英文变更日志，文档集达成中英对等）；新增 GitHub Actions `test` workflow（push / PR 自动跑 74 项单测，零依赖零安装步骤）。
- **天气短期缓存**：`PandaWeather.fetchWeather` 将最近 10 分钟的结果写入 localStorage（键按取整 lat/lon + 预报天数），再次打开标签页或切换城市不重复请求；视图首次加载可用缓存，「手动刷新」强制绕缓存取新数据。
- **地理查询语言跟随 UI**：`searchCity` / `reverseGeocode` / `locateByIp` / `locateCurrentCity` 新增 `opts.lang`（默认 zh 行为不变），视图按当前界面语言传入——英文界面下 Open-Meteo / BigDataCloud / ip-api 返回英文城市与国家名，不再硬编码中文。

### Changed

- **「今日」卡片布局紧凑化**：正文改为左右两栏（左侧大日期+农历，右侧节日/节气标签、放假/调休说明与操作按钮），宽卡片不再右侧留白；窄屏（≤560px）自动回退单列。
- **日历放大**：日期数字 14→17px、周表头 11→12px、农历/节日副标 10→11px、格子加高（58→68px），视觉更清晰。
- **周末与节假日区分强化**：法定休息日与「真周末」（周六日且非调休上班）整格浅红底 + 日期加粗；调休上班日（如补班周六）保持普通工作日观感（灰「班」标、无底色），避免误导。
- **修复周六/节气颜色引用**：改用主题确认存在的 `business` 色系（此前引用的 `state-info-*` 变量在宿主主题中实际未定义，周六蓝色从未生效——这正是周末与工作日区分不明显的直接原因）。

### Tests

- 新增 7 项（共 74）：历史快照纯查找（`historyLookup`/`historyOf`，含 2/29、缺失日期空安全）、zh wiki onthisday 负载规范化、实时拉取缓存命中/过期重取/静默失败（429、断网、空响应、无 fetch 宿主）、今日卡 history 小节渲染集成（快照未生成时跳过）。
- 新增 3 项（共 67）：`isRestDayCell` 语义（周末与法定 off 为休、调休上班不算休）、今日卡两栏结构、网格休息日判定一致。
- 新增 8 项 weather 测试（共 64）：`lang` 透传与 zh 默认不变、缓存命中不联网、过期重取、`force` 绕过、成功回写、无 storage 环境安全。

### 发布

- 完成插件公开发布：代码推送 GitHub + 发布 npm `v1.2.0`（「历史上的今天」功能版）。

## [1.1.0] - 2026-09-03

### Changed

- README.md / README.en.md：标题下新增插件界面预览图（`assets/preview-zh.jpg`、`assets/preview-en.jpg`；以 GitHub raw 链接引用，GitHub 与 npm 页面均可见）。
- README.md / README.en.md：顶部新增「简体中文 / English」语言切换栏，仓库主页默认显示中文版，英文全文在 `README.en.md` 一键可达。
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

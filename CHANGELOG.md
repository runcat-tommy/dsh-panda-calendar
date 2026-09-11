# Changelog

All notable changes to **dsh-panda-calendar** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.4] - 2026-09-11

### Changed

- **「历史上的今天」的展开 / 收起改为醒目的主色实心按钮**：此前它是 11px 的品牌色描边胶囊（`border-radius: 999px`、`padding: 3px 11px`），而宿主是**单色主题**——`--dsw-alias-brand-primary` 与正文色同为近黑——于是它在标题右侧几乎等于一段小字，收到的反馈就是「展开 / 收起按钮不够明显」。现改为与时间戳卡「现在」按钮同款的主操作形制：实心填充（`--dsw-alias-button-primary-fill`）+ 8px 圆角 + `0 2px 8px` 投影 + 13px/600 字重 + `8px 14px` 内边距，hover 加亮上浮、按下下沉、键盘聚焦描边；折叠态的「展开全部 N 条 ▾」与展开态的「收起 ▴」同样生效。
  - 折叠态「默认只露首条」（首条预览 + 「首条预览 · 点击展开」提示）**保持不变**——它本来就已经实现，本次只解决"按钮不够明显"这一半。

### Tests

- 单测 87 → **88 项**：新增「历史上的今天 的展开 / 收起读作主操作」用例，断言它是真 `<button>`、默认 `aria-expanded="false"`，且 CSS 为实心填充、有投影、字重 600、8px 圆角（**刻意不再是 999px 胶囊**）、字号 ≥ 13px、内边距 ≥ 8px/14px（防止日后被改回扁平小字）。

### 发布

- 发布 v1.2.4：代码推送 GitHub + 发布 npm `v1.2.4`（界面细节改进，补丁版本；npm 页面沿用中文 README，无需替换）。

## [1.2.3] - 2026-09-11

### Changed

- **「现在」按钮改为卡片的主操作按钮**：时间戳转换卡里的「现在」此前是透明描边的扁平小胶囊（与「自动 / 秒 / 毫秒」单位胶囊同款），不够显眼。现改为**实心主色按钮**：🕒 时钟图标 + 13px/600 字重 + 8px 圆角 + 实心填充 + `0 2px 8px` 投影（hover 加亮上浮、按下下沉、键盘聚焦有描边），高度 24→35px，明显大于同排 24px 的单位胶囊；「时间戳 → 日期」与「日期 → 时间戳」两种模式都生效（模式 A 在输入框右侧、模式 B 在日期小格下方）。
  - 为什么不用配色区分：宿主主题为**单色主题**——实测 `--dsw-alias-brand-primary` 与 `--dsw-alias-button-primary-fill` 同为 `rgb(15, 17, 21)`，没有可用的饱和强调色，因此层级只能靠形制（尺寸 / 字重 / 图标 / 投影）表达；按钮文字对比度实测 18.9:1。

### Tests

- 单测 86 → **87 项**：新增「现在按钮读作主操作」用例，断言它是真 `<button>`、带时钟图标、实心填充、有投影、字重 600，且字号与内边距**刻意大于** `.pc-city` 胶囊、圆角为 8px 而非 999px（防止日后被改回扁平样式）。

### 发布

- 发布 v1.2.3：代码推送 GitHub + 发布 npm `v1.2.3`（界面细节改进，补丁版本）。

## [1.2.2] - 2026-09-11

### Added

- **⏱ 时间戳转换卡片**：「城市天气」卡下方新增独立卡片，纯前端计算、**离线可用**，无需任何网络与 API Key。
  - **时间戳 → 日期**：粘入数字即时得到年月日时分秒；10 位（秒）/13 位（毫秒）**自动识别**并标注「识别为毫秒」，也可手动锁定「自动 / 秒 / 毫秒」；非法输入即时提示并把输入框标红。
  - **日期 → 时间戳**：填写年月日时分秒，同时给出**秒级与毫秒级**时间戳，并按所选时区回读校验（如 2026-09-11 14:33:20 @ 京沪 → 1789108400 / 1789108400000）。
  - **时区选择**：本地 / UTC / 北京·上海 / 香港 / 台北 / 东京 / 新加坡 / 新德里 / 迪拜 / 莫斯科 / 伦敦 / 巴黎·柏林 / 纽约 / 芝加哥 / 洛杉矶 / 悉尼；偏移经 `Intl.DateTimeFormat` 实时计算，**夏令时自动生效**（同一时刻：上海 14:33:20、UTC 06:33:20、纽约 02:33:20），墙钟反解采用两趟偏移校正以跨过夏令时跳变。
  - 结果含**星期、UTC 偏移、ISO 8601（UTC）**，逐行一键复制（含 `execCommand` 回退）；「现在」按钮填充当前时刻；输入与选择状态跨标签切换保留。

### Fixed

- **「历史上的今天」文案里的维基残留**：`<ref></ref>` 等标记此前会原样出现在界面上（如「造成2,996人死亡`<ref></ref>`。」）。生成脚本新增统一的标签与实体清理（`<ref>`、`<br>`、`<small>`、HTML 注释、`&nbsp;` 等），并离线重生成快照：366 天共 3257 条文案中含标记的条目由 **16 条降为 0**。
- **英文词典缺项**：`refresh` 键此前只存在于中文词典（zh 103 键 / en 102 键），现补齐；新增「中英键位完全对齐」与「时间戳全键非空」单测守卫，防止再次漂移。

### Tests

- 单测由 74 项增至 **86 项**：新增时间戳转换（秒/毫秒识别与 `1e11` 分界、Date 范围越界拒绝、多时区格式化与反解、2026 年美/欧夏令时跳变、非法与空缺输入、卡片位于天气卡下方、字典键位与双语时区名）与历史数据卫生（无 HTML 残留、fixture 与内联快照无漂移）。

### Docs

- `README.md` / `README.en.md`：新增「⏱ 时间戳转换」功能条目与使用步骤，更新单测覆盖说明。

### 发布

- 发布 v1.2.2：代码推送 GitHub + 发布 npm `v1.2.2`。

## [1.2.1] - 2026-09-09

### Fixed

- **实时拉取回退语义修正**：`PandaHistory.fetchHistoryLive` 现在把显式传入的 `fetchImpl: null` 视为「宿主无网络能力」——直接返回 null、绝不调用全局 fetch；只有未传 `fetchImpl`（undefined）时才回退全局 fetch（浏览器运行路径不变）。此前 null 会静默回落成全局 fetch 发起真实请求，使「静默失败」测试依赖网络可达性：CI 上（可访问中文维基）真实返回当天事件导致断言失败，而本地沙箱因请求被秒拒而“侥幸”通过。
- **测试环境无关化**：修复后 74 项单测在有网/无网环境结果一致，本机套件耗时由 ~10.7s 降至 ~0.2s（不再有隐藏的维基请求等待）。

### Docs

- 预览截图换用人工截图（`assets/preview-zh.jpg` / `assets/preview-en.jpg`，中英双版），展示 v1.2.0 紧凑双栏今日卡与展开的「📜 历史上的今天」小节。

### 发布

- 完成补丁发布：代码推送 GitHub + 发布 npm `v1.2.1`（CI 修复 + 截图更新）。

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

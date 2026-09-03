# dsh-panda-calendar

<p align="center">
  <a href="https://github.com/runcat-tommy/dsh-panda-calendar/blob/main/README.md"><strong>简体中文</strong></a> · 
  <a href="https://github.com/runcat-tommy/dsh-panda-calendar/blob/main/README.en.md"><strong>English</strong></a>
</p>

A **token-free calendar & weather plugin** for DeepSeek Harness Web. Adds a **"Panda Calendar (熊猫日历)"** tab to the session header (next to 对话/Chat, Trajectory and 诗词/Poetry, right after Poetry), giving you **solar/lunar dates, ganzhi, Chinese zodiac, solar terms, festivals, China public holidays (incl. make-up workdays) and multi-city weather** in one place.

<p align="center"><img src="https://raw.githubusercontent.com/runcat-tommy/dsh-panda-calendar/main/assets/preview-en.jpg" alt="Panda Calendar preview" width="85%"></p>

- Lunar engine: built-in offline data tables for **1900–2100**, generated from and validated day-by-day against [lunar-javascript](https://github.com/6tail/lunar-javascript) (6tail, MIT) — works offline, **no API key**
- Public holidays: free public feed [holiday-cn](https://github.com/imldres/holiday-cn) (MIT, based on State Council announcements) with built-in **2025/2026 snapshots** plus rule-based fallback
- Weather / geolocation: Open-Meteo (current + 3-day), BigDataCloud reverse geocoding, ip-api.com fallback — all free, no sign-up, no API key
- Pure front-end (no backend); state stays local
- Requires a `dsh web` build that supports client plugins (same mechanism as dsh-chinese-poetry)

## Features

- **Today card**: local solar date/weekday → lunar (labelled **Beijing time**) · ganzhi year/month/day · zodiac → solar terms → festival chips (Chinese primary, English in tooltip) → 🇨🇳 statutory status (off / make-up workday, incl. "holiday day N/M") → **✍ Send to chat** (writes the day summary into the input box; press Enter to hand it to the AI)
- **Month grid**: 6×7 calendar with solar day + lunar/term/festival subtitle per cell; red 休 / grey 班 statutory badges; today outlined; click any day to inspect it in the today card (cross-month clicks jump months)
- **City weather**: locate chain (browser geolocation → ip-api.com → default cities) + manual city search (Open-Meteo Geocoding with `language=zh`, country disambiguation), switch/remove cities, current + 3-day, refresh — the **city list and active city persist to localStorage**, surviving plugin updates and reinstalls
- **Public holidays**: red = off day, grey = make-up workday; unpublished/offline years fall back to snapshots and rule tables, with the data source noted
- **Bilingual UI**: zh/en follows the dsh UI language

## Install

### Option 1: npm package (once published)

```sh
dsh plugin --profile web add dsh-panda-calendar
```

### Option 2: from source (development)

```sh
cd dsh-panda-calendar
dsh plugin --profile web add .
```

For live development use a linked install (source changes take effect after a Web UI restart):

```sh
dsh plugin --profile web add link:.
```

**Restart `dsh web`** after installing, open any session — the **Panda Calendar** tab appears in the header bar.

> If you don't have pnpm yet: `npm i -g pnpm` (`dsh plugin` depends on pnpm).

## Usage

1. Open a session and click the **Panda Calendar** tab.
2. The today card shows today's lunar date, ganzhi, zodiac, terms, festivals and statutory status.
3. Click **✍ Send to chat** to drop that day's summary into the input box (it is **not sent automatically**); switch back to Chat and press Enter to have the AI elaborate.
4. Flip months, use **Today**, or click any day for details; add/switch cities from the weather card.

## Data sources & credits

| Data | Source | License |
| --- | --- | --- |
| Lunar / ganzhi / zodiac / terms (built-in 1900–2100 tables) | [6tail/lunar-javascript](https://github.com/6tail/lunar-javascript) | MIT |
| China public holidays (yearly JSON, State Council basis) | [imldres/holiday-cn](https://github.com/imldres/holiday-cn) | MIT |
| Weather (current + 3-day daily) | [Open-Meteo](https://open-meteo.com/) | CC-BY 4.0 (data), free API |
| Reverse geocoding (lat/lon → city) | [BigDataCloud reverse-geocode-client](https://www.bigdatacloud.com/docs/api/free-reverse-geocode-to-city-api) | Free, no key |
| IP geolocation fallback | [ip-api.com](https://ip-api.com/) | Free, no key (non-commercial) |

## Updating public-holiday data (for users / maintainers)

The plugin ships with published statutory holiday data built in (休/班 markers show offline too). **Each time the government publishes the next year's holiday schedule**, run this command to refresh the built-in data:

```sh
node tools/gen-holiday-snapshot.mjs
```

It fetches the latest schedule, writes it into the bundle and regenerates the test fixtures; afterwards **restart `dsh web`** (Ctrl+C → run `dsh web` again) to apply it.

> 💡 The plugin page shows the same plain-language hint (with a "copy command" button) whenever the built-in data does not yet cover **next year** — copy, run in a terminal, restart. No need to memorise the command.

## Development

```sh
npm test          # node --test (evals the client bundle with stubbed react/fetch — zero network, deterministic)
```

The suite covers: calendar engine (911 day-by-day fixtures + leap months / Spring-Festival year boundary / term rules / round-trip / out-of-range), festival rules (incl. Easter and lunar-year boundary), statutory normalization & badges, weather parsing & city search, view models (month grid / today card / send text) and a registration smoke test.

Layout:

```
dsh-panda-calendar/
├── package.json          # dsh.bundle.patch + dsh.client declaration
├── cordis.patch.yml      # profile bundle patch
├── LICENSE               # MIT
├── lib/
│   ├── index.js          # node half (no-op host)
│   └── client.js         # browser half: ModuleLoader bundle (single file, no build)
├── tools/                # reproducible table/snapshot generators
├── test/                 # node --test suite
└── docs/                 # feasibility / Q&A / design (implementation memo)
```

## Roadmap

- [x] M0: skeleton + "Panda Calendar" tab registration (order 30, after Poetry)
- [x] M1: CalendarCore (lunar/ganzhi/zodiac/terms, 1900–2100 day-validated) + festival rules
- [x] M2: statutory layer (holiday-cn primary + 2025/2026 snapshots + rule fallback); weather layer (Open-Meteo + city management)
- [x] M3: view — today card + month grid (休/班 badges, terms, festivals) + city weather; click-to-inspect days
- [x] M4: locate chain (browser → ip-api → defaults) + weather auto-refresh per city list
- [x] M5: send-to-chat (setDraft + switch to Chat view), bilingual README, CHANGELOG, npm publish prep

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

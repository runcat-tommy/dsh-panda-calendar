#!/usr/bin/env node
/**
 * dsh-panda-calendar - engine data generator (dev tool).
 *
 * Generates compact, self-consistent lunar-month & solar-term tables for
 * 1900..2100 from the authoritative astronomical implementation
 * lunar-javascript (6tail, MIT), then EXHAUSTIVELY validates the reference
 * algorithms the client engine will mirror — solar->lunar, term-day lookup,
 * ganzhi day / month (节气口径) / year (春节口径), zodiac — against 6tail for
 * EVERY solar day 1900-01-31 .. 2100-12-31.
 *
 * Outputs:
 *   tools/lunar-tables.txt                : packed table blob (embed in client)
 *   test/fixtures/engine.fixtures.json    : validated fixtures for unit tests
 *
 * Usage: node tools/gen-engine-data.mjs
 *        LUNAR_JS_PATH=<pkg-dir> node tools/gen-engine-data.mjs
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

function resolveLunarJs() {
  if (process.env.LUNAR_JS_PATH && existsSync(path.join(process.env.LUNAR_JS_PATH, "lunar.js"))) {
    return process.env.LUNAR_JS_PATH;
  }
  const temp = process.env.TEMP || "/tmp";
  const probe = path.join(temp, "panda-engine-probe", "lunar-javascript-1.7.7-x", "package");
  if (existsSync(path.join(probe, "lunar.js"))) return probe;
  throw new Error("lunar-javascript not found; set LUNAR_JS_PATH=<pkg-dir>");
}
const pkgDir = resolveLunarJs();
const require = createRequire(import.meta.url);
const L = require(path.join(pkgDir, "lunar.js")); // { Solar, Lunar, LunarYear, ... }

/* ================= constants ================= */

const B32 = "0123456789abcdefghijklmnopqrstuv"; // value 0..31
const GAN = "甲乙丙丁戊己庚辛壬癸".split("");
const ZHI = "子丑寅卯辰巳午未申酉戌亥".split("");
const ANIMALS = "鼠牛虎兔龙蛇马羊猴鸡狗猪".split("");
const TERM_NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
  "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];
const TERM_IDX = {};
TERM_NAMES.forEach((n, i) => (TERM_IDX[n] = i));

function yearGzIdx(year) { return (((year - 4) % 60) + 60) % 60; }
function gzName(idx) { idx = ((idx % 60) + 60) % 60; return GAN[idx % 10] + ZHI[idx % 12]; }
function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

/* ================= step 1: lunar month tables (chronological) =================
   For lunar year Y: runs = [{ month:(signed), days, start:Date }] starting at
   正月初一 (solar 1900-01-31 = lunar 1900-01-01 anchor confirmed below). */
const lunarYearStart = {}; // Y -> Date of 正月初一
const lunarRuns = {}; // Y -> [{month, days}]
for (let Y = 1900; Y <= 2100; Y++) {
  const s1 = L.Lunar.fromYmd(Y, 1, 1).getSolar();
  const start = new Date(Date.UTC(s1.getYear(), s1.getMonth() - 1, s1.getDay()));
  lunarYearStart[Y] = start;
  const s2 = L.Lunar.fromYmd(Y + 1, 1, 1).getSolar();
  const end = new Date(Date.UTC(s2.getYear(), s2.getMonth() - 1, s2.getDay()));
  const runs = [];
  let cur = null;
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    const dt = new Date(t);
    const s = L.Solar.fromYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    const lun = s.getLunar();
    const m = lun.getMonth(); // negative = leap
    const day = lun.getDay();
    if (day === 1) {
      if (cur) cur.days = daysBetween(cur.start, dt);
      cur = { month: m, days: 0, start: new Date(t) };
      runs.push(cur);
    }
  }
  if (cur) cur.days = daysBetween(cur.start, end);
  // sanity: 12 regular months exactly once, in order, at most one leap
  const reg = runs.filter((r) => r.month > 0).map((r) => r.month);
  if (reg.length !== 12 || reg.some((m, i) => m !== i + 1)) {
    throw new Error(`year ${Y}: bad regular months ${JSON.stringify(reg)}`);
  }
  const leapCount = runs.filter((r) => r.month < 0).length;
  if (leapCount > 1) throw new Error(`year ${Y}: multiple leap months`);
  lunarRuns[Y] = runs.map(({ month, days }) => ({ month, days }));
}
// anchor check
const a0 = L.Solar.fromYmd(1900, 1, 31).getLunar();
if (!(a0.getYear() === 1900 && a0.getMonth() === 1 && a0.getDay() === 1)) {
  throw new Error("anchor 1900-01-31 is not lunar 1900-01-01");
}
console.log("anchor ok: 1900-01-31 == lunar 1900 正月初一");

/* ================= step 2: solar term tables =================
   termDays[Y] = array(24), index i -> day-of-month of TERM_NAMES[i] in solar year Y.
   Term i always sits in solar month floor(i/2)+1.
   Generated for 1899..2101 because month-ganzhi lookups at the 1900/2100 edges
   need the neighboring year's 立春/小寒 etc. (validation itself only uses
   1900..2100, but fixtures/engine may look one year either side). */
const TERM_YEAR0 = 1899;
const TERM_YEAR1 = 2101;
const termDays = {};
for (let Y = TERM_YEAR0; Y <= TERM_YEAR1; Y++) {
  const arr = new Array(24).fill(0);
  let found = 0;
  for (let m = 1; m <= 12 && found < 24; m++) {
    const dim = new Date(Date.UTC(Y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim && found < 24; d++) {
      const jq = L.Solar.fromYmd(Y, m, d).getLunar().getJieQi();
      if (!jq) continue;
      const i = TERM_IDX[jq];
      if (i === undefined) throw new Error(`unknown jieqi ${jq} ${Y}-${m}-${d}`);
      const em = Math.floor(i / 2) + 1;
      if (em !== m) throw new Error(`term ${jq}: month ${m} != ${em}`);
      if (arr[i] !== 0) throw new Error(`dup term ${jq} ${Y}-${m}-${d}`);
      arr[i] = d;
      found++;
    }
  }
  if (found !== 24) throw new Error(`year ${Y}: found ${found} terms`);
  termDays[Y] = arr;
}

/* ================= step 3: reference algorithms (client mirrors these) ================= */

const ANCHOR_MS = Date.UTC(1900, 0, 31);
function solarIdx(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - ANCHOR_MS) / 86400000); }

function lunarYearTotalDays(Y) {
  return lunarRuns[Y].reduce((s, r) => s + r.days, 0);
}
function solarToLunarYmd(y, m, d) {
  let off = solarIdx(y, m, d);
  if (off < 0) return null;
  let Y = 1900;
  while (Y < 2100) {
    const td = lunarYearTotalDays(Y);
    if (off < td) break;
    off -= td;
    Y++;
  }
  if (Y > 2100) return null;
  const runs = lunarRuns[Y];
  for (const r of runs) {
    if (off < r.days) return { lYear: Y, lMonth: r.month, lDay: off + 1 };
    off -= r.days;
  }
  return null;
}
function jieQiName(y, m, d) {
  const arr = termDays[y];
  if (!arr) return null;
  const i0 = (m - 1) * 2, i1 = i0 + 1;
  if (arr[i0] === d) return TERM_NAMES[i0];
  if (arr[i1] === d) return TERM_NAMES[i1];
  return null;
}
function gzDayIdx(y, m, d) { return (((solarIdx(y, m, d) + 40) % 60) + 60) % 60; } // 1900-01-31 = 甲辰(40)

// month ganzhi, 节气口径: 寅月 opens at 立春; sequence advances one pair per 节.
function gzMonthIdx(y, m, d) {
  const lichunY = termDays[y][2]; // 立春 day-of-month in year y
  let Yref = (m > 2 || (m === 2 && d >= lichunY)) ? y : y - 1; // ganzhi-label year of the 寅月 sequence in effect
  const g = yearGzIdx(Yref);
  // base = 寅月 of that year; count 节 crossings strictly after its 立春 up to date
  const jieIdx = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0]; // 惊蛰..大雪 (Yref) then 小寒 (Yref+1)
  let k = 0;
  const target = Date.UTC(y, m - 1, d);
  for (const ti of jieIdx) {
    const my = ti === 0 ? Yref + 1 : Yref;
    const mm = Math.floor(ti / 2) + 1;
    const md = termDays[my][ti];
    if (Date.UTC(my, mm - 1, md) <= target) k++;
  }
  return (((g * 12 + 2) + k) % 60 + 60) % 60;
}

/* ================= step 4: exhaustive validation vs 6tail ================= */

let checked = 0;
const fails = { lunar: 0, term: 0, gzDay: 0, gzMonth: 0, gzYear: 0, zodiac: 0 };
const samples = [];
function fail(kind, msg) { fails[kind]++; if (samples.length < 15) samples.push(`${kind}: ${msg}`); }

for (let y = 1900; y <= 2100; y++) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      if (y === 1900 && m === 1 && d < 31) continue;
      checked++;
      const mine = solarToLunarYmd(y, m, d);
      const ref = L.Solar.fromYmd(y, m, d).getLunar();
      const refM = ref.getMonth(), refD = ref.getDay();
      if (!mine || mine.lMonth !== refM || mine.lDay !== refD) {
        fail("lunar", `${y}-${m}-${d}: mine=${mine ? mine.lMonth + "/" + mine.lDay : "null"} ref=${refM}/${refD}`);
        continue;
      }
      if ((jieQiName(y, m, d) || "") !== (ref.getJieQi() || "")) {
        fail("term", `${y}-${m}-${d}: mine=${jieQiName(y, m, d)} ref=${ref.getJieQi()}`);
      }
      if (gzName(gzDayIdx(y, m, d)) !== ref.getDayInGanZhi()) {
        fail("gzDay", `${y}-${m}-${d}: mine=${gzName(gzDayIdx(y, m, d))} ref=${ref.getDayInGanZhi()}`);
      }
      if (gzName(gzMonthIdx(y, m, d)) !== ref.getMonthInGanZhi()) {
        fail("gzMonth", `${y}-${m}-${d}: mine=${gzName(gzMonthIdx(y, m, d))} ref=${ref.getMonthInGanZhi()}`);
      }
      if (gzName(yearGzIdx(mine.lYear)) !== ref.getYearInGanZhi()) {
        fail("gzYear", `${y}-${m}-${d}: mine=${gzName(yearGzIdx(mine.lYear))}(lYear ${mine.lYear}) ref=${ref.getYearInGanZhi()}`);
      }
      if (ANIMALS[(((mine.lYear - 4) % 12) + 12) % 12] !== ref.getYearShengXiao()) {
        fail("zodiac", `${y}-${m}-${d}: mine=${ANIMALS[(((mine.lYear - 4) % 12) + 12) % 12]} ref=${ref.getYearShengXiao()}`);
      }
    }
  }
}
console.log(`checked ${checked} solar days`);
console.log("fails:", JSON.stringify(fails));
if (samples.length) console.log("samples:\n" + samples.join("\n"));
if (Object.values(fails).some((v) => v > 0)) {
  console.error("VALIDATION FAILED — aborting");
  process.exit(1);
}
console.log("ALL 1900-2100 VALIDATED OK vs lunar-javascript");

/* ================= step 5: pack tables ================= */

// lunar pack: per lunar year 1900..2100 -> 20 bits -> 4 b32 chars:
//   [leapMonth 0..12 : 4 bits][12 regular month sizes (1=30d,0=29d) : 12 bits][leap size bit if leap>0 else 0 : 1 bit]... padded
// Encode canonical: leap(4) + months1..12 sizes(12) + leapSize(1) = 17 bits -> pad to 20 (4 chars).
function packBits(bits) {
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    let v = 0;
    for (let j = 0; j < 5; j++) v = v * 2 + (bits[i + j] || 0);
    out += B32[v];
  }
  return out;
}
let lunarPack = "";
for (let Y = 1900; Y <= 2100; Y++) {
  const runs = lunarRuns[Y];
  const leap = runs.find((r) => r.month < 0);
  const bits = [];
  const leapVal = leap ? -leap.month : 0;
  for (let b = 3; b >= 0; b--) bits.push((leapVal >> b) & 1);
  for (let mm = 1; mm <= 12; mm++) {
    const r = runs.find((x) => x.month === mm);
    bits.push(r.days === 30 ? 1 : 0);
  }
  bits.push(leap && leap.days === 30 ? 1 : 0);
  while (bits.length % 5) bits.push(0);
  lunarPack += packBits(bits);
}
// term pack: per solar year 1899..2101 -> 24 days * 5 bits = 120 bits = 24 b32 chars
let termPack = "";
for (let Y = TERM_YEAR0; Y <= TERM_YEAR1; Y++) {
  const bits = [];
  for (let i = 0; i < 24; i++) {
    const dv = termDays[Y][i]; // 1..31
    for (let b = 4; b >= 0; b--) bits.push((dv >> b) & 1);
  }
  termPack += packBits(bits);
}
console.log("lunarPack chars:", lunarPack.length, "(expect 804) | termPack chars:", termPack.length, "(expect 4872 = 203yr*24)");

const blob =
  `/* GENERATED by tools/gen-engine-data.mjs from lunar-javascript (6tail, MIT license). Do not edit by hand. */\n` +
  `/* lunar table: 201 years x 20 bits (leap 0-12 | 12 month sizes 1=30d | leap size). term table: 203 years x 24 term days-of-month (order = TERM_NAMES). */\n` +
  `var PANDA_LUNAR_YEAR0 = 1900;\n` +
  `var PANDA_TERM_YEAR0 = ${TERM_YEAR0};\n` +
  `var PANDA_LUNAR_PACK = ${JSON.stringify(lunarPack)};\n` +
  `var PANDA_TERM_PACK = ${JSON.stringify(termPack)};\n`;
writeFileSync(path.join(root, "tools", "lunar-tables.txt"), blob, "utf8");
console.log("wrote tools/lunar-tables.txt");

/* ================= step 6: fixtures ================= */

const MONTH_CN = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
function toFixture(y, m, d) {
  const lun = solarToLunarYmd(y, m, d);
  const ref = L.Solar.fromYmd(y, m, d).getLunar();
  return {
    y, m, d,
    lYear: lun.lYear, lMonth: lun.lMonth, lDay: lun.lDay,
    gzYear: gzName(yearGzIdx(lun.lYear)),
    gzMonth: gzName(gzMonthIdx(y, m, d)),
    gzDay: gzName(gzDayIdx(y, m, d)),
    animal: ANIMALS[(((lun.lYear - 4) % 12) + 12) % 12],
    term: jieQiName(y, m, d) || "",
  };
}
const seen = new Set();
const fixtures = [];
function add(y, m, d, tag) {
  if (y < 1900 || y > 2100) return;
  if (y === 1900 && m === 1 && d < 31) return;
  const key = `${y}-${m}-${d}`;
  if (seen.has(key)) return;
  seen.add(key);
  fixtures.push(Object.assign(toFixture(y, m, d), { tag }));
}
// leap month first days + lunar new years + lunar new year eves
for (let Y = 1900; Y <= 2100; Y++) {
  const runs = lunarRuns[Y];
  const leap = runs.find((r) => r.month < 0);
  if (leap) {
    // first day of leap month: walk chronological runs until leap then +1 day past prior month end
    let idx = 0;
    for (; idx < runs.length && runs[idx].month !== leap.month; idx++) {}
    const prior = runs[idx - 1];
    const leapStart = new Date(lunarYearStart[Y].getTime());
    for (let i = 0; i < idx - 1; i++) leapStart.setTime(leapStart.getTime() + runs[i].days * 86400000);
    leapStart.setTime(leapStart.getTime() + prior.days * 86400000);
    add(leapStart.getUTCFullYear(), leapStart.getUTCMonth() + 1, leapStart.getUTCDate(), `leap-${Y}`);
  }
  const ny = lunarYearStart[Y];
  add(ny.getUTCFullYear(), ny.getUTCMonth() + 1, ny.getUTCDate(), `ny-${Y}`);
  const eve = new Date(lunarYearStart[Y].getTime() - 86400000);
  add(eve.getUTCFullYear(), eve.getUTCMonth() + 1, eve.getUTCDate(), `eve-${Y}`);
}
// term days across representative years incl. term boundary conflicts 1912-1928 region
for (const Y of [1900, 1912, 1913, 1917, 1927, 1928, 1949, 1984, 2000, 2020, 2023, 2024, 2025, 2026, 2027, 2033, 2099, 2100]) {
  for (let i = 0; i < 24; i++) {
    const mm = Math.floor(i / 2) + 1;
    add(Y, mm, termDays[Y][i], `term-${TERM_NAMES[i]}`);
  }
}
// ganzhi / zodiac boundary spots + misc
for (const [y, m, d] of [
  [2026, 1, 31], [2026, 2, 3], [2026, 2, 4], [2026, 2, 16], [2026, 2, 17], [2026, 12, 31],
  [2025, 1, 28], [2025, 1, 29], [2025, 2, 3], [2024, 2, 9], [2024, 2, 10],
  [2023, 1, 21], [2023, 1, 22], [2023, 3, 21], [2023, 3, 22], [2033, 12, 22], [2049, 2, 1],
  [1900, 1, 31], [1900, 12, 31], [2100, 1, 1], [2100, 12, 31], [2000, 1, 1], [2000, 12, 31],
]) add(y, m, d, "spot");
mkdirSync(path.join(root, "test", "fixtures"), { recursive: true });
writeFileSync(path.join(root, "test", "fixtures", "engine.fixtures.json"), JSON.stringify(fixtures, null, 0), "utf8");
console.log("wrote", fixtures.length, "fixtures -> test/fixtures/engine.fixtures.json");

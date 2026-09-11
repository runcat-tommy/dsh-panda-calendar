#!/usr/bin/env node
/**
 * Build the offline "today in history" snapshot (大事记 + 诞辰精选) for the
 * panda-calendar client, mirroring gen-holiday-snapshot.mjs's architecture.
 *
 * Data sources (both CC BY-SA via the Wikimedia REST / MediaWiki APIs, zh wiki):
 *   - events:  feed/onthisday/selected/{m}/{d}  — the editor-curated 大事记
 *               (a handful of notable events per day)
 *   - births:  page "M月D日" wikitext section == 出生 ==  — an editor-curated
 *               list of notable people born that day (many per day); we pick
 *               the 4-6 most "notable-looking" via a keyword score and cap
 *               each description to keep the snapshot small.
 *
 * Raw payloads must be pre-fetched by tools/fetch-history-raw.ps1 into
 * %TEMP%\panda-history-raw\<m>-<d>-selected.json / <m>-<d>-day.json
 * (that fetcher exists because zh.wikipedia.org is only reachable through a
 * proxy on CN networks and must be rate-limited).
 *
 * Output:
 *   - tools/history-snapshot.txt  (var PANDA_HISTORY_SNAPSHOT snippet)
 *   - test/fixtures/history.snapshot.json (compact same data, for the suite)
 * then injects the snippet into lib/client.js between the
 * //==HISTORY_SNAPSHOT== markers.
 *
 * Requires: npm i -D opencc-js  (dev-only, for zh-TW -> zh-CN text + terms).
 * Run: node tools/gen-history-data.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Converter } from "opencc-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const clientPath = path.join(root, "lib", "client.js");
const rawDir = process.env.PANDA_HISTORY_RAW || path.join(process.env.TEMP || ".", "panda-history-raw");
// zh wiki day pages are written in mixed script. Strategy: opencc tw->cn for
// character-level conversion only (safe on historical wording: 啟用→启用,
// 宣告→宣告), then a curated mainland phrase patch for the common Taiwan
// terms that char-level conversion alone leaves wrong (义大利→意大利).
// Full tw2sp is NOT used: its phrase dict misfires on encyclopedia prose
// (e.g. 啟用→激活, 宣告→声明). Table is longest-first; keys are the
// SIMPLIFIED-char (post-opencc) Taiwan-flavored spellings.
const toCn = Converter({ from: "tw", to: "cn" });

const TW_MAINLAND = [
  ["网际网路", "互联网"], ["网路", "网络"],
  ["义大利", "意大利"],
  ["作业系统", "操作系统"], ["程式设计", "程序设计"], ["程式码", "代码"], ["程式", "程序"],
  ["资料库", "数据库"], ["资料", "数据"],
  ["印表机", "打印机"], ["记忆体", "内存"], ["硬碟", "硬盘"], ["软体", "软件"], ["硬体", "硬件"],
  ["位元组", "字节"], ["位元", "位"], ["数位", "数字"], ["伺服器", "服务器"],
  ["太空梭", "航天飞机"], ["行动电话", "移动电话"], ["雷射", "激光"],
  ["计程车", "出租车"], ["矽谷", "硅谷"], ["滑鼠", "鼠标"], ["档案", "文件"],
];

/** Curated political/cultural figure transliterations where zh wiki's Taiwan
 *  spelling differs from mainland usage (opencc is char-only and leaves these
 *  untouched). Only unambiguous, high-value names; keys are the post-opencc
 *  simplified-char forms. */
const NAME_MAINLAND = [
  ["甘迺迪", "肯尼迪"], ["尼克森", "尼克松"], ["卡斯楚", "卡斯特罗"],
  ["川普", "特朗普"], ["柴契尔", "撒切尔"], ["布希", "布什"],
  ["布里兹涅夫", "勃列日涅夫"], ["叶尔钦", "叶利钦"], ["戈巴契夫", "戈尔巴乔夫"],
  ["鲍利斯·叶利钦", "鲍里斯·叶利钦"],
  ["雷根", "里根"], ["邱吉尔", "丘吉尔"], ["宾拉登", "本·拉登"],
  ["杰佛逊", "杰斐逊"], ["莫札特", "莫扎特"], ["黛安娜", "戴安娜"],
];

/** Convert tw/zh wiki text to mainland Chinese: chars then curated phrases.
 *  Pure substring replacement is fine here — these keys are unambiguous words
 *  (no longer mainland word contains 网路/义大利/软体 as a proper substring
 *  of a different word). */
function toMainland(s) {
  let out = toCn(s);
  for (const [tw, cn] of TW_MAINLAND) {
    if (out.includes(tw)) out = out.split(tw).join(cn);
  }
  for (const [tw, cn] of NAME_MAINLAND) {
    if (out.includes(tw)) out = out.split(tw).join(cn);
  }
  return out;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MAX_EVENTS = 3; // the view shows ~3 大事 per day (user choice)
const MIN_BIRTHS = 4;
const MAX_BIRTHS = 6;
const DESC_CAP = 46; // characters after which a birth description is cut
const EVENT_CAP = 110;

/* ---------------- wikitext helpers (shared with the probe) ---------------- */

function pickVariant(inner) {
  const parts = inner.split(";");
  const byLang = {};
  for (const p of parts) {
    const m = /^\s*zh[-_]?(?:cn|hans|tw|hk|sg|mo)\s*:\s*(.+?)\s*$/.exec(p);
    if (m) byLang[m[0].match(/zh[-_]?(?:cn|hans|tw|hk|sg|mo)/)[0]] = m[1];
  }
  return byLang["zh-cn"] || byLang["zh-hans"] || byLang["zh-tw"] || parts[0].trim();
}

function stripLinks(t) {
  return t
    .replace(/\[\[\s*([^\]|]+?)(?:\|\s*([^\]]+?))?\s*\]\]/g, (m, a, b) => (b || a).trim())
    .replace(/\[\[/g, "").replace(/\]\]/g, "");
}

/** Drop MediaWiki/HTML remnants that survive the wikitext pass: <ref/> and
 *  <ref>…</ref> citation markers, <br>, <small>/<sup> wrappers, HTML comments
 *  and the entities that come with them. Without this, strings such as
 *  "…正式向外界公布。<ref></ref>" reach the UI verbatim. */
function stripTags(t) {
  return t
    .replace(/<ref[^>]*?\/\s*>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, "&");
}

function cleanText(t) {
  let s = t
    // templates first: {{...}} (also handles {{lang|...|zh=X}} etc.)
    .replace(/\{\{[^{}]*\}\}/g, "")
    // zh wiki language-conversion blocks: -{zh-cn:A; zh-tw:B}- / {A|B} —
    // pick the target-variant text
    .replace(/-?\{([^{}]*)\}-?/g, (m, inner) => pickVariant(inner))
    .replace(/'''|''/g, "");
  s = stripTags(s)
    .replace(/\s+/g, " ")
    .trim();
  // a conversion we could not resolve leaves stray braces; drop them
  s = s.replace(/[{}]/g, "");
  // nothing should look like markup any more — drop a lone stray tag remnant
  s = s.replace(/<\/?[^>\s]{0,12}>/g, "");
  return s;
}

function cleanNote(t) {
  let s = stripLinks(cleanText(t));
  s = s.replace(/^[，,、\s]+/, "");
  s = s.replace(/(（[^）]*逝世[^）]*）)\s*$/, "");
  s = s.replace(/\s+[，,。.;；]\s*$/g, "");
  return s.trim();
}

/** Strip trailing "（图）"/"（雕像）"-style image annotations that leak into
 *  REST-derived event text ("非裔美國人弗雷德里克·道格拉斯（圖）逃離...") —
 *  handle both traditional （圖） and simplified （图） spellings. */
function stripImageAnno(t) {
  return t
    .replace(/（\s*(?:圖|图|圖像|图像|雕像|畫像|画像|照片|海報|海报)\s*）\s*/g, "")
    .replace(/\(\s*(?:image|photo)\s*\)\s*/gi, "");
}

/** Parse the == 大事记 == section of an M月D日 page into events sorted by
 *  appearance. Returns [{ y: "1783", raw: "..." }]. The REST onthisday feed
 *  reuses this list (same years), so we prefer its bullet text over the
 *  feed's own (which drops link labels / leading subjects). Heading spelling
 *  varies across zh wiki pages (大事记/大事記/大事纪/大事紀), so a regex is
 *  used instead of a fixed string. */
function parseDayEvents(wikitext) {
  const out = [];
  const head = /^==\s*大事[记記纪紀]\s*==\s*$/m.exec(wikitext);
  if (!head) return out;
  const after = wikitext.slice(head.index + head[0].length);
  // section ends at the next level-2 heading (== 出生 == / == 逝世 == ...)
  const end = /^==[^=]/m.exec(after);
  const section = end ? after.slice(0, end.index) : after;
  const lines = section.split(/\r?\n/);
  for (const raw of lines) {
    if (!/^\s*\*\s/.test(raw)) continue;
    const line = raw.replace(/^\s*\*\s*/, "").trim();
    // year: [[YYYY年]] / [[前45年]] link or bare YYYY年 / 前YYYY年 prefix
    let mm = /^\[\[\s*(前\s*)?([-–—]?\d{1,4})\s*年\s*\]\]/.exec(line);
    let year = null;
    let bodyStart = 0;
    if (mm) {
      year = (mm[1] ? "-" : "") + mm[2];
      bodyStart = mm.index + mm[0].length;
    } else {
      const m2 = /^(前\s*)?([-–—]?\d{1,4})\s*年/.exec(line);
      if (m2) {
        year = (m2[1] ? "-" : "") + m2[2];
        bodyStart = m2.index + m2[0].length;
        mm = m2;
      }
    }
    if (year == null) continue;
    const body = line.slice(bodyStart).replace(/^[:：]\s*/, "").trim();
    if (!body) continue;
    out.push({ y: String(Number(year)), raw: body });
  }
  return out;
}

/** Bigram overlap between a cleaned candidate and the (defective) feed text:
 *  how much of the candidate survives in the feed. Used to disambiguate when
 *  a day page lists several events in the same year. */
function overlap(a, b) {
  const bi = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bi(a), B = bi(b);
  if (!A.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / A.size;
}

/** Parse the == 出生 == section of an M月D日 page into [{y,n,d}]. */
function parseBirths(wikitext) {
  const out = [];
  const birthIdx = wikitext.indexOf("== 出生 ==");
  if (birthIdx < 0) return out;
  const rest = wikitext.slice(birthIdx + "== 出生 ==".length);
  const endIdx = rest.search(/\n==[^=]/);
  const section = endIdx < 0 ? rest : rest.slice(0, endIdx);
  const lines = section.split(/\r?\n/).filter((l) => /^\s*\*\s*/.test(l));
  for (const raw of lines) {
    let line = raw.replace(/^\s*\*\s*/, "").trim();
    if (!line) continue;
    // year: [[YYYY年]] link or bare YYYY年 at the start
    const ym = /^\[\[\s*([-–—]?\d{1,4})\s*年\s*\]\]/.exec(line)
      || /^([-–—]?\d{1,4})\s*年\s*[:：]?/.exec(line);
    const year = ym ? ym[1] : null;
    if (!year) continue;
    line = line.slice(ym.index + ym[0].length).replace(/^[:：]/, "").trim();
    const nm = /\[\[\s*([^\]|]+?)(?:\|\s*([^\]]+?))?\s*\]\]/.exec(line);
    if (!nm) continue;
    const nameRaw = nm[2] || nm[1];
    const note = cleanNote(line.slice(nm.index + nm[0].length));
    const name = cleanText(nameRaw).replace(/\s*\(.*\)\s*$/, "").trim();
    if (name && name.length <= 24) out.push({ y: year, n: name, d: note });
  }
  return out;
}

/** Notability heuristic over name+description (taste: 历史名人为主). */
function scoreBirth(b) {
  const t = b.n + " " + b.d;
  let s = 0;
  const strong = ["诺贝尔", "皇帝", "国王", "女王", "天皇", "总统", "首相", "总理", "元首", "苏丹", "沙皇", "教宗", "教皇", "开国", "创始人", "创始", "之父", "发明", "发现者", "帝国", "王朝", "君", "革命", "解放"];
  const mid = ["家", "学家", "物理", "化学", "数学", "作家", "诗人", "画家", "音乐", "作曲", "建筑", "工程", "医生", "经济学家", "哲学家", "历史", "军事", "将军", "元帅", "上将", "军官", "演员", "导演", "运动员", "奥运", "冠军", "教", "学"];
  const skip = ["比赛", "歌手", "演员", "偶像", "团体", "模特", "主播", "选手"];
  for (const k of strong) if (t.includes(k)) s += 3;
  for (const k of mid) if (t.includes(k)) s += 1;
  return s;
}

function chooseBirths(list) {
  if (!list.length) return [];
  const scored = list
    .map((b) => ({ ...b, s: scoreBirth(b) }))
    .sort((a, b) => b.s - a.s || Number(b.y) - Number(a.y) || a.n.localeCompare(b.n));
  const top = scored.filter((x) => x.s >= 2).slice(0, MAX_BIRTHS);
  const rest = scored.filter((x) => x.s < 2).slice(0, MAX_BIRTHS - top.length);
  const picks = top.concat(rest).slice(0, MAX_BIRTHS);
  // ensure at least MIN_BIRTHS when possible
  if (picks.length < MIN_BIRTHS && list.length > picks.length) {
    const seen = new Set(picks.map((p) => p.n));
    for (const x of scored) {
      if (picks.length >= MIN_BIRTHS) break;
      if (!seen.has(x.n)) { picks.push(x); seen.add(x.n); }
    }
  }
  // de-dup same name, keep desc short
  const seen = new Set();
  return picks.filter((p) => {
    if (seen.has(p.n)) return false;
    seen.add(p.n);
    p.d = toMainland(p.d || "").slice(0, DESC_CAP);
    p.n = toMainland(p.n);
    return true;
  });
}

function cutCn(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const last = cut.search(/[。；;！？.!?][^。；;！？.!?]*$/);
  return (last > n * 0.5 ? cut.slice(0, last + 1) : cut) + "…";
}

/* ---------------- build ---------------- */

function keyOf(m, d) { return m + "-" + d; }

const snapshot = {};
let missing = 0, totalEvents = 0, totalBirths = 0;

for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d++) {
    const key = keyOf(m, d);
    const selFile = path.join(rawDir, `${m}-${d}-selected.json`);
    const dayFile = path.join(rawDir, `${m}-${d}-day.json`);
    if (!existsSync(selFile) || !existsSync(dayFile)) { missing++; continue; }
    // Parse the day page first: it is the source of truth for event text.
    // The REST feed only tells us WHICH events the editors picked (year match
    // on the same list); the feed's own text is a lossy render that drops
    // link labels and leading subjects, so prefer the wikitext bullet.
    let dayEvents = [];
    let dayWiki = "";
    try {
      const dj = JSON.parse(readFileSync(dayFile, "utf8"));
      dayWiki = (dj.parse && dj.parse.wikitext) || "";
      dayEvents = parseDayEvents(dayWiki);
    } catch (e) { console.log(`skip ${key} day: ${e.message}`); }
    const byYear = {};
    for (const dev of dayEvents) {
      (byYear[dev.y] = byYear[dev.y] || []).push(dev.raw);
    }
    const events = [];
    try {
      const sel = JSON.parse(readFileSync(selFile, "utf8"));
      const arr = sel && sel.selected;
      if (Array.isArray(arr)) {
        for (const ev of arr) {
          const year = ev.year != null ? String(ev.year) : "";
          if (!year) continue;
          let text = "";
          const cands = byYear[year] || [];
          if (cands.length === 1) {
            text = cands[0]; // unique same-year bullet: use it verbatim
          } else if (cands.length > 1) {
            // Several events share the year: pick the bullet whose text best
            // matches the feed's (defective) rendering of the same event.
            const feedClean = toMainland(stripImageAnno(cleanNote(ev.text || "")));
            let best = "", bestScore = -1;
            for (const c of cands) {
              const s = overlap(toMainland(stripImageAnno(cleanNote(c))), feedClean);
              if (s > bestScore) { bestScore = s; best = c; }
            }
            text = bestScore >= 0.10 ? best : (ev.text || "");
          } else {
            text = ev.text || ""; // day page lacks the year: trust the feed
          }
          const cleaned = toMainland(stripImageAnno(cleanNote(text)));
          if (cleaned) events.push([year, cutCn(cleaned, EVENT_CAP)]);
        }
      }
    } catch (e) { console.log(`skip ${key} selected: ${e.message}`); }
    let births = [];
    try {
      const dj = JSON.parse(readFileSync(dayFile, "utf8"));
      births = chooseBirths(parseBirths(dj.parse && dj.parse.wikitext || ""));
    } catch (e) { console.log(`skip ${key} day: ${e.message}`); }
    if (!events.length && !births.length) { missing++; continue; }
    const rec = {};
    if (events.length) rec.e = events.slice(0, MAX_EVENTS);
    if (births.length) rec.b = births.map((x) => [x.y, x.n, x.d]);
    snapshot[key] = rec;
    totalEvents += events.length;
    totalBirths += births.length;
  }
}

if (Object.keys(snapshot).length < 360) {
  console.error(`only ${Object.keys(snapshot).length}/366 days built (missing ${missing}) — aborting`);
  process.exit(1);
}
console.log(`built ${Object.keys(snapshot).length} days, events=${totalEvents}, births=${totalBirths}`);

const compactJson = JSON.stringify(snapshot);
console.log(`compact payload: ${(compactJson.length / 1024).toFixed(1)} KB`);

const snippet = "var PANDA_HISTORY_SNAPSHOT = " + compactJson + ";";
writeFileSync(path.join(root, "tools", "history-snapshot.txt"), snippet + "\n", "utf8");
writeFileSync(path.join(root, "test", "fixtures", "history.snapshot.json"), compactJson + "\n", "utf8");
console.log("wrote tools/history-snapshot.txt + test/fixtures/history.snapshot.json");

// inject into client.js between markers
const client = readFileSync(clientPath, "utf8");
const startMarker = "    //==HISTORY_SNAPSHOT==";
const endMarker = "    //==/HISTORY_SNAPSHOT==";
const i1 = client.indexOf(startMarker);
const i2 = client.indexOf(endMarker);
if (i1 < 0 || i2 < 0) {
  console.error("history markers not found in lib/client.js — add them, then re-run");
  process.exit(1);
}
const next =
  client.slice(0, i1) + startMarker + "\n    " + snippet + "\n" + endMarker + client.slice(i2 + endMarker.length);
writeFileSync(clientPath, next, "utf8");
console.log("injected snapshot into lib/client.js");

// samples for eyeballing
for (const k of ["1-1", "9-3", "10-1", "12-31"]) {
  const rec = snapshot[k];
  if (!rec) continue;
  console.log(`--- ${k} ---`);
  (rec.e || []).slice(0, 3).forEach((x) => console.log(`  E ${x[0]}: ${x[1].slice(0, 46)}`));
  (rec.b || []).slice(0, 5).forEach((x) => console.log(`  B ${x[0]} ${x[1]} — ${x[2].slice(0, 40)}`));
}

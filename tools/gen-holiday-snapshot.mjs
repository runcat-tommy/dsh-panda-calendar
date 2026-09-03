#!/usr/bin/env node
/**
 * Build the offline holiday snapshot for the panda-calendar client.
 *
 * Fetches holiday-cn JSON (MIT, https://github.com/NateScarlet/holiday-cn)
 * for the current and following years from jsDelivr, keeps years that carry
 * published day lists, and writes:
 *   - tools/holiday-snapshot.txt   (the var PANDA_HOLIDAY_SNAPSHOT snippet)
 *   - test/fixtures/holiday.snapshot.json (raw payloads for the test suite)
 *
 * Then injects the snapshot into lib/client.js between the
 * //==HOLIDAY_SNAPSHOT== markers. Run with node tools/gen-holiday-snapshot.mjs
 * after a new 国务院 year gets published.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const clientPath = path.join(root, "lib", "client.js");

const thisYear = new Date().getUTCFullYear();
const years = [thisYear - 1, thisYear, thisYear + 1].filter((y) => y >= 2022);

const fetched = {};
for (const y of years) {
  const u = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`;
  try {
    const res = await fetch(u);
    if (!res.ok) continue;
    const j = await res.json();
    if (j && Array.isArray(j.days) && j.days.length > 0) fetched[y] = j;
    console.log(`fetched ${y}: ${j && j.days ? j.days.length : 0} days`);
  } catch (e) {
    console.log(`fetch ${y} failed: ${e.message}`);
  }
}

if (!Object.keys(fetched).length) {
  console.error("no holiday data fetched — aborting (offline?)");
  process.exit(1);
}

// compact but readable: keep only name + off flag (id/papers stripped)
const compact = {};
for (const [y, payload] of Object.entries(fetched)) {
  compact[y] = {
    year: payload.year,
    days: payload.days.map((d) => ({ date: d.date, name: d.name, isOffDay: d.isOffDay })),
  };
}

const snippet = `var PANDA_HOLIDAY_SNAPSHOT = ${JSON.stringify(compact, null, 2)};`;
writeFileSync(path.join(root, "tools", "holiday-snapshot.txt"), snippet + "\n", "utf8");
writeFileSync(
  path.join(root, "test", "fixtures", "holiday.snapshot.json"),
  JSON.stringify(compact, null, 2),
  "utf8"
);
console.log("wrote tools/holiday-snapshot.txt + test/fixtures/holiday.snapshot.json");

// inject into client.js between markers
const client = readFileSync(clientPath, "utf8");
const startMarker = "    //==HOLIDAY_SNAPSHOT==";
const endMarker = "    //==/HOLIDAY_SNAPSHOT==";
const i1 = client.indexOf(startMarker);
const i2 = client.indexOf(endMarker);
if (i1 < 0 || i2 < 0) throw new Error("holiday markers not found in lib/client.js");
const indented = snippet.split(/\r?\n/).map((l) => (l ? "    " + l : l)).join("\n");
const next =
  client.slice(0, i1) + startMarker + "\n" + indented + "\n" + endMarker + client.slice(i2 + endMarker.length);
writeFileSync(clientPath, next, "utf8");
console.log("injected snapshot into lib/client.js");

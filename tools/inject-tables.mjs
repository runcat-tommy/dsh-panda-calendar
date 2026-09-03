#!/usr/bin/env node
/**
 * Dev helper: inject the GENERATED calendar tables (tools/lunar-tables.txt)
 * between the //==PANDA_TABLES== and //==/PANDA_TABLES== markers inside
 * lib/client.js. Re-run after regenerating tools/lunar-tables.txt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const clientPath = path.join(root, "lib", "client.js");
const tablesPath = path.join(root, "tools", "lunar-tables.txt");

const client = readFileSync(clientPath, "utf8");
const tables = readFileSync(tablesPath, "utf8").replace(/\s+$/, "");
const startMarker = "    //==PANDA_TABLES==";
const endMarker = "    //==/PANDA_TABLES==";
const i1 = client.indexOf(startMarker);
const i2 = client.indexOf(endMarker);
if (i1 < 0 || i2 < 0) throw new Error("markers not found in lib/client.js");

const indented = tables.split(/\r?\n/).map((l) => (l ? "    " + l : l)).join("\n");
const next = client.slice(0, i1) + startMarker + "\n" + indented + "\n" + endMarker + client.slice(i2 + endMarker.length);
writeFileSync(clientPath, next, "utf8");
console.log("injected tables into lib/client.js (chars", next.length + ")");

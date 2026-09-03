/**
 * M2 festival layer tests.
 * Expected solar dates cross-checked against lunar-javascript (6tail)
 * authoritative answers (see probe outputs recorded in docs/04 milestone notes).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadClient } from "./helpers.mjs";

const exp = loadClient();
const C = exp.PandaCalendarCore;
const F = exp.PandaFestival;

function zh(y, m, d) {
  return F.festivalsOfDay(y, m, d).map((f) => f.zh);
}
function ids(y, m, d) {
  return F.festivalsOfDay(y, m, d).map((f) => f.id);
}

test("festival layer exposes rules and matcher", () => {
  assert.ok(Array.isArray(F.FESTIVAL_RULES) && F.FESTIVAL_RULES.length > 20);
  const chuxi = F.FESTIVAL_RULES.find((r) => r.id === "chuxi");
  assert.equal(chuxi.eve, true);
  const idsSeen = new Set(F.FESTIVAL_RULES.map((r) => r.id));
  assert.equal(idsSeen.size, F.FESTIVAL_RULES.length, "rule ids must be unique");
});

test("lunar traditional festivals land on 6tail-verified solar dates", () => {
  const cases = [
    ["春节 2026", 2026, 2, 17], ["春节 2025", 2025, 1, 29],
    ["元宵 2026", 2026, 3, 3], ["端午 2026", 2026, 6, 19],
    ["七夕 2026", 2026, 8, 19], ["中秋 2026", 2026, 9, 25],
    ["重阳 2026", 2026, 10, 18], ["腊八(2026农历)", 2027, 1, 15],
    ["端午 2025", 2025, 5, 31], ["中秋 2025", 2025, 10, 6],
    ["龙抬头 2026", 2026, 3, 20],
    ["小年(2025农历腊月廿三)", 2026, 2, 10], ["小年(2026农历腊月廿三)", 2027, 1, 30],
  ];
  for (const [label, y, m, d] of cases) {
    const got = ids(y, m, d);
    assert.ok(got.length > 0, `${label}: no festival on ${y}-${m}-${d}`);
  }
  // spot: exact day and NOT adjacent days
  assert.ok(ids(2026, 6, 19).includes("duanwu"));
  assert.equal(ids(2026, 6, 18).includes("duanwu"), false);
  assert.ok(ids(2026, 9, 25).includes("zhongqiu"));
  assert.ok(ids(2025, 10, 6).includes("zhongqiu"));
  assert.ok(ids(2026, 2, 17).includes("chunjie"));
  assert.ok(ids(2026, 2, 10).includes("xiaonian"));
  assert.ok(ids(2027, 1, 30).includes("xiaonian"));
});

test("除夕 is the last lunar day of its year (eve of next 春节)", () => {
  // 除夕 2026 (eve of 2027春节=2027-02-06): probe 2027-02-05
  assert.ok(ids(2027, 2, 5).includes("chuxi"), "2027-02-05 should be 除夕");
  assert.ok(ids(2027, 2, 6).includes("chunjie"), "next day 2027 春节");
  assert.equal(ids(2027, 2, 4).includes("chuxi"), false);
  // 除夕 for 2026春节 = 2026-02-16 (eve of 2026-02-17)
  assert.ok(ids(2026, 2, 16).includes("chuxi"));
  assert.ok(ids(2026, 2, 17).includes("chunjie"));
  // no chuxi on ordinary 腊月 days
  assert.equal(ids(2026, 2, 10).includes("chuxi"), false);
});

test("清明节 fires on the 清明 term day", () => {
  assert.ok(ids(2026, 4, 5).includes("qingming"));
  assert.ok(ids(2025, 4, 4).includes("qingming"));
  assert.ok(ids(2024, 4, 4).includes("qingming"));
  assert.equal(ids(2026, 4, 4).includes("qingming"), false); // 2026 清明 = 4/5
});

test("solar fixed festivals", () => {
  assert.ok(ids(2026, 1, 1).includes("yuandan"));
  assert.ok(ids(2026, 2, 14).includes("qingrenjie"));
  assert.ok(ids(2026, 3, 8).includes("funvjie"));
  assert.ok(ids(2026, 5, 1).includes("laodongjie"));
  assert.ok(ids(2026, 6, 1).includes("ertongjie"));
  assert.ok(ids(2026, 9, 10).includes("jiaoshijie"));
  assert.ok(ids(2026, 10, 1).includes("guoqingjie"));
  assert.ok(ids(2026, 12, 25).includes("shengdanjie"));
  assert.ok(ids(2026, 12, 24).includes("pinganye"));
});

test("floating festivals: Easter, Mother/Father/Thanksgiving", () => {
  // Easter (Anonymous Gregorian): 2024-3-31, 2025-4-20, 2026-4-5, 2027-3-28
  assert.ok(ids(2024, 3, 31).includes("fuhuojie"));
  assert.ok(ids(2025, 4, 20).includes("fuhuojie"));
  assert.ok(ids(2026, 4, 5).includes("fuhuojie"));
  assert.ok(ids(2027, 3, 28).includes("fuhuojie"));
  assert.equal(ids(2026, 4, 6).includes("fuhuojie"), false);
  // Mother's Day = 2nd Sunday of May
  assert.ok(ids(2026, 5, 10).includes("muqinjie"));
  assert.ok(ids(2025, 5, 11).includes("muqinjie"));
  assert.equal(ids(2026, 5, 3).includes("muqinjie"), false);
  // Father's Day = 3rd Sunday of June
  assert.ok(ids(2026, 6, 21).includes("fuqinjie"));
  assert.ok(ids(2025, 6, 15).includes("fuqinjie"));
  assert.equal(ids(2026, 6, 14).includes("fuqinjie"), false);
  // Thanksgiving = 4th Thursday of November
  assert.ok(ids(2026, 11, 26).includes("ganenjie"));
  assert.equal(ids(2026, 11, 19).includes("ganenjie"), false);
});

test("festival zh/en names present for every hit", () => {
  let sampled = 0;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const list = F.festivalsOfDay(2026, m, d);
      if (!list.length) continue;
      for (const f of list) {
        assert.ok(f.zh && f.en, `missing zh/en for ${f.id} on 2026-${m}-${d}`);
      }
      sampled += list.length;
    }
  }
  assert.ok(sampled >= 20, "expected many festival hits across the year");
});

test("festival layer reuses supplied dayInfo without recompute", () => {
  const di = C.dayInfo(2026, 6, 19);
  const list = F.festivalsOfDay(2026, 6, 19, di);
  assert.ok(list.some((f) => f.id === "duanwu"));
  // out of engine range -> empty, not crash
  assert.deepEqual(F.festivalsOfDay(2200, 1, 1), []);
});

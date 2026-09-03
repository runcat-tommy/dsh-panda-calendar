/**
 * M2 weather layer tests. All network functions take an injectable
 * fetchImpl, so the suite never performs a real request. Payload shapes
 * mirror real Open-Meteo / BigDataCloud responses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadClient } from "./helpers.mjs";

const exp = loadClient();
const W = exp.PandaWeather;

const sampleForecast = {
  timezone: "Asia/Shanghai",
  current: {
    time: "2026-09-03T11:45",
    temperature_2m: 30.2,
    relative_humidity_2m: 34,
    apparent_temperature: 32.6,
    is_day: 1,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 8.1,
  },
  daily: {
    time: ["2026-09-03", "2026-09-04", "2026-09-05"],
    weather_code: [2, 61, 95],
    temperature_2m_max: [32.0, 29.5, 27.2],
    temperature_2m_min: [20.5, 21.3, 19.9],
    precipitation_probability_max: [10, 80, 95],
    uv_index_max: [6, 4, 2],
    sunrise: ["2026-09-03T05:39", "2026-09-04T05:40", "2026-09-05T05:41"],
    sunset: ["2026-09-03T18:31", "2026-09-04T18:29", "2026-09-05T18:28"],
  },
};

function okJson(json) {
  return { ok: true, json: () => Promise.resolve(json) };
}

test("weatherCodeInfo covers common WMO codes with zh/en/icon", () => {
  assert.deepEqual(W.weatherCodeInfo(0), { zh: "晴", en: "Clear", icon: "☀" });
  assert.equal(W.weatherCodeInfo(3).zh, "阴");
  assert.equal(W.weatherCodeInfo(61).en, "Light rain");
  assert.equal(W.weatherCodeInfo(95).zh, "雷雨");
  assert.equal(W.weatherCodeInfo(999).zh, "未知");
});

test("normalizeForecast reshapes current + daily", () => {
  const n = W.normalizeForecast(sampleForecast);
  assert.equal(n.current.temp, 30.2);
  assert.equal(n.current.feels, 32.6);
  assert.equal(n.current.humidity, 34);
  assert.equal(n.current.isDay, true);
  assert.deepEqual(n.current.info, { zh: "多云", en: "Partly cloudy", icon: "⛅" });
  assert.equal(n.daily.length, 3);
  assert.equal(n.daily[0].date, "2026-09-03");
  assert.equal(n.daily[1].info.zh, "小雨");
  assert.equal(n.daily[1].rainProb, 80);
  assert.equal(n.daily[2].code, 95);
  assert.equal(n.timezone, "Asia/Shanghai");
  assert.equal(W.normalizeForecast(null), null);
  assert.equal(W.normalizeForecast({}), null);
});

test("fetchWeather resolves normalized data through injected fetchImpl", async () => {
  const out = await W.fetchWeather(39.9042, 116.4074, { fetchImpl: () => Promise.resolve(okJson(sampleForecast)) });
  assert.equal(out.current.temp, 30.2);
  assert.ok(out.daily.length === 3);
  assert.ok(out.current.info.zh.length > 0);
  // http failure -> null
  const fail = await W.fetchWeather(1, 2, { fetchImpl: () => Promise.resolve({ ok: false }) });
  assert.equal(fail, null);
  // malformed JSON -> null
  const bad = await W.fetchWeather(1, 2, {
    fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ nope: true }) }),
  });
  assert.equal(bad, null);
});

test("searchCity maps Open-Meteo geocoding results", async () => {
  const geo = { results: [{ name: "上海", admin1: "上海市", country: "中国", latitude: 31.23, longitude: 121.47 }] };
  const out = await W.searchCity("上海", { fetchImpl: () => Promise.resolve(okJson(geo)) });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "上海");
  assert.equal(out[0].lat, 31.23);
  assert.equal(out[0].lon, 121.47);
  const none = await W.searchCity("x", { fetchImpl: () => Promise.resolve(okJson({ results: null })) });
  assert.deepEqual(none, []);
});

test("reverseGeocode maps BigDataCloud response", async () => {
  const bdc = { city: "北京", locality: "东城区", countryName: "中国", latitude: 39.9, longitude: 116.4 };
  const out = await W.reverseGeocode(39.9, 116.4, { fetchImpl: () => Promise.resolve(okJson(bdc)) });
  assert.equal(out.city, "北京");
  assert.equal(out.country, "中国");
  const fail = await W.reverseGeocode(1, 2, { fetchImpl: () => Promise.resolve({ ok: false }) });
  assert.equal(fail, null);
});

test("locateByIp maps ip-api success and degrades to null", async () => {
  const ip = { status: "success", country: "中国", countryCode: "CN", city: "北京", lat: 39.9, lon: 116.4, query: "1.2.3.4" };
  const out = await W.locateByIp({ fetchImpl: () => Promise.resolve(okJson(ip)) });
  assert.equal(out.city, "北京");
  assert.equal(out.countryCode, "CN");
  assert.equal(out.lat, 39.9);
  // failure status -> null
  const fail = await W.locateByIp({ fetchImpl: () => Promise.resolve(okJson({ status: "fail" })) });
  assert.equal(fail, null);
  // http error -> null
  const err = await W.locateByIp({ fetchImpl: () => Promise.resolve({ ok: false }) });
  assert.equal(err, null);
  // no fetch -> null
  assert.equal(await W.locateByIp({ fetchImpl: null }), null);
});

test("default city list is present with coordinates", () => {
  assert.ok(W.DEFAULT_CITIES.length >= 8);
  for (const c of W.DEFAULT_CITIES) {
    assert.ok(typeof c.name === "string" && c.name.length > 0);
    assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }
});

// ---- city list + active city persistence (localStorage-like stub) ----

function memStorage(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    _map: m,
  };
}

test("saveCityState + loadCityState round-trips the list and active city", () => {
  const st = memStorage();
  const list = [
    { name: "北京", lat: 39.9042, lon: 116.4074 },
    { name: "苏州", lat: 31.2989, lon: 120.5853 },
  ];
  W.saveCityState(list, "苏州", st);
  const out = W.loadCityState(st);
  assert.ok(out, "stored state should load");
  assert.equal(out.list.length, 2);
  assert.equal(out.list[1].name, "苏州");
  assert.equal(out.active, "苏州");
});

test("loadCityState restores after an (imaginary) plugin reinstall", () => {
  // localStorage survives a package reinstall (it is per browser origin, not
  // per npm package): write through one handle, then read through a fresh
  // handle that shares the same backing map.
  const backing = {};
  const writer = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  const reader = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  W.saveCityState([{ name: "苏州", lat: 31.2989, lon: 120.5853 }], "苏州", writer);
  const out = W.loadCityState(reader);
  assert.ok(out && out.list[0].name === "苏州" && out.active === "苏州");
});

test("loadCityState degrades gracefully on corrupt/empty data", () => {
  assert.equal(W.loadCityState(memStorage()), null, "no record -> null");
  assert.equal(W.loadCityState(memStorage({ "pandaCalendar.cities.v1": "{oops" })), null, "bad JSON -> null");
  assert.equal(W.loadCityState(memStorage({ "pandaCalendar.cities.v1": "[]" })), null, "empty list -> null");
  const bad = memStorage({ "pandaCalendar.cities.v1": JSON.stringify({ list: [{ name: "", lat: NaN, lon: 0 }], active: "" }) });
  assert.equal(W.loadCityState(bad), null, "no valid city -> null");
  assert.equal(W.loadCityState(null), null, "null storage -> null");
  assert.equal(W.loadCityState({}), null, "non-storage object -> null");
});

test("loadCityState falls back to first city when active is not in list", () => {
  const st = memStorage({
    "pandaCalendar.cities.v1": JSON.stringify({
      list: [{ name: "北京", lat: 39.9, lon: 116.4 }],
      active: "苏州", // stale active: not present
    }),
  });
  const out = W.loadCityState(st);
  assert.equal(out.active, "北京");
});

test("saveCityState drops invalid entries and rewrites a stale active", () => {
  const st = memStorage();
  W.saveCityState([
    { name: "北京", lat: 39.9, lon: 116.4 },
    { name: "", lat: 1, lon: 2 },          // invalid name
    { name: "坏城", lat: NaN, lon: 2 },     // invalid lat
    { name: "仅字符串" },                    // no coords
  ], "北京", st);
  const out = W.loadCityState(st);
  assert.equal(out.list.length, 1);
  assert.equal(out.list[0].name, "北京");
  assert.equal(out.active, "北京");
});

// ---- locateCurrentCity (manual "where am I": geo -> reverse geocode, ip fallback) ----

function geoOk(lat, lon) {
  return { getCurrentPosition: (ok) => ok({ coords: { latitude: lat, longitude: lon } }) };
}
function geoErr() {
  return { getCurrentPosition: (ok, err) => err(new Error("denied")) };
}
const reversePayload = { city: "苏州", countryName: "中国", latitude: 31.2989, longitude: 120.5853 };
const ipPayload = { status: "success", country: "中国", countryCode: "CN", city: "北京", lat: 39.9, lon: 116.4, query: "1.2.3.4" };

test("locateCurrentCity: geolocation + reverse geocode success", async () => {
  const fetchImpl = (u) => {
    assert.ok(u.includes("bigdatacloud.net"), "should call the reverse geocoder");
    return Promise.resolve(okJson(reversePayload));
  };
  const hit = await W.locateCurrentCity({ geolocation: geoOk(31.2, 120.5), fetchImpl });
  assert.ok(hit && hit.name === "苏州");
  assert.equal(hit.lat, 31.2989);
  assert.equal(hit.lon, 120.5853);
});

test("locateCurrentCity: geolocation denied falls back to ip-api", async () => {
  const fetchImpl = (u) => {
    assert.ok(u.includes("ip-api.com"), "should fall back to ip-api");
    return Promise.resolve(okJson(ipPayload));
  };
  const hit = await W.locateCurrentCity({ geolocation: geoErr(), fetchImpl });
  assert.ok(hit && hit.name === "北京");
});

test("locateCurrentCity: reverse geocode empty -> ip-api fallback", async () => {
  let calls = 0;
  const fetchImpl = (u) => {
    calls++;
    return u.includes("bigdatacloud.net")
      ? Promise.resolve(okJson({ countryName: "中国", latitude: 0, longitude: 0 })) // no city name
      : Promise.resolve(okJson(ipPayload));
  };
  const hit = await W.locateCurrentCity({ geolocation: geoOk(31.2, 120.5), fetchImpl });
  assert.equal(calls, 2, "reverse geocode then ip-api should both be tried");
  assert.ok(hit && hit.name === "北京");
});

test("locateCurrentCity: no geolocation and no fetch -> null", async () => {
  const hit = await W.locateCurrentCity({ geolocation: null, fetchImpl: null });
  assert.equal(hit, null);
  // and: geolocation present but everything fails -> null
  const fetchImpl = () => Promise.resolve({ ok: false });
  const miss = await W.locateCurrentCity({ geolocation: geoOk(1, 2), fetchImpl });
  assert.equal(miss, null);
});

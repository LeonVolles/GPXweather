// Browser test: loads index.html in Chromium with all outside services mocked (weather, place names,
// OpenStreetMap, map tiles; Leaflet/Plotly/jsPDF from node_modules). Run: cd tests && npm install && npm test
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const nm = (p) => path.join(here, "node_modules", p);
const LIB = {
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js": nm("leaflet/dist/leaflet.js"),
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css": nm("leaflet/dist/leaflet.css"),
  "https://cdn.plot.ly/plotly-2.35.2.min.js": nm("plotly.js-dist-min/plotly.min.js"),
  "https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js": nm("jspdf/dist/jspdf.umd.min.js"),
  "https://unpkg.com/jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js": nm("jspdf-autotable/dist/jspdf.plugin.autotable.min.js"),
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==", "base64");
const pad = (n) => String(n).padStart(2, "0");

// A 375 km test tour with some hills.
function tourGpx() {
  let pts = "";
  for (let i = 0; i <= 4000; i++) {
    const f = i / 4000;
    pts += `<trkpt lat="${(47.56 + 0.6 * f + 0.05 * Math.sin(f * 40)).toFixed(6)}" lon="${(7.59 - 4.5 * f).toFixed(6)}"><ele>${(250 + 300 * Math.sin(f * 12) ** 2).toFixed(1)}</ele></trkpt>`;
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Test Tour</name></metadata><trk><trkseg>${pts}</trkseg></trk></gpx>`;
}

// Made-up but plausible hourly forecasts (rain every third day in the afternoon).
function forecast(url) {
  const u = new URL(url);
  const lats = u.searchParams.get("latitude").split(","), days = Number(u.searchParams.get("forecast_days"));
  const seed = u.searchParams.get("models").length, now = new Date();
  const out = lats.map(() => {
    const h = { time: [], temperature_2m: [], apparent_temperature: [], precipitation: [], precipitation_probability: [],
      weather_code: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], sunshine_duration: [], cloud_cover: [] };
    for (let i = 0; i < days * 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), i), hr = i % 24, day = Math.floor(i / 24);
      const rain = day % 3 === 1 && hr > 12 && hr < 16 ? 1.2 + (seed % 2) : 0;
      h.time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
      h.temperature_2m.push(10 + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI) + (seed % 3));
      h.apparent_temperature.push(8 + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI));
      h.precipitation.push(rain);
      h.precipitation_probability.push(rain ? 70 : 10);
      h.weather_code.push(rain ? 61 : 1);
      h.wind_speed_10m.push(12 + (seed % 5));
      h.wind_direction_10m.push(250 + seed * 3);
      h.wind_gusts_10m.push(30 + (seed % 7));
      h.sunshine_duration.push(hr > 8 && hr < 17 && !rain ? 3000 : 0);
      h.cloud_cover.push(rain ? 95 : 20 + (seed % 4) * 10);
    }
    return { utc_offset_seconds: 7200, hourly: h };
  });
  return out.length === 1 ? out[0] : out;
}

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html" : "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const tmp = fs.mkdtempSync(path.join(here, ".tmp-"));
const gpxFile = path.join(tmp, "tour.gpx");
fs.writeFileSync(gpxFile, tourGpx());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Berlin", acceptDownloads: true, serviceWorkers: "block",
  permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("http://127.0.0.1")) return route.continue();
  if (LIB[url]) return route.fulfill({ body: fs.readFileSync(LIB[url]), contentType: url.endsWith(".css") ? "text/css" : "text/javascript" });
  if (url.includes("api.open-meteo.com/v1/forecast")) return route.fulfill({ json: forecast(url) });
  if (url.includes("bigdatacloud")) return route.fulfill({ json: { city: "Town " + new URL(url).searchParams.get("longitude").slice(0, 4) } });
  if (url.includes("overpass")) return route.fulfill({ json: { elements: [] } });
  if (url.endsWith(".png")) return route.fulfill({ body: PNG, contentType: "image/png" });
  return route.fulfill({ status: 404, body: "" });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const ev = (fn, arg) => page.evaluate(fn, arg);
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.log("✗", name, "\n   ", e.message.split("\n").filter(Boolean).slice(0, 8).join(" ")); }
}

await page.goto(base);
await page.setInputFiles("#file", gpxFile);
await page.waitForFunction(() => S.stages.length > 0 && S.tourId);
await page.waitForTimeout(1500);

await test("days are planned by riding time with the entered speed by default", async () => {
  assert.equal(await ev(() => S.planMode), "hours");
  assert.match(await page.textContent("#settingsSummary"), /6 h\/day at 20 km\/h/);
  assert.match(await page.textContent("#speedNote"), /No uploaded rides yet/);
  // 6 h incl. 25 % breaks = 4.8 h riding: less than 20 km/h × 4.8 h because of the climbs and the (mocked) headwind
  const st = await ev(() => S.stages.slice(0, -1).map((s) => [s.km, s.hours]));
  for (const [km, h] of st) { assert.ok(Math.abs(h - 6) < 0.1, "hours " + h); assert.ok(km > 40 && km < 96, "km " + km); }
});
await test("page order: GPS button, tour overview, completed, today, today's map, coming days", async () => {
  assert.match(await page.textContent("#locate"), /Get current GPS location/);
  const order = await ev(() => ["overviewCard", "sec-done", "next", "mapCard", "coming"].map((id) => $(id).getBoundingClientRect().top));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], "order " + order);
  assert.equal(await ev(() => !!document.querySelector("#sec-stages, #sec-models, #sec-profile, #sec-route")), false, "old sections gone");
  assert.equal(await ev(() => $("sec-tour").open), false);
  assert.equal(await page.locator(".day-detail").count(), 0, "only today is open");
});
await test("the tour overview folds out map, elevation profile and route details", async () => {
  await page.locator("#sec-tour summary").click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator("#tourMap.leaflet-container").count(), 1);
  assert.ok(await page.locator("#profile .main-svg").count() > 0);
  assert.match(await page.textContent("#preview"), /Length/);
  await page.locator("#sec-tour summary").click();
});
await test("clothing advice for the day", async () => {
  assert.match(await page.textContent("#next .wear"), /👕 .+/);
});
await test("hilly days are shorter than flat ones", async () => {
  const r = await ev(() => S.stages.slice(0, -1).map((s) => ({ km: s.km, upPerKm: s.up / s.km })));
  const hilly = r.reduce((x, y) => (y.upPerKm > x.upPerKm ? y : x)), flat = r.reduce((x, y) => (y.upPerKm < x.upPerKm ? y : x));
  assert.ok(hilly.km < flat.km, JSON.stringify(r));
});
await test("a faster entered speed makes the days longer", async () => {
  await ev(() => { $("settings").open = true; });
  const before = await ev(() => S.stages[0].km);
  await page.fill("#flatSpeed", "25"); await page.dispatchEvent("#flatSpeed", "change");
  assert.ok((await ev(() => S.stages[0].km)) > before + 10);
  assert.match(await page.textContent("#settingsSummary"), /25 km\/h/);
  await page.fill("#flatSpeed", "20"); await page.dispatchEvent("#flatSpeed", "change");
});
await test("an uploaded ride measures your speed and breaks and is used for planning", async () => {
  // 40 km of the route in 3:30 h (3 h moving) yesterday – much slower than 20 km/h on the flat
  const now = Date.now(), n = 400; let trk = "";
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * (40 / 375);
    const t = now - 86400000 + (i < 200 ? i * 0.45 : 30 + i * 0.45) * 60000;
    trk += `<trkpt lat="${(47.56 + 0.6 * f + 0.05 * Math.sin(f * 40)).toFixed(6)}" lon="${(7.59 - 4.5 * f).toFixed(6)}"><time>${new Date(t).toISOString()}</time></trkpt>`;
  }
  const ride = path.join(tmp, "ride.gpx");
  fs.writeFileSync(ride, `<gpx><trk><trkseg>${trk}</trkseg></trk></gpx>`);
  try {
  await page.setInputFiles("#rideFile", ride);
  await page.waitForTimeout(500);
  assert.match(await page.textContent("#speedNote"), /From 1 uploaded ride.*used for planning/);
  assert.match(await page.textContent("#settingsSummary"), /km\/h measured/);
  // the measured values drive the plan: 16–18 km/h on the flat instead of the entered 20
  const flat = await ev(() => flatSpeed(modelParams().P, S.mass));
  assert.ok(flat > 15 && flat < 19, "measured flat speed " + flat);
  assert.ok(Math.abs((await ev(() => modelParams().breaks)) - 1.17) < 0.05);
  await page.uncheck("#useRides");
  assert.ok(Math.abs((await ev(() => flatSpeed(modelParams().P, S.mass))) - 20) < 0.2, "unticked: back to the entered 20 km/h");
  assert.equal(await ev(() => modelParams().breaks), 1.25);
  await page.check("#useRides");
  await page.fill("#breaks", "30"); await page.dispatchEvent("#breaks", "change");
  assert.equal(await ev(() => S.useRides), false, "entering breaks by hand switches the measured values off");
  } finally {
    await ev(() => { S.days = {}; S.breaks = 25; S.useRides = true; saveGlobalSettings(); syncInputs(); setStartKm(0, true, false); return saveTourSettings(); });
  }
});
await test("old saved tours switch to riding time", async () => {
  await ev(async () => { const st = await idb.get("set|" + S.tourId); st.planMode = "km"; delete st.planModeChosen; await idb.set("set|" + S.tourId, st); });
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.equal(await ev(() => S.planMode), "hours");
});
await test("fixed distance can still be chosen and is kept", async () => {
  await ev(() => { $("settings").open = true; });
  await page.click('label:has(input[name="planMode"][value="km"])');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.equal(await ev(() => S.planMode), "km");
});
await test("stages use the distance you set", async () => {
  assert.match(await page.textContent("#settingsSummary"), /80 km\/day/);
  assert.equal(await ev(() => S.stages[0].km.toFixed(0)), "80");
});
await test("next stage offers Today / Tomorrow / In N days", async () => {
  const opts = await ev(() => [...$("date").options].map((o) => o.textContent));
  assert.match(opts[0], /^Today/); assert.match(opts[1], /^Tomorrow/); assert.match(opts[2], /^In 2 days/);
});
await test("coming days list shows weather and a GPX button per day", async () => {
  assert.equal(await page.locator(".day-row").count(), 4);
  assert.match(await page.locator(".day-row").first().innerText(), /°.*☔/s);
});
await test("dragging the position slider is logged once, not step by step", async () => {
  await ev(() => { $("settings").open = true; });
  await page.evaluate(() => {
    const r = $("startKm");
    for (let v = 1; v <= 33; v++) { r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }
    r.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.deepEqual(await ev(() => S.days[todayStr()]), { start: 0, end: 33 });
  assert.match(await page.textContent("#status"), /Undo/);
});
await test("Undo puts the position back", async () => {
  await page.click("#undoBtn");
  assert.equal(await ev(() => S.startKm), 0);
});
await test("a big manual jump restarts today and shows as 'not logged'", async () => {
  await page.fill("#startKmNum", "200"); await page.dispatchEvent("#startKmNum", "change");
  assert.deepEqual(await ev(() => S.days[todayStr()]), { start: 200, end: 200 });
  assert.equal(await ev(() => completedDays().map((d) => `${d.date}:${d.b / 1000}`).join()), "null:200");
});
await test("slider-only days don't count as ridden and never change km/day", async () => {
  await ev(() => { S.days = { [addDays(todayStr(), -2)]: { start: 0, end: 33 }, [addDays(todayStr(), -1)]: { start: 33, end: 34 } }; setStartKm(34, true, false); });
  assert.equal(await ev(() => completedDays().filter((d) => d.date).length), 0);
  assert.equal(await ev(() => planPerDay()), 80);
});
await test("your average is only used when switched on, and changing km/day switches it off", async () => {
  await ev(() => { S.days = { [addDays(todayStr(), -2)]: { start: 0, end: 30, closed: true }, [addDays(todayStr(), -1)]: { start: 30, end: 66, closed: true } }; setStartKm(66, true, false); });
  assert.equal(await ev(() => planPerDay()), 80);
  await ev(() => { $("moreSettings").open = true; });
  await page.check("#useHistory");
  assert.equal(await ev(() => planPerDay()), 33);
  await page.fill("#perDayNum", "110"); await page.dispatchEvent("#perDayNum", "change");
  assert.equal(await ev(() => planPerDay()), 110);
  assert.equal(await ev(() => S.useHistory), false);
});
await test("a day can be removed from the ride log (and restored with Undo)", async () => {
  const d = await ev(() => addDays(todayStr(), -1));
  await ev(() => { $("sec-done").open = true; });
  await page.click(`[data-del-day="${d}"]`);
  assert.equal(await ev((d) => d in S.days, d), false);
  await page.click("#undoBtn");
  assert.equal(await ev((d) => d in S.days, d), true);
});
await test("the chosen start day survives a reload", async () => {
  await ev(() => { $("settings").open = true; });
  await page.selectOption("#date", { index: 1 });
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.equal(await ev(() => S.date), await ev(() => addDays(todayStr(), 1)));
  await ev(() => { $("settings").open = true; });
  await page.selectOption("#date", { index: 0 });
  await page.waitForTimeout(1000);
});
await test("the GPX button in the coming days hands over the GPX file (share menu on phones)", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".day-row button[data-gpx]").first().click()]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  assert.match(dl.suggestedFilename(), /stage-\d+-\d{4}-\d\d-\d\d\.gpx$/);
  assert.ok((gpx.match(/<trkpt/g) || []).length > 100);
  assert.equal(await page.locator(".day-detail").count(), 0, "the GPX button must not open the day");
});
await test("on a phone the share menu gets only the file, no title (so 'Copy' isn't just the name)", async () => {
  const shared = await ev(async () => {
    let got = null;
    const m = window.matchMedia;
    window.matchMedia = (q) => (q === "(pointer: coarse)" ? { matches: true } : m.call(window, q));
    navigator.canShare = () => true;
    navigator.share = async (data) => { got = { keys: Object.keys(data).sort(), name: data.files[0].name, type: data.files[0].type, size: data.files[0].size }; };
    await downloadStage(1);
    window.matchMedia = m; delete navigator.share; delete navigator.canShare;
    return got;
  });
  assert.deepEqual(shared.keys, ["files"]);
  assert.match(shared.name, /\.gpx$/);
  assert.equal(shared.type, "application/gpx+xml");
  assert.ok(shared.size > 10000);
});
await test("the copy button copies the GPX text itself", async () => {
  await page.locator("#next .next-card [data-gpx-copy]").click();
  await page.waitForTimeout(200);
  const text = await ev(() => navigator.clipboard.readText());
  assert.match(text, /^<\?xml[\s\S]*<gpx[\s\S]*<trkpt lat=[\s\S]*<\/gpx>\s*$/);
  assert.match(await page.textContent("#status"), /GPX of stage \d+ copied/);
});
await test("today's card offers the GPX file too", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#next [data-gpx]").first().click()]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  assert.match(dl.suggestedFilename(), /stage-\d+-\d{4}-\d\d-\d\d\.gpx$/);
  assert.ok((gpx.match(/<trkpt/g) || []).length > 100);
});
await test("tapping a coming day opens it in place with its own route map, without jumping down", async () => {
  await ev(() => window.scrollTo(0, 0));
  const k = await ev(() => Number(document.querySelectorAll(".day-row")[1].dataset.openStage));
  const row = page.locator(`.day-row[data-open-stage="${k}"] .dr-main`);   // re-found after every re-render
  await ev((k) => document.querySelector(`.day-row[data-open-stage="${k}"]`).scrollIntoView({ block: "center" }), k);
  await page.waitForTimeout(300);
  const y0 = await ev(() => window.scrollY);
  await row.click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".day-detail .day-inline").count(), 1);
  assert.ok(Math.abs((await ev(() => window.scrollY)) - y0) < 5, "page scrolled");
  const detail = await page.locator(".day-detail").innerText();
  assert.match(detail, /Distance/); assert.match(detail, /Open in app/); assert.match(detail, /Copy GPX/); assert.match(detail, /👕/);
  assert.equal(await page.locator(".day-detail .day-map-el.leaflet-container").count(), 1, "route map of the day");
  // the map element survives re-renders (no reload of tiles), the day stays open; a second tap closes it
  const mapId = await ev(() => document.querySelector(".day-detail .day-map-el")._leaflet_id);
  await ev(() => render());
  assert.equal(await page.locator(".day-detail").count(), 1);
  assert.equal(await ev(() => document.querySelector(".day-detail .day-map-el")._leaflet_id), mapId);
  await page.locator(".day-row.open .dr-main").click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".day-detail").count(), 0);
});
await test("each day has the weather model comparison folded in, with hourly charts", async () => {
  const det = page.locator("#next details[data-models]");
  await det.locator("summary").click();
  await page.waitForTimeout(800);
  const txt = await det.innerText();
  assert.match(txt, /ECMWF/); assert.match(txt, /Median/); assert.match(txt, /Cloud cover/);
  assert.ok(await det.locator("[id^=h-temp-] .main-svg").count() > 0);
  await ev(() => render());   // stays open with charts after a re-render
  assert.equal(await ev(() => document.querySelector("#next details[data-models]").open), true);
  assert.ok(await page.locator("#next [id^=h-temp-] .main-svg").count() > 0);
  await page.locator("#next details[data-models] summary").click();
});
await test("offline banner", async () => {
  await ctx.setOffline(true);
  await page.waitForTimeout(200);
  assert.match(await page.textContent("#offline"), /Offline/);
  await ctx.setOffline(false);
  await page.waitForTimeout(200);
  assert.equal(await ev(() => $("offline").classList.contains("hidden")), true);
});
await test("PDF of the whole forecast", async () => {
  await ev(() => { $("sec-tour").open = true; });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#pdfBtn")]);
  assert.match(dl.suggestedFilename(), /forecast.*\.pdf$/);
});
await test("your exact case: old 'use my average' setting + 33 km days, distance set to 110", async () => {
  await ev(() => {
    localStorage.setItem("gpxweather.v1.settings", JSON.stringify({ models: [...S.models], autoGps: false, useHistory: true }));
    S.perDay = 110;
    S.days = { [addDays(todayStr(), -3)]: { start: 0, end: 33, closed: true }, [addDays(todayStr(), -2)]: { start: 33, end: 66, closed: true },
               [addDays(todayStr(), -1)]: { start: 66, end: 99, closed: true } };
    S.startKm = 99;
    return saveTourSettings();
  });
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  await page.waitForTimeout(500);
  assert.equal(await ev(() => planPerDay()), 110);
  assert.match(await page.textContent("#settingsSummary"), /110 km\/day/);
  const kms = await ev(() => S.stages.slice(0, -1).map((s) => Math.round(s.km)));
  assert.ok(kms.every((k) => k === 110), "stage km: " + kms);
  assert.match(await page.locator("#next .next-card").innerText(), /110\.0 km/);
  assert.match(await page.locator(".day-row").first().innerText(), /110 km/);
});

// Every setting must change the plan and every view of it (today card, coming days, table, summary).
const snapshot = () => ev(() => JSON.stringify({
  stages: S.stages.map((s) => [Math.round(s.a), Math.round(s.b), s.date, Math.round(s.hours * 60), Math.round(s.dep)]),
  today: $("next").innerText, table: $("coming").textContent, summary: $("settingsSummary").textContent,
  progress: $("progress").innerText,
}));
async function changes(name, act, check) {
  await test(`changing "${name}" updates the plan and every view`, async () => {
    await ev(() => { $("settings").open = true; $("moreSettings").open = true; });
    const before = JSON.parse(await snapshot());
    await act();
    await page.waitForTimeout(250);
    const after = JSON.parse(await snapshot());
    for (const key of ["stages", "today", "table"]) assert.notDeepEqual(after[key], before[key], `${key} did not change`);
    if (check) await check(after);
  });
}
const setNum = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, "change"); };
await changes("distance per day", () => setNum("#perDayNum", 70), (a) => assert.match(a.summary, /70 km\/day/));
await changes("distance slider", () => ev(() => { const r = $("perDay"); r.value = 95; r.dispatchEvent(new Event("input", { bubbles: true })); }),
  (a) => assert.match(a.summary, /95 km\/day/));
await changes("departure", () => setNum("#dep", "07:00"), (a) => assert.match(a.today, /07:00/));
await changes("flat speed", () => setNum("#flatSpeed", 26));
await changes("breaks", () => setNum("#breaks", 60));
await changes("weight", () => setNum("#mass", 140));
await changes("next stage day", () => page.selectOption("#date", { index: 2 }), (a) => assert.match(a.today, /Tue|Wed|Thu|Fri|Sat|Sun|Mon/));
await page.selectOption("#date", { index: 0 });
await changes("plan by hours", () => page.click('label:has(input[name="planMode"][value="hours"])'), (a) => assert.match(a.summary, /h\/day/));
await changes("hours per day", () => setNum("#hoursNum", 4), (a) => assert.match(a.summary, /4 h\/day/));
await page.click('label:has(input[name="planMode"][value="km"])');
await test("weather models: the count and the comparison follow the choice", async () => {
  const n = await ev(() => S.models.size);
  await page.locator('#models input').first().uncheck();
  await page.waitForTimeout(200);
  assert.equal(await ev(() => S.models.size), n - 1);
  await page.locator('#models input').first().check();
});
await test("settings are kept after a reload", async () => {
  await setNum("#perDayNum", 123);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.equal(await ev(() => S.perDay), 123);
  assert.equal(await ev(() => Math.round(S.stages[0].km)), 123);
});

await test("no errors in the console", async () => assert.deepEqual(errors, []));

await browser.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : "\nAll tests passed");
process.exit(failed ? 1 : 0);

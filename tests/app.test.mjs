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
  if (url.includes("overpass")) {
    const q = decodeURIComponent(route.request().postData().replace(/^data=/, "").replace(/\+/g, " "));
    if (!q.includes("camp_site")) return route.fulfill({ json: { elements: [] } });
    campQueries.push(q);
    return route.fulfill({ json: { elements: campElements } });
  }
  if (url.startsWith("https://brouter.de/brouter?")) {
    // Straight line with elevation; going to `brouterHill` means a 250 m climb on the way.
    brouterCalls.push(url);
    if (brouterDown) return route.fulfill({ body: "operation killed by thread-priority-watchdog" });   // BRouter's error text
    const [[lon0, lat0], [lon1, lat1]] = new URL(url).searchParams.get("lonlats").split("|").map((x) => x.split(",").map(Number));
    const hill = brouterHill && Math.hypot((lat1 - brouterHill.lat) * 111, (lon1 - brouterHill.lon) * 75) < 0.3;
    const coords = Array.from({ length: 41 }, (_, i) => {
      const f = i / 40;
      return [lon0 + (lon1 - lon0) * f, lat0 + (lat1 - lat0) * f, 400 + (hill ? 250 * Math.sin(Math.PI * Math.min(1, f * 1.6)) * (f < 0.625 ? 1 : 1) : 0)];
    });
    return route.fulfill({ json: { type: "FeatureCollection", features: [{ type: "Feature", properties: { messages: [["Longitude", "Latitude", "WayTags"]] }, geometry: { type: "LineString", coordinates: coords } }] } });
  }
  if (url.endsWith(".png")) return route.fulfill({ body: PNG, contentType: "image/png" });
  return route.fulfill({ status: 404, body: "" });
});
let campElements = [], campQueries = [];
let brouterCalls = [], brouterHill = null, brouterDown = false;   // BRouter mock   // what the campsite search returns / was asked
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
await test("the GPX button in the coming days opens a preview of the GPX, without opening the day", async () => {
  await page.locator(".day-row button[data-gpx]").first().click();
  assert.equal(await ev(() => $("gpxSheet").open), true);
  assert.match(await page.textContent("#gpxSheetText"), /^<\?xml[\s\S]*<trkpt lat=[\s\S]*more lines$/);
  assert.match(await page.textContent("#gpxSheetInfo"), /stage-\d+-\d{4}-\d\d-\d\d\.gpx · .* km · .* track points/);
  assert.equal(await page.locator(".day-detail").count(), 0, "the GPX button must not open the day");
});
await test("the preview's Share button hands over the GPX file (download off phones)", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gpxSheetShare")]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  assert.match(dl.suggestedFilename(), /stage-\d+-\d{4}-\d\d-\d\d\.gpx$/);
  assert.ok((gpx.match(/<trkpt/g) || []).length > 100);
});
await test("the preview's Copy button copies the GPX text itself", async () => {
  await page.click("#gpxSheetCopy");
  await page.waitForTimeout(200);
  const text = await ev(() => navigator.clipboard.readText());
  assert.match(text, /^<\?xml[\s\S]*<gpx[\s\S]*<trkpt lat=[\s\S]*<\/gpx>\s*$/);
  assert.match(await page.textContent("#status"), /GPX of stage \d+ copied/);
  assert.match(await page.textContent("#gpxSheetCopy"), /Copied/);
});
await test("the preview closes with ✕ and with a tap on the backdrop", async () => {
  await page.click("#gpxSheetClose");
  assert.equal(await ev(() => $("gpxSheet").open), false);
  await page.locator("#next [data-gpx]").click();
  assert.equal(await ev(() => $("gpxSheet").open), true);
  await page.mouse.click(195, 20);
  assert.equal(await ev(() => $("gpxSheet").open), false);
});
await test("on a phone the share menu gets only the file, no title (so 'Copy' isn't just the name)", async () => {
  const shared = await ev(async () => {
    let got = null;
    const m = window.matchMedia;
    window.matchMedia = (q) => (q === "(pointer: coarse)" ? { matches: true } : m.call(window, q));
    navigator.canShare = () => true;
    navigator.share = async (data) => { got = { keys: Object.keys(data).sort(), name: data.files[0].name, type: data.files[0].type, size: data.files[0].size }; };
    openGpxSheet(1);
    const label = $("gpxSheetShare").textContent;
    $("gpxSheetShare").click();
    await new Promise((r) => setTimeout(r, 100));
    $("gpxSheet").close();
    window.matchMedia = m; delete navigator.share; delete navigator.canShare;
    return { ...got, label };
  });
  assert.match(shared.label, /Share/);
  assert.deepEqual(shared.keys, ["files"]);
  assert.match(shared.name, /\.gpx$/);
  assert.equal(shared.type, "application/gpx+xml");
  assert.ok(shared.size > 10000);
});
await test("today's card has a single GPX share button and shows sunrise and sunset", async () => {
  assert.equal(await page.locator("#next [data-gpx]").count(), 1);
  assert.equal(await page.locator("[data-gpx-copy]").count(), 0);
  assert.match(await page.locator("#next .stage-head").innerText(), /🌅 \d\d:\d\d · 🌇 \d\d:\d\d/);
});
await test("every coming day shows sunrise and sunset", async () => {
  const rows = await page.locator(".day-row .dr-route").allInnerTexts();
  assert.ok(rows.length > 0);
  for (const r of rows) assert.match(r, /🌅 \d\d:\d\d 🌇 \d\d:\d\d/);
});
await test("campsites are searched along the end of the stage, close to the route", async () => {
  // Test campsites placed relative to today's stage end: km before the end, metres off the route (north).
  const k = await ev(() => S.stages.findIndex((st) => st.dayOffset >= 0));
  campElements = await ev((k) => {
    const st = S.stages[k];
    const at = (before, off, name) => { const p = pointAt(S.track, st.b - before * 1000); return { type: "node", lat: p.lat + off / 111320, lon: p.lon, tags: { tourism: "camp_site", name } }; };
    return [at(0, 100, "End Camp"), at(4, 800, "Four Km Camp"), at(15, 500, "Fifteen Km Camp"), at(2, 4000, "Far Off Camp")];
  }, k);
  await ev(() => { localStorage.removeItem("gpxweather.v1.camps"); campCache = {}; });
  await page.locator("#next [data-camp-open]").click();
  await page.waitForFunction(() => document.querySelectorAll("#next .camp-list li").length > 0);
  const q = campQueries.at(-1);
  assert.match(q, /around:2000,[\d.,]+\)/, "default: up to 2 km off the route");
  const coords = q.match(/around:2000,([\d.,]+)\)/)[1].split(",").length / 2;
  assert.ok(coords > 10, `searches along a line of the route, not one point (${coords} points)`);
  const names = await page.locator("#next .camp-list .name").allInnerTexts();
  assert.deepEqual(names.map((n) => n.replace("⛺ ", "")), ["End Camp", "Four Km Camp"], "last 10 km, 2 km off the route, closest to the end first");
  const facts = await page.locator("#next .camp-list li .muted").allInnerTexts();
  assert.match(facts[0], /at the stage end · right on the route/);
  const [, before, off] = facts[1].match(/^([\d.]+) km before the stage end \(km \d+\) · ([\d.]+) km off the route/);
  assert.ok(before > 3 && before <= 4.5 && off > 0.3 && off <= 0.8, facts[1]);   // the zig-zag route passes closer than where it was placed
  assert.match(await page.locator("#next details.camp > summary").innerText(), /along the end of this stage/);
});
await test("a longer stretch finds campsites earlier on the route; more distance finds ones further off", async () => {
  await page.locator("#next [data-camp-stretch]").selectOption("20");
  await page.waitForFunction(() => document.querySelectorAll("#next .camp-list li").length === 3);
  assert.match(campQueries.at(-1), /around:2000,/);
  await page.locator("#next [data-camp-radius]").selectOption("5");
  await page.waitForFunction(() => document.querySelectorAll("#next .camp-list li").length === 4);
  assert.match(campQueries.at(-1), /around:5000,/);
  assert.match(await page.locator("#next .camp-controls + p").innerText(), /in the last 20 km, up to 5 km off the route/);
});
await test("stretch 0 searches only around the stage end; the choice survives a reload", async () => {
  await page.locator("#next [data-camp-radius]").selectOption("2");
  await page.locator("#next [data-camp-stretch]").selectOption("0");
  await page.waitForFunction(() => document.querySelectorAll("#next .camp-list li").length === 1);
  assert.equal(campQueries.at(-1).match(/around:2000,([\d.,]+)\)/)[1].split(",").length, 2, "a single point");
  assert.match(await page.locator("#next .camp-list").innerText(), /End Camp/);
  const n = campQueries.length;
  await page.locator("#next [data-camp-radius]").selectOption("5");
  await page.locator("#next [data-camp-stretch]").selectOption("20");   // searched before: no new search
  await page.waitForFunction(() => document.querySelectorAll("#next .camp-list li").length === 4);
  assert.equal(campQueries.length, n + 1, "only the 0 km / 5 km step was new");
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.deepEqual(await ev(() => [campStretch, campRadius]), [20, 5]);
  await ev(() => { campStretch = 10; campRadius = 2; store("campStretch", 10); store("campRadius", 2); });
});
// A recorded ride along the route from km a to km b (optionally with a detour north), as GPX text.
async function rideAlong(a, b, startMs, detourKm = 0) {
  return ev(({ a, b, startMs, detourKm }) => {
    const pts = [];
    for (let d = a * 1000; d <= b * 1000; d += 100) {
      const p = pointAt(S.track, d);
      // the detour: halfway, ride north and back
      const mid = (a + b) * 500, off = detourKm && Math.abs(d - mid) < 1000 ? (1 - Math.abs(d - mid) / 1000) * detourKm * 1000 / 2 : 0;
      pts.push([p.lat + off / 111320, p.lon]);
    }
    return `<gpx><trk><trkseg>${pts.map(([lat, lon], i) =>
      `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>300</ele><time>${new Date(startMs + i * 18000).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
  }, { a, b, startMs, detourKm });
}
const sum2 = (a) => a.reduce((x, y) => x + y, 0);
async function upload(name, text) {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, text);
  await page.setInputFiles("#rideFile", f);
  await page.waitForTimeout(400);
}
await test("an uploaded ride counts as you rode it: real km in Completed, the tour total and the map", async () => {
  await ev(() => { S.days = {}; S.gps = null; S.approach = null; setStartKm(0, true, false); });
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(9, 0, 0, 0);
  await upload("detour.gpx", await rideAlong(0, 30, y.getTime(), 4));   // 30 km of route + a detour 1 km north and back (≈ +2.5 km)
  const d = await ev(() => completedDays().find((x) => x.date));
  assert.ok(d.real.km > 32 && d.real.km < 33.5, "recorded km " + d.real.km);
  assert.ok(Math.abs(d.km - 30) < 0.5, "planned km " + d.km);
  await ev(() => { $("sec-done").open = true; });
  assert.match(await page.locator("#done-list tbody tr").first().innerText(), /📍\s*3[23][.,]\d/);
  const total = await ev(() => tourKm()), planned = await ev(() => S.track.total / 1000);
  assert.ok(Math.abs(total - (planned + d.real.km - 30)) < 0.6, `tour total ${total} vs planned ${planned}`);
  assert.match(await page.textContent("#progress"), /Ridden\s*3[23] of [\d.,]+ km · planned/);
  assert.deepEqual(await ev(() => unrecordedRidden()), [], "no planned line drawn under the recording");
});
await test("several GPX files of one day add up; the same file twice counts once", async () => {
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(15, 0, 0, 0);
  const afternoon = await rideAlong(30, 50, y.getTime());
  await upload("afternoon.gpx", afternoon);
  const one = await ev(() => completedDays().filter((x) => x.date));
  assert.equal(one.length, 1, "still one day");
  assert.equal(one[0].rec.parts.length, 2);
  assert.ok(one[0].real.km > 52 && one[0].real.km < 54, "morning + afternoon " + one[0].real.km);
  assert.ok(Math.abs(one[0].rec.elapsedH - sum2(one[0].rec.parts.map((p) => p.elapsedH))) < 1e-9 && one[0].rec.elapsedH < 3,
    "time on the road: both recordings added, not the long stop between them " + one[0].rec.elapsedH);
  await upload("afternoon-again.gpx", afternoon);
  const again = await ev(() => completedDays().filter((x) => x.date)[0]);
  assert.equal(again.rec.parts.length, 2);
  assert.ok(Math.abs(again.real.km - one[0].real.km) < 0.01);
  assert.match(await page.textContent("#status"), /replaced/);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#done-list [data-done-gpx]").first().click()]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  assert.equal((gpx.match(/<trkseg>/g) || []).length, 2, "the recorded GPX has both parts");
  assert.match(gpx, /as ridden/);
});
await test("the next day starts at the campsite: BRouter leads back to the route, not up the hill to the nearest point", async () => {
  // The ride ended at route km ~50. Now you're at a campsite 1.2 km north of the route near km 50.5.
  const loc = await ev(() => { const p = pointAt(S.track, 50500); return { lat: p.lat + 1200 / 111320, lon: p.lon }; });
  const near = await ev((loc) => nearestKm(S.track, loc.lat, loc.lon), loc);
  brouterHill = await ev((km) => { const p = pointAt(S.track, km * 1000); return { lat: p.lat, lon: p.lon }; }, near.km);
  brouterCalls = [];
  await ev((loc) => { S.gps = { ...loc, t: Date.now() }; recompute(); }, loc);
  await page.waitForFunction(() => S.approach && S.stages[0].approach);
  const ap = await ev(() => S.stages[0].approach);
  assert.ok(brouterCalls.length >= 3, "several points of the route were tried: " + brouterCalls.length);
  assert.ok(ap.join - near.km * 1000 > 300, `joins ahead of the nearest point (${ap.join} vs ${near.km * 1000}) – avoids the climb`);
  assert.ok(ap.up < 50, "the chosen way has no big climb: " + ap.up);
  const st = await ev(() => { const s = S.stages[0]; return { a: s.a, km: s.km, routeKm: (s.b - s.a) / 1000, hours: s.hours, startAt: stageSegments(s)[0][0] }; });
  assert.equal(st.a, ap.join, "the day continues on the route from the join point");
  assert.ok(Math.abs(st.km - st.routeKm - ap.km) < 0.01, "the way back counts towards the day");
  assert.ok(Math.abs(st.km - (await ev(() => planPerDay()))) < 0.5, "distance mode: the day's km include the way back: " + st.km);
  const hrs = await ev(() => { S.planMode = "hours"; recompute(); const s = S.stages[0]; const r = [s.hours, s.approach.moving * s.breaks, S.hoursPerDay]; S.planMode = "km"; recompute(); return r; });
  assert.ok(Math.abs(hrs[0] - hrs[2]) < 0.35 && hrs[1] > 0.1, "riding-time mode: the way back is part of the day's hours: " + hrs);
  assert.ok(Math.abs(st.startAt[0] - loc.lat) < 1e-4 && Math.abs(st.startAt[1] - loc.lon) < 1e-4, "the day's GPX starts at the campsite");
  assert.match(await page.locator("#next").innerText(), /🧭 The day starts at your GPS position: [\d.,]+ km .* back to the route at km/);
  // the GPX in the share sheet starts at the campsite too
  await page.locator("#next [data-gpx]").click();
  assert.match(await page.textContent("#gpxSheetText"), new RegExp(`<trkpt lat="${loc.lat.toFixed(6).slice(0, 7)}`));
  await ev(() => $("gpxSheet").close());
});
await test("on the route (under 200 m) no way back is planned; without BRouter the GPX starts on the route", async () => {
  await ev(() => { const p = pointAt(S.track, S.startKm * 1000); S.gps = { lat: p.lat + 100 / 111320, lon: p.lon, t: Date.now() }; recompute(); });
  assert.equal(await ev(() => !!S.stages[0].approach), false);
  assert.equal(await ev(() => S.stages[0].a), await ev(() => S.startKm * 1000));
  brouterDown = true;
  await ev(() => { const p = pointAt(S.track, S.startKm * 1000 + 300); S.gps = { lat: p.lat - 900 / 111320, lon: p.lon, t: Date.now() }; recompute(); });
  await page.waitForFunction(() => /could not be planned/.test($("next").innerText));
  assert.equal(await ev(() => !!S.stages[0].approach), false);
  brouterDown = false; brouterHill = null;
  // already riding today (20 km done), then a stop 500 m off the route: no way back is planned
  const n0 = brouterCalls.length;
  await ev(() => { S.days[todayStr()] = { start: S.startKm, end: S.startKm + 20 }; S.startKm += 20; const p = pointAt(S.track, S.startKm * 1000); S.gps = { lat: p.lat + 500 / 111320, lon: p.lon, t: Date.now() }; recompute(); });
  await page.waitForTimeout(300);
  assert.equal(await ev(() => approachNeed()), null);
  assert.equal(brouterCalls.length, n0);
  await ev(() => { S.days = {}; S.gps = null; S.approach = null; setStartKm(0, true, false); return saveTourSettings(); });
});
await test("a ride with heart rate, power and cadence shows them in Completed, with a chart of each", async () => {
  await ev(() => { S.days = {}; S.gps = null; S.approach = null; setStartKm(0, true, false); });
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(9, 0, 0, 0);
  // 20 km at 20 km/h; heart rate 130/150 in turns, 150 W in the first half and 250 W in the second, 85 rpm
  const gpx = await ev((t0) => {
    let pts = "";
    for (let i = 0; i <= 200; i++) {
      const p = pointAt(S.track, i * 100);
      pts += `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>300</ele><time>${new Date(t0 + i * 18000).toISOString()}</time>` +
        `<extensions><power>${i <= 100 ? 150 : 250}</power><gpxtpx:TrackPointExtension><gpxtpx:hr>${i % 2 ? 150 : 130}</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`;
    }
    return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>${pts}</trkseg></trk></gpx>`;
  }, y.getTime());
  await upload("sensors.gpx", gpx);
  const r = await ev(() => rideStats(completedDays().find((d) => d.date).rec));
  assert.ok(Math.abs(r.hrAvg - 140) < 1.5 && r.hrMax === 150, "heart rate " + r.hrAvg + " / " + r.hrMax);
  assert.ok(Math.abs(r.pAvg - 200) < 3 && r.pMax === 250, "power " + r.pAvg);
  assert.ok(Math.abs(r.np - (((150 ** 4 + 250 ** 4) / 2) ** 0.25)) < 3, "normalized power " + r.np);   // ≈ 217 W
  assert.ok(Math.abs(r.cad - 85) < 0.5 && Math.abs(r.vAvg - 20) < 0.5 && r.vMax < 22, `cadence ${r.cad}, speed ${r.vAvg}/${r.vMax}`);
  await ev(() => { $("sec-done").open = true; });
  await page.locator("#done-list [data-ride-open]").click();
  const text = await page.locator("#done-list .ride-detail").innerText();
  assert.match(text, /❤️ Heart rate\s*14\d bpm\s*average · max 150/);
  assert.match(text, /⚡ Power\s*(199|200|201) W\s*average · normalized \d+ · max 250/);
  assert.match(text, /🔄 Cadence\s*85 rpm/);
  assert.match(text, /🚴 Speed\s*20[.,]\d km\/h/);
  await page.waitForFunction(() => document.querySelector("#done-list .track-chart .main-svg"));
  // like gpx.studio: elevation on top, then speed, heart rate and power (cadence and temperature can be switched on)
  const labels = async () => ev(() => [...document.querySelectorAll("#done-list .track-chart .annotation-text")].map((e) => e.textContent));
  assert.deepEqual(await labels(), ["⛰️ Elevation", "🚴 Speed (km/h)", "❤️ Heart rate (bpm)", "⚡ Power (W)"]);
  assert.deepEqual(await page.locator("#done-list .track-chart [data-layer]").allInnerTexts(), ["📐 Gradient", "🚴 Speed", "❤️ Heart rate", "⚡ Power", "🔄 Cadence"]);
  await page.locator('#done-list .track-chart [data-layer="hr"]').click();
  await page.locator('#done-list .track-chart [data-layer="cad"]').click();
  assert.deepEqual(await labels(), ["⛰️ Elevation", "🚴 Speed (km/h)", "⚡ Power (W)", "🔄 Cadence (rpm)"], "each row can be switched on and off");
  assert.deepEqual(await ev(() => JSON.parse(localStorage.getItem("gpxweather.v1.chartLayers"))), { hr: false, cad: true }, "the choice is remembered");
  await page.locator('#done-list .track-chart [data-layer="hr"]').click();
  await page.locator('#done-list .track-chart [data-layer="cad"]').click();
  // pointing at km 15 shows every value there, and the spot on the ride's map
  assert.match(await page.textContent("#done-list .tc-readout"), /^(19[.,]\d|20[.,]0) km · ↑ 0 m ↓ 0 m/);
  await ev(() => document.querySelector("#done-list .tc-plot").scrollIntoView({ block: "center" }));
  const box = await page.locator("#done-list .tc-plot .nsewdrag").last().boundingBox();   // the bottom row (power)
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.waitForTimeout(300);
  assert.match(await page.textContent("#done-list .tc-readout"), /^km 15[.,]\d · ⛰️ 300 m · 📐 [+]?0[.,]0 % · 🚴 20[.,]\d km\/h · ❤️ 1[34]\d bpm · ⚡ 250 W · 🔄 85 rpm$/);
  assert.equal(await ev(() => document.querySelectorAll("#done-list .day-map-el .leaflet-interactive").length), 2, "track + position marker on the ride's map");
  await page.locator("#done-list [data-ride-open]").click();
  assert.equal(await page.locator("#done-list .ride-detail").count(), 0, "📈 closes the details again");
});
await test("a planned day shows its elevation profile coloured by gradient", async () => {
  await ev(() => { const d = document.querySelector("#next details[data-more]"); d.open = true; });
  await page.waitForFunction(() => document.querySelector("#next .track-chart .main-svg"));
  assert.ok(await ev(() => document.querySelectorAll("#next .track-chart .bars path").length > 100), "the profile is drawn");
  // the test tour is nearly flat, so check the colours on a made-up hill: 5 km up at 10 %, 5 km down at 5 %
  const hill = await ev(async () => {
    const km = [], ele = [];
    for (let i = 0; i <= 200; i++) { const x = i * 0.05; km.push(x); ele.push(x <= 5 ? 300 + x * 100 : 800 - (x - 5) * 50); }
    const el = document.createElement("div"); document.body.appendChild(el);
    const tc = { el, data: { km, ele, slope: gradients(km, ele) }, kind: "plan", id: "x" };
    drawTrackChart(tc);
    const fills = [...el.querySelectorAll(".bars path")].map((b) => b.style.fill);
    const res = { up: tc.data.slope[50], down: tc.data.slope[150], colors: [...new Set(fills)], readout: el.querySelector(".tc-readout").textContent };
    el.remove();
    return res;
  });
  assert.ok(Math.abs(hill.up - 10) < 0.5 && Math.abs(hill.down + 5) < 0.5, `gradients ${hill.up} / ${hill.down}`);
  assert.ok(hill.colors.includes("rgb(214, 69, 42)") && hill.colors.includes("rgb(79, 143, 214)"), "↑ 8–12 % red, ↓ 4–8 % blue: " + hill.colors);
  assert.match(hill.readout, /^10[.,]0 km · ↑ 500 m ↓ 250 m · 300–800 m · steepest 10 % up, 5 % down$/);
  assert.match(await page.textContent("#next .tc-legend"), /↓ 8\+.*flat.*↑ 12\+/s);
  assert.deepEqual(await page.locator("#next .track-chart [data-layer]").allInnerTexts(), ["📐 Gradient"], "a plan has no sensor data");
  await page.locator('#next .track-chart [data-layer="slope"]').click();
  assert.equal(await page.locator("#next .tc-legend").count(), 0, "gradient colours switched off");
  await page.locator('#next .track-chart [data-layer="slope"]').click();
  await ev(() => { document.querySelector("#next details[data-more]").open = false; });
});
await test("a ride uploaded by an older version asks for the GPX again instead of showing nothing", async () => {
  await ev(() => { const e = Object.values(S.days)[0]; e.rec.parts.forEach((p) => delete p.metrics); rideOpen.add(Object.keys(S.days)[0]); renderDone(); });
  assert.match(await page.locator("#done-list .ride-detail").innerText(), /Upload the GPX of .* again/);
  await ev(() => { rideOpen.clear(); S.days = {}; setStartKm(0, true, false); });
});
await test("replacing the route keeps the ridden days and uploaded rides, placed on the new route", async () => {
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(9, 0, 0, 0);
  await upload("day1.gpx", await rideAlong(0, 40, y.getTime()));
  const before = await ev(() => ({ total: S.track.total, startKm: S.startKm, id: S.tourId, tours: S.tours.length, day: Object.values(S.days)[0] }));
  // the same start, but from km 150 on a different way (further north) and 30 km longer
  const gpx = await ev(() => {
    let pts = "";
    for (let d = 0; d <= S.track.total; d += 100) {
      const p = pointAt(S.track, d), f = Math.max(0, d - 150000) / 1000;
      pts += `<trkpt lat="${(p.lat + f * 0.0006).toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele></trkpt>`;
    }
    const e = pointAt(S.track, S.track.total);
    for (let k = 1; k <= 300; k++) pts += `<trkpt lat="${(e.lat + 225 * 0.0006 + k * 0.0009).toFixed(6)}" lon="${e.lon.toFixed(6)}"><ele>300</ele></trkpt>`;
    return `<gpx><trk><name>New way</name><trkseg>${pts}</trkseg></trk></gpx>`;
  });
  fs.writeFileSync(path.join(tmp, "newroute.gpx"), gpx);
  await ev(() => { $("sec-tour").open = true; });
  await page.setInputFiles("#replaceFile", path.join(tmp, "newroute.gpx"));
  await page.waitForFunction(() => /Route replaced/.test($("status").textContent));
  const after = await ev(() => ({ total: S.track.total, startKm: S.startKm, id: S.tourId, tours: S.tours.length, day: Object.values(S.days)[0], name: S.track.name }));
  assert.equal(after.id, before.id, "same tour");
  assert.equal(after.tours, before.tours, "no second tour");
  assert.equal(after.name, "Test Tour", "the tour keeps its name");
  assert.ok(after.total > before.total + 30000, `new length ${after.total} vs ${before.total}`);
  assert.ok(Math.abs(after.startKm - before.startKm) < 1, "position kept: " + after.startKm);
  assert.ok(Math.abs(after.day.start - before.day.start) < 1 && Math.abs(after.day.end - before.day.end) < 1, "ride placed on the new route");
  assert.ok(after.day.rec && after.day.rec.parts.length === 1, "the upload is kept");
  assert.match(await page.textContent("#status"), /Route replaced: \d+ km \(was 37\d\)\. 1 uploaded ride kept\./);
  // survives a reload
  await page.reload();
  await page.waitForFunction(() => S.stages.length > 0);
  assert.ok(Math.abs((await ev(() => S.track.total)) - after.total) < 1);
  assert.equal(await ev(() => Object.keys(S.days).length), 1);
});
await test("a new route that starts where you are keeps the ridden part in front; Undo brings the old route back", async () => {
  await ev(() => { setStartKm(40, true, false); setStatus(""); });
  const old = await ev(() => ({ total: S.track.total, p20: pointAt(S.track, 20000), p40: pointAt(S.track, 40000) }));
  // planned from here: 100 km straight north
  const gpx = await ev(() => {
    const p = pointAt(S.track, 40000);
    let pts = "";
    for (let k = 0; k <= 1000; k++) pts += `<trkpt lat="${(p.lat + 0.001 + k * 0.0009).toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>300</ele></trkpt>`;
    return `<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`;
  });
  fs.writeFileSync(path.join(tmp, "fromhere.gpx"), gpx);
  await page.setInputFiles("#replaceFile", path.join(tmp, "fromhere.gpx"));
  await page.waitForFunction(() => /Route replaced/.test($("status").textContent));
  const now = await ev(() => ({ total: S.track.total, startKm: S.startKm, p20: pointAt(S.track, 20000), day: Object.values(S.days)[0], gaps: S.track.cumGap[S.track.cumGap.length - 1] }));
  assert.ok(Math.abs(now.total - 140000) < 2000, "40 km ridden + 100 km new: " + now.total);
  assert.ok(Math.abs(now.startKm - 40) < 0.5, "you are still at km 40: " + now.startKm);
  assert.ok(Math.abs(now.p20.lat - old.p20.lat) < 1e-3 && Math.abs(now.p20.lon - old.p20.lon) < 1e-3, "the ridden part is the old route");
  assert.ok(Math.abs(now.day.end - 40) < 1, "the ride stays where it was");
  assert.equal(now.gaps, 0, "no gap where the new route starts");
  assert.match(await page.textContent("#status"), /The 40 km you rode stay in front/);
  assert.ok((await ev(() => S.stages[0].a)) >= 39500, "the plan continues on the new route");
  await page.click("#undoBtn");
  await page.waitForFunction((t) => Math.abs(S.track.total - t) < 1, old.total);
  assert.ok(Math.abs((await ev(() => S.track.total)) - old.total) < 1, "Undo: the route before");
  await ev(() => { S.days = {}; setStartKm(0, true, false); return saveTourSettings(); });
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
  assert.match(detail, /Distance/); assert.match(detail, /Share GPX/); assert.match(detail, /🌅/); assert.match(detail, /👕/);
  assert.equal(await page.locator(`.day-row[data-open-stage="${k}"] [data-gpx]`).count(), 0, "one GPX button per open day, not two");
  assert.equal(await page.locator(".day-detail [data-gpx]").count(), 1);
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

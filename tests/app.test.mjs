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
      weather_code: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], sunshine_duration: [] };
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Berlin", acceptDownloads: true, serviceWorkers: "block" });
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
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.log("✗", name, "\n   ", e.message.split("\n")[0]); }
}

await page.goto(base);
await page.setInputFiles("#file", gpxFile);
await page.waitForFunction(() => S.stages.length > 0 && S.tourId);
await page.waitForTimeout(1500);

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
await test("GPX download from the coming days list", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".day-row button[data-gpx]").first().click()]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  assert.match(dl.suggestedFilename(), /stage-\d+-\d{4}-\d\d-\d\d\.gpx$/);
  assert.ok((gpx.match(/<trkpt/g) || []).length > 100);
});
await test("tapping a coming day opens its card with hourly charts", async () => {
  await page.locator(".day-row .dr-main").first().click();
  await page.waitForTimeout(800);
  assert.equal(await ev(() => $("sec-stages").open), true);
  assert.ok(await page.locator("[id^=h-temp-] .main-svg").count() > 0);
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
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#pdfBtn")]);
  assert.match(dl.suggestedFilename(), /forecast.*\.pdf$/);
});
await test("no errors in the console", async () => assert.deepEqual(errors, []));

await browser.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : "\nAll tests passed");
process.exit(failed ? 1 : 0);

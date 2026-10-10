# GPX Weather

A web app for multi-day bike tours. Load a GPX file, choose how far you ride per
day, and get a weather report for every daily stage – from several forecast
models side by side, so you can see whether they agree.

Everything runs in your browser. There is no server, no account and no API key.

![App icon](icon-192.png)

## Features

- **Daily stages**: a slider sets the kilometres per day; the rest of the route
  is split into stages from your start date and departure time.
- **Your position**: tap "📍 Update my position" (GPS), tap the route on the map,
  or use the km slider. Only the part ahead of you is planned. After you have
  used GPS once, the position is updated automatically whenever the app opens
  (can be switched off in the settings).
- **Per stage**: distance, climb and descent, elevation profile, riding time,
  sunrise/sunset, temperature (and how cold it feels), rain amount and
  probability, wind speed and direction, gusts, **head- or tailwind relative to
  your direction of travel**, sunshine, and the night low at the stage end.
- **Weather where you will be**: the forecast is read hour by hour at the place
  you are expected to be at that time, not at a single point.
- **Model comparison**: ECMWF, ICON, GFS, Météo-France (and optionally UK Met
  Office) from [Open-Meteo](https://open-meteo.com/). Each stage shows the
  median, the spread between the models and a clear "models agree / disagree"
  rating.
- **GPX per stage**: every stage has a "⬇ GPX of this stage" button. The file
  contains the original track points of that stage (full detail), start and end
  waypoints and the stage data in its description. On the iPhone it opens the
  share sheet, so you can save it to Files or open it directly in a navigation
  app (Komoot, OsmAnd, Garmin, …).
- **Bike map**: [CyclOSM](https://www.cyclosm.org/) as the base map (switchable
  to the standard OpenStreetMap map).
- **Saved tours**: every GPX you load is stored on your device. Several tours
  can be kept and switched in the list at the top. When you open the app again,
  everything is there immediately – the last position, settings and the last
  known weather – and only the position and the weather are updated.
- **Works on the phone and offline**: the layout is made for phones. Once
  opened, the app also starts without a connection and shows the last saved
  weather.
- **Large files**: tracks with 100 000+ points load in a few seconds. Gaps
  between GPX sections (e.g. a ferry) are shown dashed and counted as straight
  lines.
- **Gentle on the free APIs**: weather is fetched on a fixed 20 km grid along
  the route, only as far ahead as each model forecasts, with up to 50 places per
  request, and cached for 3 hours. Moving sliders or reopening the app does not
  trigger new requests. If a service answers "limit reached", that model pauses
  for 30 minutes.

## Use it on the iPhone

The app needs to be served over https once; the easiest way is GitHub Pages,
which is free for this public repository.

### 1. Publish the app (once)

1. Make sure the app files (`index.html`, `sw.js`, `manifest.webmanifest` and
   the `*.png` icons) are on the `main` branch.
2. On GitHub open the repository → **Settings** → **Pages**.
3. Under **Build and deployment** choose **Source: Deploy from a branch**,
   **Branch: `main`**, folder **`/ (root)`**, and press **Save**.
4. After a minute the app is live at
   **https://leonvolles.github.io/GPXweather/**

### 2. Install it on the iPhone

1. Open **https://leonvolles.github.io/GPXweather/** in **Safari**.
2. Tap the **Share** button (square with arrow) → **Add to Home Screen** → **Add**.
3. From now on, start "GPX Weather" from the home screen. It opens full screen
   like a normal app and also starts without a connection.

### 3. Load your tour

1. Save the GPX file in the **Files** app first (e.g. from Komoot, Strava,
   Ride with GPS or a mail attachment: *Share → Save to Files*).
2. In GPX Weather tap **＋ Load GPX** and pick the file. The route, map and
   stages appear immediately; the weather follows a few seconds later.
3. Tap **📍 Update my position** and allow location access ("Allow While Using
   App"). If you declined by mistake: iPhone **Settings → Privacy & Security →
   Location Services → Safari Websites → While Using the App**.

### Good to know on the iPhone

- The home-screen app and a Safari tab keep **separate** data. Load your GPX in
  the app you will actually use (the home-screen app is recommended).
- Safari may delete data of websites that were not used for several weeks.
  Home-screen apps are not affected by this.
- The map tiles need a connection; without one, the route is still shown.

## Privacy and security

- The GPX file never leaves your device. Tours, settings and cached weather are
  stored only in the browser (IndexedDB / localStorage) of that device.
- The app sends only coordinates to these free public services, without any
  key, account or personal data:
  - [Open-Meteo](https://open-meteo.com/) – weather (points every 20 km along
    the route) and, only if the GPX has no elevation, elevation data.
  - [BigDataCloud](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api)
    – town names for stage start and end points.
  - [CyclOSM](https://www.cyclosm.org/) / [OpenStreetMap](https://www.openstreetmap.org/)
    – map tiles of the area you look at.
- The libraries Leaflet and Plotly are loaded from unpkg.com and cdn.plot.ly.
- The repository contains no API keys, passwords or other secrets.

## Run it locally

Open `index.html` in a browser (double-click works). Offline support and
"Add to Home Screen" only work when the files are served over http(s), e.g.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app (HTML, CSS and JavaScript in one file) |
| `sw.js` | Service worker: keeps the app usable offline |
| `manifest.webmanifest`, `*.png` | App name and icons for the home screen |
| `eurovelo6_wetter.py` | The original Colab/Jupyter script for a fixed EuroVelo 6 itinerary (Nantes → Basel), writes a static HTML report |

## Data sources and licences

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0), based on
ECMWF, DWD, NOAA, Météo-France and UK Met Office models. Elevation: Copernicus
DEM via Open-Meteo. Map: CyclOSM, map data © OpenStreetMap contributors (ODbL).
Not an official weather warning service.

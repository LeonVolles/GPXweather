# GPXweather

Weather planner for multi-day bike tours.

## Web app (`index.html`)

A single, self-contained HTML file. Open it in any modern browser (double-click
works, no server or install needed) and drop in a GPX file.

- **Daily stages**: a slider sets the kilometres per day; the remaining track is
  cut into day stages starting from the chosen date and departure time.
- **Current position**: set it with the km slider, by clicking on the map, or with
  "📍 Mein Standort" (browser geolocation, snapped to the nearest track point).
  Only the part of the track ahead of you is planned.
- **Per stage**: distance, climbing/descent, elevation profile, riding time,
  sunrise/sunset, temperature, rain amount and probability, wind speed and
  direction, gusts, head-/tailwind relative to your direction of travel, and the
  night low at the stage end.
- **Time-matched weather**: the weather is read hour by hour at the place you
  will be at that time, not at a single point.
- **Model comparison**: ECMWF, ICON, GFS, Météo-France (and optionally UK Met
  Office) are fetched live from [Open-Meteo](https://open-meteo.com/). Each stage
  shows the median, the spread between the models and whether they agree or
  disagree.
- **Preview first**: the route, map, elevation profile and stages appear as soon
  as the GPX is read, before any weather request. They stay usable when no
  weather data is available (offline, API error, stage too far ahead). If the
  map or chart library can't load, a simplified SVG route and profile are drawn.
- **Large files**: the track is resampled to at most ~8000 evenly spaced points,
  so files with 100 000+ points load in a few seconds. Gaps between GPX sections
  (e.g. a ferry or missing sections) are shown dashed and counted as straight
  lines.
- **Gentle on the APIs**: weather is fetched on a fixed 20 km grid along the
  route, only as far as each model's forecast reaches, with up to 50 locations
  per request. Results are cached in the browser (IndexedDB) for 3 hours, so
  moving sliders or reloading the page reuses them. A rate-limit answer pauses
  that model for 30 minutes and errors for 2 minutes, even across reloads;
  "Wetter neu laden" never refetches data younger than 15 minutes.
- If the GPX has no elevation data, it is filled in from the Open-Meteo
  elevation API (at most ~15 requests).
- The track, position and settings are remembered in the browser for the next
  visit.

Forecasts reach up to 16 days ahead; stages further out show no weather yet.

## Python script (`eurovelo6_wetter.py`)

The original Colab/Jupyter script for a fixed EuroVelo 6 itinerary
(Nantes → Basel). It writes `eurovelo6_wetter.html`.

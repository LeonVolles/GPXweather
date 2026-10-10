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
- If the GPX has no elevation data, it is filled in from the Open-Meteo
  elevation API.
- The track, position and settings are remembered in the browser for the next
  visit.

Forecasts reach up to 16 days ahead; stages further out show no weather yet.

## Python script (`eurovelo6_wetter.py`)

The original Colab/Jupyter script for a fixed EuroVelo 6 itinerary
(Nantes → Basel). It writes `eurovelo6_wetter.html`.

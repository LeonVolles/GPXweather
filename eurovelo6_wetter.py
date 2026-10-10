import html as htmllib
import json
import math
import statistics
import urllib.parse
import urllib.request

from datetime import date, datetime, timedelta
from pathlib import Path

from IPython.display import HTML, display

START = date(2026, 10, 10)

STAGES = [
    ("Nantes", "Angers", 47.35, -1.05),
    ("Angers", "Chinon", 47.28, -0.15),
    ("Chinon", "Blois", 47.42, 0.79),
    ("Blois", "Gien", 47.78, 1.98),
    ("Gien", "Nevers", 47.25, 2.91),
    ("Nevers", "Digoin", 46.75, 3.55),
    ("Digoin", "Dole", 46.78, 4.85),
    ("Dole", "Montbeliard", 47.30, 6.05),
    ("Montbeliard", "Basel", 47.64, 7.30),
]

MODELS = {
    "ECMWF": "ecmwf_ifs025",
    "ICON": "icon_seamless",
    "GFS": "gfs_seamless",
}

VARS = (
    "temperature_2m,precipitation,precipitation_probability,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,sunshine_duration"
)


def load(lat, lon, model):
    parameters = {
        "latitude": lat,
        "longitude": lon,
        "hourly": VARS,
        "models": model,
        "timezone": "Europe/Paris",
        "forecast_days": 16,
        "wind_speed_unit": "kmh",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(parameters)
    request = urllib.request.Request(url, headers={"User-Agent": "EV6-weather/2.2"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["hourly"]


def compass(deg):
    if deg is None:
        return "-"
    names = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO",
             "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return names[int((deg + 11.25) // 22.5) % 16]


def period(h, start_dt, end_dt):
    ids = [
        i for i, t in enumerate(h["time"])
        if start_dt <= datetime.fromisoformat(t) < end_dt
    ]
    if not ids:
        return None

    def vals(key):
        values = h.get(key, [])
        return [values[i] for i in ids if i < len(values) and values[i] is not None]

    temp = vals("temperature_2m")
    rain = vals("precipitation")
    gust = vals("wind_gusts_10m")
    prob = vals("precipitation_probability")
    sun = vals("sunshine_duration")

    if not temp or not rain or not gust:
        return None

    speeds = h.get("wind_speed_10m", [])
    dirs = h.get("wind_direction_10m", [])
    pairs = [
        (speeds[i], dirs[i]) for i in ids
        if i < len(speeds) and i < len(dirs)
        and speeds[i] is not None and dirs[i] is not None
    ]

    if pairs:
        x = sum(s * math.sin(math.radians(d)) for s, d in pairs)
        y = sum(s * math.cos(math.radians(d)) for s, d in pairs)
        wind_dir = (math.degrees(math.atan2(x, y)) + 360) % 360
        wind_speed = sum(s for s, _ in pairs) / len(pairs)
    else:
        wind_dir = None
        wind_speed = None

    return {
        "lo": min(temp),
        "hi": max(temp),
        "rain": sum(rain),
        "prob": max(prob) if prob else None,
        "speed": wind_speed,
        "dir": wind_dir,
        "gust": max(gust),
        "sun": sum(sun) / 3600 if sun else None,
    }


def day_period(h, d):
    base = datetime.combine(d, datetime.min.time())
    return period(h, base + timedelta(hours=7), base + timedelta(hours=19))


def night_period(h, d):
    base = datetime.combine(d, datetime.min.time())
    return period(h, base + timedelta(hours=19), base + timedelta(hours=31))


def med(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def mean_dir(directions):
    directions = [d for d in directions if d is not None]
    if not directions:
        return None
    x = sum(math.sin(math.radians(d)) for d in directions)
    y = sum(math.cos(math.radians(d)) for d in directions)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def fmt(value, spec=".0f", unit=""):
    return "-" if value is None else f"{value:{spec}}{unit}"


def ptxt(value):
    return "-" if value is None else f"{value:.0f} %"


def wind(value):
    if not value or value["dir"] is None or value["speed"] is None:
        return "Wind -"
    return f"Wind {value['speed']:.0f} km/h aus {compass(value['dir'])} ({value['dir']:.0f}°)"


def detail_text(value):
    if not value:
        return "noch ausserhalb des Modellhorizonts"
    return (
        f"{value['rain']:.1f} mm, "
        f"{value['lo']:.0f}-{value['hi']:.0f} °C, "
        f"Regenrisiko max. {ptxt(value['prob'])}, "
        f"{wind(value)}, "
        f"Böen {value['gust']:.0f} km/h"
    )


def short_rain(value):
    if not value:
        return "-"
    return f"{value['rain']:.1f} mm / {ptxt(value['prob'])}"


def combined_summary(values, label):
    good = [v for v in values if v]
    if not good:
        return f"{label}: noch keine Modelldaten verfügbar"

    rains = sorted(v["rain"] for v in good)
    median_rain = rains[len(rains) // 2]
    low = min(v["lo"] for v in good)
    high = max(v["hi"] for v in good)
    gust = max(v["gust"] for v in good)

    directions = [v["dir"] for v in good if v["dir"] is not None]
    speeds = [v["speed"] for v in good if v["speed"] is not None]

    if directions and speeds:
        avg_dir = mean_dir(directions)
        avg_speed = sum(speeds) / len(speeds)
        wind_text = f"Wind ca. {avg_speed:.0f} km/h aus {compass(avg_dir)}"
    else:
        wind_text = "Wind -"

    return (
        f"{label}: {low:.0f}-{high:.0f} °C · "
        f"Regen {median_rain:.1f} mm ({min(rains):.1f}-{max(rains):.1f}) · "
        f"{wind_text} · Böen bis {gust:.0f} km/h"
    )


def model_line(name, day, night):
    if not day:
        return f"<b>{name}</b>: keine Daten"
    text = (
        f"<b>{name}</b><br>"
        f"&nbsp;&nbsp;☀️ {day['rain']:.1f} mm, {day['lo']:.0f}-{day['hi']:.0f} °C, "
        f"Risiko {fmt(day['prob'], '.0f', ' %')}, "
        f"Wind {fmt(day['speed'])} km/h {compass(day['dir'])}, "
        f"Böen {day['gust']:.0f}, Sonne {fmt(day['sun'], '.1f', ' h')}"
    )
    if night:
        text += (
            f"<br>&nbsp;&nbsp;🌙 {night['rain']:.1f} mm, "
            f"{night['lo']:.0f}-{night['hi']:.0f} °C, "
            f"Wind {fmt(night['speed'])} km/h {compass(night['dir'])}, "
            f"Böen {night['gust']:.0f}"
        )
    return text


def build_card(number, start, destination, stage_date, days, nights, context):
    available_day = sum(v is not None for v in days.values())
    available_night = sum(v is not None for v in nights.values())
    good_day = [v for v in days.values() if v]

    if good_day:
        rains = sorted(v["rain"] for v in good_day)
        median_rain = rains[len(rains) // 2]
        max_gust = max(v["gust"] for v in good_day)
        if median_rain < 2 and max_gust < 45:
            color = "green"
        elif median_rain < 7 and max_gust < 55:
            color = "gold"
        else:
            color = "orangered"
    else:
        color = "gray"

    day_summary = combined_summary(days.values(), "☀️ Tag 07-19 Uhr")
    night_summary = combined_summary(nights.values(), "🌙 Nacht 19-07 Uhr")

    lines = []
    for model_name in MODELS:
        ctx = " | ".join(short_rain(v) for v in context[model_name])
        lines.append(
            "<li>"
            f"<b>{model_name}</b>"
            "<div class='period day-period'>"
            "<span class='period-label'>☀️ 07-19 Uhr</span>"
            f"{detail_text(days[model_name])}</div>"
            "<div class='period night-period'>"
            "<span class='period-label'>🌙 19-07 Uhr</span>"
            f"{detail_text(nights[model_name])}</div>"
            f"<small>Tageswerte Vortag | Fahrtag | Folgetag: {ctx}</small>"
            "</li>"
        )

    status = (
        "<span class='status'>"
        f"<span title='Tag: {available_day}/3 Modelle' class='pie' "
        f"style='--fill:{available_day * 120}deg'></span>"
        f"Tag {available_day}/3 · Nacht {available_night}/3</span>"
    )
    next_date = stage_date + timedelta(days=1)

    return (
        "<section>"
        "<div class='row'>"
        f"<h2><i style='background:{color}'></i>Tag {number}: {start} → {destination}</h2>"
        f"{status}</div>"
        f"<p>{stage_date:%d.%m.%Y}</p>"
        f"<div class='summary-box day-summary'><strong>{day_summary}</strong></div>"
        "<div class='summary-box night-summary'>"
        f"<strong>{night_summary}</strong>"
        f"<small>Nacht vom {stage_date:%d.%m.} auf den {next_date:%d.%m.%Y}</small>"
        "</div>"
        "<details><summary>Modelle, Tag-/Nachtwerte, Regenrisiko und Wind</summary>"
        f"<ul>{''.join(lines)}</ul></details>"
        "</section>"
    )


def collect():
    rows = []
    cards = []
    fail = 0

    for number, (start, destination, lat, lon) in enumerate(STAGES, 1):
        d = START + timedelta(days=number - 1)
        days, nights, context = {}, {}, {}

        for model_name, model in MODELS.items():
            try:
                hourly = load(lat, lon, model)
                days[model_name] = day_period(hourly, d)
                nights[model_name] = night_period(hourly, d)
                context[model_name] = [
                    day_period(hourly, d + timedelta(days=o)) for o in (-1, 0, 1)
                ]
            except Exception as error:
                fail += 1
                print(f"Fehler Tag {number}, {model_name}: {error}")
                days[model_name] = None
                nights[model_name] = None
                context[model_name] = [None, None, None]

        gd = [v for v in days.values() if v]
        gn = [v for v in nights.values() if v]

        rows.append({
            "label": f"Tag {number}<br>{start} → {destination}<br>{d:%d.%m.}",
            "hi": med([v["hi"] for v in gd]),
            "lo": med([v["lo"] for v in gn] or [v["lo"] for v in gd]),
            "rain": med([v["rain"] for v in gd]),
            "rain_night": med([v["rain"] for v in gn]),
            "sun": med([v["sun"] for v in gd]),
            "speed": med([v["speed"] for v in gd]),
            "gust": med([v["gust"] for v in gd]),
            "dir": mean_dir([v["dir"] for v in gd]),
            "detail": "<br>".join(model_line(m, days[m], nights[m]) for m in MODELS),
        })

        cards.append(build_card(number, start, destination, d, days, nights, context))

    return rows, cards, fail


def build_figure(rows):
    x = [r["label"] for r in rows]
    wind_text = [compass(r["dir"]) if r["speed"] is not None else "" for r in rows]

    traces = [
        {
            "type": "scatter", "mode": "lines+markers", "name": "Max. Temperatur [°C]",
            "x": x, "y": [r["hi"] for r in rows], "xaxis": "x", "yaxis": "y",
            "line": {"color": "#f0a30a", "width": 3, "shape": "spline"},
            "marker": {"size": 6},
            "hovertemplate": "Max: %{y:.0f} °C<extra></extra>",
        },
        {
            "type": "scatter", "mode": "lines+markers", "name": "Min. Temperatur [°C]",
            "x": x, "y": [r["lo"] for r in rows], "xaxis": "x", "yaxis": "y",
            "line": {"color": "#0b4a8f", "width": 3, "shape": "spline"},
            "marker": {"size": 6},
            "hovertemplate": "Min (Nacht): %{y:.0f} °C<extra></extra>",
        },
        {
            "type": "bar", "name": "Niederschlag Tag 07-19 [mm]",
            "x": x, "y": [r["rain"] for r in rows], "xaxis": "x", "yaxis": "y2",
            "marker": {"color": "#5aa2f7"}, "opacity": 0.85, "width": 0.55,
            "customdata": [[fmt(r["rain_night"], ".1f")] for r in rows],
            "hovertemplate": (
                "Regen Tag: %{y:.1f} mm<br>Regen Nacht: %{customdata[0]} mm<extra></extra>"
            ),
        },
        {
            "type": "bar", "name": "Sonnenschein [h]",
            "x": x, "y": [r["sun"] for r in rows], "xaxis": "x", "yaxis": "y3",
            "marker": {"color": "#fbbf1f"}, "width": 0.55,
            "hovertemplate": "Sonne: %{y:.1f} h<extra></extra>",
        },
        {
            "type": "scatter", "mode": "lines+markers+text", "name": "Wind Ø [km/h]",
            "x": x, "y": [r["speed"] for r in rows], "xaxis": "x", "yaxis": "y4",
            "text": wind_text, "textposition": "top center",
            "line": {"color": "#2e8b57", "width": 2.5, "shape": "spline"},
            "marker": {"size": 6},
            "hovertemplate": "Wind Ø: %{y:.0f} km/h aus %{text}<extra></extra>",
        },
        {
            "type": "scatter", "mode": "lines+markers", "name": "Böen max. [km/h]",
            "x": x, "y": [r["gust"] for r in rows], "xaxis": "x", "yaxis": "y4",
            "line": {"color": "#c0392b", "width": 2, "dash": "dot", "shape": "spline"},
            "marker": {"size": 5},
            "hovertemplate": "Böen: %{y:.0f} km/h<extra></extra>",
        },
    ]

    shapes = [
        {
            "type": "rect", "xref": "x", "yref": "paper",
            "x0": i - 0.5, "x1": i + 0.5, "y0": 0, "y1": 1,
            "fillcolor": "rgba(90,150,255,0.07)", "line": {"width": 0}, "layer": "below",
        }
        for i in range(len(rows)) if i % 2 == 0
    ]

    grid = "#d9dde3"
    layout = {
        "height": 780,
        "margin": {"l": 70, "r": 70, "t": 30, "b": 60},
        "paper_bgcolor": "white",
        "plot_bgcolor": "white",
        "hovermode": "x unified",
        "hoverlabel": {"align": "left"},
        "legend": {"orientation": "h", "y": -0.12, "x": 0},
        "shapes": shapes,
        "xaxis": {
            "anchor": "y4", "type": "category", "showgrid": False,
            "range": [-0.5, len(rows) - 0.5], "tickfont": {"size": 11},
        },
        "yaxis": {
            "domain": [0.45, 1.0], "anchor": "x", "title": "Temperatur [°C]",
            "gridcolor": grid, "ticksuffix": " °C", "zeroline": True,
        },
        "yaxis2": {
            "domain": [0.45, 1.0], "anchor": "x", "overlaying": "y", "side": "right",
            "title": "Regen [mm]", "rangemode": "tozero", "showgrid": False,
        },
        "yaxis3": {
            "domain": [0.24, 0.38], "anchor": "x", "title": "Sonne [h]",
            "rangemode": "tozero", "range": [0, 12], "gridcolor": grid,
        },
        "yaxis4": {
            "domain": [0.0, 0.17], "anchor": "x", "title": "Wind [km/h]",
            "rangemode": "tozero", "gridcolor": grid,
        },
    }
    return {"data": traces, "layout": layout}


CSS = """
    body { font: 16px system-ui; background: #f3f5f2; color: #182019; margin: 0; }
    main { max-width: 1200px; margin: auto; padding: 20px; }
    header { background: #18412d; color: white; padding: 20px; border-radius: 16px; }
    header h1 { margin: 0 0 6px; }
    header p { margin: 3px 0; }
    h3.part { margin: 28px 0 0; }
    .card { background: white; border-radius: 14px; padding: 12px;
            margin: 14px 0; box-shadow: 0 2px 12px #0001; }
    #detail { font-size: 0.9rem; line-height: 1.45; min-height: 150px; }
    section { background: white; padding: 18px; margin: 14px 0;
              border-radius: 14px; box-shadow: 0 2px 12px #0001; }
    h2 { font-size: 1.15rem; margin: 0; }
    .row { display: flex; justify-content: space-between; align-items: center;
           gap: 15px; flex-wrap: wrap; }
    i { display: inline-block; width: 13px; height: 13px;
        border-radius: 50%; margin-right: 9px; }
    .status { display: flex; align-items: center; gap: 7px;
              color: #59645d; font-size: 0.88rem; }
    .pie { width: 23px; height: 23px; border-radius: 50%;
           background: conic-gradient(#287a4b 0 var(--fill), #d8ded9 var(--fill) 360deg);
           border: 1px solid #b9c3bb; }
    .summary-box { margin-top: 10px; padding: 11px 13px; border-radius: 10px; }
    .day-summary { background: #fff8df; border-left: 4px solid #e7b928; }
    .night-summary { background: #edf2fa; border-left: 4px solid #496a9f; }
    .night-summary small { display: block; margin-top: 5px; }
    details > summary { cursor: pointer; margin-top: 15px; }
    ul { padding-left: 22px; }
    li { margin-bottom: 16px; }
    .period { margin-top: 7px; padding: 8px 10px; border-radius: 8px; }
    .day-period { background: #fff9e8; }
    .night-period { background: #eef3fa; }
    .period-label { display: inline-block; min-width: 115px; font-weight: 650; }
    small { color: #667; }
"""


def main():
    rows, cards, fail = collect()
    figure = build_figure(rows)
    details = [r["detail"] for r in rows]

    document = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EuroVelo 6 Wetter</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<main>
<header>
  <h1>🚲 EuroVelo 6 Wetter</h1>
  <p>Nantes → Basel · 10.-18. Oktober 2026</p>
  <p>Aktualisiert: {datetime.now():%d.%m.%Y %H:%M} · fehlgeschlagene Abfragen: {fail}</p>
</header>

<h3 class="part">Diagramm</h3>
<div class="card"><div id="chart"></div></div>
<div class="card">
  <b>Details pro Modell</b> <small>(Maus auf einen Tag bewegen)</small>
  <div id="detail">Noch kein Tag ausgewählt.</div>
</div>

<h3 class="part">Tagesübersicht</h3>
{''.join(cards)}

<p><small>Diagramm: Median von ECMWF, ICON und GFS. Max-Temperatur und Regen: 07-19 Uhr,
Min-Temperatur: Nacht 19-07 Uhr. Windrichtung bedeutet, woher der Wind kommt.
Keine amtliche Warnanwendung.</small></p>
</main>
<script>
  const fig = {json.dumps(figure)};
  const details = {json.dumps(details)};
  const labels = fig.data[0].x;
  Plotly.newPlot("chart", fig.data, fig.layout, {{responsive: true, displaylogo: false}});
  document.getElementById("chart").on("plotly_hover", e => {{
    const i = labels.indexOf(e.points[0].x);
    if (i >= 0) document.getElementById("detail").innerHTML = details[i];
  }});
</script>
</body>
</html>"""

    output = Path("eurovelo6_wetter.html")
    output.write_text(document, encoding="utf-8")
    print("Erstellt:", output.resolve())
    return output, document


output, document = main()

display(HTML(
    "<iframe style='width:100%;height:1100px;border:0' "
    f"srcdoc=\"{htmllib.escape(document, quote=True)}\"></iframe>"
))

try:
    from google.colab import files
    files.download(str(output))
except ImportError:
    pass

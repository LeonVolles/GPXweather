# Prüfbericht Limes-Radweg-GPX

Erstellt am 09.11.2026 aus den Originaldateien von Nederland Fietsland, der Deutschen Limes-Straße und EuroVelo.

## Ausgabedateien

- `limes-radweg_katwijk-passau.gpx`: ein durchgehender Track Katwijk – Passau (1.452,4 km) mit Höhen und 346 POIs als `<wpt>`.
- `limes-radweg_katwijk-wien.gpx`: derselbe Track, durchgehend weiter auf EuroVelo 6 bis Wien (1.764,3 km insgesamt), dieselben POIs.
- `limes-poi.csv`: alle 359 POIs mit Typ, neuem Namen, Routen-km, Abstand und ob aufgenommen.

Aufbau des Tracks:

| Abschnitt | Quelle | km von – bis |
|---|---|---|
| Niederländische Limesroute Katwijk – Berg en Dal | Nederland Fietsland (offizielle GPX) | 0 – 210,9 |
| Verbindung Berg en Dal – Millingen/Grenze | BRouter (Profil trekking) | 210,9 – 225,1 |
| Deutscher Limes-Radweg Grenze – Passau | Deutsche Limes-Straße, Stand 02/2026 | 225,1 – 1.452,4 |
| EuroVelo 6 Passau – Wien (nur in der Wien-Datei) | EuroVelo | 1.452,4 – 1.764,3 |

**Höhen:** Die Originalhöhen sind unbrauchbar: 76 % der Punkte im deutschen Gesamttrack haben `ele = 0`, und echte Werte gibt es erst ab DE-km 265. Außerdem liegt das Maximum bei nur 339 m, obwohl die Route im Taunus über 500 m erreicht. Deshalb habe ich die Höhe für jeden Trackpunkt neu aus dem Höhenmodell EU-DEM (25-m-Raster, über OpenTopoData) übernommen. Das gilt auch für die niederländische Strecke (dort waren alle Höhen 0) und für EuroVelo. In den Niederlanden liegen einige Polderabschnitte unter Meereshöhe.

| Strecke | Anstieg | Abstieg | tiefster Punkt | höchster Punkt |
|---|---|---|---|---|
| Niederlande Katwijk – Berg en Dal | 328 m | 247 m | -5 m | 96 m |
| Verbindung zur Grenze | 19 m | 90 m | 9 m | 95 m |
| Deutschland Grenze – Passau | 12.115 m | 11.834 m | 11 m | 780 m |
| Katwijk – Passau | 12.467 m | 12.177 m | -5 m | 780 m |
| EuroVelo 6 Passau – Wien | 1.907 m | 2.035 m | 157 m | 312 m |
| Katwijk – Wien | 14.374 m | 14.212 m | -5 m | 780 m |

Die Werte für Anstieg und Abstieg zählen nur Höhenänderungen ab 3 m, damit kleines Rauschen im Höhenmodell nicht mitgezählt wird. Andere Apps rechnen mit anderen Schwellen und können deshalb etwas andere Summen zeigen. Trackpunkte ohne Höhe: 0.

Doppelte Punkte (Abstand 0 m) wurden entfernt: 1 im deutschen Track, 20 im niederländischen.

## 1. Niederländische Limesroute

- **Quelle:** offizielle GPX von [Nederland Fietsland](https://www.nederlandfietsland.nl/fietsroute/limesroute/), Route-ID 1972. Sie ist 210,9 km lang (die Website nennt 211 km), hat einen durchgehenden Track ohne Segmentbrüche und 3652 Punkte. Der größte Abstand zwischen zwei Punkten beträgt 700 m.
- **Verlauf:** Katwijk aan Zee – Leiden – Woerden – Utrecht – Wijk bij Duurstede – Betuwe – Millingen. Danach führt die Route noch über Nijmegen (Valkhof, km 205) nach Berg en Dal (Museum Park Orientalis, km 210,9).
- **Anschluss an den deutschen Track:** Der deutsche Track beginnt an der Grenze bei Millingen/Keeken. Die NL-Route kommt dort bei km 184,6 bis auf 700 m heran und macht danach die Schlussschleife über Nijmegen nach Berg en Dal. Damit Nijmegen nicht wegfällt, habe ich die NL-Route vollständig übernommen. Von Berg en Dal zum deutschen Startpunkt führt dann eine mit BRouter berechnete Verbindung über Wyler und Zyfflich (14,2 km). Sie nutzt andere Wege als die NL-Route; nur 0,4 km überschneiden sich. Wer Nijmegen auslassen will, kann in Millingen (km 184,6) direkt nach Deutschland weiterfahren und spart etwa 40 km.
- **POIs:** Für den niederländischen Teil gibt es in den Daten der Limesstraße keine POIs.

## 2. Deutscher Gesamttrack (02/2026) gegen Etappen (07/2023)

In diesem Abschnitt zählen alle Kilometer ab der deutschen Grenze („DE-km“). Für den km-Wert ab Katwijk 225,1 km addieren.

| Kennzahl | Wert |
|---|---|
| Länge Gesamttrack | 1.227,35 km |
| Summe Etappen | 1.225,94 km (NRW 234,92, RP 118,62, HE 280,81, BW 228,31, BY 363,27) |
| Differenz | +1,41 km (+0,12 %) |
| Anschlüsse zwischen den Etappen | NRW→RP 0,0 m, RP→HE 0,0 m, HE→BW 0,1 m, BW→BY 0,7 m (lückenlos) |
| Start und Ziel | identisch mit Start NRW und Ziel BY |
| Abdeckung bei ≤ 10 m Toleranz | Gesamt durch Etappen 97,14 %, Etappen durch Gesamt 97,24 % |
| Abdeckung bei ≤ 50 m Toleranz | Gesamt durch Etappen 97,43 %, Etappen durch Gesamt 97,54 % |
| Abdeckung bei ≤ 100 m Toleranz | Gesamt durch Etappen 97,67 %, Etappen durch Gesamt 97,80 % |
| Abdeckung bei ≤ 300 m Toleranz | Gesamt durch Etappen 98,24 %, Etappen durch Gesamt 98,44 % |
| Max. Abweichung Gesamt → Etappen | 1.628 m bei km 1.033,8 (48.89803, 11.85116) |
| Max. Abweichung Etappen → Gesamt | 1.548 m (48.90709, 11.82720) |

NRW, Rheinland-Pfalz und Baden-Württemberg sind 2023 und 2026 deckungsgleich. Alle Änderungen liegen in Hessen (Raum Marköbel) und in Bayern zwischen Denkendorf und Bad Abbach.

Die Längendifferenz von +1,41 km erklärt sich fast vollständig durch die Abschnitte unten (Summe +1,33 km). Die restlichen 0,08 km sind kleine Abweichungen unter 50 m.

### Alle abweichenden Abschnitte

„DE-km“ zählt ab der deutschen Grenze, „Etappen-km“ ab Start der jeweiligen Landesetappe. Die Richtung sagt, wo die Route 2026 relativ zur Route 2023 liegt.

| DE-km | Etappe (km) | Raum | Länge 2026 | Länge 2023 | Δ | max. Abstand | Lage 2026 |
|---|---|---|---|---|---|---|---|
| 533,6–534,9 | HE 180,1–181,5 | Marköbel / Hammersbach | 1,25 km | 1,49 km | −238 m | 543 m | S |
| 538,3–538,8 | HE 184,9–185,9 | südlich Marköbel | 0,59 km | 1,01 km | −420 m | 271 m | W |
| 542,0–542,3 | HE 189,1–189,5 | südlich Marköbel | 0,30 km | 0,37 km | −69 m | 130 m | W |
| 983,4–984,6 | BY 121,4–123,4 | Denkendorf (Lkr. Eichstätt) | 1,20 km | 1,97 km | −779 m | 517 m | S |
| 989,4–992,4 | BY 128,2–131,9 | zwischen Denkendorf und Altmannstein | 3,05 km | 3,70 km | −651 m | 1.307 m | SW |
| 1.001,5–1.002,2 | BY 141,0–141,6 | Altmannstein | 0,62 km | 0,62 km | +2 m | 178 m | S |
| 1.004,0–1.004,2 | BY 143,4–143,8 | Altmannstein | 0,21 km | 0,37 km | −151 m | 114 m | NW |
| 1.014,9–1.018,3 | BY 154,5–157,4 | Eining / Hienheim / Bad Gögging (Donauquerung) | 3,34 km | 2,87 km | +473 m | 624 m | W |
| 1.018,5–1.023,6 | BY 157,6–159,9 | Eining / Hienheim / Bad Gögging (Donauquerung) | 5,13 km | 2,31 km | +2.822 m | 1.217 m | O |
| 1.025,0–1.029,6 | BY 161,3–166,0 | Eining / Hienheim / Bad Gögging (Donauquerung) | 4,55 km | 4,74 km | −190 m | 598 m | W |
| 1.031,3–1.038,1 | BY 167,8–175,1 | Weltenburg – Kelheim (Donaudurchbruch) | 6,76 km | 7,34 km | −582 m | 1.628 m | SO |
| 1.042,1–1.042,6 | BY 179,2–179,9 | Kelheim / Saal a.d. Donau | 0,51 km | 0,76 km | −256 m | 217 m | SO |
| 1.051,8–1.055,8 | BY 189,1–191,7 | Bad Abbach | 4,07 km | 2,62 km | +1.455 m | 908 m | S |
| 1.056,7–1.058,6 | BY 192,5–194,6 | Bad Abbach | 1,94 km | 2,02 km | −87 m | 120 m | SW |

### Erklärung der Abweichungen über 300 m

Alle Abschnitte trennen sich von der alten Route und treffen sie wieder (beide Enden liegen innerhalb von 15 m). Es sind also echte Umlegungen der Route zwischen 07/2023 und 02/2026 und keine Datenfehler, Lücken oder Versätze. Einen offiziellen Grund für die Umlegungen habe ich bei der Deutschen Limes-Straße nicht gefunden. Die Beschreibungen unten stützen sich deshalb nur auf die Geometrie.

- **km 533,6–534,9, Marköbel / Hammersbach (HE), max. 543 m:** Lokale Neuführung 2026: kürzere Verbindung südlich der alten Trasse.
- **km 983,4–984,6, Denkendorf (Lkr. Eichstätt) (BY), max. 517 m:** Neuführung 2026 südlich der alten Trasse, deutlich kürzer.
- **km 989,4–992,4, zwischen Denkendorf und Altmannstein (BY), max. 1.307 m:** Längster BY-Abschnitt mit anderer Wegwahl 2026: Route liegt bis 1,3 km südwestlich der 2023-Führung, 0,65 km kürzer.
- **km 1.014,9–1.018,3, Eining / Hienheim / Bad Gögging (Donauquerung) (BY), max. 624 m:** Beginn der neuen Führung um Eining: 2026 westlich der alten Trasse, etwas länger. Kastell Eining bleibt an der Route (159 m).
- **km 1.018,5–1.023,6, Eining / Hienheim / Bad Gögging (Donauquerung) (BY), max. 1.217 m:** Größter Umweg 2026: Schleife bis 1,2 km östlich der alten Trasse, +2,8 km. Zusammen mit dem vorigen und folgenden Abschnitt komplett neue Führung im Raum Eining/Hienheim.
- **km 1.025,0–1.029,6, Eining / Hienheim / Bad Gögging (Donauquerung) (BY), max. 598 m:** Parallelführung ~0,6 km westlich der alten Trasse, nahezu gleich lang.
- **km 1.031,3–1.038,1, Weltenburg – Kelheim (Donaudurchbruch) (BY), max. 1.628 m:** Größte Abweichung überhaupt (1,63 km): 2023 führte die Route direkt am Kloster Weltenburg vorbei (80 m), 2026 verläuft sie bis 1,6 km südöstlich (Kloster ca. 700 m entfernt) und ist 0,58 km kürzer.
- **km 1.051,8–1.055,8, Bad Abbach (BY), max. 908 m:** Neuführung 2026 bis 0,9 km südlich der alten Trasse, +1,46 km.

Die Abschnitte bei km 538, 542, 1001, 1004, 1042 und 1057 weichen höchstens 271 m ab. Das sind kleine Wegänderungen auf Straßen, die parallel oder ortsnah verlaufen.

### Lücken über 500 m

- **Keine echten Lücken.** Beide Dateien haben je einen durchgehenden Track ohne Segmentbrüche, und die Etappen schließen nahtlos aneinander an (unter 1 m).
- **Weite Punktabstände:** 45 Stellen im Gesamttrack und 45 in den Etappen haben mehr als 500 m zwischen zwei Punkten (max. 954 m bei km 529). Sie liegen an denselben Stellen und sind gerade Wegstücke mit wenigen Stützpunkten, keine Lücken. Die Mitte jedes Sprungs liegt 0 m neben der Etappe. Die einzige Ausnahme ist km 983,8 (316 m), und die liegt im umgelegten Abschnitt bei Denkendorf.
- **Abschnitte ohne Abdeckung über 500 m** (bei 50 m Toleranz): Das sind genau die umgelegten Abschnitte oben (km 533,6, km 538,3, km 983,4, km 989,4, km 1.001,5, km 1.014,9, km 1.018,5, km 1.025,0, km 1.031,3, km 1.051,8, km 1.056,7), zusammen 31,2 km.

## 3. POIs

Quelle sind `Limes-RW-Waypoints.kml` und `.asc`. Beide enthalten dieselben 359 Punkte mit identischen Namen und Koordinaten. Die POIs liegen nur zwischen km 481 (Rheinbrohl) und km 1301 (Regensburg), also am Obergermanisch-Raetischen Limes. Für die Niederlande, für Niederrhein/NRW und für Regensburg – Passau gibt es keine POIs.

Der Routen-km in den POI-Namen zählt ab Katwijk. Er ist die Position des nächstgelegenen Punkts auf dem Track.

| Code | Neuer Name | Anzahl |
|---|---|---|
| TURMRESTE | Wachturm-Reste | 197 |
| TURMGRUND | Wachturm-Grundriss | 46 |
| KK-RESTE | Kleinkastell-Reste | 44 |
| TURM | Wachturm (rekonstruiert) | 16 |
| KASTELL-R | Kastell-Reste | 16 |
| KASTELL | Kastell (rekonstruiert) | 14 |
| K-KASTELL | Kleinkastell (teilrekonstruiert) | 12 |
| BAD | Römisches Bad | 4 |
| INSCHRIFT | Römische Inschrift | 2 |
| TURMAUSGR | Wachturm-Ausgrabung | 1 |
| KK-REST | Kleinkastell-Reste | 1 |
| GRABSTEIN | Römischer Grabstein | 1 |
| MITHRAS | Mithras-Heiligtum | 1 |
| OFEN | Römischer Brennofen | 1 |
| LIMESTOR | Limestor | 1 |
| BURGUS | Burgus (röm. Wachposten) | 1 |
| PRAETORIA | Porta Praetoria (Römertor) | 1 |

Die Namen folgen den Begriffserklärungen zur ASC-Datei: TURM = komplett rekonstruierter Limeswachturm, TURMGRUND = Grundriss erkennbar bzw. rekonstruiert, TURMRESTE = Schutthügel erkennbar, K-KASTELL = Kleinkastell mit rekonstruierten Mauerstücken, KK-RESTE = Kleinkastell als Erhebung erkennbar, KASTELL = ganz oder teilweise rekonstruiertes Erscheinungsbild, KASTELL-R = Reste oder Erhebung erkennbar. Die Erklärung steht bei jedem Wegpunkt auch in `<desc>`. Für die übrigen Codes (BAD, INSCHRIFT, OFEN usw.) gibt es keine Erklärung; ihre Namen sind wörtlich übersetzt.

### Weggelassen, weil mehr als 2 km von der Route entfernt (13)

| Typ | Name | nächster Routen-km | Abstand | Koordinaten |
|---|---|---|---|---|
| TURMRESTE | Wachturm-Reste | 542 | 2,13 km | 50.35802, 7.76032 |
| TURMRESTE | Wachturm-Reste | 846 | 4,22 km | 49.68813, 9.28754 |
| TURMGRUND | Wachturm-Grundriss | 858 | 3,96 km | 49.66990, 9.28869 |
| TURMRESTE | Wachturm-Reste | 858 | 3,43 km | 49.66423, 9.28900 |
| TURMRESTE | Wachturm-Reste | 859 | 3,30 km | 49.65839, 9.29801 |
| TURMRESTE | Wachturm-Reste | 859 | 3,20 km | 49.65469, 9.30206 |
| K-KASTELL | Kleinkastell (teilrekonstruiert) | 863 | 2,23 km | 49.63354, 9.33059 |
| TURMRESTE | Wachturm-Reste | 863 | 2,21 km | 49.63136, 9.33468 |
| TURMRESTE | Wachturm-Reste | 864 | 2,09 km | 49.62747, 9.34002 |
| TURMRESTE | Wachturm-Reste | 1031 | 2,03 km | 48.83751, 9.94445 |
| TURMRESTE | Wachturm-Reste | 1031 | 2,06 km | 48.83849, 9.94932 |
| TURMRESTE | Wachturm-Reste | 1047 | 3,72 km | 48.86158, 10.04422 |
| KASTELL | Kastell (rekonstruiert) | 1188 | 8,95 km | 48.88388, 11.26388 |

8 der 13 liegen im Odenwald zwischen km 845 und 864, wo der Radweg 2–4 km neben der Limeslinie verläuft. Am weitesten entfernt ist das Kastell bei Pfünz im Altmühltal (8,9 km).

## 4. EuroVelo 6 Passau – Wien

Die EuroVelo-Datei enthält 13 Tracks: 01–07 sind die durchgehende Hauptroute, 08–13 sind Varianten am anderen Donauufer. Verwendet wurden 01–07 (311,9 km).

- Das Ende des Limes-Tracks liegt 1,7 m neben EV6-Etappe 01, und zwar 1.080 m nach deren Start (Passau-Altstadt). Diese ersten 1.080 m wurden abgeschnitten, damit der Track nicht doppelt und nicht rückwärts läuft.
- Zwischen „02: Obermühl an der Donau – Linz“ und „03: Linz – St. Georgen an der Gusen“ fehlen in den EuroVelo-Daten 160 m. Hier verbindet eine gerade Linie die beiden Etappen.
- Zwischen „03: Linz – St. Georgen an der Gusen“ und „04: St. Georgen an der Gusen – Dornach bei Grein“ fehlen in den EuroVelo-Daten 28 m. Hier verbindet eine gerade Linie die beiden Etappen.
- Die übrigen Etappen schließen auf unter 1 m an.
- Der größte Punktabstand in den EuroVelo-Daten beträgt 2,1 km (Etappe 07). Der Track ist dort durchgehend, hat aber nur wenige Stützpunkte.

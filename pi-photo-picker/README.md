# pi-photo-picker

Lokaler KI-Agent für den Raspberry Pi. Er wählt für
[MMM-SynPhotoSlideshow](../README.md) das nächste Foto **gleichverteilt
zufällig** aus den Bildern, die das Modul noch nicht gezeigt hat.

Die Zufallsauswahl steckt im Tool `pick_random_photo`. MagicMirror ruft
dieses Tool über HTTP auf dem Pi auf. Dafür ist kein Modell-Aufruf nötig,
die Diashow bleibt schnell und läuft auch ohne Cursor-API-Key. Im
Playground kann man den Agenten zusätzlich fragen, welches Bild als
Nächstes kommt. Dann antwortet das Modell und ruft dasselbe Tool auf.

## Auf dem Raspberry Pi starten

Node.js 22 oder neuer. Im Modulverzeichnis:

```sh
cd ~/MagicMirror/modules/MMM-SynPhotoSlideshow/pi-photo-picker
npm install
npx agent-sdk serve --mode single --host 127.0.0.1 --port 3000
```

Der Dienst bindet nur an `127.0.0.1`. Die Diashow auf demselben Pi erreicht
ihn unter:

```text
http://127.0.0.1:3000/v1/tools/pick_random_photo
```

Prüfen, ohne ein Modell zu starten:

```sh
npx agent-sdk tool call pick_random_photo --dir . --input '{"photos":[{"path":"a.jpg"},{"path":"b.jpg"}]}'
```

Ein zweiter Aufruf mit denselben Fotos liefert das andere Bild. Erst wenn
alle gezeigt wurden, beginnt eine neue Runde. Das zuletzt gezeigte Bild
wird dabei übersprungen, solange noch ein anderes übrig ist.

Gespräch mit dem Modell (dafür `npx agent-sdk login` oder `CURSOR_API_KEY`):

```sh
npx agent-sdk run --dir . --message "Wähle ein zufälliges Bild."
```

## systemd

Beispiel: `deploy/pi-photo-picker.service`. Pfad und Benutzer an den Pi
anpassen, dann:

```sh
sudo cp deploy/pi-photo-picker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-photo-picker
```

`--no-playground` und `--no-docs` sparen Speicher auf kleinen Pis. Wer den
Agenten im Browser fragen will, diese beiden Flags weglassen und
`http://127.0.0.1:3000/playground` öffnen.

## Modul

In `config.js` oder `.env` des Moduls:

```javascript
useAgentPicker: true
```

```bash
USE_AGENT_PICKER=true
AGENT_PICKER_URL=http://127.0.0.1:3000/v1/tools/pick_random_photo
```

Antwortet der Agent nicht innerhalb von zwei Sekunden, zeigt das Modul das
nächste Bild aus der lokalen Reihenfolge.

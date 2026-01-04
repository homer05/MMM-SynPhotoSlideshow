# Test für Nominatim Reverse Geocoding

## Manueller Test im Browser

Öffnen Sie diese URL im Browser, um die Geocodierung zu testen:

### Test 1: Griechenland (mit accept-language=en)
```
https://nominatim.openstreetmap.org/reverse?lat=35.3065319&lon=25.3938994&format=json&accept-language=en
```

**Erwartetes Ergebnis:**
- `display_name` sollte in englischer Sprache sein (lateinische Zeichen)
- Beispiel: "iokasti, 10, Varnali, Limin Chersonisou Municipality..."

### Test 2: Deutschland (Dresden)
```
https://nominatim.openstreetmap.org/reverse?lat=51.121822&lon=13.771794&format=json&accept-language=en
```

**Erwartetes Ergebnis:**
- `display_name` sollte in englischer Sprache sein
- Beispiel: "2, Vogelstellerweg, Königswald, Klotzsche, Dresden..."

### Test 3: Seychellen
```
https://nominatim.openstreetmap.org/reverse?lat=-4.6415364&lon=55.4759384&format=json&accept-language=en
```

**Erwartetes Ergebnis:**
- `display_name` sollte in englischer Sprache sein
- Beispiel: "The Boardwalk, Marina Drive, Roche Caiman, Seychelles"

## Test mit Node.js Script

Falls Node.js installiert ist, können Sie das Test-Script ausführen:

```bash
node test-geocoding-simple.js
```

Das Script testet die Geocodierung mit den Griechenland-Koordinaten und zeigt:
- `FullAddress` (display_name)
- `ShortAddress` (City - Country)
- Prüfung auf nicht-lateinische Zeichen

## Vergleich: Mit vs. Ohne accept-language=en

### Ohne accept-language (Standard - lokale Sprache):
```
https://nominatim.openstreetmap.org/reverse?lat=35.3065319&lon=25.3938994&format=json
```
→ Gibt griechische Zeichen zurück: "Βάρναλη, Κοινότητα Λιμένος Χερσονήσου..."

### Mit accept-language=en:
```
https://nominatim.openstreetmap.org/reverse?lat=35.3065319&lon=25.3938994&format=json&accept-language=en
```
→ Gibt englische/lateinische Zeichen zurück: "Varnali, Limin Chersonisou Municipality..."

## Erwartete Ergebnisse

Nach der Implementierung sollten alle Adressen in `photo_metadata.json` gespeichert werden als:

```json
{
  "84368_0": {
    "synologyId": 84368,
    "spaceId": 0,
    "location": "35.306061, 25.394467",
    "captureDate": "2025-04-19T09:59:55.000Z",
    "FullAddress": "iokasti, 10, Varnali, Limin Chersonisou Municipality, Chersonisos Municipal Unit, Chersonissos Province, Heraklion Regional Unit, Crete Region, 700 14, Greece",
    "ShortAddress": "Chersonisos Municipal Unit - Greece"
  }
}
```

**Wichtig:** Alle Zeichen sollten lateinisch sein (keine griechischen, kyrillischen, etc.)

# Fork Differences / Fork-Unterschiede

This document explains all differences between this fork and the original repository at [https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow](https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow).

Dieses Dokument erklärt alle Unterschiede zwischen diesem Fork und dem Original-Repository unter [https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow](https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow).

---

## English / Englisch

### Overview

This fork extends the original MMM-SynPhotoSlideshow module with enhanced metadata display features, including geolocation maps and improved date/address information from `photo_metadata.json`.

### New Features

#### 1. Enhanced Image Info Display

**New `imageInfo` Options:**

- `capturedate` - Display capture date from `photo_metadata.json` only (no EXIF fallback)
- `fulladdress` - Display full address from `photo_metadata.json`
- `shortaddress` - Display short address format ("City - Country")
- `address` - Display address with priority: FullAddress > ShortAddress

**Configuration Example:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    imageInfo: ['capturedate', 'fulladdress'],
    imageInfoLocation: 'bottomRight',
    // ...
  }
}
```

**Changes:**
- The `date` option now uses metadata from `photo_metadata.json` only (no EXIF fallback)
- All date/address information comes exclusively from `photo_metadata.json`
- UTC dates are automatically converted to CET/CEST timezone

#### 2. Geolocation Map Display

**New Feature:** Interactive map showing photo location above image information.

**Features:**
- Uses Leaflet.js with OpenStreetMap tiles
- Displays location from `photo_metadata.json` `location` field
- Shows red marker at exact photo coordinates
- Positioned above image information
- German map labels (using `tile.openstreetmap.de`)

**Configuration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    mapZoom: 13, // Zoom level 1-19 (default: 13)
    // ...
  }
}
```

**Map Details:**
- Size: 200x150px
- Position: Above image info (adjusts based on `imageInfoLocation`)
- Zoom: Configurable via `mapZoom` (1-19, default: 13)
- Language: German labels (German OpenStreetMap server)
- Interactive: Disabled (display only, no user interaction)

#### 3. UTC to CET/CEST Timezone Conversion

**Feature:** Automatic timezone conversion for capture dates.

- Capture dates from `photo_metadata.json` are in UTC format
- Automatically converted to CET (Central European Time) / CEST (Central European Summer Time)
- Handles daylight saving time automatically
- Uses `Europe/Berlin` timezone

**Example:**
- UTC: `2025-04-19T09:59:55.000Z`
- CET: `Samstag, 19. April 2025, 11:59` (UTC+1)
- CEST: `Samstag, 19. Juli 2025, 11:59` (UTC+2)

#### 4. Metadata-Only Display

**Change:** Image information now uses only `photo_metadata.json`, no EXIF fallback.

**Before:**
- Date: EXIF `DateTimeOriginal` with metadata fallback
- Address: Not available

**After:**
- Date: Only from `photo_metadata.json` `captureDate` (UTC → CET/CEST)
- Address: Only from `photo_metadata.json` `FullAddress` or `ShortAddress`
- Location: Only from `photo_metadata.json` `location` field

### Technical Changes

#### Dependencies Added

- **Leaflet.js** (via CDN) - For interactive map display
  - JavaScript: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - CSS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`

#### Files Modified

1. **src/types.ts**
   - Added `mapZoom?: number` to `ModuleConfig` interface

2. **src/MMM-SynPhotoSlideshow.ts**
   - Added Leaflet.js and CSS to `getScripts()` and `getStyles()`
   - Added `mapZoom: 13` default configuration

3. **src/frontend/UIBuilder.ts**
   - Added `parseLocation()` method to parse location string
   - Added `createMapDiv()` method to create Leaflet map
   - Modified `formatCaptureDate()` to convert UTC to CET/CEST
   - Modified `getImageProperty()` to support new options
   - Removed EXIF fallback for date display

4. **src/frontend/ModuleController.ts**
   - Modified `handleImageLoad()` to create map for each image
   - Changed `updateImageInfoFromMetadata()` to use metadata only
   - Removed EXIF date extraction

5. **src/frontend/ConfigValidator.ts**
   - Updated regex to accept new `imageInfo` values

6. **src/frontend/display.scss**
   - Added styles for `.map-container`
   - Positioned map above image info

### Configuration Options

#### New Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mapZoom` | number | 13 | Zoom level for location map (1-19) |

#### Updated Configuration Options

| Option | Change |
|--------|--------|
| `imageInfo` | New values: `capturedate`, `fulladdress`, `shortaddress`, `address` |

### Migration Guide

#### For Users Upgrading from Original

1. **Update your configuration:**

   ```javascript
   {
     module: 'MMM-SynPhotoSlideshow',
     config: {
       showImageInfo: true,
       imageInfo: ['capturedate', 'fulladdress'], // New options
       mapZoom: 13, // Optional: adjust zoom level
       // ... rest of your config
     }
   }
   ```

2. **No breaking changes:**
   - Existing configurations continue to work
   - Old `imageInfo` values (`date`, `name`, `imagecount`) still supported
   - `date` now uses metadata only (no EXIF)

3. **New features are optional:**
   - Map only displays if `location` field exists in metadata
   - New `imageInfo` options are optional

### Requirements

- `photo_metadata.json` must contain:
  - `captureDate` (ISO 8601 UTC format) for date display
  - `location` (format: "lat, lon") for map display
  - `FullAddress` or `ShortAddress` for address display

### Limitations

- Map requires internet connection (loads OpenStreetMap tiles)
- Map only displays if `location` field exists in metadata
- Date conversion assumes CET/CEST timezone (hardcoded to `Europe/Berlin`)

---

## Deutsch / German

### Übersicht

Dieser Fork erweitert das ursprüngliche MMM-SynPhotoSlideshow-Modul um erweiterte Metadaten-Anzeigefunktionen, einschließlich Geolocation-Karten und verbesserter Datums-/Adressinformationen aus `photo_metadata.json`.

### Neue Features

#### 1. Erweiterte Bildinformationen-Anzeige

**Neue `imageInfo` Optionen:**

- `capturedate` - Zeigt Aufnahmedatum nur aus `photo_metadata.json` an (kein EXIF-Fallback)
- `fulladdress` - Zeigt vollständige Adresse aus `photo_metadata.json` an
- `shortaddress` - Zeigt kurze Adresse im Format "Stadt - Land" an
- `address` - Zeigt Adresse mit Priorität: FullAddress > ShortAddress

**Konfigurationsbeispiel:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    imageInfo: ['capturedate', 'fulladdress'],
    imageInfoLocation: 'bottomRight',
    // ...
  }
}
```

**Änderungen:**
- Die `date` Option verwendet jetzt nur noch Metadaten aus `photo_metadata.json` (kein EXIF-Fallback)
- Alle Datums-/Adressinformationen kommen ausschließlich aus `photo_metadata.json`
- UTC-Daten werden automatisch in CET/CEST Zeitzone umgewandelt

#### 2. Geolocation-Kartenanzeige

**Neues Feature:** Interaktive Karte, die den Foto-Standort oberhalb der Bildinformationen anzeigt.

**Features:**
- Verwendet Leaflet.js mit OpenStreetMap-Karten
- Zeigt Standort aus dem `location` Feld von `photo_metadata.json` an
- Zeigt roten Marker an exakten Foto-Koordinaten
- Positioniert oberhalb der Bildinformationen
- Deutsche Kartenbeschriftungen (verwendet `tile.openstreetmap.de`)

**Konfiguration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    mapZoom: 13, // Zoom-Level 1-19 (Standard: 13)
    // ...
  }
}
```

**Kartendetails:**
- Größe: 200x150px
- Position: Oberhalb der Bildinfo (passt sich an `imageInfoLocation` an)
- Zoom: Konfigurierbar über `mapZoom` (1-19, Standard: 13)
- Sprache: Deutsche Beschriftungen (deutscher OpenStreetMap-Server)
- Interaktiv: Deaktiviert (nur Anzeige, keine Benutzerinteraktion)

#### 3. UTC zu CET/CEST Zeitzonen-Umwandlung

**Feature:** Automatische Zeitzonen-Umwandlung für Aufnahmedaten.

- Aufnahmedaten aus `photo_metadata.json` sind im UTC-Format
- Werden automatisch in CET (Mitteleuropäische Zeit) / CEST (Mitteleuropäische Sommerzeit) umgewandelt
- Behandelt automatisch die Sommerzeit
- Verwendet `Europe/Berlin` Zeitzone

**Beispiel:**
- UTC: `2025-04-19T09:59:55.000Z`
- CET: `Samstag, 19. April 2025, 11:59` (UTC+1)
- CEST: `Samstag, 19. Juli 2025, 11:59` (UTC+2)

#### 4. Nur-Metadaten-Anzeige

**Änderung:** Bildinformationen verwenden jetzt nur noch `photo_metadata.json`, kein EXIF-Fallback.

**Vorher:**
- Datum: EXIF `DateTimeOriginal` mit Metadaten-Fallback
- Adresse: Nicht verfügbar

**Nachher:**
- Datum: Nur aus `photo_metadata.json` `captureDate` (UTC → CET/CEST)
- Adresse: Nur aus `photo_metadata.json` `FullAddress` oder `ShortAddress`
- Standort: Nur aus `photo_metadata.json` `location` Feld

### Technische Änderungen

#### Hinzugefügte Abhängigkeiten

- **Leaflet.js** (via CDN) - Für interaktive Kartenanzeige
  - JavaScript: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - CSS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`

#### Geänderte Dateien

1. **src/types.ts**
   - `mapZoom?: number` zur `ModuleConfig` Schnittstelle hinzugefügt

2. **src/MMM-SynPhotoSlideshow.ts**
   - Leaflet.js und CSS zu `getScripts()` und `getStyles()` hinzugefügt
   - `mapZoom: 13` Standard-Konfiguration hinzugefügt

3. **src/frontend/UIBuilder.ts**
   - `parseLocation()` Methode zum Parsen des Location-Strings hinzugefügt
   - `createMapDiv()` Methode zum Erstellen der Leaflet-Karte hinzugefügt
   - `formatCaptureDate()` geändert, um UTC zu CET/CEST umzuwandeln
   - `getImageProperty()` geändert, um neue Optionen zu unterstützen
   - EXIF-Fallback für Datumsanzeige entfernt

4. **src/frontend/ModuleController.ts**
   - `handleImageLoad()` geändert, um Karte für jedes Bild zu erstellen
   - `updateImageInfoFromMetadata()` geändert, um nur Metadaten zu verwenden
   - EXIF-Datums-Extraktion entfernt

5. **src/frontend/ConfigValidator.ts**
   - Regex aktualisiert, um neue `imageInfo` Werte zu akzeptieren

6. **src/frontend/display.scss**
   - Styles für `.map-container` hinzugefügt
   - Karte oberhalb der Bildinfo positioniert

### Konfigurationsoptionen

#### Neue Konfigurationsoptionen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `mapZoom` | number | 13 | Zoom-Level für Standortkarte (1-19) |

#### Aktualisierte Konfigurationsoptionen

| Option | Änderung |
|--------|----------|
| `imageInfo` | Neue Werte: `capturedate`, `fulladdress`, `shortaddress`, `address` |

### Migrationsleitfaden

#### Für Benutzer, die vom Original aktualisieren

1. **Konfiguration aktualisieren:**

   ```javascript
   {
     module: 'MMM-SynPhotoSlideshow',
     config: {
       showImageInfo: true,
       imageInfo: ['capturedate', 'fulladdress'], // Neue Optionen
       mapZoom: 13, // Optional: Zoom-Level anpassen
       // ... Rest Ihrer Konfiguration
     }
   }
   ```

2. **Keine Breaking Changes:**
   - Bestehende Konfigurationen funktionieren weiterhin
   - Alte `imageInfo` Werte (`date`, `name`, `imagecount`) werden weiterhin unterstützt
   - `date` verwendet jetzt nur noch Metadaten (kein EXIF)

3. **Neue Features sind optional:**
   - Karte wird nur angezeigt, wenn `location` Feld in Metadaten existiert
   - Neue `imageInfo` Optionen sind optional

### Anforderungen

- `photo_metadata.json` muss enthalten:
  - `captureDate` (ISO 8601 UTC Format) für Datumsanzeige
  - `location` (Format: "lat, lon") für Kartenanzeige
  - `FullAddress` oder `ShortAddress` für Adressanzeige

### Einschränkungen

- Karte benötigt Internetverbindung (lädt OpenStreetMap-Karten)
- Karte wird nur angezeigt, wenn `location` Feld in Metadaten existiert
- Datumsumwandlung geht von CET/CEST Zeitzone aus (fest codiert auf `Europe/Berlin`)

---

## Summary / Zusammenfassung

### Key Differences / Hauptunterschiede

1. **Metadata Display** - Enhanced display of capture date and address from `photo_metadata.json`
2. **Geolocation Map** - Interactive map showing photo location
3. **Timezone Conversion** - Automatic UTC to CET/CEST conversion
4. **Metadata-Only** - No EXIF fallback, uses only `photo_metadata.json`

### Compatibility / Kompatibilität

✅ **100% backward compatible** - All existing configurations work unchanged
✅ **No breaking changes** - Existing features preserved
✅ **Optional features** - New features are opt-in via configuration

---

## Links

- **Original Repository**: https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow
- **This Fork**: [Your repository URL]

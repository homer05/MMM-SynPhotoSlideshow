# Fork Differences / Fork-Unterschiede

This document explains all differences between this fork and the original repository at [https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow](https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow).

Dieses Dokument erklärt alle Unterschiede zwischen diesem Fork und dem Original-Repository unter [https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow](https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow).

---

## English / Englisch

### Overview

This fork extends the original MMM-SynPhotoSlideshow module with five major feature enhancements:

1. **Fixed Frame Mode** - Option to display images in a frame instead of fullscreen
2. **Advanced Filtering** - Filter photos by persons, places (geocoding), or scenes (concepts)
3. **Enhanced Image Cache & Metadata** - Automatic download of original images for metadata extraction and address determination
4. **Enhanced Image Information Display** - Display capture date and addresses from metadata
5. **Geolocation Map** - Interactive map showing photo location

---

### 1. Fixed Frame Mode / Vollbild vs. Ausschnitte

**Feature:** Option to display images in a fixed frame instead of fullscreen.

**Configuration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    useFixedFrame: true,        // Enable fixed frame mode
    frameWidth: '80%',          // Frame width (CSS value)
    frameHeight: '80%',         // Frame height (CSS value)
    framePosition: 'center',    // Position: 'center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    frameBackgroundColor: 'rgba(0, 0, 0, 0.5)', // Background color around frame
    // ... other settings
  }
}
```

**How it works:**
- When `useFixedFrame: true`, images are displayed in a configurable frame
- The frame has a shadow and rounded corners for a picture frame effect
- Background overlay shows around the frame
- Images are contained within the frame boundaries
- Perfect for creating a digital photo frame effect

**Visual Effect:**
- Fullscreen mode: Image fills entire screen
- Fixed frame mode: Image displayed in a frame with background around it

---

### 2. Advanced Filtering / Filtern nach Personen, Orten oder Szenen

**Feature:** Filter photos by AI-generated albums (persons, concepts/scenes, geocoding/locations).

**Configuration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    // Filter by persons (AI-generated person albums)
    synologyPersonIds: [123, 456],  // Array of person IDs
    
    // Filter by concepts/scenes (AI-generated theme albums)
    synologyConceptIds: [789, 101],  // Array of concept IDs
    
    // Filter by geocoding/locations (AI-generated location albums)
    synologyGeocodingIds: [202, 303], // Array of geocoding IDs
    
    // ... other settings
  }
}
```

**How it works:**
- Uses Synology Photos AI-generated albums from personal space
- **Persons**: Filter photos containing specific people (face recognition)
- **Concepts**: Filter photos by scenes/themes (e.g., "beach", "mountains", "food")
- **Geocoding**: Filter photos by location (e.g., "Paris", "New York")
- Priority: Personal space albums > Tags > Regular albums
- Multiple IDs can be specified for each type
- Photos matching any of the specified IDs will be included

**Finding IDs:**
- Person IDs: From Synology Photos person albums
- Concept IDs: From Synology Photos concept/theme albums
- Geocoding IDs: From Synology Photos location albums

**Environment Variables:**
```bash
SYNOLOGY_PERSON_IDS=123,456
SYNOLOGY_CONCEPT_IDS=789,101
SYNOLOGY_GEOCODING_IDS=202,303
```

---

### 3. Enhanced Image Cache & Metadata / Erweiterte Bild-Cache und Metadaten

**Feature:** Automatic download of original images for metadata extraction and address determination.

#### 3.1 Original Image Download

**How it works:**
- When metadata is not available in `photo_metadata.json`, the module automatically downloads the original image file
- Original images are cached locally for metadata extraction
- Uses `SYNO.Foto.Download` API to download full-resolution images with EXIF data
- Supports both personal space and shared albums

**Process:**
1. Check if metadata exists in `photo_metadata.json`
2. If not found, download original image from Synology
3. Extract EXIF metadata (capture date, GPS coordinates, camera info)
4. Save metadata to `photo_metadata.json` for future use
5. Cache original image for faster subsequent access

**Configuration:**
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    enableImageCache: true,        // Enable image caching
    imageCacheMaxSize: 500,        // Max cache size in MB
    imageCachePreloadCount: 10,   // Number of images to preload
    // ... other settings
  }
}
```

#### 3.2 Address Determination (Reverse Geocoding)

**Feature:** Automatic address determination from GPS coordinates.

**How it works:**
- When GPS coordinates are found in EXIF data, the module performs reverse geocoding
- Uses Nominatim API (OpenStreetMap) to get addresses
- Respects rate limiting (max 1 request per 5 seconds)
- Generates two address formats:
  - **FullAddress**: Complete address from Nominatim `display_name`
  - **ShortAddress**: Short format "City - Country"

**Process:**
1. Extract GPS coordinates from EXIF metadata
2. Check if address already exists in `photo_metadata.json`
3. If not, call Nominatim API with rate limiting
4. Parse response to extract FullAddress and ShortAddress
5. Save to `photo_metadata.json` for future use

**Address Format:**
- **FullAddress**: `"iokasti, 10, Varnali, Limin Chersonisou Municipality, Chersonisos Municipal Unit, Chersonissos Province, Heraklion Regional Unit, Crete Region, 700 14, Greece"`
- **ShortAddress**: `"Chersonisos Municipal Unit - Greece"`

**Rate Limiting:**
- Maximum 1 request per 5 seconds (Nominatim policy)
- Automatic waiting between requests
- Prevents API blocking

**Storage:**
- All metadata saved to `photo_metadata.json` in module directory
- Format: `{ "synologyId_spaceId": { "location": "lat, lon", "captureDate": "ISO8601", "FullAddress": "...", "ShortAddress": "..." } }`

---

### 4. Enhanced Image Information Display / Erweiterte Bildinformationen-Anzeige

**Feature:** Display capture date and addresses from `photo_metadata.json` with timezone conversion.

#### 4.1 New `imageInfo` Options

**Available Options:**
- `capturedate` - Display capture date from `photo_metadata.json` only (no EXIF fallback)
- `fulladdress` - Display full address from `photo_metadata.json`
- `shortaddress` - Display short address format ("City - Country")
- `address` - Display address with priority: FullAddress > ShortAddress
- `date` - Display date from metadata only (no EXIF fallback, updated behavior)
- `name` - Display image name (existing)
- `imagecount` - Display "X of Y" (existing)

**Configuration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    imageInfo: ['capturedate', 'fulladdress'],  // New options
    imageInfoLocation: 'bottomRight',           // Position: 'bottomRight', 'bottomLeft', 'topRight', 'topLeft'
    // ... other settings
  }
}
```

#### 4.2 UTC to CET/CEST Timezone Conversion

**Feature:** Automatic timezone conversion for capture dates.

- Capture dates from `photo_metadata.json` are in UTC format
- Automatically converted to CET (Central European Time) / CEST (Central European Summer Time)
- Handles daylight saving time automatically
- Uses `Europe/Berlin` timezone

**Example:**
- UTC: `2025-04-19T09:59:55.000Z`
- CET: `Samstag, 19. April 2025, 11:59` (UTC+1)
- CEST: `Samstag, 19. Juli 2025, 11:59` (UTC+2)

#### 4.3 Metadata-Only Display

**Change:** Image information now uses only `photo_metadata.json`, no EXIF fallback.

**Before:**
- Date: EXIF `DateTimeOriginal` with metadata fallback
- Address: Not available

**After:**
- Date: Only from `photo_metadata.json` `captureDate` (UTC → CET/CEST)
- Address: Only from `photo_metadata.json` `FullAddress` or `ShortAddress`
- Location: Only from `photo_metadata.json` `location` field

**Benefits:**
- Consistent data source
- Faster display (no EXIF parsing needed)
- Uses pre-processed metadata from cache

---

### 5. Geolocation Map / Karte mit GeoLocation

**Feature:** Interactive map showing photo location above image information.

**Features:**
- Uses Leaflet.js with OpenStreetMap tiles
- Displays location from `photo_metadata.json` `location` field
- Shows red marker at exact photo coordinates
- Positioned above image information
- German map labels (using `tile.openstreetmap.de`)
- Configurable zoom level

**Configuration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,        // Must be enabled for map
    mapZoom: 13,                // Zoom level 1-19 (default: 13)
    // ... other settings
  }
}
```

**Map Details:**
- **Size**: 200x150px
- **Position**: Above image info (adjusts based on `imageInfoLocation`)
- **Zoom**: Configurable via `mapZoom` (1-19, default: 13)
  - 1-5: Continent/Country
  - 6-9: Region/State
  - 10-12: City
  - 13-14: Neighborhood (default: 13)
  - 15-17: Street/Building
  - 18-19: Very detailed
- **Language**: German labels (German OpenStreetMap server)
- **Interactive**: Disabled (display only, no user interaction)
- **Marker**: Red marker at exact photo coordinates

**Requirements:**
- `location` field must exist in `photo_metadata.json`
- Format: `"35.306061, 25.394467"` (latitude, longitude)
- Internet connection required (loads OpenStreetMap tiles)

**Technical Implementation:**
- Leaflet.js loaded via CDN
- Map created dynamically for each image
- Positioned relative to image (inside transition div)
- Automatically resized after creation

---

## Deutsch / German

### Übersicht

Dieser Fork erweitert das ursprüngliche MMM-SynPhotoSlideshow-Modul um fünf Hauptfunktionen:

1. **Fixed Frame Mode** - Option, Bilder in einem Rahmen statt Vollbild anzuzeigen
2. **Erweiterte Filterung** - Filtern von Fotos nach Personen, Orten (Geocoding) oder Szenen (Concepts)
3. **Erweiterter Bild-Cache & Metadaten** - Automatischer Download von Originalbildern zur Metadaten-Extraktion und Adress-Ermittlung
4. **Erweiterte Bildinformationen-Anzeige** - Anzeige von Aufnahmedatum und Adressen aus Metadaten
5. **Geolocation-Karte** - Interaktive Karte mit Foto-Standort

---

### 1. Fixed Frame Mode / Vollbild vs. Ausschnitte

**Feature:** Option, Bilder in einem festen Rahmen statt Vollbild anzuzeigen.

**Konfiguration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    useFixedFrame: true,        // Fixed Frame Modus aktivieren
    frameWidth: '80%',          // Rahmenbreite (CSS-Wert)
    frameHeight: '80%',         // Rahmenhöhe (CSS-Wert)
    framePosition: 'center',   // Position: 'center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    frameBackgroundColor: 'rgba(0, 0, 0, 0.5)', // Hintergrundfarbe um den Rahmen
    // ... weitere Einstellungen
  }
}
```

**Funktionsweise:**
- Bei `useFixedFrame: true` werden Bilder in einem konfigurierbaren Rahmen angezeigt
- Der Rahmen hat Schatten und abgerundete Ecken für einen Bilderrahmen-Effekt
- Hintergrund-Overlay wird um den Rahmen angezeigt
- Bilder werden innerhalb der Rahmen-Grenzen dargestellt
- Perfekt für einen digitalen Bilderrahmen-Effekt

**Visueller Effekt:**
- Vollbild-Modus: Bild füllt gesamten Bildschirm
- Fixed Frame Modus: Bild wird in einem Rahmen mit Hintergrund angezeigt

---

### 2. Erweiterte Filterung / Filtern nach Personen, Orten oder Szenen

**Feature:** Filtern von Fotos nach KI-generierten Alben (Personen, Concepts/Szenen, Geocoding/Orte).

**Konfiguration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    // Filtern nach Personen (KI-generierte Personen-Alben)
    synologyPersonIds: [123, 456],  // Array von Personen-IDs
    
    // Filtern nach Concepts/Szenen (KI-generierte Themen-Alben)
    synologyConceptIds: [789, 101],  // Array von Concept-IDs
    
    // Filtern nach Geocoding/Orten (KI-generierte Orts-Alben)
    synologyGeocodingIds: [202, 303], // Array von Geocoding-IDs
    
    // ... weitere Einstellungen
  }
}
```

**Funktionsweise:**
- Verwendet KI-generierte Alben aus dem persönlichen Speicherplatz von Synology Photos
- **Personen**: Filtern von Fotos mit bestimmten Personen (Gesichtserkennung)
- **Concepts**: Filtern von Fotos nach Szenen/Themen (z.B. "Strand", "Berge", "Essen")
- **Geocoding**: Filtern von Fotos nach Ort (z.B. "Paris", "New York")
- Priorität: Persönliche Alben > Tags > Reguläre Alben
- Mehrere IDs können für jeden Typ angegeben werden
- Fotos, die einer der angegebenen IDs entsprechen, werden einbezogen

**IDs finden:**
- Personen-IDs: Aus Synology Photos Personen-Alben
- Concept-IDs: Aus Synology Photos Concept/Themen-Alben
- Geocoding-IDs: Aus Synology Photos Orts-Alben

**Umgebungsvariablen:**
```bash
SYNOLOGY_PERSON_IDS=123,456
SYNOLOGY_CONCEPT_IDS=789,101
SYNOLOGY_GEOCODING_IDS=202,303
```

---

### 3. Erweiterter Bild-Cache & Metadaten / Erweiterte Bild-Cache und Metadaten

**Feature:** Automatischer Download von Originalbildern zur Metadaten-Extraktion und Adress-Ermittlung.

#### 3.1 Originalbild-Download

**Funktionsweise:**
- Wenn Metadaten nicht in `photo_metadata.json` verfügbar sind, lädt das Modul automatisch die Originalbild-Datei herunter
- Originalbilder werden lokal gecacht für Metadaten-Extraktion
- Verwendet `SYNO.Foto.Download` API zum Download von Vollauflösungs-Bildern mit EXIF-Daten
- Unterstützt sowohl persönlichen Speicherplatz als auch geteilte Alben

**Prozess:**
1. Prüfen, ob Metadaten in `photo_metadata.json` existieren
2. Wenn nicht gefunden, Originalbild von Synology herunterladen
3. EXIF-Metadaten extrahieren (Aufnahmedatum, GPS-Koordinaten, Kamera-Info)
4. Metadaten in `photo_metadata.json` für zukünftige Verwendung speichern
5. Originalbild cachen für schnellere nachfolgende Zugriffe

**Konfiguration:**
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    enableImageCache: true,        // Bild-Cache aktivieren
    imageCacheMaxSize: 500,        // Max. Cache-Größe in MB
    imageCachePreloadCount: 10,   // Anzahl der vorzuladenden Bilder
    // ... weitere Einstellungen
  }
}
```

#### 3.2 Adress-Ermittlung (Reverse Geocoding)

**Feature:** Automatische Adress-Ermittlung aus GPS-Koordinaten.

**Funktionsweise:**
- Wenn GPS-Koordinaten in EXIF-Daten gefunden werden, führt das Modul Reverse Geocoding durch
- Verwendet Nominatim API (OpenStreetMap) zum Abrufen von Adressen
- Respektiert Rate Limiting (max. 1 Anfrage pro 5 Sekunden)
- Generiert zwei Adressformate:
  - **FullAddress**: Vollständige Adresse aus Nominatim `display_name`
  - **ShortAddress**: Kurzes Format "Stadt - Land"

**Prozess:**
1. GPS-Koordinaten aus EXIF-Metadaten extrahieren
2. Prüfen, ob Adresse bereits in `photo_metadata.json` existiert
3. Wenn nicht, Nominatim API mit Rate Limiting aufrufen
4. Antwort parsen, um FullAddress und ShortAddress zu extrahieren
5. In `photo_metadata.json` für zukünftige Verwendung speichern

**Adressformat:**
- **FullAddress**: `"iokasti, 10, Varnali, Limin Chersonisou Municipality, Chersonisos Municipal Unit, Chersonissos Province, Heraklion Regional Unit, Crete Region, 700 14, Greece"`
- **ShortAddress**: `"Chersonisos Municipal Unit - Greece"`

**Rate Limiting:**
- Maximum 1 Anfrage pro 5 Sekunden (Nominatim-Richtlinie)
- Automatisches Warten zwischen Anfragen
- Verhindert API-Sperrung

**Speicherung:**
- Alle Metadaten werden in `photo_metadata.json` im Modul-Verzeichnis gespeichert
- Format: `{ "synologyId_spaceId": { "location": "lat, lon", "captureDate": "ISO8601", "FullAddress": "...", "ShortAddress": "..." } }`

---

### 4. Erweiterte Bildinformationen-Anzeige / Erweiterte Bildinformationen-Anzeige

**Feature:** Anzeige von Aufnahmedatum und Adressen aus `photo_metadata.json` mit Zeitzonen-Umwandlung.

#### 4.1 Neue `imageInfo` Optionen

**Verfügbare Optionen:**
- `capturedate` - Zeigt Aufnahmedatum nur aus `photo_metadata.json` an (kein EXIF-Fallback)
- `fulladdress` - Zeigt vollständige Adresse aus `photo_metadata.json` an
- `shortaddress` - Zeigt kurze Adresse im Format "Stadt - Land" an
- `address` - Zeigt Adresse mit Priorität: FullAddress > ShortAddress
- `date` - Zeigt Datum nur aus Metadaten an (kein EXIF-Fallback, aktualisiertes Verhalten)
- `name` - Zeigt Bildname an (bestehend)
- `imagecount` - Zeigt "X von Y" an (bestehend)

**Konfiguration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,
    imageInfo: ['capturedate', 'fulladdress'],  // Neue Optionen
    imageInfoLocation: 'bottomRight',           // Position: 'bottomRight', 'bottomLeft', 'topRight', 'topLeft'
    // ... weitere Einstellungen
  }
}
```

#### 4.2 UTC zu CET/CEST Zeitzonen-Umwandlung

**Feature:** Automatische Zeitzonen-Umwandlung für Aufnahmedaten.

- Aufnahmedaten aus `photo_metadata.json` sind im UTC-Format
- Werden automatisch in CET (Mitteleuropäische Zeit) / CEST (Mitteleuropäische Sommerzeit) umgewandelt
- Behandelt automatisch die Sommerzeit
- Verwendet `Europe/Berlin` Zeitzone

**Beispiel:**
- UTC: `2025-04-19T09:59:55.000Z`
- CET: `Samstag, 19. April 2025, 11:59` (UTC+1)
- CEST: `Samstag, 19. Juli 2025, 11:59` (UTC+2)

#### 4.3 Nur-Metadaten-Anzeige

**Änderung:** Bildinformationen verwenden jetzt nur noch `photo_metadata.json`, kein EXIF-Fallback.

**Vorher:**
- Datum: EXIF `DateTimeOriginal` mit Metadaten-Fallback
- Adresse: Nicht verfügbar

**Nachher:**
- Datum: Nur aus `photo_metadata.json` `captureDate` (UTC → CET/CEST)
- Adresse: Nur aus `photo_metadata.json` `FullAddress` oder `ShortAddress`
- Standort: Nur aus `photo_metadata.json` `location` Feld

**Vorteile:**
- Konsistente Datenquelle
- Schnellere Anzeige (kein EXIF-Parsing nötig)
- Verwendet vorverarbeitete Metadaten aus Cache

---

### 5. Geolocation-Karte / Karte mit GeoLocation

**Feature:** Interaktive Karte, die den Foto-Standort oberhalb der Bildinformationen anzeigt.

**Features:**
- Verwendet Leaflet.js mit OpenStreetMap-Karten
- Zeigt Standort aus dem `location` Feld von `photo_metadata.json` an
- Zeigt roten Marker an exakten Foto-Koordinaten
- Positioniert oberhalb der Bildinformationen
- Deutsche Kartenbeschriftungen (verwendet `tile.openstreetmap.de`)
- Konfigurierbarer Zoom-Level

**Konfiguration:**

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  config: {
    showImageInfo: true,        // Muss aktiviert sein für Karte
    mapZoom: 13,                // Zoom-Level 1-19 (Standard: 13)
    // ... weitere Einstellungen
  }
}
```

**Kartendetails:**
- **Größe**: 200x150px
- **Position**: Oberhalb der Bildinfo (passt sich an `imageInfoLocation` an)
- **Zoom**: Konfigurierbar über `mapZoom` (1-19, Standard: 13)
  - 1-5: Kontinent/Land
  - 6-9: Region/Staat
  - 10-12: Stadt
  - 13-14: Stadtteil (Standard: 13)
  - 15-17: Straße/Gebäude
  - 18-19: Sehr detailliert
- **Sprache**: Deutsche Beschriftungen (deutscher OpenStreetMap-Server)
- **Interaktiv**: Deaktiviert (nur Anzeige, keine Benutzerinteraktion)
- **Marker**: Roter Marker an exakten Foto-Koordinaten

**Anforderungen:**
- `location` Feld muss in `photo_metadata.json` existieren
- Format: `"35.306061, 25.394467"` (Breitengrad, Längengrad)
- Internetverbindung erforderlich (lädt OpenStreetMap-Karten)

**Technische Implementierung:**
- Leaflet.js wird über CDN geladen
- Karte wird dynamisch für jedes Bild erstellt
- Positioniert relativ zum Bild (innerhalb des Transition-Divs)
- Automatische Größenanpassung nach Erstellung

---

## Technical Changes / Technische Änderungen

### Dependencies Added / Hinzugefügte Abhängigkeiten

- **Leaflet.js** (via CDN) - For interactive map display
  - JavaScript: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - CSS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`

### Files Modified / Geänderte Dateien

1. **src/types.ts**
   - Added `mapZoom?: number` to `ModuleConfig` interface
   - Existing: `useFixedFrame`, `synologyPersonIds`, `synologyConceptIds`, `synologyGeocodingIds`

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
   - Fixed frame mode support (existing)

5. **src/frontend/ConfigValidator.ts**
   - Updated regex to accept new `imageInfo` values

6. **src/frontend/display.scss**
   - Added styles for `.map-container`
   - Positioned map above image info
   - Fixed frame styles (existing)

7. **src/backend/ExifExtractor.ts**
   - Reverse geocoding functionality (existing)
   - Address extraction (FullAddress, ShortAddress) (existing)
   - Metadata database management (existing)

8. **src/backend/ImageProcessor.ts**
   - Original image download for metadata extraction (existing)
   - Metadata loading from database (existing)

9. **src/backend/SynologyPhotosClient.ts**
   - Person/Concept/Geocoding album support (existing)
   - Original photo download API (existing)

---

## Configuration Options / Konfigurationsoptionen

### New Configuration Options / Neue Konfigurationsoptionen

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mapZoom` | number | 13 | Zoom level for location map (1-19) |

### Existing Configuration Options (Enhanced) / Bestehende Konfigurationsoptionen (Erweitert)

| Option | Change / Änderung |
|--------|-------------------|
| `imageInfo` | New values: `capturedate`, `fulladdress`, `shortaddress`, `address` |
| `useFixedFrame` | Existing feature - documented here |
| `synologyPersonIds` | Existing feature - documented here |
| `synologyConceptIds` | Existing feature - documented here |
| `synologyGeocodingIds` | Existing feature - documented here |

---

## Migration Guide / Migrationsleitfaden

### For Users Upgrading from Original / Für Benutzer, die vom Original aktualisieren

1. **Update your configuration:**

   ```javascript
   {
     module: 'MMM-SynPhotoSlideshow',
     config: {
       // New features
       showImageInfo: true,
       imageInfo: ['capturedate', 'fulladdress'],
       mapZoom: 13,
       
       // Filtering options
       synologyPersonIds: [123, 456],
       synologyConceptIds: [789],
       synologyGeocodingIds: [202],
       
       // Fixed frame mode
       useFixedFrame: true,
       frameWidth: '80%',
       frameHeight: '80%',
       
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
   - Filtering options are optional

---

## Requirements / Anforderungen

### For Metadata Display / Für Metadaten-Anzeige

- `photo_metadata.json` must contain:
  - `captureDate` (ISO 8601 UTC format) for date display
  - `location` (format: "lat, lon") for map display
  - `FullAddress` or `ShortAddress` for address display

### For Address Determination / Für Adress-Ermittlung

- GPS coordinates in EXIF data
- Internet connection for Nominatim API
- Rate limiting: 1 request per 5 seconds

### For Map Display / Für Kartenanzeige

- `location` field in `photo_metadata.json`
- Internet connection (loads OpenStreetMap tiles)
- Leaflet.js loaded via CDN

---

## Limitations / Einschränkungen

- Map requires internet connection (loads OpenStreetMap tiles)
- Map only displays if `location` field exists in metadata
- Date conversion assumes CET/CEST timezone (hardcoded to `Europe/Berlin`)
- Reverse geocoding rate limited to 1 request per 5 seconds
- Original image download requires appropriate Synology API permissions

---

## Summary / Zusammenfassung

### Key Differences / Hauptunterschiede

1. **Fixed Frame Mode** - Display images in a frame instead of fullscreen
2. **Advanced Filtering** - Filter by persons, concepts, or geocoding IDs
3. **Enhanced Metadata** - Automatic original download and address determination
4. **Enhanced Image Info** - Display date and addresses from metadata with timezone conversion
5. **Geolocation Map** - Interactive map showing photo location

### Compatibility / Kompatibilität

✅ **100% backward compatible** - All existing configurations work unchanged  
✅ **No breaking changes** - Existing features preserved  
✅ **Optional features** - New features are opt-in via configuration

---

## Links

- **Original Repository**: https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow
- **This Fork**: [Your repository URL]

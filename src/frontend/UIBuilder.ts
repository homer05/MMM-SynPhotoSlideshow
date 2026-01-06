/**
 * UIBuilder.ts
 *
 * Handles UI element creation (gradients, info divs, progress bars)
 */

import type { ImageInfo, ModuleConfig } from '../types';

// Declare global Log for MagicMirror
declare const Log: {
  warn: (message: string) => void;
};

class UIBuilder {
  private readonly config: ModuleConfig;

  constructor(config: ModuleConfig) {
    this.config = config;
  }

  /**
   * Create gradient div
   */
  createGradientDiv(
    direction: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    const div = document.createElement('div');
    div.style.backgroundImage = `linear-gradient( to ${direction}, ${gradient.join()})`;
    div.className = 'gradient';
    wrapper.appendChild(div);
  }

  /**
   * Create radial gradient div
   */
  createRadialGradientDiv(
    type: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    const div = document.createElement('div');
    div.style.backgroundImage = `radial-gradient( ${type}, ${gradient.join()})`;
    div.className = 'gradient';
    wrapper.appendChild(div);
  }

  /**
   * Parse location string from photo_metadata.json
   * Format: "35.306061, 25.394467" -> { lat: 35.306061, lon: 25.394467 }
   */
  private parseLocation(location: string): { lat: number; lon: number } | null {
    try {
      const parts = location.split(',').map(part => part.trim());
      if (parts.length !== 2) {
        return null;
      }
      const lat = Number.parseFloat(parts[0]);
      const lon = Number.parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) {
        return null;
      }
      return { lat, lon };
    } catch {
      return null;
    }
  }

  /**
   * Create map div for geolocation display
   * Uses location string from photo_metadata.json
   * Uses Leaflet with OpenStreetMap tiles
   * Stores map instance in container for proper cleanup
   */
  createMapDiv(wrapper: HTMLElement, location: string): HTMLDivElement | null {
    // Parse location string from photo_metadata.json
    const coords = this.parseLocation(location);
    if (!coords) {
      return null;
    }

    // Check if Leaflet is available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).L === 'undefined') {
      Log.warn('[MMM-SynPhotoSlideshow] Leaflet library not loaded, map cannot be displayed');
      return null;
    }

    const mapContainer = document.createElement('div');
    mapContainer.className = 'map-container'; // Fixed position, no location class needed
    const mapId = `map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    mapContainer.id = mapId;
    
    // Append container to DOM first
    wrapper.appendChild(mapContainer);
    
    // Initialize Leaflet map after container is in DOM
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        const map = L.map(mapId, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false
        }).setView([coords.lat, coords.lon], this.config.mapZoom || 13);

        // Add OpenStreetMap tile layer (German server for German labels)
        L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add marker
        L.marker([coords.lat, coords.lon], {
          icon: L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
          })
        }).addTo(map);

        // Store map instance in container for proper cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapContainer as any)._leafletMap = map;

        // Trigger map resize to ensure proper rendering
        // Store timer reference so it can be cleared if map is destroyed early
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapContainer as any)._leafletInvalidateTimer = setTimeout(() => {
          try {
            // Check if map still exists before calling invalidateSize
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const storedMap = (mapContainer as any)._leafletMap;
            if (storedMap && typeof storedMap.invalidateSize === 'function') {
              storedMap.invalidateSize();
            }
          } catch (error) {
            // Silently ignore errors if map was already destroyed
            Log.warn(`[MMM-SynPhotoSlideshow] Error calling invalidateSize: ${(error as Error).message}`);
          }
        }, 50);
      } catch (error) {
        Log.warn(`[MMM-SynPhotoSlideshow] Failed to create map: ${(error as Error).message}`);
      }
    }, 10);
    
    return mapContainer;
  }

  /**
   * Create world map div (left side, no zoom - shows location on world map)
   * Stores map instance in container for proper cleanup
   */
  createWorldMapDiv(wrapper: HTMLElement, location: string): HTMLDivElement | null {
    // Parse location string from photo_metadata.json
    const coords = this.parseLocation(location);
    if (!coords) {
      return null;
    }

    // Check if Leaflet is available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).L === 'undefined') {
      Log.warn('[MMM-SynPhotoSlideshow] Leaflet library not loaded, world map cannot be displayed');
      return null;
    }

    const mapContainer = document.createElement('div');
    mapContainer.className = 'world-map-container'; // Fixed position, no location class needed
    const mapId = `world-map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    mapContainer.id = mapId;
    
    // Append container to DOM first
    wrapper.appendChild(mapContainer);
    
    // Initialize Leaflet map after container is in DOM
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        // Use zoom level 2 for world map view (no zoom)
        const map = L.map(mapId, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false
        }).setView([coords.lat, coords.lon], 2); // Zoom level 2 for world map

        // Add OpenStreetMap tile layer (German server for German labels)
        L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add marker (smaller for world map)
        L.marker([coords.lat, coords.lon], {
          icon: L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconSize: [20, 32], // Smaller marker for world map
            iconAnchor: [10, 32],
            popupAnchor: [1, -34]
          })
        }).addTo(map);

        // Store map instance in container for proper cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapContainer as any)._leafletMap = map;

        // Trigger map resize to ensure proper rendering
        // Store timer reference so it can be cleared if map is destroyed early
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapContainer as any)._leafletInvalidateTimer = setTimeout(() => {
          try {
            // Check if map still exists before calling invalidateSize
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const storedMap = (mapContainer as any)._leafletMap;
            if (storedMap && typeof storedMap.invalidateSize === 'function') {
              storedMap.invalidateSize();
            }
          } catch (error) {
            // Silently ignore errors if map was already destroyed
            Log.warn(`[MMM-SynPhotoSlideshow] Error calling invalidateSize: ${(error as Error).message}`);
          }
        }, 50);
      } catch (error) {
        Log.warn(`[MMM-SynPhotoSlideshow] Failed to create world map: ${(error as Error).message}`);
      }
    }, 10);
    
    return mapContainer;
  }

  /**
   * Destroy Leaflet map instance to prevent memory leaks
   * Must be called before removing the map container from DOM
   */
  destroyMap(mapContainer: HTMLElement | null): void {
    if (!mapContainer) {
      return;
    }

    // Clear pending invalidateSize timer if it exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invalidateTimer = (mapContainer as any)._leafletInvalidateTimer;
    if (invalidateTimer) {
      clearTimeout(invalidateTimer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (mapContainer as any)._leafletInvalidateTimer;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (mapContainer as any)._leafletMap;
    if (map && typeof map.remove === 'function') {
      try {
        map.remove();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (mapContainer as any)._leafletMap;
      } catch (error) {
        Log.warn(`[MMM-SynPhotoSlideshow] Error destroying map: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Create image info div
   */
  createImageInfoDiv(wrapper: HTMLElement): HTMLDivElement {
    const div = document.createElement('div');
    div.className = `info ${this.config.imageInfoLocation}`; // Keep class for compatibility, but CSS overrides position
    wrapper.appendChild(div);
    return div;
  }

  /**
   * Create progress bar div
   */
  createProgressbarDiv(wrapper: HTMLElement, slideshowSpeed: number): void {
    const div = document.createElement('div');
    div.className = 'progress';
    const inner = document.createElement('div');
    inner.className = 'progress-inner';
    inner.style.display = 'none';
    inner.style.animation = `move ${slideshowSpeed}ms linear`;
    div.appendChild(inner);
    wrapper.appendChild(div);
  }

  /**
   * Restart progress bar animation
   */
  restartProgressBar(): void {
    const oldDiv = document.querySelector('.progress-inner') as HTMLElement;
    if (!oldDiv) return;

    const newDiv = oldDiv.cloneNode(true) as HTMLElement;
    oldDiv.parentNode?.replaceChild(newDiv, oldDiv);
    newDiv.style.display = '';
  }

  /**
   * Update image info display
   */
  updateImageInfo(
    imageInfoDiv: HTMLDivElement,
    imageinfo: ImageInfo,
    imageDate: string,
    translate: (key: string) => string
  ): void {
    const imageInfoArray = Array.isArray(this.config.imageInfo)
      ? this.config.imageInfo
      : [this.config.imageInfo];

    const imageProps = this.collectImageProperties(
      imageInfoArray,
      imageinfo,
      imageDate
    );
    const innerHTML = this.buildImageInfoHtml(imageProps, translate);

    imageInfoDiv.innerHTML = innerHTML;
  }

  /**
   * Collect image properties based on configuration
   */
  private collectImageProperties(
    infoArray: string[],
    imageinfo: ImageInfo,
    imageDate: string
  ): string[] {
    const props: string[] = [];

    for (const prop of infoArray) {
      const value = this.getImageProperty(prop, imageinfo, imageDate);
      if (value) {
        props.push(value);
      }
    }

    return props;
  }

  /**
   * Get a single image property value
   */
  private getImageProperty(
    prop: string,
    imageinfo: ImageInfo,
    imageDate: string
  ): string | null {
    switch (prop.toLowerCase()) {
      case 'date':
        // Nur aus metadata (photo_metadata.json), kein EXIF mehr
        if (imageinfo.metadata?.captureDate) {
          return this.formatCaptureDate(imageinfo.metadata.captureDate);
        }
        return null;

      case 'capturedate':
        // Nur aus metadata, nicht aus EXIF
        if (imageinfo.metadata?.captureDate) {
          return this.formatCaptureDate(imageinfo.metadata.captureDate);
        }
        return null;

      case 'fulladdress':
        return imageinfo.metadata?.FullAddress || null;

      case 'shortaddress':
        return imageinfo.metadata?.ShortAddress || null;

      case 'address':
        // Priorität: FullAddress > ShortAddress
        return imageinfo.metadata?.FullAddress || 
               imageinfo.metadata?.ShortAddress || 
               null;

      case 'name':
        return this.getNameProperty(imageinfo.path);

      case 'imagecount':
        return `${imageinfo.index} of ${imageinfo.total}`;

      default:
        Log.warn(
          `[MMM-SynPhotoSlideshow] ${prop} is not a valid value for imageInfo. Please check your configuration`
        );
        return null;
    }
  }

  /**
   * Get formatted date property
   */
  private getDateProperty(imageDate: string): string | null {
    if (imageDate && imageDate !== 'Invalid date') {
      return imageDate;
    }
    return null;
  }

  /**
   * Format capture date from metadata (ISO 8601 format, UTC)
   * Converts UTC to CET (Central European Time)
   */
  private formatCaptureDate(captureDate: string): string | null {
    if (!captureDate) {
      return null;
    }

    try {
      // Parse UTC date from photo_metadata.json
      const dateUTC = new Date(captureDate);
      if (isNaN(dateUTC.getTime())) {
        return null;
      }

      // Convert UTC to CET (UTC+1 in winter, UTC+2 in summer)
      // CET is UTC+1, CEST (Central European Summer Time) is UTC+2
      // JavaScript Date automatically handles timezone conversion when using toLocaleString
      // We'll use Europe/Berlin timezone which automatically handles CET/CEST
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin' // CET/CEST timezone
      };

      return dateUTC.toLocaleDateString('de-DE', options);
    } catch {
      return null;
    }
  }

  /**
   * Get formatted name property
   */
  private getNameProperty(imagePath: string): string {
    // Only display last path component as image name
    let imageName = imagePath.split('/').pop() || '';

    // Remove file extension from image name if configured
    if (this.config.imageInfoNoFileExt) {
      const dotIndex = imageName.lastIndexOf('.');
      if (dotIndex > 0) {
        imageName = imageName.substring(0, dotIndex);
      }
    }

    return imageName;
  }

  /**
   * Build HTML string for image info display
   */
  private buildImageInfoHtml(
    imageProps: string[],
    translate: (key: string) => string
  ): string {
    let html = `<header class="infoDivHeader">${translate('PICTURE_INFO')}</header>`;

    for (const val of imageProps) {
      html += `${val}<br/>`;
    }

    return html;
  }
}

export default UIBuilder;

/**
 * ExifExtractor.ts
 *
 * Extracts EXIF metadata (geolocation, capture date) from cached images
 * Uses exifr library for reliable EXIF parsing
 */

import exifr from 'exifr';
import sharp from 'sharp';
import { exiftool } from 'exiftool-vendored';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import Log from './Logger';

export interface ExifMetadata {
  captureDate?: string; // ISO 8601 format
  captureTimestamp?: number; // Unix timestamp
  latitude?: number;
  longitude?: number;
  location?: string; // Formatted location string
  FullAddress?: string; // Full address from Nominatim display_name
  ShortAddress?: string; // Short address format: "City - Country"
  camera?: string;
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
}

interface SynologyClient {
  getExifMetadata?: (
    photoId: number,
    spaceId: number | null
  ) => Promise<Record<string, unknown> | null>;
}

interface PhotoMetadataEntry {
  location?: string;
  captureDate?: string;
  address?: string; // Reverse geocoded address from Nominatim (deprecated, use FullAddress)
  FullAddress?: string; // Full address from Nominatim display_name
  ShortAddress?: string; // Short address format: "City - Country"
  synologyId: number;
  spaceId: number | null;
}

interface PhotoMetadataDatabase {
  [key: string]: PhotoMetadataEntry; // Key: `${synologyId}_${spaceId || 0}`
}

class ExifExtractor {
  private synologyClient: SynologyClient | null = null;

  private metadataFilePath: string | null = null;

  private lastGeocodingRequestTime: number = 0;

  private readonly geocodingRateLimitMs: number = 5000; // 5 seconds between requests

  private geocodingQueue: Array<() => Promise<void>> = [];

  private isProcessingGeocodingQueue: boolean = false;

  /**
   * Set Synology client for API-based EXIF extraction
   */
  setSynologyClient(client: SynologyClient | null): void {
    this.synologyClient = client;
  }

  /**
   * Extract EXIF metadata from Synology API
   * This is the preferred method as it doesn't require downloading the file
   */
  async extractMetadataFromApi(
    photoId: number,
    spaceId: number | null = null
  ): Promise<ExifMetadata | null> {
    if (!this.synologyClient?.getExifMetadata) {
      Log.debug('Synology client not available for API-based EXIF extraction');
      return null;
    }

    try {
      const apiData = await this.synologyClient.getExifMetadata(photoId, spaceId);
      if (!apiData) {
        Log.debug(`No EXIF data returned from API for photo ${photoId}`);
        return null;
      }

      Log.debug(`Received EXIF data from API for photo ${photoId}: ${Object.keys(apiData).length} fields`);
      
      const result: ExifMetadata = {};

      // Extract capture date/time
      // API might return date in different formats
      const dateTimeOriginal = apiData.DateTimeOriginal || apiData.DateTime || apiData.date_time_original || apiData.date_time;
      if (dateTimeOriginal) {
        try {
          // Ensure dateTimeOriginal is a string or number
          const dateValue = typeof dateTimeOriginal === 'string' || typeof dateTimeOriginal === 'number' 
            ? dateTimeOriginal 
            : String(dateTimeOriginal);
          const dateObj = new Date(dateValue);
          if (!isNaN(dateObj.getTime())) {
            result.captureDate = dateObj.toISOString();
            result.captureTimestamp = dateObj.getTime();
          }
        } catch {
          // Try parsing as timestamp
          const timestamp = Number(dateTimeOriginal);
          if (!isNaN(timestamp) && timestamp > 0) {
            result.captureTimestamp = timestamp;
            result.captureDate = new Date(timestamp).toISOString();
          }
        }
      }

      // Extract GPS coordinates
      const gpsLatitude = apiData.GPSLatitude || apiData.gps_latitude || apiData.latitude;
      const gpsLongitude = apiData.GPSLongitude || apiData.gps_longitude || apiData.longitude;
      if (gpsLatitude !== undefined && gpsLongitude !== undefined) {
        result.latitude = Number(gpsLatitude);
        result.longitude = Number(gpsLongitude);
        result.location = `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
      }

      // Extract camera information
      const make = apiData.Make || apiData.make;
      const model = apiData.Model || apiData.model;
      if (make || model) {
        result.camera = [make, model].filter(Boolean).join(' ').trim();
      }

      // Extract technical details
      if (apiData.ISO || apiData.iso) {
        result.iso = Number(apiData.ISO || apiData.iso);
      }
      if (apiData.FNumber || apiData.f_number || apiData.aperture) {
        const fNum = Number(apiData.FNumber || apiData.f_number || apiData.aperture);
        result.aperture = `f/${fNum.toFixed(1)}`;
      }
      if (apiData.ExposureTime || apiData.exposure_time || apiData.shutter_speed) {
        const expTime = Number(apiData.ExposureTime || apiData.exposure_time || apiData.shutter_speed);
        if (expTime < 1) {
          result.shutterSpeed = `1/${Math.round(1 / expTime)}s`;
        } else {
          result.shutterSpeed = `${expTime.toFixed(1)}s`;
        }
      }
      if (apiData.FocalLength || apiData.focal_length) {
        const focal = Number(apiData.FocalLength || apiData.focal_length);
        result.focalLength = `${focal.toFixed(0)}mm`;
      }

      // Only return result if we found useful data
      if (result.captureDate || result.latitude !== undefined) {
        Log.debug(
          `Extracted EXIF metadata from API for photo ${photoId}: ${JSON.stringify(result)}`
        );
        return result;
      }

      Log.debug(`No useful EXIF data extracted from API for photo ${photoId}`);
      return null;
    } catch (error) {
      Log.warn(
        `Failed to extract EXIF metadata from API for photo ${photoId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Extract EXIF metadata from an image file
   * Uses exiftool-vendored for all image formats
   */
  async extractMetadata(imagePath: string): Promise<ExifMetadata | null> {
    try {
      // Check if file exists
      try {
        await fsPromises.access(imagePath);
      } catch {
        Log.debug(`Image file not found for EXIF extraction: ${imagePath}`);
        return null;
      }

      // Use exiftool-vendored for all formats
      return await this.extractMetadataWithSharp(imagePath);
    } catch (error) {
      Log.warn(
        `Failed to extract EXIF metadata from ${imagePath}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Extract EXIF metadata using exiftool-vendored
   * exiftool-vendored has excellent support for all image formats including HEIC
   */
  private async extractMetadataWithSharp(imagePath: string): Promise<ExifMetadata | null> {
    try {
      const tags = await exiftool.read(imagePath);
      
      // Parse relevant fields into ExifMetadata format
      const result: ExifMetadata = {};

      // Extract capture date/time
      const dateTimeOriginal = tags.DateTimeOriginal || tags.DateTime || tags.CreateDate;
      if (dateTimeOriginal) {
        try {
          const dateValue = typeof dateTimeOriginal === 'string' || typeof dateTimeOriginal === 'number' 
            ? dateTimeOriginal 
            : String(dateTimeOriginal);
          const dateObj = new Date(dateValue);
          if (!isNaN(dateObj.getTime())) {
            result.captureDate = dateObj.toISOString();
            result.captureTimestamp = dateObj.getTime();
          }
        } catch {
          const timestamp = Number(dateTimeOriginal);
          if (!isNaN(timestamp) && timestamp > 0) {
            result.captureTimestamp = timestamp;
            result.captureDate = new Date(timestamp).toISOString();
          }
        }
      }

      // Extract GPS coordinates
      const gpsLatitude = tags.GPSLatitude;
      const gpsLongitude = tags.GPSLongitude;
      if (gpsLatitude !== undefined && gpsLongitude !== undefined) {
        result.latitude = Number(gpsLatitude);
        result.longitude = Number(gpsLongitude);
        result.location = `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
      }

      // Extract camera information
      const make = tags.Make;
      const model = tags.Model;
      if (make || model) {
        result.camera = [make, model].filter(Boolean).join(' ').trim();
      }

      // Extract technical details
      if (tags.ISO) {
        result.iso = Number(tags.ISO);
      }

      if (tags.FNumber) {
        const fNum = Number(tags.FNumber);
        result.aperture = `f/${fNum.toFixed(1)}`;
      }

      if (tags.ExposureTime) {
        const expTime = Number(tags.ExposureTime);
        if (expTime < 1) {
          result.shutterSpeed = `1/${Math.round(1 / expTime)}s`;
        } else {
          result.shutterSpeed = `${expTime.toFixed(1)}s`;
        }
      }

      if (tags.FocalLength) {
        const focal = Number(tags.FocalLength);
        result.focalLength = `${focal.toFixed(0)}mm`;
      }

      // Only return result if we found useful data
      if (result.captureDate || result.latitude !== undefined) {
        Log.debug(`Extracted EXIF metadata from ${path.basename(imagePath)}`);
        return result;
      }

      Log.debug(`No useful EXIF data extracted from ${path.basename(imagePath)}`);
      return null;
    } catch (error) {
      Log.warn(
        `Failed to extract EXIF metadata from ${imagePath}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Parse EXIF data into ExifMetadata format
   */
  private parseExifData(exifData: any): ExifMetadata {
    const result: ExifMetadata = {};

    // Extract capture date/time
    const dateTimeOriginal = exifData.DateTimeOriginal;
    const dateTime = exifData.DateTime || dateTimeOriginal;
    if (dateTime) {
      const dateObj = new Date(dateTime);
      if (!isNaN(dateObj.getTime())) {
        result.captureDate = dateObj.toISOString();
        result.captureTimestamp = dateObj.getTime();
      }
    }

    // Extract GPS coordinates
    const gpsLatitude = exifData.GPSLatitude;
    const gpsLongitude = exifData.GPSLongitude;
    if (gpsLatitude !== undefined && gpsLongitude !== undefined) {
      result.latitude = Number(gpsLatitude);
      result.longitude = Number(gpsLongitude);
      result.location = `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
    }

    // Extract camera information
    const make = exifData.Make;
    const model = exifData.Model;
    if (make || model) {
      result.camera = [make, model].filter(Boolean).join(' ').trim();
    }

    // Extract technical details
    if (exifData.ISO) {
      result.iso = Number(exifData.ISO);
    }
    if (exifData.FNumber) {
      const fNum = Number(exifData.FNumber);
      result.aperture = `f/${fNum.toFixed(1)}`;
    }
    if (exifData.ExposureTime) {
      const expTime = Number(exifData.ExposureTime);
      if (expTime < 1) {
        result.shutterSpeed = `1/${Math.round(1 / expTime)}s`;
      } else {
        result.shutterSpeed = `${expTime.toFixed(1)}s`;
      }
    }
    if (exifData.FocalLength) {
      const focal = Number(exifData.FocalLength);
      result.focalLength = `${focal.toFixed(0)}mm`;
    }

    return result;
  }

  /**
   * Save metadata to JSON file alongside the image
   */
  async saveMetadata(
    imagePath: string,
    metadata: ExifMetadata
  ): Promise<string | null> {
    try {
      const metadataPath = `${imagePath}.metadata.json`;
      await fsPromises.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      Log.debug(`Saved metadata to ${metadataPath}`);
      return metadataPath;
    } catch (error) {
      Log.warn(
        `Failed to save metadata for ${imagePath}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Load metadata from JSON file and enrich with address data from centralized database
   */
  async loadMetadata(imagePath: string, synologyId?: number, spaceId?: number | null): Promise<ExifMetadata | null> {
    try {
      const metadataPath = `${imagePath}.metadata.json`;
      const data = await fsPromises.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data) as ExifMetadata;
      
      // Enrich with address data from centralized database if available
      if (synologyId !== undefined && this.metadataFilePath) {
        try {
          const database = await this.loadMetadataDatabase();
          const key = `${synologyId}_${spaceId || 0}`;
          const entry = database[key];
          
          if (entry) {
            // Add FullAddress and ShortAddress if available
            if (entry.FullAddress) {
              metadata.FullAddress = entry.FullAddress;
            }
            if (entry.ShortAddress) {
              metadata.ShortAddress = entry.ShortAddress;
            }
          }
        } catch (error) {
          Log.debug(`Failed to load address data from centralized database: ${(error as Error).message}`);
        }
      }
      
      return metadata;
    } catch {
      // Metadata file doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Initialize metadata file path (outside cache directory)
   * @param cacheDirPath - Path to cache directory (not a file path)
   */
  initializeMetadataFile(cacheDirPath?: string): void {
    if (cacheDirPath) {
      // Store metadata file in parent directory of cache (outside cache)
      // cacheDirPath is the cache directory, so we go up one level to module root
      const moduleDir = path.dirname(cacheDirPath);
      this.metadataFilePath = path.join(moduleDir, 'photo_metadata.json');
    } else {
      // Default location: module root
      this.metadataFilePath = path.join(__dirname, '..', '..', 'photo_metadata.json');
    }
    Log.debug(`Metadata file path: ${this.metadataFilePath}`);
  }

  /**
   * Load centralized metadata database
   * Handles corrupted/truncated files gracefully
   */
  private async loadMetadataDatabase(): Promise<PhotoMetadataDatabase> {
    if (!this.metadataFilePath) {
      return {};
    }

    try {
      const data = await fsPromises.readFile(this.metadataFilePath, 'utf-8');
      
      // Check if file is empty or only whitespace
      if (!data.trim()) {
        Log.warn(`Metadata database file is empty, returning empty database`);
        return {};
      }
      
      // Try to parse JSON
      try {
        return JSON.parse(data) as PhotoMetadataDatabase;
      } catch (parseError) {
        // File might be truncated or corrupted
        Log.warn(`Failed to parse metadata database (file may be truncated): ${(parseError as Error).message}`);
        
        // Try to load backup if available
        const backupPath = `${this.metadataFilePath}.backup`;
        try {
          const backupData = await fsPromises.readFile(backupPath, 'utf-8');
          if (backupData.trim()) {
            try {
              const backupDb = JSON.parse(backupData) as PhotoMetadataDatabase;
              Log.info(`Successfully loaded metadata database from backup`);
              // Restore backup to main file
              await this.saveMetadataDatabase(backupDb);
              return backupDb;
            } catch {
              Log.warn(`Backup file is also corrupted`);
            }
          }
        } catch {
          // No backup available or backup is also corrupted
        }
        
        // If all else fails, return empty database
        Log.warn(`Returning empty database due to corruption`);
        return {};
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, return empty database
        return {};
      }
      Log.warn(`Failed to load metadata database: ${(error as Error).message}`);
      return {};
    }
  }

  /**
   * Save centralized metadata database
   * Uses atomic write (temporary file + rename) to prevent corruption
   */
  private async saveMetadataDatabase(database: PhotoMetadataDatabase): Promise<void> {
    if (!this.metadataFilePath) {
      return;
    }

    try {
      // Create backup of existing file if it exists
      try {
        await fsPromises.access(this.metadataFilePath);
        const backupPath = `${this.metadataFilePath}.backup`;
        await fsPromises.copyFile(this.metadataFilePath, backupPath);
      } catch {
        // File doesn't exist yet or backup failed, continue anyway
      }

      // Write to temporary file first (atomic write)
      const tempPath = `${this.metadataFilePath}.tmp`;
      const jsonData = JSON.stringify(database, null, 2);
      
      await fsPromises.writeFile(tempPath, jsonData, 'utf-8');
      
      // Atomically replace the original file by renaming
      await fsPromises.rename(tempPath, this.metadataFilePath);
      
      Log.debug(`Saved metadata database to ${this.metadataFilePath}`);
    } catch (error) {
      Log.warn(`Failed to save metadata database: ${(error as Error).message}`);
      
      // Try to clean up temporary file if it exists
      try {
        const tempPath = `${this.metadataFilePath}.tmp`;
        await fsPromises.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Load metadata from centralized database only (without original file)
   * Returns metadata if found, null otherwise
   */
  async loadMetadataFromDatabase(
    synologyId: number,
    spaceId: number | null
  ): Promise<ExifMetadata | null> {
    if (!this.metadataFilePath) {
      return null;
    }

    try {
      const database = await this.loadMetadataDatabase();
      const key = `${synologyId}_${spaceId || 0}`;
      const entry = database[key];

      if (entry) {
        // Convert database entry to ExifMetadata
        const metadata: ExifMetadata = {};
        
        if (entry.location) {
          // Parse location string to get lat/lon
          const coords = this.parseLocation(entry.location);
          if (coords) {
            metadata.latitude = coords.lat;
            metadata.longitude = coords.lon;
            metadata.location = entry.location;
          }
        }
        
        if (entry.captureDate) {
          metadata.captureDate = entry.captureDate;
          // Convert to timestamp if needed
          try {
            metadata.captureTimestamp = new Date(entry.captureDate).getTime();
          } catch {
            // Ignore conversion errors
          }
        }
        
        // Add address data
        if (entry.FullAddress) {
          metadata.FullAddress = entry.FullAddress;
        }
        if (entry.ShortAddress) {
          metadata.ShortAddress = entry.ShortAddress;
        }
        
        return metadata;
      }
      
      return null;
    } catch (error) {
      Log.debug(`Failed to load metadata from database: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Save photo metadata to centralized database (if not already present)
   */
  async savePhotoMetadata(
    synologyId: number,
    spaceId: number | null,
    metadata: ExifMetadata
  ): Promise<void> {
    if (!this.metadataFilePath) {
      Log.debug('Metadata file path not initialized, skipping centralized save');
      return;
    }

    // Only save location and captureDate
    if (!metadata.location && !metadata.captureDate) {
      Log.debug(`No location or captureDate to save for photo ${synologyId}`);
      return;
    }

    try {
      const database = await this.loadMetadataDatabase();
      const key = `${synologyId}_${spaceId || 0}`;

      // Check if photo already exists in database
      const existingEntry = database[key];
      if (existingEntry) {
        Log.debug(`Photo ${synologyId} already in metadata database`);
        
        // If location exists but no FullAddress, try to geocode
        if (existingEntry.location && !existingEntry.FullAddress) {
          const coords = this.parseLocation(existingEntry.location);
          if (coords) {
            Log.debug(`Photo ${synologyId} has location but no address, geocoding ${coords.lat}, ${coords.lon}`);
            // Enqueue geocoding request (thread-safe)
            void this.enqueueGeocoding(key, coords.lat, coords.lon);
          }
        }
        return;
      }

      // Add new entry
      const entry: PhotoMetadataEntry = {
        synologyId,
        spaceId,
        location: metadata.location,
        captureDate: metadata.captureDate
      };

      database[key] = entry;
      await this.saveMetadataDatabase(database);
      Log.debug(`Saved metadata for photo ${synologyId} to centralized database`);

      // If location is available, try to geocode
      if (metadata.location) {
        const coords = this.parseLocation(metadata.location);
        if (coords) {
          Log.debug(`New photo ${synologyId} has location, geocoding ${coords.lat}, ${coords.lon}`);
          // Enqueue geocoding request (thread-safe)
          void this.enqueueGeocoding(key, coords.lat, coords.lon);
        }
      }
    } catch (error) {
      Log.warn(`Failed to save photo metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Parse location string to extract latitude and longitude
   * Format: "51.121669, 13.772767" -> { lat: 51.121669, lon: 13.772767 }
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
   * Reverse geocode location to address using Nominatim API
   * Respects rate limiting (max 1 request per 5 seconds)
   * Attribution: Data © OpenStreetMap contributors, ODbL 1.0
   * Returns object with FullAddress and ShortAddress
   * Uses accept-language=en to get addresses in Latin characters (English)
   */
  private async reverseGeocode(lat: number, lon: number): Promise<{ FullAddress: string; ShortAddress: string } | null> {
    // Build URL with accept-language=en to get addresses in Latin characters (English)
    // This ensures readable addresses for European users instead of local scripts (e.g., Greek, Cyrillic)
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
    
    // Rate limiting: wait if last request was less than 5 seconds ago
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastGeocodingRequestTime;
    if (timeSinceLastRequest < this.geocodingRateLimitMs) {
      const waitTime = this.geocodingRateLimitMs - timeSinceLastRequest;
      Log.debug(`Rate limiting: waiting ${waitTime}ms before next geocoding request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      // Set User-Agent as required by Nominatim policy
      Log.debug(`Calling Nominatim API: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'MMM-SynPhotoSlideshow/2.0.0 (MagicMirror Module)',
          'Referer': 'https://github.com/homer05/MMM-SynPhotoSlideshow', // Required by Nominatim policy
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors, we'll handle them
      });
      
      // Check for HTTP errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        Log.warn(`Nominatim API returned HTTP ${response.status} for ${lat}, ${lon}: ${JSON.stringify(response.data)}`);
        this.lastGeocodingRequestTime = Date.now();
        return null;
      }

      // Log response status for debugging
      Log.debug(`Nominatim API response status: ${response.status}`);
      
      if (!response.data) {
        Log.warn(`Nominatim API returned empty response for ${lat}, ${lon}`);
        this.lastGeocodingRequestTime = Date.now();
        return null;
      }
      
      if (response.data.error) {
        Log.warn(`Nominatim API error for ${lat}, ${lon}: ${JSON.stringify(response.data.error)}`);
        this.lastGeocodingRequestTime = Date.now();
        return null;
      }
      
      if (response.data && response.data.display_name) {
        this.lastGeocodingRequestTime = Date.now();
        
        // Extract display_name as FullAddress (exact copy, no modification)
        const FullAddress = String(response.data.display_name).trim();
        
        // Extract ShortAddress from address object: "City/Region - Country"
        let ShortAddress = '';
        if (response.data.address) {
          const addr = response.data.address;
          // Try to find city/town/village/municipality/county (in order of preference)
          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          const country = addr.country || '';
          
          if (city && country) {
            ShortAddress = `${city} - ${country}`;
          } else if (country) {
            ShortAddress = country;
          } else if (city) {
            ShortAddress = city;
          }
        }
        
        // If ShortAddress couldn't be constructed from address object, use a shortened version of display_name
        if (!ShortAddress && FullAddress) {
          const parts = FullAddress.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
          if (parts.length >= 2) {
            // Take last two parts (usually city/region and country)
            // Make sure we don't truncate the country name
            const lastPart = parts[parts.length - 1];
            const secondLastPart = parts[parts.length - 2];
            ShortAddress = `${secondLastPart} - ${lastPart}`;
          } else if (parts.length === 1) {
            ShortAddress = parts[0];
          } else {
            ShortAddress = FullAddress;
          }
        }
        
        // Ensure we have a valid ShortAddress
        if (!ShortAddress) {
          ShortAddress = FullAddress;
        }
        
        Log.debug(`Reverse geocoded ${lat}, ${lon} -> FullAddress: "${FullAddress}", ShortAddress: "${ShortAddress}"`);
        Log.debug(`Attribution: Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright`);
        
        return { FullAddress, ShortAddress };
      }
      return null;
    } catch (error) {
      // Enhanced error logging for better debugging
      let errorMessage = 'Unknown error';
      let httpStatus: number | undefined;
      let responseData: unknown;
      let isTimeout = false;
      let isNetworkError = false;
      
      if (error && typeof error === 'object') {
        // Check if it's an axios error
        if ('code' in error) {
          const code = String((error as { code: unknown }).code);
          if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
            isTimeout = true;
            errorMessage = `Timeout after 10 seconds`;
          } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
            isNetworkError = true;
            errorMessage = `Network error: ${code}`;
          } else {
            errorMessage = `Error code: ${code}`;
          }
        }
        
        if ('response' in error) {
          const axiosError = error as { 
            response?: { 
              status?: number; 
              data?: unknown; 
              statusText?: string;
              headers?: Record<string, unknown>;
            };
            request?: unknown;
          };
          if (axiosError.response) {
            httpStatus = axiosError.response.status;
            responseData = axiosError.response.data;
            const statusText = axiosError.response.statusText || '';
            errorMessage = `HTTP ${httpStatus}${statusText ? ` ${statusText}` : ''}`;
            
            // Check for rate limiting
            if (httpStatus === 429) {
              errorMessage = `Rate limit exceeded (HTTP 429)`;
              const retryAfter = axiosError.response.headers?.['retry-after'] || axiosError.response.headers?.['Retry-After'];
              if (retryAfter) {
                Log.debug(`Nominatim suggests retrying after ${retryAfter} seconds`);
              }
            }
          } else if (axiosError.request) {
            isNetworkError = true;
            errorMessage = 'Network error (no response from server)';
          }
        } else if ('message' in error) {
          const msg = String((error as { message: unknown }).message);
          if (msg && msg !== 'Error') {
            errorMessage = msg;
          }
        }
      } else if (error) {
        errorMessage = String(error);
      }
      
      // Log error with details
      if (httpStatus !== undefined) {
        Log.warn(
          `Failed to reverse geocode ${lat}, ${lon}: ${errorMessage}${responseData ? ` - Response: ${JSON.stringify(responseData)}` : ''}`
        );
      } else if (isTimeout) {
        Log.warn(`Failed to reverse geocode ${lat}, ${lon}: ${errorMessage} (request timed out)`);
      } else if (isNetworkError) {
        Log.warn(`Failed to reverse geocode ${lat}, ${lon}: ${errorMessage} (network issue)`);
      } else {
        Log.warn(`Failed to reverse geocode ${lat}, ${lon}: ${errorMessage}`);
      }
      
      // Log full error object in debug mode for troubleshooting
      if (error && typeof error === 'object') {
        Log.debug(`Full error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      }
      
      // Log URL for debugging
      Log.debug(`Geocoding URL that failed: ${url}`);
      
      this.lastGeocodingRequestTime = Date.now(); // Still update to prevent rapid retries
      return null;
    }
  }

  /**
   * Process geocoding queue (ensures thread-safe access)
   */
  private async processGeocodingQueue(): Promise<void> {
    if (this.isProcessingGeocodingQueue) {
      return;
    }

    this.isProcessingGeocodingQueue = true;

    while (this.geocodingQueue.length > 0) {
      const task = this.geocodingQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          Log.warn(`Error processing geocoding task: ${(error as Error).message}`);
        }
      }
    }

    this.isProcessingGeocodingQueue = false;
  }

  /**
   * Update address for a photo in the metadata database (thread-safe)
   */
  private async updatePhotoAddress(
    key: string,
    FullAddress: string,
    ShortAddress: string
  ): Promise<void> {
    if (!this.metadataFilePath) {
      return;
    }

    // Use file locking by reading, updating, and writing atomically
    try {
      const database = await this.loadMetadataDatabase();
      if (database[key]) {
        database[key].FullAddress = FullAddress;
        database[key].ShortAddress = ShortAddress;
        await this.saveMetadataDatabase(database);
        Log.debug(`Updated address for photo ${key} in metadata database: FullAddress="${FullAddress}", ShortAddress="${ShortAddress}"`);
      }
    } catch (error) {
      Log.warn(`Failed to update photo address: ${(error as Error).message}`);
    }
  }

  /**
   * Check if photo needs geocoding and trigger it if needed
   * Called when displaying an image to check if address is missing
   */
  async checkAndLogGeocodingUrl(
    synologyId: number,
    spaceId: number | null,
    location: string
  ): Promise<void> {
    if (!this.metadataFilePath) {
      return;
    }

    try {
      const database = await this.loadMetadataDatabase();
      const key = `${synologyId}_${spaceId || 0}`;
      const entry = database[key];

      // If photo exists in database but has no FullAddress, trigger geocoding
      if (entry && entry.location && !entry.FullAddress) {
        const coords = this.parseLocation(location);
        if (coords) {
          Log.debug(`Photo ${synologyId} has location "${location}" but no address, triggering geocoding`);
          // Enqueue geocoding request (thread-safe)
          void this.enqueueGeocoding(key, coords.lat, coords.lon);
        }
      }
    } catch (error) {
      Log.debug(`Failed to check geocoding: ${(error as Error).message}`);
    }
  }

  /**
   * Enqueue geocoding request (thread-safe queue processing)
   */
  private async enqueueGeocoding(
    key: string,
    lat: number,
    lon: number
  ): Promise<void> {
    return new Promise((resolve) => {
      this.geocodingQueue.push(async () => {
        const addressData = await this.reverseGeocode(lat, lon);
        if (addressData) {
          Log.debug(`Reverse geocoded address for photo ${key}: FullAddress="${addressData.FullAddress}", ShortAddress="${addressData.ShortAddress}"`);
          await this.updatePhotoAddress(key, addressData.FullAddress, addressData.ShortAddress);
        }
        resolve();
      });

      // Start processing queue if not already processing
      void this.processGeocodingQueue();
    });
  }

  /**
   * Extract and save metadata for an image (if not already cached)
   */
  async extractAndSaveMetadata(imagePath: string): Promise<ExifMetadata | null> {
    // Check if metadata already exists
    const existing = await this.loadMetadata(imagePath);
    if (existing) {
      Log.debug(`Using cached metadata for ${path.basename(imagePath)}`);
      return existing;
    }

    // Extract metadata
    const metadata = await this.extractMetadata(imagePath);
    if (metadata) {
      // Save metadata
      await this.saveMetadata(imagePath, metadata);
    }

    return metadata;
  }

}

export default ExifExtractor;

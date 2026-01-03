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
import Log from './Logger';

export interface ExifMetadata {
  captureDate?: string; // ISO 8601 format
  captureTimestamp?: number; // Unix timestamp
  latitude?: number;
  longitude?: number;
  location?: string; // Formatted location string
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

class ExifExtractor {
  private synologyClient: SynologyClient | null = null;

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
      Log.debug(`Extracting metadata with exiftool-vendored: ${path.basename(imagePath)}`);
      const tags = await exiftool.read(imagePath);
      
      // Debug: Output all metadata from exiftool
      Log.debug(`=== EXIFTOOL METADATA FOR ${path.basename(imagePath)} ===`);
      Log.debug(`Raw exiftool output (first 50 keys): ${JSON.stringify(Object.keys(tags).slice(0, 50))}`);
      
      // Output all metadata fields in debug mode
      for (const [key, value] of Object.entries(tags)) {
        if (value !== null && value !== undefined) {
          Log.debug(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
      Log.debug(`=== END EXIFTOOL METADATA ===`);
      
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
        Log.debug(
          `Extracted EXIF metadata from ${path.basename(imagePath)}: ${JSON.stringify(result)}`
        );
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
   * Load metadata from JSON file
   */
  async loadMetadata(imagePath: string): Promise<ExifMetadata | null> {
    try {
      const metadataPath = `${imagePath}.metadata.json`;
      const data = await fsPromises.readFile(metadataPath, 'utf-8');
      return JSON.parse(data) as ExifMetadata;
    } catch {
      // Metadata file doesn't exist or is invalid
      return null;
    }
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

/**
 * ImageProcessor.ts
 *
 * Handles image reading, resizing, and processing
 */

import sharp from 'sharp';
import fsPromises from 'node:fs/promises';
import Log from './Logger';
import type { ModuleConfig } from '../types';
import type ImageCache from './ImageCache';
import ExifExtractor, { type ExifMetadata } from './ExifExtractor';

interface SynologyClient {
  downloadPhoto: (url: string) => Promise<Buffer | null>;
}

class ImageProcessor {
  private readonly config: Partial<ModuleConfig>;

  private readonly imageCache: ImageCache | null;

  private readonly exifExtractor: ExifExtractor;

  constructor(
    config: Partial<ModuleConfig>,
    imageCache: ImageCache | null = null
  ) {
    this.config = config;
    this.imageCache = imageCache;
    this.exifExtractor = new ExifExtractor();
  }

  /**
   * Extract metadata asynchronously (non-blocking)
   */
  private async extractMetadataAsync(imagePath: string): Promise<void> {
    try {
      const metadata = await this.exifExtractor.extractAndSaveMetadata(imagePath);
      if (metadata) {
        if (metadata.captureDate) {
          Log.debug(`Extracted capture date from thumbnail: ${metadata.captureDate}`);
        }
        if (metadata.latitude !== undefined) {
          Log.debug(`Extracted location from thumbnail: ${metadata.location}`);
        }
      }
    } catch (error) {
      // Silently fail - metadata extraction is optional
      Log.debug(`Metadata extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Resize image using sharp
   */
  private async resizeImage(
    inputPath: string,
    callback: (data: string | null, metadata?: ExifMetadata) => void
  ): Promise<void> {
    Log.log(
      `Resizing image to max: ${this.config.maxWidth}x${this.config.maxHeight}`
    );

    try {
      const buffer = await sharp(inputPath)
        .rotate()
        .resize({
          width: Number.parseInt(String(this.config.maxWidth), 10),
          height: Number.parseInt(String(this.config.maxHeight), 10),
          fit: 'inside'
        })
        .jpeg({
          quality: 80,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();

      const dataUrl = `data:image/jpg;base64,${buffer.toString('base64')}`;
      
      // Try to extract metadata from original file
      let metadata: ExifMetadata | undefined;
      try {
        metadata = (await this.exifExtractor.extractAndSaveMetadata(inputPath)) || undefined;
      } catch (error) {
        Log.debug(`Failed to extract metadata from ${inputPath}: ${(error as Error).message}`);
      }
      
      callback(dataUrl, metadata);
      Log.log('Resizing complete');
    } catch (err) {
      Log.error('Error resizing image:', err);
      callback(null);
    }
  }

  /**
   * Read file without resizing
   */
  private async readFileRaw(
    filepath: string,
    callback: (data: string | null, metadata?: ExifMetadata) => void
  ): Promise<void> {
    const ext = filepath.split('.').pop();

    try {
      const buffer = await fsPromises.readFile(filepath);
      const dataUrl = `data:image/${ext};base64,${buffer.toString('base64')}`;
      
      // Try to extract metadata from file
      let metadata: ExifMetadata | undefined;
      try {
        metadata = (await this.exifExtractor.extractAndSaveMetadata(filepath)) || undefined;
      } catch (error) {
        Log.debug(`Failed to extract metadata from ${filepath}: ${(error as Error).message}`);
      }
      
      callback(dataUrl, metadata);
      Log.log('File read complete');
    } catch (err) {
      Log.error('Error reading file:', err);
      callback(null);
    }
  }

  /**
   * Download and process Synology image
   * Stores original file in cache, returns data URL for frontend
   */
  private async downloadSynologyImage(
    imageUrl: string,
    synologyClient: SynologyClient,
    callback: (data: string | null, metadata?: ExifMetadata) => void,
    synologyId?: number,
    spaceId?: number | null
  ): Promise<void> {
    try {
      if (this.imageCache && this.config.enableImageCache) {
        // Use consistent cache key based on synologyId and spaceId
        const cachedPath = await this.imageCache.get(imageUrl, synologyId, spaceId);

        if (cachedPath) {
          Log.debug('Serving image from cache');
          // Read cached file and convert to data URL for frontend
          try {
            const buffer = await fsPromises.readFile(cachedPath);
            const ext = cachedPath.split('.').pop()?.toLowerCase() || 'jpeg';
            const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
            const base64 = buffer.toString('base64');
            
            // Try to load metadata from original file cache (if available)
            // Original files are cached with key: original_${synologyId}_${spaceId}
            let metadata: ExifMetadata | undefined;
            if (synologyId !== undefined && this.imageCache) {
              try {
                const originalCacheKey = `original_${synologyId}_${spaceId || 0}`;
                Log.debug(`Looking for original file cache with key: ${originalCacheKey}`);
                const originalCachedPath = await this.imageCache.get(originalCacheKey, synologyId, spaceId);
                if (originalCachedPath) {
                  Log.debug(`Found original file cache: ${originalCachedPath}`);
                  // Try to load metadata from original file
                  metadata = (await this.exifExtractor.loadMetadata(originalCachedPath)) || undefined;
                  if (metadata) {
                    Log.debug(`Loaded metadata from original file cache for ${originalCachedPath}`);
                  } else {
                    // Try to extract metadata from original file
                    Log.debug(`No cached metadata found for original, extracting from ${originalCachedPath}...`);
                    metadata = (await this.exifExtractor.extractAndSaveMetadata(originalCachedPath)) || undefined;
                    if (metadata) {
                      Log.debug(`Successfully extracted metadata from original file`);
                    } else {
                      Log.debug(`Failed to extract metadata from original file`);
                    }
                  }
                } else {
                  Log.debug(`Original file cache not found for key: ${originalCacheKey}`);
                }
              } catch (error) {
                Log.debug(`Failed to load metadata from original file: ${(error as Error).message}`);
              }
            } else {
              if (synologyId === undefined) {
                Log.debug(`No synologyId available for metadata lookup`);
              }
              if (!this.imageCache) {
                Log.debug(`Image cache not available for metadata lookup`);
              }
            }
            
            // Fallback: try to load metadata from thumbnail cache
            if (!metadata) {
              try {
                metadata = (await this.exifExtractor.loadMetadata(cachedPath)) || undefined;
                if (metadata) {
                  Log.debug(`Loaded metadata from thumbnail cache for ${cachedPath}`);
                } else {
                  // Metadata not available, try to extract it from thumbnail
                  Log.debug(`No cached metadata found, extracting from thumbnail...`);
                  metadata = (await this.exifExtractor.extractAndSaveMetadata(cachedPath)) || undefined;
                }
              } catch (error) {
                Log.debug(`Failed to extract metadata from thumbnail: ${(error as Error).message}`);
              }
            }
            
            callback(`data:image/${mimeType};base64,${base64}`, metadata);
            return;
          } catch (error) {
            Log.warn(
              `Failed to read cached file ${cachedPath}: ${(error as Error).message}`
            );
            // Continue to download
          }
        }
      }

      Log.debug('Downloading Synology image...');
      const imageBuffer = await synologyClient.downloadPhoto(imageUrl);

      if (imageBuffer) {
        // Determine file extension from URL or default to jpg
        let fileExtension = '.jpg';
        if (imageUrl.includes('.heic') || imageUrl.includes('.HEIC')) {
          fileExtension = '.heic';
        } else if (imageUrl.includes('.png')) {
          fileExtension = '.png';
        } else if (imageUrl.includes('.webp')) {
          fileExtension = '.webp';
        }

        // Store thumbnail in cache with consistent key
        let metadata: ExifMetadata | undefined;
        if (this.imageCache && this.config.enableImageCache) {
          // Use consistent cache key based on synologyId and spaceId
          const cachedPath = await this.imageCache.set(imageUrl, imageBuffer, fileExtension, synologyId, spaceId);
          
          // Extract EXIF metadata from cached thumbnail (if available)
          if (cachedPath) {
            try {
              // Try to extract metadata synchronously (may take a moment)
              metadata = (await this.exifExtractor.extractAndSaveMetadata(cachedPath)) || undefined;
              if (metadata) {
                Log.debug(`Extracted metadata from ${cachedPath}`);
              }
            } catch (error) {
              Log.debug(`Failed to extract metadata: ${(error as Error).message}`);
            }
          }
        }

        // Convert to data URL for frontend compatibility
        const base64 = imageBuffer.toString('base64');
        const mimeType = fileExtension === '.heic' ? 'heic' : 'jpeg';
        const dataUrl = `data:image/${mimeType};base64,${base64}`;
        Log.debug(`Downloaded Synology image: ${imageBuffer.length} bytes`);

        callback(dataUrl, metadata);
      } else {
        Log.error('Failed to download Synology image');
        callback(null);
      }
    } catch (error) {
      Log.error(
        `Error downloading Synology image: ${(error as Error).message}`
      );
      callback(null);
    }
  }

  /**
   * Read and process image file
   */
  async readFile(
    filepath: string,
    callback: (data: string | null, metadata?: ExifMetadata) => void,
    imageUrl: string | null = null,
    synologyClient: SynologyClient | null = null,
    synologyId?: number,
    spaceId?: number | null
  ): Promise<void> {
    if (imageUrl && synologyClient) {
      await this.downloadSynologyImage(imageUrl, synologyClient, callback, synologyId, spaceId);
      return;
    }

    if (this.config.resizeImages) {
      await this.resizeImage(filepath, callback);
    } else {
      Log.log('Reading image without resizing');
      await this.readFileRaw(filepath, callback);
    }
  }
}

export default ImageProcessor;

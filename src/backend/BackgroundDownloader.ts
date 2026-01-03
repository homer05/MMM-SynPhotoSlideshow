/**
 * BackgroundDownloader.ts
 *
 * Handles background downloading of images from Synology
 * and periodic checking for new images
 */

import fsPromises from 'node:fs/promises';
import Log from './Logger';
import type { ModuleConfig, PhotoItem } from '../types';
import type ImageCache from './ImageCache';
import type ImageProcessor from './ImageProcessor';
import type SynologyManager from './SynologyManager';
import TimerManager from './TimerManager';
import ExifExtractor from './ExifExtractor';

interface SynologyClient {
  downloadPhoto: (url: string) => Promise<Buffer | null>;
  downloadOriginalPhoto: (
    photoId: number,
    spaceId: number | null,
    filePath?: string,
    personId?: number
  ) => Promise<Buffer | null>;
  getExifMetadata?: (
    photoId: number,
    spaceId: number | null
  ) => Promise<Record<string, unknown> | null>;
}

class BackgroundDownloader {
  private readonly config: ModuleConfig;

  private readonly imageCache: ImageCache | null;

  private readonly imageProcessor: ImageProcessor | null;

  private readonly synologyManager: SynologyManager;

  private readonly timerManager: TimerManager;

  private readonly exifExtractor: ExifExtractor;

  private isDownloading = false;

  private downloadedImageIds = new Set<string>();

  constructor(
    config: ModuleConfig,
    imageCache: ImageCache | null,
    imageProcessor: ImageProcessor | null,
    synologyManager: SynologyManager
  ) {
    this.config = config;
    this.imageCache = imageCache;
    this.imageProcessor = imageProcessor;
    this.synologyManager = synologyManager;
    this.timerManager = new TimerManager();
    this.exifExtractor = new ExifExtractor();
  }

  /**
   * Start background download process
   */
  start(): void {
    if (!this.config.backgroundDownloadEnabled) {
      Log.debug('Background download disabled');
      return;
    }

    const interval =
      this.config.backgroundDownloadInterval || 60 * 60 * 1000; // Default: 1 hour

    Log.info(
      `Starting background downloader with interval: ${interval / 1000 / 60} minutes`
    );

    // Start initial download after a short delay
    setTimeout(() => {
      void this.checkAndDownloadNewImages();
    }, 5000);

    // Schedule periodic checks
    this.timerManager.startRefreshTimer(() => {
      void this.checkAndDownloadNewImages();
    }, interval);
  }

  /**
   * Stop background download process
   */
  stop(): void {
    this.timerManager.stopRefreshTimer();
    Log.info('Background downloader stopped');
  }

  /**
   * Check for new images and download them
   */
  async checkAndDownloadNewImages(): Promise<void> {
    if (this.isDownloading) {
      Log.debug('Background download already in progress, skipping');
      return;
    }

    if (!this.config.enableImageCache || !this.imageCache) {
      Log.debug('Image cache disabled, skipping background download');
      return;
    }

    this.isDownloading = true;
    Log.info('Checking for new images on Synology...');

    try {
      // Fetch current image list from Synology
      const photos = await this.synologyManager.fetchPhotos(this.config);

      if (!photos || photos.length === 0) {
        Log.debug('No photos found on Synology');
        this.isDownloading = false;
        return;
      }

      // Filter to only images with URLs
      const imagesWithUrls = photos.filter((photo) => photo.url);

      Log.info(
        `Found ${imagesWithUrls.length} images, checking which need to be downloaded...`
      );

      // Check which images are not yet cached as original files
      const imagesToDownload: PhotoItem[] = [];
      let skippedNoId = 0;
      let alreadyCached = 0;
      for (const image of imagesWithUrls) {
        if (!image.synologyId) {
          skippedNoId++;
          Log.debug(
            `Skipping image without synologyId: ${image.path} (has url: ${!!image.url})`
          );
          continue; // Skip images without synologyId
        }

        // Check if original file is already cached
        const originalCacheKey = `original_${image.synologyId}_${image.spaceId || 0}`;
        const cachedPath = await this.imageCache.get(originalCacheKey, image.synologyId, image.spaceId);

        if (!cachedPath) {
          imagesToDownload.push(image);
          Log.debug(`Will download original: ${image.path} (synologyId: ${image.synologyId}, spaceId: ${image.spaceId || 0})`);
        } else {
          alreadyCached++;
          Log.debug(`Original already cached: ${image.path} (key: ${originalCacheKey})`);
        }
      }

      Log.info(
        `Background download check: ${imagesToDownload.length} to download, ${alreadyCached} already cached, ${skippedNoId} skipped (no synologyId)`
      );

      if (skippedNoId > 0) {
        Log.warn(
          `Skipped ${skippedNoId} images without synologyId - they may not be from Synology`
        );
      }

      if (imagesToDownload.length === 0) {
        Log.info('All images are already cached');
        this.isDownloading = false;
        return;
      }

      Log.info(
        `Found ${imagesToDownload.length} new images to download in background`
      );

      // Download images in background (with delay to avoid overload)
      await this.downloadImages(imagesToDownload);
    } catch (error) {
      Log.error(
        `Error checking for new images: ${(error as Error).message}`
      );
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Download images in background with rate limiting
   */
  private async downloadImages(images: PhotoItem[]): Promise<void> {
    const synologyClient = this.synologyManager.getClient();
    if (!synologyClient) {
      Log.error('Synology client not available, cannot download images');
      return;
    }

    const delay = this.config.imageCachePreloadDelay || 500;

    for (const image of images) {
      if (!image.synologyId) {
        Log.debug(`Skipping image without synologyId: ${image.path}`);
        continue;
      }

      try {
        Log.debug(`Background downloading original: ${image.path}`);

        // Download original file (with EXIF metadata) instead of thumbnail
        // Pass filePath if available for File Station API fallback
        // Pass personId if available for alternative download method
        const imageBuffer = await synologyClient.downloadOriginalPhoto(
          image.synologyId,
          image.spaceId || null,
          (image as PhotoItem & { filePath?: string }).filePath,
          (image as PhotoItem & { personId?: number }).personId
        );

        if (imageBuffer && this.imageCache) {
          // Determine file extension from filename
          let fileExtension = '.jpg';
          const lowerPath = image.path.toLowerCase();
          if (lowerPath.endsWith('.heic')) {
            fileExtension = '.heic';
          } else if (lowerPath.endsWith('.png')) {
            fileExtension = '.png';
          } else if (lowerPath.endsWith('.webp')) {
            fileExtension = '.webp';
          } else if (lowerPath.endsWith('.jpeg')) {
            fileExtension = '.jpeg';
          }

          // Use synologyId as cache key for original files
          const cacheKey = `original_${image.synologyId}_${image.spaceId || 0}`;
          const cachedPath = await this.imageCache.set(cacheKey, imageBuffer, fileExtension, image.synologyId, image.spaceId);
          this.downloadedImageIds.add(cacheKey);

          const sizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
          Log.info(
            `Background downloaded and cached original: ${image.path} (${sizeMB}MB)`
          );
          
          // Extract EXIF metadata from cached local file using exiftool-vendored
          if (cachedPath) {
            try {
              Log.debug(`Extracting EXIF metadata from cached original: ${cachedPath}`);
              // Check if file exists
              try {
                await fsPromises.access(cachedPath);
                Log.debug(`Original file exists: ${cachedPath}`);
              } catch {
                Log.warn(`Original file does not exist: ${cachedPath}`);
              }
              
              const metadata = await this.exifExtractor.extractAndSaveMetadata(cachedPath);
              if (metadata) {
                Log.debug(`Successfully extracted metadata from file for ${image.path}`);
                if (metadata.captureDate) {
                  Log.debug(`  Capture date: ${metadata.captureDate}`);
                }
                if (metadata.latitude !== undefined) {
                  Log.debug(`  Location: ${metadata.location}`);
                }
                if (metadata.camera) {
                  Log.debug(`  Camera: ${metadata.camera}`);
                }
              } else {
                Log.debug(`No metadata extracted from ${cachedPath}`);
              }
            } catch (error) {
              Log.warn(
                `Failed to extract EXIF metadata from file for ${image.path}: ${(error as Error).message}`
              );
            }
          } else {
            Log.warn(`No cached path available for metadata extraction: ${image.path} (cacheKey: original_${image.synologyId}_${image.spaceId || 0})`);
          }
        } else if (!imageBuffer) {
          // Original file downloads are not available due to API permissions
          // This is expected behavior - we continue with thumbnails which are successfully cached
          Log.debug(`Original file download not available for: ${image.path} (API permission restrictions). Using thumbnail instead.`);
        }

        // Rate limiting: wait between downloads
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      } catch (error) {
        Log.warn(
          `Failed to background download ${image.path}: ${(error as Error).message}`
        );
        // Continue with next image
      }
    }

    Log.info(
      `Background download complete: ${images.length} images processed`
    );
  }

  /**
   * Get download statistics
   */
  getStats(): {
    enabled: boolean;
    interval: number;
    downloadedCount: number;
    isDownloading: boolean;
  } {
    return {
      enabled: this.config.backgroundDownloadEnabled || false,
      interval: this.config.backgroundDownloadInterval || 0,
      downloadedCount: this.downloadedImageIds.size,
      isDownloading: this.isDownloading
    };
  }
}

export default BackgroundDownloader;

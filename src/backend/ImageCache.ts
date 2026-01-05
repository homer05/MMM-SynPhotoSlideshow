/**
 * ImageCache.ts
 *
 * Manages image caching with automatic size limits and pre-loading
 */

import NodeCache from 'node-cache';
import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import Log from './Logger';
import type { ModuleConfig, PhotoItem } from '../types';

interface FileStats {
  path: string;
  name: string;
  size: number;
  mtime: Date;
}

type ImageDownloadCallback = (
  image: PhotoItem,
  callback: (imageData: string | null) => void
) => void;

class ImageCache {
  private readonly config: Partial<ModuleConfig>;

  private cache: NodeCache | null = null;

  private cacheDir: string | null = null;

  private preloadQueue: PhotoItem[] = [];

  private isPreloading = false;

  private currentCacheSize = 0;

  private maxCacheSize = 0;

  private readonly preloadDelay: number;

  constructor(config: Partial<ModuleConfig>) {
    this.config = config;
    this.preloadDelay = config.imageCachePreloadDelay || 500;
  }

  /**
   * Initialize the cache
   */
  async initialize(): Promise<boolean> {
    try {
      // Use custom path from config if provided, otherwise use default
      if (this.config.imageCachePath) {
        this.cacheDir = this.config.imageCachePath;
      } else {
        this.cacheDir = path.join(__dirname, '..', '..', '.image-cache');
      }
      const maxSizeMB = this.config.imageCacheMaxSize || 500;
      this.maxCacheSize = maxSizeMB * 1024 * 1024;

      try {
        await fsPromises.mkdir(this.cacheDir, { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }

      this.cache = new NodeCache({
        stdTTL: 60 * 60 * 24 * 7,
        checkperiod: 600,
        useClones: false,
        maxKeys: 1000
      });

      await this.calculateCacheSize();

      Log.info(
        `Image cache initialized at ${this.cacheDir} with max size ${maxSizeMB}MB`
      );
      return true;
    } catch (error) {
      Log.error(
        `Failed to initialize image cache: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Calculate current cache size
   */
  private async calculateCacheSize(): Promise<void> {
    try {
      let totalSize = 0;

      if (!this.cacheDir) return;

      try {
        const files = await fsPromises.readdir(this.cacheDir);

        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const sizes = await Promise.all(
            batch.map(async (file) => {
              try {
                const filePath = path.join(this.cacheDir!, file);
                const stats = await fsPromises.stat(filePath);
                return stats.isFile() ? stats.size : 0;
              } catch {
                return 0;
              }
            })
          );
          totalSize += sizes.reduce((sum, size) => sum + size, 0);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      this.currentCacheSize = totalSize;
      Log.debug(
        `Current cache size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`
      );
    } catch (error) {
      Log.error(`Error calculating cache size: ${(error as Error).message}`);
      this.currentCacheSize = 0;
    }
  }

  /**
   * Get current cache size in MB
   */
  async getCurrentCacheSize(): Promise<number> {
    await this.calculateCacheSize();
    return Math.round(this.currentCacheSize / 1024 / 1024);
  }

  /**
   * Evict old files if cache is too large
   */
  async evictOldFiles(): Promise<void> {
    if (
      this.currentCacheSize <= this.maxCacheSize ||
      !this.cacheDir ||
      !this.cache
    ) {
      return;
    }

    try {
      const files = await fsPromises.readdir(this.cacheDir);
      const fileStats: FileStats[] = [];

      const statsPromises = files.map(async (file) => {
        try {
          const filePath = path.join(this.cacheDir!, file);
          const stats = await fsPromises.stat(filePath);

          if (stats.isFile()) {
            return {
              path: filePath,
              name: file,
              size: stats.size,
              mtime: stats.mtime
            };
          }
        } catch {
          // File might have been deleted
        }
        return null;
      });

      const allStats = await Promise.all(statsPromises);
      fileStats.push(
        ...(allStats.filter((stat) => stat !== null) as FileStats[])
      );

      fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      const targetSize = this.maxCacheSize * 0.9;
      for (const file of fileStats) {
        if (this.currentCacheSize <= targetSize) {
          break;
        }

        try {
          // PROTECTION: Never delete photo_metadata.json (even if it somehow ends up in cache dir)
          if (file.name === 'photo_metadata.json' || file.name.endsWith('photo_metadata.json')) {
            Log.debug(`Skipping photo_metadata.json in eviction (protected file)`);
            continue;
          }
          
          await fsPromises.unlink(file.path);
          // Extract key from filename (remove extension)
          const key = file.name.replace(/\.(jpg|jpeg|png|heic|webp)$/i, '');
          this.cache.del(key);
          this.currentCacheSize -= file.size;
          Log.debug(
            `Evicted ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
          );
        } catch (error) {
          Log.debug(
            `Could not evict ${file.name}: ${(error as Error).message}`
          );
        }
      }
    } catch (error) {
      Log.error(`Error evicting files: ${(error as Error).message}`);
    }
  }

  /**
   * Generate cache key from image URL or path
   * If synologyId and spaceId are provided, use a consistent key based on these IDs
   */
  getCacheKey(imageIdentifier: string, synologyId?: number, spaceId?: number | null): string {
    // Check if this is already a consistent cache key (original_ or thumbnail_)
    if (imageIdentifier.startsWith('original_') || imageIdentifier.startsWith('thumbnail_')) {
      return imageIdentifier; // Already a consistent key
    }
    
    // For Synology images, use consistent key based on synologyId and spaceId
    if (synologyId !== undefined) {
      // Check if this is a Synology URL for original files
      if (imageIdentifier.includes('SYNO.Foto.Download') || imageIdentifier.includes('SYNO.FotoTeam.Download')) {
        return `original_${synologyId}_${spaceId || 0}`;
      }
      // Check if this is a Synology URL for thumbnails
      if (imageIdentifier.includes('SYNO.Foto.Thumbnail') || imageIdentifier.includes('SYNO.FotoTeam.Thumbnail')) {
        return `thumbnail_${synologyId}_${spaceId || 0}`;
      }
      // Default to thumbnail for Synology images if URL type is unclear
      return `thumbnail_${synologyId}_${spaceId || 0}`;
    }
    // Fallback: use hash of identifier (for non-Synology images)
    return crypto.createHash('md5').update(imageIdentifier).digest('hex');
  }

  /**
   * Get image from cache (returns file path for original files)
   * @param imageIdentifier - URL or path identifier
   * @param synologyId - Optional Synology photo ID for consistent caching
   * @param spaceId - Optional space ID for consistent caching
   */
  async get(imageIdentifier: string, synologyId?: number, spaceId?: number | null): Promise<string | null> {
    if (!this.cache || !this.cacheDir) {
      return null;
    }

    try {
      const key = this.getCacheKey(imageIdentifier, synologyId, spaceId);
      const cachedMeta = this.cache.get(key);

      if (cachedMeta) {
        // Try to find cached file with any extension
        const extensions = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];
        for (const ext of extensions) {
          const filePath = path.join(this.cacheDir, `${key}${ext}`);
          try {
            await fsPromises.access(filePath);
            Log.debug(`Cache hit for ${imageIdentifier}`);
            return filePath;
          } catch {
            // Try next extension
          }
        }
        this.cache.del(key);
        Log.debug(`Cache file missing for ${imageIdentifier}`);
        return null;
      }

      // Check disk cache without metadata
      const extensions = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];
      for (const ext of extensions) {
        const filePath = path.join(this.cacheDir, `${key}${ext}`);
        try {
          await fsPromises.access(filePath);
          this.cache.set(key, true);
          Log.debug(`Disk cache hit for ${imageIdentifier}`);
          return filePath;
        } catch {
          // Try next extension
        }
      }

      Log.debug(`Cache miss for ${imageIdentifier}`);
      return null;
    } catch (error) {
      Log.error(`Error getting from cache: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get cached file path (for backward compatibility with base64 data URLs)
   * Returns null if file doesn't exist, file path if it does
   * @param imageIdentifier - URL or path identifier
   * @param synologyId - Optional Synology photo ID for consistent caching
   * @param spaceId - Optional space ID for consistent caching
   */
  async getFilePath(imageIdentifier: string, synologyId?: number, spaceId?: number | null): Promise<string | null> {
    return this.get(imageIdentifier, synologyId, spaceId);
  }

  /**
   * Store image in cache (original file as Buffer)
   * Returns the file path if successful, null otherwise
   * @param imageIdentifier - URL or path identifier
   * @param imageData - Image data as string or Buffer
   * @param fileExtension - File extension (default: .jpg)
   * @param synologyId - Optional Synology photo ID for consistent caching
   * @param spaceId - Optional space ID for consistent caching
   */
  async set(
    imageIdentifier: string,
    imageData: string | Buffer,
    fileExtension = '.jpg',
    synologyId?: number,
    spaceId?: number | null
  ): Promise<string | null> {
    if (!this.cache || !this.cacheDir) {
      return null;
    }

    try {
      const key = this.getCacheKey(imageIdentifier, synologyId, spaceId);
      const filePath = path.join(this.cacheDir, `${key}${fileExtension}`);

      // Check if cache is at max keys limit and evict old entries if needed
      // NodeCache has a maxKeys limit of 1000, so we need to remove old entries before adding new ones
      if (this.cache) {
        const currentKeys = this.cache.keys();
        if (currentKeys.length >= 1000) {
          Log.debug(`Cache at max keys limit (${currentKeys.length}/1000), evicting old entries...`);
          // Remove oldest 100 entries to make room
          const keysToRemove = currentKeys.slice(0, 100);
          for (const oldKey of keysToRemove) {
            this.cache.del(oldKey);
          }
          Log.debug(`Evicted ${keysToRemove.length} old cache entries, now ${this.cache.keys().length} entries remaining`);
        }
      }

      // Try to set the key, catch error if maxKeys is still exceeded
      try {
        this.cache.set(key, true);
      } catch (error) {
        // If still failing, try to evict more entries
        if ((error as Error).message.includes('max keys') || (error as Error).message.includes('maxKeys')) {
          Log.warn(`Cache still at max keys after eviction, removing more entries...`);
          const allKeys = this.cache.keys();
          const keysToRemove = allKeys.slice(0, 200); // Remove 200 more entries
          for (const oldKey of keysToRemove) {
            this.cache.del(oldKey);
          }
          // Try again
          this.cache.set(key, true);
          Log.debug(`Successfully added cache key after additional eviction`);
        } else {
          throw error; // Re-throw if it's a different error
        }
      }

      let buffer: Buffer;
      if (typeof imageData === 'string') {
        // If it's a base64 data URL, extract the buffer
        if (imageData.startsWith('data:')) {
          const base64Data = imageData.split(',')[1];
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          // Plain base64 string
          buffer = Buffer.from(imageData, 'base64');
        }
      } else {
        buffer = imageData;
      }

      await fsPromises.writeFile(filePath, buffer);

      const dataSize = buffer.length;
      this.currentCacheSize += dataSize;

      if (this.currentCacheSize > this.maxCacheSize) {
        this.evictOldFiles().catch((error) => {
          Log.error(`Error evicting old files: ${(error as Error).message}`);
        });
      }

      Log.debug(
        `Cached image ${imageIdentifier} (${(dataSize / 1024 / 1024).toFixed(2)}MB)`
      );
      return filePath;
    } catch (error) {
      Log.error(`Error setting cache: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Pre-load images in the background
   */
  async preloadImages(
    images: PhotoItem[],
    downloadCallback: ImageDownloadCallback
  ): Promise<void> {
    if (!this.config.enableImageCache || !this.cache) {
      return;
    }

    this.preloadQueue = images
      .filter((img) => img.url)
      .slice(0, this.config.imageCachePreloadCount || 10);

    Log.info(
      `Starting background preload of ${this.preloadQueue.length} images`
    );

    this.processPreloadQueue(downloadCallback).catch((error) => {
      Log.error(`Error processing preload queue: ${(error as Error).message}`);
    });
  }

  /**
   * Process preload queue in background
   */
  private async processPreloadQueue(
    downloadCallback: ImageDownloadCallback
  ): Promise<void> {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;

    while (this.preloadQueue.length > 0) {
      const image = this.preloadQueue.shift();
      if (!image) continue;

      // Use consistent cache key based on synologyId and spaceId if available
      const imageIdentifier = image.url || image.path;
      const synologyId = (image as PhotoItem & { synologyId?: number }).synologyId;
      const spaceId = (image as PhotoItem & { spaceId?: number | null }).spaceId;
      const key = this.getCacheKey(imageIdentifier, synologyId, spaceId);
      const cachedMeta = this.cache?.get(key);

      if (cachedMeta) {
        Log.debug(`Skipping preload, already cached: ${image.path}`);
      } else {
        try {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Preload timeout'));
            }, 30000);

            downloadCallback(image, async (imageData) => {
              clearTimeout(timeout);
              if (imageData) {
                // Determine file extension from URL or path
                let fileExtension = '.jpg';
                const imageUrl = image.url || image.path;
                if (imageUrl.includes('.heic') || imageUrl.includes('.HEIC')) {
                  fileExtension = '.heic';
                } else if (imageUrl.includes('.png')) {
                  fileExtension = '.png';
                } else if (imageUrl.includes('.webp')) {
                  fileExtension = '.webp';
                }
                await this.set(imageUrl, imageData, fileExtension, synologyId, spaceId);
                Log.debug(`Preloaded and cached: ${image.path}`);
              }
              resolve();
            });
          });

          await new Promise((resolve) => {
            setTimeout(resolve, this.preloadDelay);
          });
        } catch (error) {
          Log.error(`Error preloading image: ${(error as Error).message}`);
        }
      }
    }

    this.isPreloading = false;
    Log.info('Background preload complete');
  }

  /**
   * Clear all cache
   * IMPORTANT: Never deletes photo_metadata.json - it's stored outside cache directory
   */
  async clear(): Promise<void> {
    if (!this.cache || !this.cacheDir) {
      return;
    }

    try {
      this.cache.flushAll();

      try {
        const files = await fsPromises.readdir(this.cacheDir);

        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (file) => {
              try {
                // PROTECTION: Never delete photo_metadata.json (even if it somehow ends up in cache dir)
                if (file === 'photo_metadata.json' || file.endsWith('photo_metadata.json')) {
                  Log.debug(`Skipping photo_metadata.json in cache clear (protected file)`);
                  return;
                }
                const filePath = path.join(this.cacheDir!, file);
                await fsPromises.unlink(filePath);
              } catch {
                // File might already be deleted
              }
            })
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      this.currentCacheSize = 0;
      Log.info('Cache cleared');
    } catch (error) {
      Log.error(`Error clearing cache: ${(error as Error).message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    enabled: boolean;
    maxSize: number;
    preloadCount: number;
  } | null> {
    if (!this.cache) {
      return null;
    }

    try {
      return {
        enabled: this.config.enableImageCache || false,
        maxSize: this.config.imageCacheMaxSize || 500,
        preloadCount: this.config.imageCachePreloadCount || 10
      };
    } catch (error) {
      Log.error(`Error getting cache stats: ${(error as Error).message}`);
      return null;
    }
  }
}

export default ImageCache;

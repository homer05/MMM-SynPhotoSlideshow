/**
 * SlideshowController.ts
 *
 * Main controller for slideshow logic
 * Orchestrates all backend components
 */

import { exec } from 'node:child_process';
import Log from './Logger';
import ImageListManager from './ImageListManager';
import TimerManager from './TimerManager';
import ConfigLoader from './ConfigLoader';
import SynologyManager from './SynologyManager';
import ImageProcessor from './ImageProcessor';
import ImageCache from './ImageCache';
import MemoryMonitor from './MemoryMonitor';
import BackgroundDownloader from './BackgroundDownloader';
import type { ImageInfo, ModuleConfig } from '../types';

export type NotificationCallback = (
  notification: string,
  payload?: unknown
) => void;
/**
 * Main slideshow controller
 * Handles all business logic for the slideshow module
 */
export default class SlideshowController {
  private readonly imageListManager: ImageListManager;

  private readonly timerManager: TimerManager;

  private readonly synologyManager: SynologyManager;

  private imageCache: ImageCache | null = null;

  private imageProcessor: ImageProcessor | null = null;

  private memoryMonitor: MemoryMonitor | null = null;

  private backgroundDownloader: BackgroundDownloader | null = null;

  private config: ModuleConfig | null = null;

  private isRetryingImageLoad = false;

  private isLoadingNextBatch = false; // Flag to prevent multiple simultaneous batch loads

  private readonly notificationCallback: NotificationCallback;

  constructor(notificationCallback: NotificationCallback) {
    this.notificationCallback = notificationCallback;
    this.imageListManager = new ImageListManager();
    this.timerManager = new TimerManager();
    this.synologyManager = new SynologyManager();
    Log.info('SlideshowController initialized');
  }

  /**
   * Initialize the controller with configuration
   */
  async initialize(payload: Partial<ModuleConfig>): Promise<void> {
    const config = ConfigLoader.initialize(payload);
    this.config = config;

    // Initialize memory monitor if enabled
    if (config.enableMemoryMonitor !== false) {
      this.memoryMonitor = new MemoryMonitor(config);

      this.memoryMonitor.onCleanupNeeded(() => {
        Log.info('Running memory cleanup');
        if (this.imageCache) {
          void this.imageCache.evictOldFiles();
        }
      });

      this.memoryMonitor.start();
    }

    // Initialize image cache if enabled
    if (config.enableImageCache) {
      this.imageCache = new ImageCache(config);
      await this.imageCache.initialize();
    }

    // Initialize image processor
    this.imageProcessor = new ImageProcessor(config, this.imageCache);

    // Note: Background downloader and refresh timer are no longer used
    // Images are loaded dynamically when all current images have been shown

    // Start slideshow after a short delay
    setTimeout(() => {
      void this.gatherImageList(config, true, 0, true).then(() => {
        void this.getNextImage();
      });
    }, 200);
  }

  /**
   * Gather images from Synology and prepare the image list
   * @param config - Module configuration
   * @param sendNotification - Whether to send notification
   * @param offset - Offset for pagination (default: 0)
   * @param checkForNewFirst - If true, check for new photos first (default: false)
   */
  async gatherImageList(
    config: ModuleConfig,
    sendNotification = false,
    offset: number = 0,
    checkForNewFirst: boolean = false
  ): Promise<void> {
    if (!config?.synologyUrl) {
      this.notificationCallback('BACKGROUNDSLIDESHOW_REGISTER_CONFIG');
      return;
    }

    Log.info(`Gathering image list... (offset: ${offset}, checkForNewFirst: ${checkForNewFirst})`);

    // Check cache size and evict if needed
    if (this.imageCache && config.enableImageCache) {
      const currentSize = await this.imageCache.getCurrentCacheSize();
      const maxSize = config.imageCacheMaxSize || 50000; // Default 50GB in MB
      if (currentSize >= maxSize) {
        Log.info(`Cache size (${currentSize}MB) reached max (${maxSize}MB), evicting old files...`);
        await this.imageCache.evictOldFiles();
      }
    }

    const photos = await this.synologyManager.fetchPhotos(config, offset, checkForNewFirst);
    const finalImageList = this.imageListManager.prepareImageList(
      photos,
      config,
      false // Never preload in gatherImageList - preload is handled separately
    );

    // Update batch offset
    if (checkForNewFirst) {
      this.imageListManager.setCurrentBatchOffset(0);
    } else {
      this.imageListManager.setCurrentBatchOffset(offset);
    }

    if (this.imageCache && config.enableImageCache) {
      this.imageCache.preloadImages(finalImageList, (image, callback) => {
        this.imageProcessor?.readFile(
          image.path,
          callback,
          image.url,
          this.synologyManager.getClient(),
          image.synologyId,
          image.spaceId
        );
      });
    }

    this.notificationCallback('BACKGROUNDSLIDESHOW_FILELIST', {
      imageList: finalImageList
    });

    if (sendNotification) {
      this.notificationCallback('BACKGROUNDSLIDESHOW_READY', {
        identifier: config.identifier
      });
    }
  }

  /**
   * Get and display the next image in the slideshow
   */
  async getNextImage(): Promise<void> {
    Log.debug('Getting next image...');

    if (!this.imageListManager || this.imageListManager.isEmpty()) {
      Log.debug('Image list empty, loading images...');
      if (this.config) {
        await this.gatherImageList(this.config, false, 0, true);
      }

      if (this.imageListManager.isEmpty()) {
        // Only schedule one retry attempt
        if (!this.isRetryingImageLoad) {
          Log.warn('No images available, retrying in 10 minutes');
          this.isRetryingImageLoad = true;
          setTimeout(() => {
            this.isRetryingImageLoad = false;
            this.getNextImage().catch((error) => {
              Log.error(
                `Error retrying image load: ${(error as Error).message}`
              );
            });
          }, 600000);
        }
        return;
      }
    }

    // Clear retry flag if we have images
    this.isRetryingImageLoad = false;

    // Check if we need to preload next batch (when only 2 images remain)
    const currentList = this.imageListManager.getList();
    const remainingImages = currentList.length - this.imageListManager.index;
    const batchSize = this.config?.synologyMaxPhotos || 100;
    
    if (remainingImages <= 2 && !this.isLoadingNextBatch && this.config) {
      Log.info(`Only ${remainingImages} images remaining, preloading next batch in background...`);
      void this.preloadNextBatch(); // Load asynchronously without blocking
    }

    // Check if all images in current batch have been shown
    if (this.imageListManager.areAllImagesShown()) {
      Log.info('All images in current batch have been shown, switching to next batch...');
      
      if (!this.config) {
        return;
      }

      // If next batch was already preloaded, switch to it
      if (this.imageListManager.hasNextBatchPreloaded()) {
        Log.info('Switching to preloaded next batch');
        this.imageListManager.switchToNextBatch();
      } else {
        // Next batch not preloaded, load it now (fallback)
        Log.info('Next batch not yet preloaded, loading now...');
        
        // Check if all photos from Synology have been shown
        const allShownSet = this.imageListManager.readShownImagesTracker();
        const batchSize = this.config.synologyMaxPhotos || 100;
        const currentOffset = this.imageListManager.getCurrentBatchOffset();
        
        // Try to load next batch
        // First, check for new photos (offset 0)
        const newPhotos = await this.synologyManager.fetchPhotos(this.config, 0, true);
        
        if (newPhotos.length > 0) {
          // Filter out already shown photos
          const unseenNewPhotos = newPhotos.filter(photo => !allShownSet.has(photo.path));
          
          if (unseenNewPhotos.length > 0) {
            Log.info(`Found ${unseenNewPhotos.length} new unseen photos, loading them first`);
            await this.gatherImageList(this.config, false, 0, true);
          } else {
            // No new unseen photos, load next batch
            const nextOffset = currentOffset + batchSize;
            Log.info(`Loading next batch with offset ${nextOffset}`);
            await this.gatherImageList(this.config, false, nextOffset, false);
          }
        } else {
          // No new photos, try next batch
          const nextOffset = currentOffset + batchSize;
          const nextBatchPhotos = await this.synologyManager.fetchPhotos(this.config, nextOffset, false);
          
          if (nextBatchPhotos.length > 0) {
            Log.info(`Loading next batch with offset ${nextOffset}`);
            await this.gatherImageList(this.config, false, nextOffset, false);
          } else {
            // No more photos available - all photos from Synology have been shown
            Log.info('All photos from Synology have been shown, resetting tracker and starting from beginning');
            this.imageListManager.resetShownImagesTracker();
            await this.gatherImageList(this.config, false, 0, true);
          }
        }
        
        // After loading new batch, get next image
        if (this.imageListManager.isEmpty()) {
          Log.warn('No images available after loading next batch');
          return;
        }
      }
    }

    const image = this.imageListManager.getNextImage();
    if (!image) {
      Log.error('Failed to get next image');
      return;
    }

    if (
      this.imageListManager.index === 0 &&
      this.config?.showAllImagesBeforeRestart
    ) {
      this.imageListManager.resetShownImagesTracker();
    }

    const imageUrl = image.url || null;
    const synologyClient = this.synologyManager.getClient();

    this.imageProcessor?.readFile(
      image.path,
      (data, metadata) => {
        const returnPayload: ImageInfo = {
          identifier: this.config?.identifier || '',
          path: image.path,
          data: data || '',
          index: this.imageListManager.index,
          total: this.imageListManager.getList().length,
          metadata: metadata
        };
        
        // Debug output for metadata
        if (metadata) {
          Log.debug(`Image metadata for "${image.path}":`);
          if (metadata.captureDate) {
            Log.debug(`  Capture Date: ${metadata.captureDate}`);
          }
          if (metadata.latitude !== undefined && metadata.longitude !== undefined) {
            Log.debug(`  Location: ${metadata.location} (${metadata.latitude}, ${metadata.longitude})`);
          }
          if (metadata.camera) {
            Log.debug(`  Camera: ${metadata.camera}`);
          }
        } else {
          Log.debug(`No metadata available for "${image.path}"`);
        }
        
        Log.debug(`Sending DISPLAY_IMAGE notification for "${image.path}"`);
        this.notificationCallback(
          'BACKGROUNDSLIDESHOW_DISPLAY_IMAGE',
          returnPayload
        );
      },
      imageUrl,
      synologyClient,
      image.synologyId,
      image.spaceId
    );

    const slideshowSpeed = this.config?.slideshowSpeed || 10000;
    Log.info(`Using slideshowSpeed: ${slideshowSpeed}ms (${slideshowSpeed / 1000}s)`);
    this.timerManager.startSlideshowTimer(() => {
      void this.getNextImage();
    }, slideshowSpeed);

    if (this.config?.showAllImagesBeforeRestart) {
      this.imageListManager.addImageToShown(image.path);
    }
  }

  /**
   * Get and display the previous image
   */
  getPreviousImage(): void {
    if (this.imageListManager) {
      this.imageListManager.getPreviousImage();
    }
    void this.getNextImage();
  }

  /**
   * Preload next batch in background when only 2 images remain
   */
  private async preloadNextBatch(): Promise<void> {
    if (!this.config || this.isLoadingNextBatch) {
      return;
    }

    this.isLoadingNextBatch = true;
    
    try {
      // Check if all photos from Synology have been shown
      const allShownSet = this.imageListManager.readShownImagesTracker();
      const batchSize = this.config.synologyMaxPhotos || 100;
      const currentOffset = this.imageListManager.getCurrentBatchOffset();
      
      // First, check for new photos (offset 0)
      const newPhotos = await this.synologyManager.fetchPhotos(this.config, 0, true);
      
      if (newPhotos.length > 0) {
        // Filter out already shown photos
        const unseenNewPhotos = newPhotos.filter(photo => !allShownSet.has(photo.path));
        
        if (unseenNewPhotos.length > 0) {
          Log.info(`Preloading ${unseenNewPhotos.length} new unseen photos in background`);
          this.imageListManager.prepareImageList(newPhotos, this.config, true); // Preload mode
          return;
        }
      }
      
      // No new unseen photos, preload next batch
      const nextOffset = currentOffset + batchSize;
      Log.info(`Preloading next batch with offset ${nextOffset} in background`);
      const nextBatchPhotos = await this.synologyManager.fetchPhotos(this.config, nextOffset, false);
      
      if (nextBatchPhotos.length > 0) {
        this.imageListManager.prepareImageList(nextBatchPhotos, this.config, true); // Preload mode
      } else {
        // No more photos available - all photos from Synology have been shown
        Log.info('All photos from Synology have been shown, will reset tracker when current batch ends');
        // Don't reset tracker here - wait until all current images are shown
      }
    } catch (error) {
      Log.error(`Error preloading next batch: ${(error as Error).message}`);
    } finally {
      this.isLoadingNextBatch = false;
    }
  }

  // Note: refreshImageList() method removed - images are now loaded dynamically
  // when all current images have been shown

  /**
   * Pause the slideshow
   */
  pause(): void {
    this.timerManager?.stopAllTimers();
  }

  /**
   * Resume/start the slideshow
   */
  play(): void {
    const slideshowSpeed = this.config?.slideshowSpeed || 10000;
    this.timerManager?.startSlideshowTimer(() => {
      void this.getNextImage();
    }, slideshowSpeed);

    // Note: Refresh timer removed - images are now loaded dynamically
  }

  /**
   * Play a video file
   */
  playVideo(videoPath: string): void {
    Log.info('Playing video');
    exec(`omxplayer --win 0,0,1920,1080 --alpha 180 ${videoPath}`, () => {
      this.notificationCallback('BACKGROUNDSLIDESHOW_PLAY', null);
      Log.info('Video playback complete');
    });
  }
}

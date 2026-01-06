/**
 * ModuleController.ts
 *
 * Main controller for the MMM-SynPhotoSlideshow frontend module.
 * Handles module lifecycle, notifications, and UI updates.
 */

import type { ImageInfo, ModuleConfig } from '../types';
import ConfigValidator from './ConfigValidator';
import ImageHandler from './ImageHandler';
import UIBuilder from './UIBuilder';
import TransitionHandler from './TransitionHandler';

interface LoggerInterface {
  info: (message: string, ...args: unknown[]) => void;
  log: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

type MomentInterface = (
  date: string,
  format: string
) => { format: (format: string) => string };

interface EXIFInterface {
  getData: (image: HTMLImageElement, callback: () => void) => void;
  getTag: (image: HTMLImageElement, tag: string) => string | number | null;
}

interface NotificationCallbacks {
  sendSocketNotification: (notification: string, payload?: unknown) => void;
  sendNotification: (notification: string, payload?: unknown) => void;
  translate: (key: string) => string;
}

/**
 * ModuleController - Main controller for the frontend module
 */
export default class ModuleController {
  private config: ModuleConfig;

  private readonly identifier: string;

  private imageHandler: ImageHandler | null = null;

  private uiBuilder: UIBuilder | null = null;

  private transitionHandler: TransitionHandler | null = null;

  private imagesDiv: HTMLDivElement | null = null;

  private imageInfoDiv: HTMLDivElement | null = null;

  private imageList: string[] = [];

  private imageIndex = 0;

  private playingVideo = false;

  private timer: NodeJS.Timeout | null = null;

  private savedImages: string[] | null = null;

  private backendManagesSlideshow = true; // Backend manages slideshow timing by default

  private savedIndex: number | null = null;

  private readonly callbacks: NotificationCallbacks;

  private readonly Log: LoggerInterface;

  private readonly moment: MomentInterface;

  private readonly EXIF: EXIFInterface;

  constructor(
    config: ModuleConfig,
    identifier: string,
    callbacks: NotificationCallbacks,
    Log: LoggerInterface,
    moment: MomentInterface,
    EXIF: EXIFInterface
  ) {
    this.config = { ...config, identifier };
    this.identifier = identifier;
    this.callbacks = callbacks;
    this.Log = Log;
    this.moment = moment;
    this.EXIF = EXIF;
  }

  /**
   * Initialize the module
   */
  start(): void {
    // Validate and normalize configuration
    this.config = ConfigValidator.validateConfig(this.config);

    // Initialize helper modules
    this.imageHandler = new ImageHandler(this.config);
    this.uiBuilder = new UIBuilder(this.config);
    this.transitionHandler = new TransitionHandler(this.config);

    this.playingVideo = false;
  }

  /**
   * Get the DOM wrapper for the module
   */
  getDom(): HTMLElement {
    const wrapper = document.createElement('div');

    // Apply fixed frame mode if enabled
    if (this.config.useFixedFrame) {
      wrapper.classList.add('fixed-frame-mode');
      this.applyFixedFrameStyles(wrapper);
    }

    this.imagesDiv = document.createElement('div');
    this.imagesDiv.className = 'images';
    
    // Apply fixed frame class to images container if enabled
    if (this.config.useFixedFrame) {
      this.imagesDiv.classList.add('fixed-frame');
      this.applyFixedFramePosition(this.imagesDiv);
    }
    
    wrapper.appendChild(this.imagesDiv);

    // Add gradients INSIDE imagesDiv so they layer properly
    if (
      this.config.gradientDirection === 'vertical' ||
      this.config.gradientDirection === 'both'
    ) {
      this.createGradientDiv('bottom', this.config.gradient, this.imagesDiv);
    }

    if (
      this.config.gradientDirection === 'horizontal' ||
      this.config.gradientDirection === 'both'
    ) {
      this.createGradientDiv(
        'right',
        this.config.horizontalGradient,
        this.imagesDiv
      );
    }

    if (this.config.gradientDirection === 'radial') {
      this.createRadialGradientDiv(
        'ellipse at center',
        this.config.radialGradient,
        this.imagesDiv
      );
    }

    // Image info div will be created dynamically for each image
    // No need to create it here anymore

    if (this.config.showProgressBar) {
      this.createProgressbarDiv(wrapper, this.config.slideshowSpeed);
    }

    this.imageList = [];
    this.imageIndex = 0;
    this.updateImageList();

    return wrapper;
  }

  /**
   * Handle notifications received from other modules
   */
  notificationReceived(notification: string): void {
    if (notification === 'BACKGROUNDSLIDESHOW_NEXT') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_NEXT_IMAGE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PREV') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PREV_IMAGE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PAUSE') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PAUSE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY');
    }
  }

  /**
   * Handle socket notifications from the backend
   */
  socketNotificationReceived(notification: string, payload: unknown): void {
    this.Log.log(
      '[MMM-SynPhotoSlideshow] Frontend received notification:',
      notification,
      payload
    );

    const handlers: Record<string, () => void> = {
      BACKGROUNDSLIDESHOW_READY: () => this.handleReady(payload),
      BACKGROUNDSLIDESHOW_REGISTER_CONFIG: () => this.handleRegisterConfig(),
      BACKGROUNDSLIDESHOW_PLAY: () => this.handlePlay(),
      BACKGROUNDSLIDESHOW_DISPLAY_IMAGE: () => this.handleDisplayImage(payload),
      BACKGROUNDSLIDESHOW_FILELIST: () => this.handleFileList(payload),
      BACKGROUNDSLIDESHOW_UPDATE_IMAGE_LIST: () => this.handleUpdateImageList(),
      BACKGROUNDSLIDESHOW_IMAGE_UPDATE: () => this.handleImageUpdate(),
      BACKGROUNDSLIDESHOW_NEXT: () => this.handleNext(),
      BACKGROUNDSLIDESHOW_PREVIOUS: () => this.handlePrevious(),
      BACKGROUNDSLIDESHOW_PAUSE: () => this.handlePause(),
      BACKGROUNDSLIDESHOW_URL: () => this.handleUrl(payload),
      BACKGROUNDSLIDESHOW_URLS: () => this.handleUrls(payload)
    };

    const handler = handlers[notification];
    if (handler) {
      handler();
    }
  }

  /**
   * Handle READY notification
   */
  private handleReady(payload: unknown): void {
    const typedPayload = payload as { identifier: string };
    this.Log.log(
      '[MMM-SynPhotoSlideshow] READY notification, identifier match:',
      typedPayload.identifier === this.identifier
    );
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Handle REGISTER_CONFIG notification
   */
  private handleRegisterConfig(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] Registering config');
    this.updateImageList();
  }

  /**
   * Handle PLAY notification
   */
  private handlePlay(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] PLAY notification');
    this.updateImage();
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY');
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Handle DISPLAY_IMAGE notification
   */
  private handleDisplayImage(payload: unknown): void {
    const typedPayload = payload as ImageInfo;
    this.Log.log(
      '[MMM-SynPhotoSlideshow] DISPLAY_IMAGE notification, identifier match:',
      typedPayload.identifier === this.identifier
    );
    if (typedPayload.identifier === this.identifier) {
      this.displayImage(typedPayload);
    }
  }

  /**
   * Handle FILELIST notification
   */
  private handleFileList(payload: unknown): void {
    this.callbacks.sendNotification('BACKGROUNDSLIDESHOW_FILELIST', payload);
  }

  /**
   * Handle UPDATE_IMAGE_LIST notification
   */
  private handleUpdateImageList(): void {
    this.imageIndex = -1;
    this.updateImageList();
    this.updateImage();
  }

  /**
   * Handle IMAGE_UPDATE notification
   */
  private handleImageUpdate(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] Changing Background');
    this.suspend();
    this.updateImage();
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Handle NEXT notification
   */
  private handleNext(): void {
    this.updateImage();
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Handle PREVIOUS notification
   */
  private handlePrevious(): void {
    this.updateImage(true);
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Handle PAUSE notification
   */
  private handlePause(): void {
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PAUSE');
  }

  /**
   * Handle URL notification
   */
  private handleUrl(payload: unknown): void {
    const typedPayload = payload as { url?: string; resume?: boolean };
    if (!typedPayload?.url) return;

    // Backend manages slideshow timing, so don't start frontend timer
    this.suspend();
    this.updateImage(false, typedPayload.url);
  }

  /**
   * Handle URLS notification
   */
  private handleUrls(payload: unknown): void {
    this.Log.log(
      `[MMM-SynPhotoSlideshow] Notification Received: BACKGROUNDSLIDESHOW_URLS. Payload: ${JSON.stringify(payload)}`
    );
    const typedPayload = payload as { urls?: string[] };

    if (typedPayload?.urls?.length) {
      this.handleUrlsWithImages(typedPayload.urls);
    } else if (this.savedImages) {
      this.restoreSavedImages();
    }
  }

  /**
   * Handle URLS notification when URLs are provided
   */
  private handleUrlsWithImages(urls: string[]): void {
    if (this.savedImages) {
      const temp = [...new Set([...urls, ...this.imageList])];
      if (temp.length !== urls.length) {
        this.updateImageListWithArray(urls);
      }
    } else {
      this.savedImages = this.imageList;
      this.savedIndex = this.imageIndex;
      this.updateImageListWithArray(urls);
    }
  }

  /**
   * Restore saved images
   */
  private restoreSavedImages(): void {
    this.imageList = this.savedImages!;
    this.imageIndex = this.savedIndex || 0;
    this.savedImages = null;
    this.savedIndex = null;
    this.updateImage();
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Display an image
   */
  displayImage(imageinfo: ImageInfo): void {
    this.Log.info(
      `[MMM-SynPhotoSlideshow] Frontend displayImage called for: ${imageinfo.path}`
    );
    this.Log.log(
      '[MMM-SynPhotoSlideshow] Frontend displayImage called',
      imageinfo
    );

    const mwLc = imageinfo.path.toLowerCase();
    if (mwLc.endsWith('.mp4') || mwLc.endsWith('.m4v')) {
      const payload = [imageinfo.path, 'PLAY'];
      imageinfo.data = 'modules/MMM-SynPhotoSlideshow/transparent1080p.png';
      this.callbacks.sendSocketNotification(
        'BACKGROUNDSLIDESHOW_PLAY_VIDEO',
        payload
      );
      this.playingVideo = true;
      this.suspend();
    } else {
      this.playingVideo = false;
    }

    this.Log.log(
      '[MMM-SynPhotoSlideshow] Creating image element, src:',
      imageinfo.data
    );
    const image = new Image();
    image.onload = () => {
      this.handleImageLoad(image, imageinfo);
    };

    image.onerror = (error) => {
      this.Log.error(
        '[MMM-SynPhotoSlideshow] Image failed to load:',
        imageinfo.data,
        error
      );
      this.Log.error(
        `[MMM-SynPhotoSlideshow] Image failed to load: ${imageinfo.data}`
      );
    };

    image.src = imageinfo.data;
    this.Log.log('[MMM-SynPhotoSlideshow] Image src set to:', imageinfo.data);
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_IMAGE_UPDATED', {
      url: imageinfo.path
    });
  }

  /**
   * Handle image load event
   */
  private handleImageLoad(image: HTMLImageElement, imageinfo: ImageInfo): void {
    this.Log.log(
      '[MMM-SynPhotoSlideshow] Image loaded successfully',
      image.width,
      'x',
      image.height
    );
    // Clean up old images
    if (this.imagesDiv && this.transitionHandler) {
      this.transitionHandler.cleanupOldImages(this.imagesDiv);
    }

    // Create transition div
    const transitionDiv = this.transitionHandler?.createTransitionDiv();
    if (!transitionDiv) return;

    // Create and configure image div
    const imageDiv = this.imageHandler?.createImageDiv();
    if (!imageDiv) return;

    imageDiv.style.backgroundImage = `url("${image.src}")`;
    this.Log.log('[MMM-SynPhotoSlideshow] Set backgroundImage on imageDiv');
    this.Log.log(
      '[MMM-SynPhotoSlideshow] imageDiv classList:',
      imageDiv.classList.toString()
    );
    this.Log.log(
      '[MMM-SynPhotoSlideshow] imageDiv backgroundSize:',
      imageDiv.style.backgroundSize
    );

    // Apply fit mode (portrait/landscape)
    const useFitMode =
      this.imageHandler?.applyFitMode(imageDiv, image) || false;
    this.Log.log('[MMM-SynPhotoSlideshow] useFitMode:', useFitMode);
    this.Log.log(
      '[MMM-SynPhotoSlideshow] After fitMode, classList:',
      imageDiv.classList.toString()
    );

    // Restart progress bar if enabled
    if (this.config.showProgressBar) {
      this.uiBuilder?.restartProgressBar();
    }

    // Apply animations if not in fit mode
    if (!useFitMode) {
      this.imageHandler?.applyAnimation(imageDiv, image);
    }

    // Handle EXIF orientation and update image info from metadata
    setTimeout(() => {
      this.updateImageInfoFromMetadata(imageinfo);
      this.imageHandler?.applyExifOrientation(imageDiv, image);
    }, 0);

    transitionDiv.appendChild(imageDiv);
    
    // Add image info div to the current transition div if enabled
    if (this.config.showImageInfo && this.uiBuilder) {
      // Remove old info div if it exists
      const oldInfoDiv = transitionDiv.querySelector('.info');
      if (oldInfoDiv) {
        oldInfoDiv.remove();
      }
      
      // Remove old maps if they exist (destroy Leaflet instances first to prevent memory leaks)
      const oldMap = transitionDiv.querySelector('.map-container') as HTMLElement;
      if (oldMap) {
        this.uiBuilder?.destroyMap(oldMap);
        oldMap.remove();
      }
      const oldWorldMap = transitionDiv.querySelector('.world-map-container') as HTMLElement;
      if (oldWorldMap) {
        this.uiBuilder?.destroyMap(oldWorldMap);
        oldWorldMap.remove();
      }
      
      // Create maps if location string is available from photo_metadata.json
      if (imageinfo.metadata?.location) {
        // Create detailed map (right side, with zoom)
        this.uiBuilder.createMapDiv(transitionDiv, imageinfo.metadata.location);
        // Create world map (left side, no zoom)
        this.uiBuilder.createWorldMapDiv(transitionDiv, imageinfo.metadata.location);
      }
      
      // Create new info div for this image
      this.imageInfoDiv = this.uiBuilder.createImageInfoDiv(transitionDiv);
      
      // Update image info immediately with available metadata (before EXIF is loaded)
      this.updateImageInfo(imageinfo, '');
    }
    
    this.imagesDiv?.appendChild(transitionDiv);
    this.Log.log('[MMM-SynPhotoSlideshow] Image appended to DOM');
    this.Log.log(
      '[MMM-SynPhotoSlideshow] imagesDiv children count:',
      this.imagesDiv?.children.length
    );
    this.Log.log('[MMM-SynPhotoSlideshow] imagesDiv styles:', {
      position: this.imagesDiv?.style.position,
      width: this.imagesDiv?.style.width,
      height: this.imagesDiv?.style.height,
      zIndex: this.imagesDiv?.style.zIndex
    });

    // Check if there are gradient divs blocking the view
    const wrapper = this.imagesDiv?.parentElement;
    if (wrapper) {
      this.Log.log(
        '[MMM-SynPhotoSlideshow] Wrapper children count:',
        wrapper.children.length
      );
      this.Log.log(
        '[MMM-SynPhotoSlideshow] Wrapper children types:',
        Array.from(wrapper.children).map((c) => c.className)
      );
    }
  }

  /**
   * Update image info from metadata (photo_metadata.json only, no EXIF)
   */
  private updateImageInfoFromMetadata(imageinfo: ImageInfo): void {
    // Update image info if enabled
    if (this.config.showImageInfo && this.imageInfoDiv) {
      // Only use metadata from photo_metadata.json, no EXIF fallback
      // The date will be formatted in UIBuilder with UTC to CET conversion
      this.updateImageInfo(imageinfo, '');
    }
  }

  /**
   * Update to next/previous image
   * NOTE: When backend manages slideshow, this should only be called for manual navigation.
   * Backend sends DISPLAY_IMAGE notifications automatically, so we shouldn't request NEXT_IMAGE.
   */
  updateImage(
    backToPreviousImage = false,
    imageToDisplay: string | null = null
  ): void {
    if (imageToDisplay) {
      this.displayImage({
        identifier: this.identifier,
        path: imageToDisplay,
        data: imageToDisplay,
        index: 1,
        total: 1
      });
      return;
    }

    if (this.imageList.length > 0) {
      this.imageIndex += 1;

      if (this.config.randomizeImageOrder) {
        this.imageIndex = Math.floor(Math.random() * this.imageList.length);
      }

      const imageUrl = this.imageList.splice(this.imageIndex, 1);
      this.displayImage({
        identifier: this.identifier,
        path: imageUrl[0],
        data: imageUrl[0],
        index: 1,
        total: 1
      });
      return;
    }

    // Only send NEXT_IMAGE/PREV_IMAGE for manual navigation (when user explicitly requests it)
    // Backend manages automatic slideshow timing, so we shouldn't request images automatically
    // If backend manages slideshow, don't send NEXT_IMAGE automatically
    if (!this.backendManagesSlideshow) {
      if (backToPreviousImage) {
        this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PREV_IMAGE');
      } else {
        this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_NEXT_IMAGE');
      }
    } else {
      // Backend manages slideshow - only send for explicit manual navigation
      // This should only happen via handleNext()/handlePrevious() which are called manually
      this.Log.log('[MMM-SynPhotoSlideshow] updateImage called but backend manages slideshow - ignoring automatic request');
    }
  }

  /**
   * Update image list with array of URLs
   */
  updateImageListWithArray(urls: string[]): void {
    this.imageList = urls.splice(0);
    this.imageIndex = 0;
    this.updateImage();
    // Don't start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically
  }

  /**
   * Update image info display
   */
  private updateImageInfo(imageinfo: ImageInfo, imageDate: string): void {
    if (this.imageInfoDiv && this.uiBuilder) {
      this.uiBuilder.updateImageInfo(
        this.imageInfoDiv,
        imageinfo,
        imageDate,
        this.callbacks.translate
      );
    }
  }

  /**
   * Suspend the slideshow timer
   */
  suspend(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] Frontend suspend called');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Resume the slideshow timer
   * NOTE: This method is disabled when backend manages slideshow timing.
   * The backend sends DISPLAY_IMAGE notifications automatically,
   * so the frontend timer should not run to avoid conflicts.
   */
  resume(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] Frontend resume called - but backend manages slideshow, so timer is disabled');
    this.suspend();
    // Do not start frontend timer - backend manages slideshow timing
    // Backend will send DISPLAY_IMAGE notifications automatically based on slideshowSpeed
  }

  /**
   * Request image list update from backend
   */
  updateImageList(): void {
    this.Log.log('[MMM-SynPhotoSlideshow] Frontend updateImageList called');
    this.suspend();
    this.Log.debug('[MMM-SynPhotoSlideshow] Getting images');
    this.callbacks.sendSocketNotification(
      'BACKGROUNDSLIDESHOW_REGISTER_CONFIG',
      this.config
    );
  }

  /**
   * Create gradient div
   */
  private createGradientDiv(
    direction: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    this.uiBuilder?.createGradientDiv(direction, gradient, wrapper);
  }

  /**
   * Create radial gradient div
   */
  private createRadialGradientDiv(
    type: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    this.uiBuilder?.createRadialGradientDiv(type, gradient, wrapper);
  }

  /**
   * Create image info div
   */
  private createImageInfoDiv(wrapper: HTMLElement): HTMLDivElement | null {
    return this.uiBuilder?.createImageInfoDiv(wrapper) || null;
  }

  /**
   * Create progress bar div
   */
  private createProgressbarDiv(
    wrapper: HTMLElement,
    slideshowSpeed: number
  ): void {
    this.uiBuilder?.createProgressbarDiv(wrapper, slideshowSpeed);
  }

  /**
   * Apply fixed frame styles to wrapper
   */
  private applyFixedFrameStyles(wrapper: HTMLElement): void {
    wrapper.style.setProperty('--frame-background-color', this.config.frameBackgroundColor);
  }

  /**
   * Apply fixed frame position and size to images container
   */
  private applyFixedFramePosition(imagesDiv: HTMLDivElement): void {
    imagesDiv.style.setProperty('--frame-width', this.config.frameWidth);
    imagesDiv.style.setProperty('--frame-height', this.config.frameHeight);

    // Calculate position based on framePosition setting
    const position = this.config.framePosition.toLowerCase();
    let top = '50%';
    let left = '50%';
    let transform = 'translate(-50%, -50%)';

    switch (position) {
      case 'top':
        top = '0';
        transform = 'translate(-50%, 0)';
        break;
      case 'bottom':
        top = '100%';
        transform = 'translate(-50%, -100%)';
        break;
      case 'left':
        left = '0';
        transform = 'translate(0, -50%)';
        break;
      case 'right':
        left = '100%';
        transform = 'translate(-100%, -50%)';
        break;
      case 'top-left':
        top = '0';
        left = '0';
        transform = 'translate(0, 0)';
        break;
      case 'top-right':
        top = '0';
        left = '100%';
        transform = 'translate(-100%, 0)';
        break;
      case 'bottom-left':
        top = '100%';
        left = '0';
        transform = 'translate(0, -100%)';
        break;
      case 'bottom-right':
        top = '100%';
        left = '100%';
        transform = 'translate(-100%, -100%)';
        break;
      case 'center':
      default:
        // Default values already set
        break;
    }

    imagesDiv.style.setProperty('--frame-top', top);
    imagesDiv.style.setProperty('--frame-left', left);
    imagesDiv.style.transform = transform;
  }
}

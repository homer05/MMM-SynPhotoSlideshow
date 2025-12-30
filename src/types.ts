/**
 * Types for MMM-SynPhotoSlideshow
 */

export interface PhotoItem {
  path: string;
  url?: string;
  created: number;
  modified: number;
}

export interface ModuleConfig {
  identifier: string;
  synologyUrl: string;
  synologyAccount: string;
  synologyPassword: string;
  synologyAlbumName: string;
  synologyTagNames: string[];
  synologyPersonIds: number[];
  synologyConceptIds: number[];
  synologyGeocodingIds: number[];
  synologyShareToken: string;
  synologyMaxPhotos: number;
  refreshImageListInterval: number;
  enableImageCache: boolean;
  imageCacheMaxSize: number;
  imageCachePreloadCount: number;
  imageCachePreloadDelay: number;
  enableMemoryMonitor: boolean;
  memoryMonitorInterval: number;
  memoryThreshold: number;
  slideshowSpeed: number;
  randomizeImageOrder: boolean;
  fitPortraitImages: boolean;
  showAllImagesBeforeRestart: boolean;
  sortImagesBy: string;
  sortImagesDescending: boolean;
  showImageInfo: boolean;
  imageInfo: string | string[];
  imageInfoLocation: string;
  transitionSpeed: string;
  showProgressBar: boolean;
  backgroundSize: string;
  backgroundPosition: string;
  transitionImages: boolean;
  gradient: string[];
  horizontalGradient: string[];
  radialGradient: string[];
  gradientDirection: string;
  backgroundAnimationEnabled: boolean;
  backgroundAnimationDuration: string;
  backgroundAnimationLoopCount: string;
  transitions: string[];
  transitionTimingFunction: string;
  animations: string[];
  changeImageOnResume: boolean;
  resizeImages: boolean;
  maxWidth: number;
  maxHeight: number;
  imageInfoNoFileExt: boolean;
  useFixedFrame: boolean;
  frameWidth: string;
  frameHeight: string;
  framePosition: string;
  frameBackgroundColor: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface ImageInfo {
  identifier: string;
  path: string;
  data: string;
  index: number;
  total: number;
}

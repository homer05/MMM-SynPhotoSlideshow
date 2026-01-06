/**
 * Types for MMM-SynPhotoSlideshow
 */

export interface PhotoItem {
  path: string;
  url?: string;
  created: number;
  modified: number;
  synologyId?: number;
  spaceId?: number | null;
  filePath?: string; // Full file path on Synology (for File Station API)
  personId?: number; // Person ID for person albums (used for alternative download method)
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
  imageCachePath?: string;
  backgroundDownloadEnabled?: boolean;
  backgroundDownloadInterval?: number;
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
  mapZoom?: number; // Zoom level for location map (1-19, default: 13)
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface ImageInfo {
  identifier: string;
  path: string;
  data: string;
  index: number;
  total: number;
  metadata?: {
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
  };
}

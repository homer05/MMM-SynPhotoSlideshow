/**
 * SynologyManager.ts
 *
 * Manages Synology Photos integration
 */

import Log from './Logger';
import SynologyPhotosClient from './SynologyPhotosClient';
import type { ModuleConfig, PhotoItem } from '../types';

class SynologyManager {
  private client: SynologyPhotosClient | null = null;

  private photos: PhotoItem[] = [];

  /**
   * Fetch photos from Synology Photos
   */
  async fetchPhotos(config: ModuleConfig, offset: number = 0, checkForNewFirst: boolean = false): Promise<PhotoItem[]> {
    try {
      Log.info('Initializing Synology Photos client...');

      this.client = new SynologyPhotosClient(config);

      const authenticated = await this.client.authenticate();
      if (!authenticated && !config.synologyShareToken) {
        Log.error('Failed to authenticate with Synology');
        return [];
      }

      // Personal space album IDs (persons, concepts, geocoding) have priority over tags and regular albums
      const hasPersonalSpaceAlbums =
        (config.synologyPersonIds && config.synologyPersonIds.length > 0) ||
        (config.synologyConceptIds && config.synologyConceptIds.length > 0) ||
        (config.synologyGeocodingIds && config.synologyGeocodingIds.length > 0);

      if (hasPersonalSpaceAlbums) {
        const ids: string[] = [];
        if (config.synologyPersonIds && config.synologyPersonIds.length > 0) {
          ids.push(`persons: ${config.synologyPersonIds.join(', ')}`);
        }
        if (config.synologyConceptIds && config.synologyConceptIds.length > 0) {
          ids.push(`concepts: ${config.synologyConceptIds.join(', ')}`);
        }
        if (config.synologyGeocodingIds && config.synologyGeocodingIds.length > 0) {
          ids.push(`geocoding: ${config.synologyGeocodingIds.join(', ')}`);
        }
        Log.info(`Using personal space albums: ${ids.join('; ')}`);
        // No need to find albums, IDs are used directly
      } else if (config.synologyTagNames && config.synologyTagNames.length > 0) {
        const tagsFound = await this.client.findTags();
        if (!tagsFound) {
          Log.error('Failed to find Synology tags');
          return [];
        }
      } else if (
        config.synologyAlbumName &&
        !config.synologyShareToken
      ) {
        const albumFound = await this.client.findAlbum();
        if (!albumFound) {
          Log.error('Failed to find Synology album');
          return [];
        }
      }

      const photos = await this.client.fetchPhotos(offset, checkForNewFirst);

      if (photos && photos.length > 0) {
        Log.info(`Retrieved ${photos.length} photos from Synology`);
        this.photos = photos;
        return photos;
      }
      Log.warn('No photos found in Synology');
      return [];
    } catch (error) {
      Log.error(`Error fetching Synology photos: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get the Synology client instance
   */
  getClient(): SynologyPhotosClient | null {
    return this.client;
  }

  /**
   * Get cached photos
   */
  getPhotos(): PhotoItem[] {
    return this.photos;
  }

  /**
   * Check if using Synology
   */
  isInitialized(): boolean {
    return this.client !== null;
  }
}

export default SynologyManager;

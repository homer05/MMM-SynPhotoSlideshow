/**
 * SynologyPhotosClient.ts
 *
 * MagicMirror²
 * Module: MMM-SynPhotoSlideshow
 *
 * Synology Photos API client for fetching images
 * By Spydersoft Consulting
 * MIT Licensed.
 */

import axios from 'axios';
import Log from './Logger';
import type { ModuleConfig, PhotoItem } from '../types';

interface SynologyPhoto {
  id: number;
  type: string;
  filename?: string;
  time?: number;
  indexed_time?: number;
  additional?: {
    thumbnail?: {
      cache_key?: string;
    };
  };
}

interface SynologyAlbum {
  id: number;
  name: string;
}

interface SynologyTag {
  id: number;
  name: string;
}

interface TagIds {
  [key: string]: number[];
}

class SynologyPhotosClient {
  private readonly baseUrl: string;

  private readonly account: string;

  private readonly password: string;

  private readonly albumName: string;

  private readonly shareToken: string;

  private readonly tagNames: string[];

  private readonly personIds: number[];

  private readonly conceptIds: number[];

  private readonly geocodingIds: number[];

  private sid: string | null = null; // FileStation session (for browsing)

  private photoSid: string | null = null; // PhotoStation session (for downloading originals)

  private folderIds: number[] = [];

  private tagIds: TagIds = {};

  private readonly useSharedAlbum: boolean;

  private readonly maxPhotosToFetch: number;

  private readonly authApiPath = '/webapi/auth.cgi';

  private readonly photosApiPath = '/webapi/entry.cgi';

  constructor(config: ModuleConfig) {
    this.baseUrl = config.synologyUrl;
    this.account = config.synologyAccount;
    this.password = config.synologyPassword;
    this.albumName = config.synologyAlbumName;
    this.shareToken = config.synologyShareToken;
    this.tagNames = config.synologyTagNames || [];
    this.personIds = config.synologyPersonIds || [];
    this.conceptIds = config.synologyConceptIds || [];
    this.geocodingIds = config.synologyGeocodingIds || [];
    this.useSharedAlbum = Boolean(this.shareToken);
    this.maxPhotosToFetch = config.synologyMaxPhotos || 1000;
    Log.debug(`SynologyPhotosClient initialized with maxPhotosToFetch: ${this.maxPhotosToFetch} (from config.synologyMaxPhotos: ${config.synologyMaxPhotos})`);
  }

  /**
   * Authenticate with Synology and get session ID
   * Uses FileStation session for all operations
   */
  async authenticate(): Promise<boolean> {
    if (this.useSharedAlbum) {
      Log.info('Using shared album token, skipping authentication');
      return true;
    }

    // Authenticate with FileStation (for browsing)
    try {
      const fileStationResponse = await axios.get(`${this.baseUrl}${this.authApiPath}`, {
        params: {
          api: 'SYNO.API.Auth',
          version: '3',
          method: 'login',
          account: this.account,
          passwd: this.password,
          session: 'FileStation',
          format: 'sid'
        },
        timeout: 10000
      });

      if (fileStationResponse.data.success) {
        this.sid = fileStationResponse.data.data.sid;
        Log.debug('Successfully authenticated with FileStation session');
      } else {
        Log.warn(`FileStation authentication failed: ${JSON.stringify(fileStationResponse.data)}`);
      }
    } catch (error) {
      Log.warn(`FileStation authentication error: ${(error as Error).message}`);
    }

    // Authenticate with PhotoStation (optional - not required, FileStation is sufficient)
    try {
      const photoStationResponse = await axios.get(`${this.baseUrl}${this.authApiPath}`, {
        params: {
          api: 'SYNO.API.Auth',
          version: '3',
          method: 'login',
          account: this.account,
          passwd: this.password,
          session: 'PhotoStation',
          format: 'sid'
        },
        timeout: 10000
      });

      if (photoStationResponse.data.success) {
        this.photoSid = photoStationResponse.data.data.sid;
        Log.info('Successfully authenticated with PhotoStation session');
      } else {
        // PhotoStation is optional - FileStation is sufficient for our use case
        Log.debug(`PhotoStation authentication failed (not critical): ${JSON.stringify(photoStationResponse.data)}`);
      }
    } catch (error) {
      // PhotoStation is optional - FileStation is sufficient for our use case
      Log.debug(`PhotoStation authentication error (not critical): ${(error as Error).message}`);
    }

    // At least one session should work
    if (this.sid || this.photoSid) {
      const sessions = [];
      if (this.sid) sessions.push('FileStation');
      if (this.photoSid) sessions.push('PhotoStation');
      Log.info(`Successfully authenticated with Synology (sessions: ${sessions.join(', ')})`);
      return true;
    }

    Log.error('Failed to authenticate with any Synology session');
    return false;
  }

  /**
   * List albums to find the target album
   */
  async findAlbum(): Promise<boolean> {
    if (this.useSharedAlbum) {
      Log.info('Using shared album, skipping album search');
      return true;
    }

    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Album',
          version: '1',
          method: 'list',
          offset: 0,
          limit: 100,
          _sid: this.sid
        },
        timeout: 10000
      });

      if (response.data.success) {
        const albums: SynologyAlbum[] = response.data.data.list;

        if (!this.albumName) {
          Log.info(`Found ${albums.length} albums, will fetch from all`);
          this.folderIds = albums.map((album) => album.id);
          return true;
        }

        const targetAlbum = albums.find(
          (album) => album.name.toLowerCase() === this.albumName.toLowerCase()
        );

        if (targetAlbum) {
          Log.info(`Found album: ${targetAlbum.name}`);
          this.folderIds = [targetAlbum.id];
          return true;
        }
        Log.warn(
          `Album "${this.albumName}" not found. Available albums: ${albums.map((a) => a.name).join(', ')}`
        );
        return false;
      }
      Log.error(`Failed to list albums: ${JSON.stringify(response.data)}`);
      return false;
    } catch (error) {
      Log.error(`Error listing albums: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Filter tags by name
   */
  private filterMatchingTags(allTags: SynologyTag[]): SynologyTag[] {
    const tagNamesLower = new Set(this.tagNames.map((t) => t.toLowerCase()));
    return allTags.filter((tag) => tagNamesLower.has(tag.name.toLowerCase()));
  }

  /**
   * Find tags in shared album
   */
  private async findTagsInSharedAlbum(): Promise<boolean> {
    const params = {
      api: 'SYNO.Foto.Browse.GeneralTag',
      version: '1',
      method: 'list',
      offset: 0,
      limit: 500,
      passphrase: this.shareToken
    };

    Log.info('Fetching tags from shared album');

    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params,
      timeout: 10000
    });

    if (!response.data.success) {
      Log.error(`Failed to list tags: ${JSON.stringify(response.data)}`);
      return false;
    }

    const matchedTags = this.filterMatchingTags(response.data.data.list);

    if (matchedTags.length === 0) {
      Log.warn(`No matching tags found for: ${this.tagNames.join(', ')}`);
      return false;
    }

    this.tagIds.shared = matchedTags.map((tag) => tag.id);
    Log.info(
      `Found ${matchedTags.length} matching tags in shared album: ${matchedTags.map((t) => t.name).join(', ')}`
    );
    return true;
  }

  /**
   * Find tags in a specific space
   */
  private async findTagsInSpace(space: {
    id: number;
    name: string;
    api: string;
  }): Promise<boolean> {
    const params: Record<string, unknown> = {
      api: space.api,
      version: '1',
      method: 'list',
      offset: 0,
      limit: 500,
      _sid: this.sid
    };

    if (space.id === 0) {
      params.space_id = 0;
    }

    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params,
      timeout: 10000
    });

    if (!response.data.success) {
      Log.warn(`Failed to list tags in ${space.name} space`);
      return false;
    }

    const matchedTags = this.filterMatchingTags(response.data.data.list);

    if (matchedTags.length === 0) {
      return false;
    }

    this.tagIds[space.id] = matchedTags.map((tag) => tag.id);
    const tagDescriptions = matchedTags
      .map((t) => `${t.name}(${t.id})`)
      .join(', ');
    Log.info(
      `Found ${matchedTags.length} tag(s) in ${space.name} space: ${tagDescriptions}`
    );
    return true;
  }

  /**
   * Find tags across personal and shared spaces
   */
  private async findTagsInMultipleSpaces(): Promise<boolean> {
    const spaces = [
      { id: 0, name: 'personal', api: 'SYNO.Foto.Browse.GeneralTag' },
      { id: 1, name: 'shared', api: 'SYNO.FotoTeam.Browse.GeneralTag' }
    ];

    let foundAnyTags = false;

    for (const space of spaces) {
      try {
        const found = await this.findTagsInSpace(space);
        if (found) {
          foundAnyTags = true;
        }
      } catch (error) {
        Log.warn(
          `Error fetching tags from ${space.name} space: ${(error as Error).message}`
        );
      }
    }

    if (!foundAnyTags) {
      Log.warn(`No matching tags found for: ${this.tagNames.join(', ')}`);
      return false;
    }

    return true;
  }

  /**
   * Find tags by name across personal and shared spaces
   */
  async findTags(): Promise<boolean> {
    if (!this.tagNames || this.tagNames.length === 0) {
      return true;
    }

    try {
      this.tagIds = {};

      if (this.useSharedAlbum) {
        return await this.findTagsInSharedAlbum();
      }

      return await this.findTagsInMultipleSpaces();
    } catch (error) {
      Log.error(`Error listing tags: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Fetch photos from a person album (KI-generated album)
   * Uses person_id parameter
   */
  private async fetchPersonPhotos(personId: number, offset: number = 0): Promise<PhotoItem[]> {
    return await this.tryFetchPersonalSpaceAlbum(
      personId,
      'person_id',
      'person',
      offset
    );
  }

  /**
   * Fetch photos from a concept album (KI-generated album)
   * Uses concept_id parameter
   */
  private async fetchConceptPhotos(conceptId: number, offset: number = 0): Promise<PhotoItem[]> {
    return await this.tryFetchPersonalSpaceAlbum(
      conceptId,
      'concept_id',
      'concept',
      offset
    );
  }

  /**
   * Fetch photos from a geocoding album (KI-generated album)
   * Uses geocoding_id parameter
   */
  private async fetchGeocodingPhotos(geocodingId: number, offset: number = 0): Promise<PhotoItem[]> {
    return await this.tryFetchPersonalSpaceAlbum(
      geocodingId,
      'geocoding_id',
      'geocoding',
      offset
    );
  }

  /**
   * Try to fetch photos using a specific parameter type
   */
  private async tryFetchPersonalSpaceAlbum(
    albumId: number,
    paramName: string,
    typeName: string,
    offset: number = 0
  ): Promise<PhotoItem[]> {
    try {
      // SYNOLOGY_MAX_PHOTOS is now a batch size - fetch exactly that many photos
      const batchSize = this.maxPhotosToFetch > 0 ? this.maxPhotosToFetch : 100;
      Log.debug(`Fetching ${typeName} ${albumId} with batch size: ${batchSize}, offset: ${offset}`);

      const params: Record<string, unknown> = {
        api: 'SYNO.Foto.Browse.Item',
        version: '1',
        method: 'list',
        offset: offset,
        limit: batchSize,
        space_id: 0,
        _sid: this.sid,
        additional:
          '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
      };

      params[paramName] = albumId;

      Log.info(
        `Trying to fetch personal space album ${albumId} as ${typeName} (${paramName})`
      );

      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params,
        timeout: 30000
      });

      if (response.data.success) {
        const rawPhotos: SynologyPhoto[] = response.data.data.list || [];
        Log.debug(`API returned ${rawPhotos.length} photos for ${typeName} ${albumId} (batch size: ${batchSize}, offset: ${offset})`);
        
        // Store person_id for person albums (used for alternative download method)
        const personId = paramName === 'person_id' ? albumId : undefined;
        
        // Process photos first, then sort by creation date (newest first)
        let processedPhotos = this.processPhotoList(rawPhotos, 0, personId);
        
        // Sort by creation date (newest first) to ensure new images are prioritized
        processedPhotos.sort((a, b) => {
          const dateA = a.created || 0;
          const dateB = b.created || 0;
          return dateB - dateA; // Descending order (newest first)
        });
        Log.debug(`After processing: ${processedPhotos.length} photos (filtered from ${rawPhotos.length} raw photos)`);
        
        Log.info(
          `Successfully fetched ${processedPhotos.length} photos for personal space album ${albumId} as ${typeName} (offset: ${offset})`
        );
        
        // Debug: Create mapping of unit_id to person_id for person albums
        if (paramName === 'person_id' && processedPhotos.length > 0) {
          const unitIds = processedPhotos.map(photo => photo.synologyId).filter(id => id !== undefined).join(', ');
          Log.debug(
            `Person ID ${albumId} (${typeName}) contains ${processedPhotos.length} photos with unit_ids: ${unitIds}`
          );
        }
        
        return processedPhotos;
      }

      // If error 120 (limit condition), try again without limit or with smaller limit
      if (response.data.error?.code === 120) {
        Log.debug(
          `Limit parameter caused error for ${typeName} ${albumId}, trying with smaller limit`
        );
        // Retry with a smaller limit (500 is usually safe)
        const retryParams: Record<string, unknown> = {
          ...params,
          limit: 500
        };
        const retryResponse = await axios.get(
          `${this.baseUrl}${this.photosApiPath}`,
          {
            params: retryParams,
            timeout: 30000
          }
        );
        if (retryResponse.data.success) {
          const rawPhotos: SynologyPhoto[] = retryResponse.data.data.list;
          Log.info(
            `Successfully fetched ${rawPhotos.length} photos for personal space album ${albumId} as ${typeName} (with reduced limit)`
          );
          
          // Store person_id for person albums (used for alternative download method)
          const personId = paramName === 'person_id' ? albumId : undefined;
          
          // Debug: Create mapping of unit_id to person_id for person albums
          if (paramName === 'person_id' && rawPhotos.length > 0) {
            const unitIds = rawPhotos.map(photo => photo.id).join(', ');
            Log.debug(
              `Person ID ${albumId} (${typeName}) contains ${rawPhotos.length} photos with unit_ids: ${unitIds}`
            );
          }
          
          return this.processPhotoList(rawPhotos, 0, personId);
        }
      }

      // Log only if it's not a simple "not found" error
      if (response.data.error?.code !== 609) {
        Log.debug(
          `Failed to fetch personal space album ${albumId} as ${typeName}: ${JSON.stringify(response.data)}`
        );
      }
      return [];
    } catch (error) {
      Log.debug(
        `Error trying to fetch personal space album ${albumId} as ${typeName}: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Fetch photos from persons, concepts, and geocoding albums
   * These are KI-generated albums from the personal_space
   * @param offset - Offset for pagination (default: 0)
   * @param checkForNewFirst - If true, fetch newest photos first (offset 0), then continue with offset
   */
  private async fetchPhotosByPersonalSpaceAlbums(offset: number = 0, checkForNewFirst: boolean = false): Promise<PhotoItem[]> {
    const fetchPromises: Promise<PhotoItem[]>[] = [];

    // If checking for new photos first, fetch offset 0 for all albums
    const actualOffset = checkForNewFirst ? 0 : offset;

    // Fetch person photos
    if (this.personIds.length > 0) {
      Log.info(`Fetching photos from persons: ${this.personIds.join(', ')} (offset: ${actualOffset})`);
      for (const personId of this.personIds) {
        fetchPromises.push(this.fetchPersonPhotos(personId, actualOffset));
      }
    }

    // Fetch concept photos
    if (this.conceptIds.length > 0) {
      Log.info(`Fetching photos from concepts: ${this.conceptIds.join(', ')} (offset: ${actualOffset})`);
      for (const conceptId of this.conceptIds) {
        fetchPromises.push(this.fetchConceptPhotos(conceptId, actualOffset));
      }
    }

    // Fetch geocoding photos
    if (this.geocodingIds.length > 0) {
      Log.info(`Fetching photos from geocoding: ${this.geocodingIds.join(', ')} (offset: ${actualOffset})`);
      for (const geocodingId of this.geocodingIds) {
        fetchPromises.push(this.fetchGeocodingPhotos(geocodingId, actualOffset));
      }
    }

    if (fetchPromises.length === 0) {
      return [];
    }

    try {
      const photoArrays = await Promise.all(fetchPromises);
      let photos = photoArrays.flat();

      // Sort by creation date (newest first) to ensure new images are prioritized
      photos.sort((a, b) => {
        const dateA = a.created || 0;
        const dateB = b.created || 0;
        return dateB - dateA; // Descending order (newest first)
      });

      // SYNOLOGY_MAX_PHOTOS is now a batch size - limit to that many photos
      const batchSize = this.maxPhotosToFetch > 0 ? this.maxPhotosToFetch : 100;
      if (photos.length > batchSize) {
        Log.debug(`Limiting ${photos.length} photos to batch size ${batchSize}`);
        photos = photos.slice(0, batchSize);
      }

      const totalAlbums =
        this.personIds.length +
        this.conceptIds.length +
        this.geocodingIds.length;
      Log.info(
        `Fetched ${photos.length} photos from ${totalAlbums} personal space album(s)`
      );

      // Debug: Create summary of unit_id to person_id mapping
      if (this.personIds.length > 0) {
        const personPhotoMap = new Map<number, number[]>();
        for (const photo of photos) {
          const personId = (photo as PhotoItem & { personId?: number }).personId;
          if (personId !== undefined) {
            const unitId = photo.synologyId;
            if (unitId !== undefined) {
              if (!personPhotoMap.has(personId)) {
                personPhotoMap.set(personId, []);
              }
              personPhotoMap.get(personId)!.push(unitId);
            }
          }
        }
        
        if (personPhotoMap.size > 0) {
          Log.debug('=== SYNOLOGY_PERSON_IDS to unit_id mapping ===');
          for (const [personId, unitIds] of personPhotoMap.entries()) {
            Log.debug(`Person ID ${personId}: ${unitIds.length} photos with unit_ids [${unitIds.join(', ')}]`);
          }
          Log.debug('=== End of mapping ===');
        }
      }

      return this.removeDuplicatePhotos(photos);
    } catch (error) {
      Log.error(
        `Error fetching photos from personal space albums: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Fetch photos by tags across spaces
   */
  private async fetchPhotosByTags(): Promise<PhotoItem[]> {
    const fetchPromises: Promise<PhotoItem[]>[] = [];

    Log.info(
      `Fetching photos for tags across spaces: ${JSON.stringify(this.tagIds)}`
    );

    for (const [spaceKey, tagIdArray] of Object.entries(this.tagIds)) {
      const spaceId = spaceKey === 'shared' ? 1 : Number.parseInt(spaceKey, 10);
      Log.info(
        `Processing space ${spaceKey} (ID: ${spaceId}) with ${tagIdArray.length} tag(s)`
      );

      for (const tagId of tagIdArray) {
        fetchPromises.push(this.fetchPhotosByTagInSpace(tagId, spaceId));
      }
    }

    Log.info(`Created ${fetchPromises.length} fetch promises`);
    const photoArrays = await Promise.all(fetchPromises);
    Log.info(
      `Received ${photoArrays.length} photo arrays: ${photoArrays.map((arr) => arr.length).join(', ')} photos each`
    );

    const photos = photoArrays.flat();
    Log.info(`Total photos before deduplication: ${photos.length}`);

    const deduplicated = this.removeDuplicatePhotos(photos);
    Log.info(`Total photos after deduplication: ${deduplicated.length}`);

    return deduplicated;
  }

  /**
   * Fetch photos from albums
   */
  private async fetchPhotosFromAlbums(): Promise<PhotoItem[]> {
    if (this.folderIds.length === 0) {
      return await this.fetchAllPhotos();
    }

    const albumPromises = this.folderIds.map((folderId) =>
      this.fetchAlbumPhotos(folderId)
    );
    const photoArrays = await Promise.all(albumPromises);
    return photoArrays.flat();
  }

  /**
   * Fetch photos from Synology Photos
   * @param offset - Offset for pagination (default: 0)
   * @param checkForNewFirst - If true, fetch newest photos first (offset 0), then continue with offset
   */
  async fetchPhotos(offset: number = 0, checkForNewFirst: boolean = false): Promise<PhotoItem[]> {
    try {
      let photos: PhotoItem[] = [];

      // Priority: personal space albums (persons, concepts, geocoding) > tags > shared album > regular albums
      const hasPersonalSpaceAlbums =
        (this.personIds && this.personIds.length > 0) ||
        (this.conceptIds && this.conceptIds.length > 0) ||
        (this.geocodingIds && this.geocodingIds.length > 0);

      if (hasPersonalSpaceAlbums) {
        photos = await this.fetchPhotosByPersonalSpaceAlbums(offset, checkForNewFirst);
      } else if (this.tagIds && Object.keys(this.tagIds).length > 0) {
        photos = await this.fetchPhotosByTags();
      } else if (this.useSharedAlbum) {
        photos = await this.fetchSharedAlbumPhotos();
      } else {
        photos = await this.fetchPhotosFromAlbums();
      }

      Log.info(`Fetched ${photos.length} photos from Synology Photos`);
      return photos;
    } catch (error) {
      Log.error(`Error fetching photos: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch photos from a shared album using token
   */
  private async fetchSharedAlbumPhotos(): Promise<PhotoItem[]> {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          passphrase: this.shareToken,
          additional:
            '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","file_path"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      }
      Log.error(
        `Failed to fetch shared album photos: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(
        `Error fetching shared album photos: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Fetch all photos from Synology Photos
   */
  private async fetchAllPhotos(): Promise<PhotoItem[]> {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          _sid: this.sid,
          additional:
            '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","file_path"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      }
      Log.error(`Failed to fetch all photos: ${JSON.stringify(response.data)}`);
      return [];
    } catch (error) {
      Log.error(`Error fetching all photos: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch photos from a specific album
   */
  private async fetchAlbumPhotos(albumId: number): Promise<PhotoItem[]> {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          album_id: albumId,
          _sid: this.sid,
          additional:
            '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","file_path"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      }
      Log.error(
        `Failed to fetch album photos: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(`Error fetching album photos: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch photos by tag from a specific space
   */
  private async fetchPhotosByTagInSpace(
    tagId: number,
    spaceId: number | null
  ): Promise<PhotoItem[]> {
    try {
      const params: Record<string, unknown> = {
        api:
          spaceId === 1 ? 'SYNO.FotoTeam.Browse.Item' : 'SYNO.Foto.Browse.Item',
        version: '1',
        method: 'list',
        offset: 0,
        limit: this.maxPhotosToFetch,
        general_tag_id: tagId,
        additional:
          '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
      };

      if (this.useSharedAlbum) {
        params.passphrase = this.shareToken;
      } else {
        params._sid = this.sid;
        if (spaceId === 0) {
          params.space_id = spaceId;
        }
      }

      Log.info(
        `Fetching photos for tag ${tagId} in space ${spaceId} with API: ${params.api}`
      );

      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params,
        timeout: 30000
      });

      if (response.data.success) {
        const rawPhotos: SynologyPhoto[] = response.data.data.list;
        Log.info(
          `API returned ${rawPhotos.length} photos for tag ${tagId} in space ${spaceId}`
        );
        return this.processPhotoList(rawPhotos, spaceId);
      }
      Log.warn(
        `API call failed for tag ${tagId} in space ${spaceId}: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(
        `Error fetching photos by tag ${tagId} from space ${spaceId}: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Remove duplicate photos from array using synologyId
   */
  private removeDuplicatePhotos(photos: PhotoItem[]): PhotoItem[] {
    const seen = new Set<string | number>();
    return photos.filter((photo) => {
      const dedupeKey =
        (photo as PhotoItem & { synologyId?: number; id?: number })
          .synologyId || (photo as PhotoItem & { id?: number }).id;
      if (seen.has(dedupeKey!)) {
        return false;
      }
      seen.add(dedupeKey!);
      return true;
    });
  }

  /**
   * Process photo list and extract relevant information
   */
  private processPhotoList(
    photos: SynologyPhoto[],
    spaceId: number | null = null,
    personId?: number
  ): PhotoItem[] {
    const imageList: PhotoItem[] = [];

    for (const photo of photos) {
      if (photo.type !== 'photo' && photo.type !== 'live_photo') {
        continue;
      }

      const imageUrl = this.getPhotoUrl(
        photo.id,
        photo.additional?.thumbnail?.cache_key,
        spaceId
      );
      const uniqueId = spaceId === null ? photo.id : `${spaceId}_${photo.id}`;

      imageList.push({
        path: photo.filename || `photo_${photo.id}`,
        url: imageUrl,
        created: photo.time ? photo.time * 1000 : Date.now(),
        modified: photo.indexed_time ? photo.indexed_time * 1000 : Date.now(),
        id: uniqueId,
        synologyId: photo.id,
        spaceId,
        personId, // Store person_id for alternative download method
        // Note: file_path is not available from Photos API
        // File Station API download would require searching for the file path first
        isSynology: true
      } as PhotoItem & {
        id: number | string;
        synologyId: number;
        spaceId: number | null;
        personId?: number;
        isSynology: boolean;
      });
    }

    return imageList;
  }

  /**
   * Generate photo URL for downloading (thumbnail)
   */
  private getPhotoUrl(
    photoId: number,
    cacheKey: string | undefined,
    spaceId: number | null = null
  ): string {
    let url: string;
    const quotedCacheKey = `"${cacheKey}"`;

    if (this.useSharedAlbum) {
      url = `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Thumbnail&version=2&method=get&id=${photoId}&cache_key=${quotedCacheKey}&type="unit"&size="xl"&passphrase=${this.shareToken}`;
    } else {
      const api =
        spaceId === 1 ? 'SYNO.FotoTeam.Thumbnail' : 'SYNO.Foto.Thumbnail';
      url = `${this.baseUrl}${this.photosApiPath}?api=${api}&version=2&method=get&id=${photoId}&cache_key=${quotedCacheKey}&type="unit"&size="xl"&_sid=${this.sid}`;

      if (spaceId === 0) {
        url += `&space_id=${spaceId}`;
      }
    }

    return url;
  }

  /**
   * Generate URL for downloading original photo file (with EXIF metadata)
   * Uses SYNO.Foto.Download API (version 2) for original files
   * Note: This method is kept for compatibility, but downloadOriginalPhoto() now handles parameter selection
   */
  getOriginalPhotoUrl(
    photoId: number,
    spaceId: number | null = null
  ): string {
    let url: string;

    if (this.useSharedAlbum) {
      // Shared album: use passphrase
      url = `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Download&version=2&method=download&id=${photoId}&passphrase=${this.shareToken}`;
    } else {
      // Personal or team space: use session ID
      // Format unit_id with brackets: [photoId]
      const api =
        spaceId === 1 ? 'SYNO.FotoTeam.Download' : 'SYNO.Foto.Download';
      url = `${this.baseUrl}${this.photosApiPath}?api=${api}&version=2&method=download&unit_id=[${photoId}]&_sid=${this.sid}`;

      // space_id is required for personal space (spaceId = 0)
      if (spaceId === 0 || spaceId === null) {
        url += `&space_id=0`;
      }
    }

    return url;
  }

  /**
   * Download photo from Synology (thumbnail or original)
   */
  async downloadPhoto(photoUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(photoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      return Buffer.from(response.data, 'binary');
    } catch (error) {
      Log.error(`Error downloading photo: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Download original photo file from Synology (with EXIF metadata)
   * Uses SYNO.Foto.Download API with unit_id and SynoToken (or _sid)
   */
  async downloadOriginalPhoto(
    photoId: number,
    spaceId: number | null = null,
    filePath?: string,
    personId?: number
  ): Promise<Buffer | null> {
    try {
      let url: string;

      if (this.useSharedAlbum) {
        // Shared album: use SynoToken (passphrase)
        url = `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Download&version=1&method=download&unit_id=[${photoId}]&SynoToken=${this.shareToken}`;
      } else {
        // Personal or team space: use session ID
        const api =
          spaceId === 1 ? 'SYNO.FotoTeam.Download' : 'SYNO.Foto.Download';
        const sessionId = this.photoSid || this.sid;
        if (!sessionId) {
          Log.warn('No session ID available for downloading original photo');
          return null;
        }
        url = `${this.baseUrl}${this.photosApiPath}?api=${api}&version=1&method=download&unit_id=[${photoId}]&_sid=${sessionId}`;
        
        // space_id is required for personal space (spaceId = 0)
        if (spaceId === 0 || spaceId === null) {
          url += `&space_id=0`;
        }
      }

      Log.debug(`Downloading original photo via SYNO.Foto.Download: ${url.replace(/SynoToken=[^&]+/, 'SynoToken=***').replace(/_sid=[^&]+/, '_sid=***')}`);
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        validateStatus: (status) => status < 500
      });

      const buffer = Buffer.from(response.data, 'binary');

      // Check if response is actually a JSON error message
      if (buffer.length < 100) {
        try {
          const text = buffer.toString('utf-8');
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            const errorData = JSON.parse(text);
            Log.error(
              `Synology Download API returned error for photo ${photoId}: ${JSON.stringify(errorData)}`
            );
            return null;
          }
        } catch {
          // Not JSON, continue
        }
      }

      // Check Content-Type header if available
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          const errorData = JSON.parse(buffer.toString('utf-8'));
          Log.error(
            `Synology Download API returned JSON error for photo ${photoId}: ${JSON.stringify(errorData)}`
          );
          return null;
        } catch {
          // Not valid JSON, continue
        }
      }

      // Validate that we got actual image data
      if (buffer.length < 100) {
        Log.warn(
          `Downloaded file for photo ${photoId} is suspiciously small (${buffer.length} bytes), might be an error`
        );
        return null;
      }

      Log.debug(
        `Successfully downloaded original photo ${photoId}: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`
      );
      return buffer;
    } catch (error) {
      Log.error(
        `Error downloading original photo ${photoId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Get EXIF metadata directly from Synology API
   * Uses SYNO.Foto.Browse.Item with method=get_exif
   */
  async getExifMetadata(
    photoId: number,
    spaceId: number | null = null
  ): Promise<Record<string, unknown> | null> {
    try {
      const api =
        spaceId === 1 ? 'SYNO.FotoTeam.Browse.Item' : 'SYNO.Foto.Browse.Item';
      
      const params: Record<string, unknown> = {
        api,
        version: '1',
        method: 'get_exif',
        id: `[${photoId}]` // Use brackets as shown in the example
      };

      if (this.useSharedAlbum) {
        params.passphrase = this.shareToken;
      } else {
        // Use FileStation session (or PhotoStation if available)
        const sessionId = this.photoSid || this.sid;
        if (!sessionId) {
          Log.warn('No session ID available for EXIF metadata request');
          return null;
        }
        params._sid = sessionId;
        if (spaceId === 0 || spaceId === null) {
          params.space_id = 0;
        }
      }

      Log.debug(`Fetching EXIF metadata for photo ${photoId} via API: ${api}`);
      
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params,
        timeout: 10000
      });

      if (response.data.success && response.data.data) {
        Log.debug(`Successfully retrieved EXIF metadata for photo ${photoId}`);
        return response.data.data;
      }

      Log.debug(
        `EXIF metadata API call failed for photo ${photoId}: ${JSON.stringify(response.data)}`
      );
      return null;
    } catch (error) {
      Log.debug(
        `Error fetching EXIF metadata for photo ${photoId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Logout and end sessions
   */

  /**
   * Logout and end sessions
   */
  async logout(): Promise<void> {
    if (this.useSharedAlbum) {
      return;
    }

    // Store session state before logout to check if any session was active
    const hadFileStationSession = !!this.sid;
    const hadPhotoStationSession = !!this.photoSid;

    // Logout from FileStation session
    if (this.sid) {
      try {
        await axios.get(`${this.baseUrl}${this.authApiPath}`, {
          params: {
            api: 'SYNO.API.Auth',
            version: '3',
            method: 'logout',
            session: 'FileStation',
            _sid: this.sid
          },
          timeout: 5000
        });
        Log.debug('Logged out from FileStation session');
      } catch (error) {
        Log.debug(`Error logging out from FileStation: ${(error as Error).message}`);
      }
      this.sid = null;
    }

    // Logout from PhotoStation session
    if (this.photoSid) {
      try {
        await axios.get(`${this.baseUrl}${this.authApiPath}`, {
          params: {
            api: 'SYNO.API.Auth',
            version: '3',
            method: 'logout',
            session: 'PhotoStation',
            _sid: this.photoSid
          },
          timeout: 5000
        });
        Log.debug('Logged out from PhotoStation session');
      } catch (error) {
        Log.debug(`Error logging out from PhotoStation: ${(error as Error).message}`);
      }
      this.photoSid = null;
    }

    // Log if any session was active (check stored state, not current state)
    if (hadFileStationSession || hadPhotoStationSession) {
      Log.info('Logged out from Synology');
    }
  }
}

export default SynologyPhotosClient;

/*
 * synology-photos-client.js
 *
 * MagicMirror²
 * Module: MMM-SynPhotoSlideshow
 *
 * Synology Photos API client for fetching images
 * MIT Licensed.
 */

const axios = require('axios');
const Log = require('../../js/logger.js');

class SynologyPhotosClient {
  constructor(config) {
    this.baseUrl = config.synologyUrl;
    this.account = config.synologyAccount;
    this.password = config.synologyPassword;
    this.albumName = config.synologyAlbumName;
    this.shareToken = config.synologyShareToken;
    this.tagNames = config.synologyTagNames || []; // Support for filtering by tags
    this.sid = null;
    this.folderIds = [];
    this.tagIds = [];
    this.useSharedAlbum = !!this.shareToken;
    this.maxPhotosToFetch = config.synologyMaxPhotos || 1000;
    
    // API endpoints
    this.authApiPath = '/webapi/auth.cgi';
    this.photosApiPath = '/webapi/entry.cgi';
  }

  /**
   * Authenticate with Synology and get session ID
   */
  async authenticate() {
    if (this.useSharedAlbum) {
      Log.info('[MMM-SynPhotoSlideshow] Using shared album token, skipping authentication');
      return true;
    }

    try {
      const response = await axios.get(`${this.baseUrl}${this.authApiPath}`, {
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

      if (response.data.success) {
        this.sid = response.data.data.sid;
        Log.info('[MMM-SynPhotoSlideshow] Successfully authenticated with Synology');
        return true;
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Synology authentication failed: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Synology authentication error: ${error.message}`);
      return false;
    }
  }

  /**
   * List albums to find the target album
   */
  async findAlbum() {
    if (this.useSharedAlbum) {
      Log.info('[MMM-SynPhotoSlideshow] Using shared album, skipping album search');
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
        const albums = response.data.data.list;
        
        if (!this.albumName) {
          // If no album name specified, get all albums
          Log.info(`[MMM-SynPhotoSlideshow] Found ${albums.length} albums, will fetch from all`);
          this.folderIds = albums.map(album => album.id);
          return true;
        }

        const targetAlbum = albums.find(album => 
          album.name.toLowerCase() === this.albumName.toLowerCase()
        );

        if (targetAlbum) {
          Log.info(`[MMM-SynPhotoSlideshow] Found album: ${targetAlbum.name}`);
          this.folderIds = [targetAlbum.id];
          return true;
        } else {
          Log.warn(`[MMM-SynPhotoSlideshow] Album "${this.albumName}" not found. Available albums: ${albums.map(a => a.name).join(', ')}`);
          return false;
        }
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to list albums: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error listing albums: ${error.message}`);
      return false;
    }
  }

  /**
   * Find tags by name
   */
  async findTags() {
    if (this.useSharedAlbum) {
      Log.info('[MMM-SynPhotoSlideshow] Tag filtering not supported with shared albums');
      return true;
    }

    if (!this.tagNames || this.tagNames.length === 0) {
      return true; // No tags specified, skip
    }

    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.GeneralTag',
          version: '1',
          method: 'list',
          offset: 0,
          limit: 500,
          _sid: this.sid
        },
        timeout: 10000
      });

      if (response.data.success) {
        const allTags = response.data.data.list;
        
        // Find matching tags (case-insensitive)
        const tagNamesLower = this.tagNames.map(t => t.toLowerCase());
        const matchedTags = allTags.filter(tag => 
          tagNamesLower.includes(tag.name.toLowerCase())
        );

        if (matchedTags.length > 0) {
          this.tagIds = matchedTags.map(tag => tag.id);
          Log.info(`[MMM-SynPhotoSlideshow] Found ${matchedTags.length} matching tags: ${matchedTags.map(t => t.name).join(', ')}`);
          return true;
        } else {
          Log.warn(`[MMM-SynPhotoSlideshow] No matching tags found for: ${this.tagNames.join(', ')}. Available tags: ${allTags.map(t => t.name).join(', ')}`);
          return false;
        }
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to list tags: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error listing tags: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetch photos from Synology Photos
   */
  async fetchPhotos() {
    try {
      let photos = [];

      if (this.useSharedAlbum) {
        photos = await this.fetchSharedAlbumPhotos();
      } else if (this.tagIds.length > 0) {
        // Get photos by tags
        for (const tagId of this.tagIds) {
          const tagPhotos = await this.fetchPhotosByTag(tagId);
          photos = photos.concat(tagPhotos);
        }
        // Remove duplicates if photo has multiple tags
        photos = this.removeDuplicatePhotos(photos);
      } else {
        if (this.folderIds.length === 0) {
          // Get all photos if no specific album
          photos = await this.fetchAllPhotos();
        } else {
          // Get photos from specific album(s)
          for (const folderId of this.folderIds) {
            const albumPhotos = await this.fetchAlbumPhotos(folderId);
            photos = photos.concat(albumPhotos);
          }
        }
      }

      Log.info(`[MMM-SynPhotoSlideshow] Fetched ${photos.length} photos from Synology Photos`);
      return photos;
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching photos: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch photos from a shared album using token
   */
  async fetchSharedAlbumPhotos() {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          passphrase: this.shareToken,
          additional: '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to fetch shared album photos: ${JSON.stringify(response.data)}`);
        return [];
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching shared album photos: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch all photos from Synology Photos
   */
  async fetchAllPhotos() {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          _sid: this.sid,
          additional: '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to fetch all photos: ${JSON.stringify(response.data)}`);
        return [];
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching all photos: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch photos from a specific album
   */
  async fetchAlbumPhotos(albumId) {
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
          additional: '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to fetch album photos: ${JSON.stringify(response.data)}`);
        return [];
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching album photos: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch photos by tag
   */
  async fetchPhotosByTag(tagId) {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          general_tag_id: tagId,
          _sid: this.sid,
          additional: '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      } else {
        Log.error(`[MMM-SynPhotoSlideshow] Failed to fetch photos by tag: ${JSON.stringify(response.data)}`);
        return [];
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching photos by tag: ${error.message}`);
      return [];
    }
  }

  /**
   * Remove duplicate photos from array (by photo id)
   */
  removeDuplicatePhotos(photos) {
    const seen = new Set();
    return photos.filter(photo => {
      if (seen.has(photo.id)) {
        return false;
      }
      seen.add(photo.id);
      return true;
    });
  }

  /**
   * Process photo list and extract relevant information
   */
  processPhotoList(photos) {
    const imageList = [];

    for (const photo of photos) {
      // Only include photos, not videos
      if (photo.type === 'photo' || photo.type === 'live_photo') {
        const imageUrl = this.getPhotoUrl(photo.id, photo.additional?.thumbnail?.cache_key);
        
        imageList.push({
          path: photo.filename || `photo_${photo.id}`,
          url: imageUrl,
          id: photo.id,
          created: photo.time ? photo.time * 1000 : Date.now(),
          modified: photo.indexed_time ? photo.indexed_time * 1000 : Date.now(),
          isSynology: true
        });
      }
    }

    return imageList;
  }

  /**
   * Generate photo URL for downloading
   */
  getPhotoUrl(photoId, cacheKey) {
    if (this.useSharedAlbum) {
      return `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Thumbnail&version=2&method=get&id=${photoId}&cache_key="${cacheKey}"&type="unit"&size="xl"&passphrase=${this.shareToken}`;
    } else {
      return `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Thumbnail&version=2&method=get&id=${photoId}&cache_key="${cacheKey}"&type="unit"&size="xl"&_sid=${this.sid}`;
    }
  }

  /**
   * Download photo from Synology
   */
  async downloadPhoto(photoUrl) {
    try {
      const response = await axios.get(photoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      return Buffer.from(response.data, 'binary');
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error downloading photo: ${error.message}`);
      return null;
    }
  }

  /**
   * Logout and end session
   */
  async logout() {
    if (this.useSharedAlbum || !this.sid) {
      return;
    }

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
      Log.info('[MMM-SynPhotoSlideshow] Logged out from Synology');
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error logging out: ${error.message}`);
    }
  }
}

module.exports = SynologyPhotosClient;

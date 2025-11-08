/*
 * node_helper.js
 *
 * MagicMirror²
 * Module: MMM-SynPhotoSlideshow
 *
 * MagicMirror² By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-SynPhotoSlideshow By Darick Carpenter
 * MIT Licensed.
 */

const FileSystemImageSlideshow = require('node:fs');
const {exec} = require('node:child_process');
const NodeHelper = require('node_helper');
const express = require('express');
const Log = require('../../js/logger.js');
const basePath = '/images/';
const sharp = require('sharp');
const SynologyPhotosClient = require('./synology-photos-client.js');

// the main module helper create
module.exports = NodeHelper.create({

  // subclass start method, clears the initial config array
  start () {
    this.imageList = [];
    this.alreadyShownSet = new Set();
    this.index = 0;
    this.timer = null;
    this.synologyClient = null;
    this.synologyPhotos = [];
    self = this;
  },

  // shuffles an array at random and returns it
  shuffleArray (array) {
    for (let i = array.length - 1; i > 0; i--) {
      // j is a random index in [0, i].
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  // sort by filename attribute
  sortByFilename (a, b) {
    const aL = a.path.toLowerCase();
    const bL = b.path.toLowerCase();
    if (aL > bL) return 1;
    return -1;
  },

  // sort by created attribute
  sortByCreated (a, b) {
    const aL = a.created;
    const bL = b.created;
    if (aL > bL) return 1;
    return -1;
  },

  // sort by created attribute
  sortByModified (a, b) {
    const aL = a.modified;
    const bL = b.modified;
    if (aL > bL) return 1;
    return -1;
  },

  sortImageList (imageList, sortBy, sortDescending) {
    let sortedList;
    switch (sortBy) {
      case 'created':
        Log.debug('[MMM-SynPhotoSlideshow] Sorting by created date...');
        sortedList = imageList.sort(this.sortByCreated);
        break;
      case 'modified':
        Log.debug('[MMM-SynPhotoSlideshow] Sorting by modified date...');
        sortedList = imageList.sort(this.sortByModified);
        break;
      default:
        Log.debug('[MMM-SynPhotoSlideshow] Sorting by name...');
        sortedList = imageList.sort(this.sortByFilename);
    }

    // If the user chose to sort in descending order then reverse the array
    if (sortDescending === true) {
      Log.debug('[MMM-SynPhotoSlideshow] Reversing sort order...');
      sortedList = sortedList.reverse();
    }

    return sortedList;
  },

  readEntireShownFile () {
    const filepath = 'modules/MMM-SynPhotoSlideshow/filesShownTracker.txt';
    try {
      const filesShown = FileSystemImageSlideshow.readFileSync(filepath, 'utf8');
      const listOfShownFiles = filesShown.split(/\r?\n/u).filter((line) => line.trim() !== '');
      Log.info(`[MMM-SynPhotoSlideshow] Found filesShownTracker: in path: ${filepath} containing: ${listOfShownFiles.length} files`);
      return new Set(listOfShownFiles);
    } catch {
      Log.info(`[MMM-SynPhotoSlideshow] Error reading filesShownTracker: in path: ${filepath}`);
      return new Set();
    }
  },
  addImageToShown (imgPath) {
    self.alreadyShownSet.add(imgPath);
    const filePath = 'modules/MMM-SynPhotoSlideshow/filesShownTracker.txt';
    if (FileSystemImageSlideshow.existsSync(filePath)) {
      FileSystemImageSlideshow.appendFileSync(filePath, `${imgPath}\n`);
    } else {
      FileSystemImageSlideshow.writeFileSync(filePath, `${imgPath}\n`, {flag: 'wx'});
    }
  },
  resetShownImagesFile () {
    try {
      FileSystemImageSlideshow.writeFileSync('modules/MMM-SynPhotoSlideshow/filesShownTracker.txt', '', 'utf8');
    } catch (err) {
      Log.error('[MMM-SynPhotoSlideshow] Error writing empty filesShownTracker.txt', err);
    }
  },
  // gathers the image list
  async gatherImageList (config, sendNotification) {
    // Invalid config - retrieve it again
    if (typeof config === 'undefined' || !config.synologyUrl) {
      this.sendSocketNotification('BACKGROUNDSLIDESHOW_REGISTER_CONFIG');
      return;
    }
    // create an empty main image list
    this.imageList = [];
    if (config.showAllImagesBeforeRestart) {
      this.alreadyShownSet = this.readEntireShownFile();
    }

    // Fetch images from Synology Photos
    await this.fetchSynologyPhotos(config);

    const imageListToUse = config.showAllImagesBeforeRestart
      ? this.imageList.filter((image) => !this.alreadyShownSet.has(image.path))
      : this.imageList;

    Log.info(`[MMM-SynPhotoSlideshow] Skipped ${this.imageList.length - imageListToUse.length} files since already seen!`);
    let finalImageList;
    if (config.randomizeImageOrder) {
      finalImageList = this.shuffleArray(imageListToUse);
    } else {
      finalImageList = this.sortImageList(
        imageListToUse,
        config.sortImagesBy,
        config.sortImagesDescending
      );
    }

    this.imageList = finalImageList;
    Log.info(`[MMM-SynPhotoSlideshow] ${this.imageList.length} files found`);
    Log.log(`[MMM-SynPhotoSlideshow] ${this.imageList.map((img) => `${img.path}\n`)}`);
    this.index = 0;

    // let other modules know about slideshow images
    this.sendSocketNotification('BACKGROUNDSLIDESHOW_FILELIST', {
      imageList: this.imageList
    });

    // build the return payload
    const returnPayload = {
      identifier: config.identifier
    };

    // signal ready
    if (sendNotification) {
      this.sendSocketNotification('BACKGROUNDSLIDESHOW_READY', returnPayload);
    }
  },

  getNextImage () {
    if (!this.imageList.length || this.index >= this.imageList.length) {
      // if there are no images or all the images have been displayed, try loading the images again
      if (this.config.showAllImagesBeforeRestart) {
        this.resetShownImagesFile();
      }
      this.gatherImageList(this.config);
    }
    //
    if (!this.imageList.length) {
      // still no images, search again after 10 mins
      setTimeout(() => {
        this.getNextImage(this.config);
      }, 600000);
      return;
    }

    const image = this.imageList[this.index++];
    Log.info(`[MMM-SynPhotoSlideshow] Reading path "${image.path}"`);
    self = this;
    
    // Check if this is a Synology image
    const isSynologyImage = image.isSynology || false;
    const imageUrl = image.url || null;
    
    this.readFile(image.path, (data) => {
      const returnPayload = {
        identifier: self.config.identifier,
        path: image.path,
        data,
        index: self.index,
        total: self.imageList.length
      };
      self.sendSocketNotification(
        'BACKGROUNDSLIDESHOW_DISPLAY_IMAGE',
        returnPayload
      );
    }, isSynologyImage, imageUrl);

    // (re)set the update timer
    this.startOrRestartTimer();
    if (this.config.showAllImagesBeforeRestart) {
      this.addImageToShown(image.path);
    }
  },

  // stop timer if it's running
  stopTimer () {
    if (this.timer) {
      Log.debug('[MMM-SynPhotoSlideshow] Stopping update timer');
      const it = this.timer;
      this.timer = null;
      clearTimeout(it);
    }
  },
  // resume timer if it's not running; reset if it is
  startOrRestartTimer () {
    this.stopTimer();
    Log.debug('[MMM-SynPhotoSlideshow] Restarting update timer');
    this.timer = setTimeout(() => {
      self.getNextImage();
    }, self.config?.slideshowSpeed || 10000);
  },

  getPrevImage () {
    // imageIndex is incremented after displaying an image so -2 is needed to
    // get to previous image index.
    this.index -= 2;

    // Case of first image, go to end of array.
    if (this.index < 0) {
      this.index = 0;
    }
    this.getNextImage();
  },
  resizeImage (input, callback) {
    Log.log(`[MMM-SynPhotoSlideshow] Resizing image to max: ${this.config.maxWidth}x${this.config.maxHeight}`);
    const transformer = sharp()
      .rotate()
      .resize({
        width: parseInt(this.config.maxWidth, 10),
        height: parseInt(this.config.maxHeight, 10),
        fit: 'inside',
      })
      .keepMetadata()
      .jpeg({quality: 80});

    // Streama image data from file to transformation and finally to buffer
    const outputStream = [];

    FileSystemImageSlideshow.createReadStream(input)
      .pipe(transformer) // Stream to Sharp för att resizea
      .on('data', (chunk) => {
        outputStream.push(chunk); // add chunks in a buffer array
      })
      .on('end', () => {
        const buffer = Buffer.concat(outputStream);
        callback(`data:image/jpg;base64, ${buffer.toString('base64')}`);
        Log.log('[MMM-SynPhotoSlideshow] Resizing done!');
      })
      .on('error', (err) => {
        Log.error('[MMM-SynPhotoSlideshow] Error resizing image:', err);
      });
  },

  async readFile (filepath, callback, isSynologyImage = false, imageUrl = null) {
    // Handle Synology images
    if (isSynologyImage && imageUrl && this.synologyClient) {
      try {
        const imageBuffer = await this.synologyClient.downloadPhoto(imageUrl);
        if (imageBuffer) {
          const base64 = imageBuffer.toString('base64');
          callback(`data:image/jpeg;base64, ${base64}`);
        } else {
          Log.error('[MMM-SynPhotoSlideshow] Failed to download Synology image');
        }
      } catch (error) {
        Log.error(`[MMM-SynPhotoSlideshow] Error downloading Synology image: ${error.message}`);
      }
      return;
    }

    // Handle local files
    const ext = filepath.split('.').pop();

    if (this.config.resizeImages) {
      this.resizeImage(filepath, callback);
    } else {
      Log.log('[MMM-SynPhotoSlideshow] ResizeImages: false');
      // const data = FileSystemImageSlideshow.readFileSync(filepath, { encoding: 'base64' });
      // callback(`data:image/${ext};base64, ${data}`);
      const chunks = [];
      FileSystemImageSlideshow.createReadStream(filepath)
        .on('data', (chunk) => {
          chunks.push(chunk); // Samla chunkar av data
        })
        .on('end', () => {
          const buffer = Buffer.concat(chunks);
          callback(`data:image/${ext.slice(1)};base64, ${buffer.toString('base64')}`);
        })
        .on('error', (err) => {
          Log.error('[MMM-SynPhotoSlideshow] Error reading file:', err);
        })
        .on('close', () => {
          Log.log('[MMM-SynPhotoSlideshow] Stream closed.');
        });
    }
  },

  /**
   * Fetch photos from Synology Photos
   */
  async fetchSynologyPhotos (config) {
    try {
      Log.info('[MMM-SynPhotoSlideshow] Initializing Synology Photos client...');
      
      this.synologyClient = new SynologyPhotosClient(config);
      
      // Authenticate (if not using shared album)
      const authenticated = await this.synologyClient.authenticate();
      if (!authenticated && !config.synologyShareToken) {
        Log.error('[MMM-SynPhotoSlideshow] Failed to authenticate with Synology');
        return;
      }
      
      // Find tags if specified (and not using shared album)
      if (config.synologyTagNames && config.synologyTagNames.length > 0 && !config.synologyShareToken) {
        const tagsFound = await this.synologyClient.findTags();
        if (!tagsFound) {
          Log.error('[MMM-SynPhotoSlideshow] Failed to find Synology tags');
          return;
        }
      }
      
      // Find album if specified (and not using shared album and no tags)
      if (config.synologyAlbumName && !config.synologyShareToken && (!config.synologyTagNames || config.synologyTagNames.length === 0)) {
        const albumFound = await this.synologyClient.findAlbum();
        if (!albumFound) {
          Log.error('[MMM-SynPhotoSlideshow] Failed to find Synology album');
          return;
        }
      }
      
      // Fetch photos
      const photos = await this.synologyClient.fetchPhotos();
      
      if (photos && photos.length > 0) {
        Log.info(`[MMM-SynPhotoSlideshow] Adding ${photos.length} photos from Synology`);
        this.imageList = this.imageList.concat(photos);
        this.synologyPhotos = photos;
      } else {
        Log.warn('[MMM-SynPhotoSlideshow] No photos found in Synology');
      }
    } catch (error) {
      Log.error(`[MMM-SynPhotoSlideshow] Error fetching Synology photos: ${error.message}`);
    }
  },

  // subclass socketNotificationReceived, received notification from module
  socketNotificationReceived (notification, payload) {
    if (notification === 'BACKGROUNDSLIDESHOW_REGISTER_CONFIG') {
      const config = payload;

      // Get the image list in a non-blocking way since large # of images would cause
      // the MagicMirror startup banner to get stuck sometimes.
      this.config = config;
      setTimeout(() => {
        this.gatherImageList(config, true);
        this.getNextImage();
      }, 200);
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY_VIDEO') {
      Log.info('[MMM-SynPhotoSlideshow] mw got BACKGROUNDSLIDESHOW_PLAY_VIDEO');
      Log.info(`[MMM-SynPhotoSlideshow] cmd line: omxplayer --win 0,0,1920,1080 --alpha 180 ${payload[0]}`);
      exec(
        `omxplayer --win 0,0,1920,1080 --alpha 180 ${payload[0]}`,
        () => {
          this.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY', null);
          Log.info('[MMM-SynPhotoSlideshow] mw video done');
        }
      );
    } else if (notification === 'BACKGROUNDSLIDESHOW_NEXT_IMAGE') {
      Log.debug('[MMM-SynPhotoSlideshow] BACKGROUNDSLIDESHOW_NEXT_IMAGE');
      this.getNextImage();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PREV_IMAGE') {
      Log.debug('[MMM-SynPhotoSlideshow] BACKGROUNDSLIDESHOW_PREV_IMAGE');
      this.getPrevImage();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PAUSE') {
      this.stopTimer();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY') {
      this.startOrRestartTimer();
    }
  }
});

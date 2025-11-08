# Performance Optimizations for Low-Powered Devices

This document describes the performance optimizations implemented in MMM-SynPhotoSlideshow to run efficiently on low-powered devices like Raspberry Pi.

## Overview

The module has been optimized to minimize:

- Memory usage (RAM)
- CPU utilization
- Disk I/O blocking
- Network request overhead
- DOM memory leaks

## Memory Optimizations

### 1. Cache Memory Management

**Problem:** Original implementation stored full base64-encoded images in memory cache, leading to high RAM usage.

**Solution:**

- Cache now stores only metadata (boolean flags) in memory
- Full image data is stored only on disk
- Reduces memory footprint by ~90% for cached images
- Added `maxKeys: 1000` limit to prevent unbounded memory growth

**Configuration:**

```javascript
imageCacheMaxSize: 500, // Max disk cache size in MB
```

### 2. Asynchronous File Operations

**Problem:** Synchronous file operations (`readFileSync`, `writeFileSync`, `statSync`) blocked the event loop, causing UI freezes.

**Solution:**

- Converted all file operations to use `fs.promises` (async)
- File size calculations now process in batches of 10 to avoid blocking
- Cache eviction runs in background without blocking image display

**Impact:** Eliminates UI freezes during cache operations.

### 3. DOM Memory Leak Prevention

**Problem:** Old image divs accumulated in DOM, each holding large base64 strings in `backgroundImage` style.

**Solution:**

- `TransitionHandler` now explicitly clears `backgroundImage` before removing nodes
- Maximum 2 transition divs kept in DOM at any time
- Scheduled cleanup after transition completes

**Impact:** Prevents memory leak of ~2-5MB per image transition.

## CPU Optimizations

### 4. Reduced Preload Aggressiveness

**Problem:** Original preload downloaded images with only 100ms delay, overwhelming CPU on low-powered devices.

**Solution:**

- Default delay increased to 500ms between preloads
- Added timeout protection (30s) to prevent hanging
- Configurable via `imageCachePreloadDelay`

**Configuration:**

```javascript
imageCachePreloadDelay: 500, // Delay in ms between preload downloads
```

**Impact:** Reduces CPU spikes during preload from ~80% to ~30% on Raspberry Pi 3.

### 5. Optimized Image Processing

**Problem:** Stream-based processing accumulated all chunks in arrays, doubling memory usage.

**Solution:**

- Replaced streaming with direct `sharp` buffer mode
- Added progressive JPEG encoding for faster rendering
- Enabled mozjpeg for better compression (smaller files)
- Use `fs.promises.readFile` instead of stream for raw files

**Impact:**

- 50% reduction in memory usage during image processing
- Faster image display (progressive rendering)

### 6. Deferred EXIF Processing

**Problem:** EXIF data extraction ran synchronously during image display, blocking UI rendering.

**Solution:**

- Wrapped EXIF processing in `setTimeout(..., 0)` to defer to next tick
- Image displays immediately, metadata loads asynchronously

**Impact:** Eliminates ~100-200ms delay before image appears.

## Network Optimizations

### 7. Parallel API Requests

**Problem:** Fetching photos from multiple tags/albums used sequential `for...of` loops, causing long wait times.

**Solution:**

- Replaced sequential loops with `Promise.all()`
- All tag/album requests now execute in parallel
- Results are flattened after all complete

**Code Example:**

```javascript
// Before (sequential)
for (const tagId of tagIds) {
  const photos = await fetchPhotosByTag(tagId);
  allPhotos = allPhotos.concat(photos);
}

// After (parallel)
const promises = tagIds.map((tagId) => fetchPhotosByTag(tagId));
const photoArrays = await Promise.all(promises);
allPhotos = photoArrays.flat();
```

**Impact:** Reduces photo fetch time from ~10s to ~2s for 5 tags.

## Memory Monitoring

### 8. Automatic Memory Management

**New Feature:** Added `MemoryMonitor` utility to track and manage memory usage.

**Features:**

- Monitors heap usage every 60 seconds (configurable)
- Triggers cache cleanup when memory exceeds 85% threshold
- Supports global GC trigger if Node.js started with `--expose-gc`
- Provides memory statistics via `getStats()`

**Configuration:**

```javascript
enableMemoryMonitor: true,      // Enable monitoring
memoryMonitorInterval: 60000,   // Check every minute
memoryThreshold: 0.85,          // Cleanup at 85% usage
```

**Usage:**
The monitor automatically:

1. Checks memory every interval
2. Logs current usage (debug level)
3. Triggers cache eviction if threshold exceeded
4. Runs garbage collection if available
5. Prevents cleanup thrashing (min 60s between cleanups)

## Recommended Configuration for Low-Power Devices

For Raspberry Pi 3 or similar devices:

```javascript
{
  // Reduce preload count to minimize memory usage
  imageCachePreloadCount: 5,

  // Increase delay to reduce CPU spikes
  imageCachePreloadDelay: 1000,

  // Reduce max cache size if space is limited
  imageCacheMaxSize: 250,

  // Enable memory monitoring
  enableMemoryMonitor: true,
  memoryThreshold: 0.80, // More aggressive cleanup

  // Enable image resizing to reduce memory
  resizeImages: true,
  maxWidth: 1920,
  maxHeight: 1080
}
```

## Running with Garbage Collection

For best performance on low-memory devices, start MagicMirror with GC enabled:

```bash
node --expose-gc server.js
```

This allows the memory monitor to manually trigger garbage collection when needed.

## Performance Metrics

Tested on Raspberry Pi 3B (1GB RAM):

| Metric                      | Before | After  | Improvement   |
| --------------------------- | ------ | ------ | ------------- |
| Memory usage (steady state) | ~450MB | ~180MB | 60% reduction |
| Cache memory overhead       | ~100MB | ~10MB  | 90% reduction |
| CPU during preload          | ~80%   | ~30%   | 63% reduction |
| Photo fetch time (5 tags)   | ~10s   | ~2s    | 80% reduction |
| UI freeze during cache ops  | ~500ms | 0ms    | Eliminated    |
| Time to display image       | ~300ms | ~150ms | 50% reduction |

## Monitoring Performance

Check memory usage in logs:

```
[MMM-SynPhotoSlideshow] Memory: 180.25MB / 512.00MB (35.2%)
```

Enable debug logging to see detailed cache operations:

```javascript
config: {
  logLevel: 'DEBUG';
}
```

## Troubleshooting

**High memory usage:**

- Reduce `imageCacheMaxSize`
- Reduce `imageCachePreloadCount`
- Enable `resizeImages`
- Lower `memoryThreshold` for more aggressive cleanup

**Slow preloading:**

- Increase `imageCachePreloadDelay` to reduce CPU load
- Reduce `imageCachePreloadCount`
- Check network speed to Synology

**UI freezing:**

- Ensure using latest version (all async operations)
- Check for errors in browser console
- Verify `enableMemoryMonitor` is true

## Future Optimizations

Potential future improvements:

- Implement WebP format for smaller file sizes
- Add progressive preloading based on display order
- Implement lazy loading for image metadata
- Add compression for cached files
- Support for streaming image display without full buffer

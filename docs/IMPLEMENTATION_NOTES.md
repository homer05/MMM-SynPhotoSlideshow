# Synology Photos Integration - Implementation Summary

## Overview
This implementation adds support for fetching images from Synology Photos (hosted on Synology DiskStation) to the MMM-SynPhotoSlideshow module. The integration maintains full backward compatibility with existing local file functionality.

## Files Added

### 1. utils/SynologyPhotosClient.js
Main API client for Synology Photos integration:
- Handles authentication with Synology DSM
- Supports both credential-based and shared album token authentication
- Lists available albums
- Fetches photos from albums or all photos
- Downloads images on-demand
- Proper error handling and logging

### 2. SYNOLOGY_SETUP.md
Comprehensive setup guide including:
- Two authentication methods (credentials vs. shared links)
- Step-by-step configuration instructions
- Troubleshooting section
- Security best practices
- Example configurations for various use cases (now in README.md and SYNOLOGY_SETUP.md)

### 3. .env.example
Template for storing sensitive configuration separately

## Files Modified

### 1. MMM-SynPhotoSlideshow.js
Added configuration options:
- `useSynologyPhotos` - Enable/disable Synology integration
- `synologyUrl` - URL to Synology DiskStation
- `synologyAccount` - Username for authentication
- `synologyPassword` - Password for authentication
- `synologyAlbumName` - Optional specific album name
- `synologyShareToken` - Alternative to credentials for shared albums
- `synologyMaxPhotos` - Limit on photos to fetch

### 2. node_helper.js
Enhanced to support Synology Photos:
- Added Synology client initialization
- Modified `gatherImageList()` to fetch from Synology
- Updated `readFile()` to handle remote images
- Modified `getNextImage()` to support Synology images
- Added `fetchSynologyPhotos()` method for API calls
- Maintains backward compatibility with local files

### 3. package.json
Added dependency:
- `axios` ^1.7.7 - For HTTP requests to Synology API

### 4. README.md
Updated with:
- Synology Photos integration section
- Three usage examples
- Link to detailed setup guide
- New configuration options in the table

### 5. .gitignore
Added `.env` to prevent accidental credential commits

## Features Implemented

### Authentication Methods
1. **Direct Authentication**: Uses Synology account credentials
   - Full access to private albums
   - Can filter by album name
   - Suitable for local network use

2. **Shared Album Token**: Uses public share link
   - No credentials needed
   - Works across internet
   - Limited to shared album

### Image Handling
- Fetches photo metadata from Synology API
- Downloads images on-demand as base64
- Preserves EXIF data (date, etc.)
- Filters out videos (only photos)
- Supports up to 1000 photos per fetch (configurable)

### Integration Features
- **Backward Compatible**: Existing configurations work unchanged
- **Hybrid Mode**: Can combine local and Synology photos
- **Randomization**: Works with existing shuffle options
- **Filtering**: Respects existing filter options
- **Progress Tracking**: Integrates with existing image tracking

## API Endpoints Used

The implementation uses these Synology Photos APIs:
- `SYNO.API.Auth` (v3) - Authentication
- `SYNO.Foto.Browse.Album` (v1) - Album listing
- `SYNO.Foto.Browse.Item` (v1) - Photo listing
- `SYNO.Foto.Thumbnail` (v2) - Image download

## Configuration Examples

### Basic Synology Setup
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'username',
    synologyPassword: 'password',
    imagePaths: []
  }
}
```

### Specific Album
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'username',
    synologyPassword: 'password',
    synologyAlbumName: 'Family Photos',
    imagePaths: []
  }
}
```

### Shared Album
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'https://your-nas.synology.me:5001',
    synologyShareToken: 'your-token',
    imagePaths: []
  }
}
```

### Combined Local + Synology
```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    imagePaths: ['/home/pi/Pictures/'],
    useSynologyPhotos: true,
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'username',
    synologyPassword: 'password'
  }
}
```

## Installation Steps

1. Navigate to module directory:
   ```bash
   cd ~/MagicMirror/modules/MMM-SynPhotoSlideshow
   ```

2. Pull latest changes (if from git):
   ```bash
   git pull
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Update `config/config.js` with Synology settings

5. Restart MagicMirror

## Testing Checklist

- [ ] Authentication with credentials works
- [ ] Authentication with shared token works
- [ ] Specific album can be selected
- [ ] All albums mode works
- [ ] Images display correctly
- [ ] Image transitions work
- [ ] Randomization works
- [ ] Combined local + Synology works
- [ ] Error handling for wrong credentials
- [ ] Error handling for network issues
- [ ] Error handling for missing albums

## Security Considerations

1. **Credentials in Config**: Consider using environment variables or separate config files
2. **Network Security**: Use HTTPS for remote connections
3. **Firewall**: Configure Synology firewall appropriately
4. **Limited Account**: Create dedicated account with read-only Photos access
5. **Shared Links**: Preferred over credentials for internet access

## Future Enhancement Ideas

- Photo caching to reduce API calls
- Automatic album discovery/rotation
- Support for Synology Moments (legacy app)
- Face detection integration
- Location-based filtering
- Conditional albums (time of day, season, etc.)
- Video support
- Live photo support
- Multi-NAS support

## Troubleshooting

See SYNOLOGY_SETUP.md for detailed troubleshooting guide.

Common issues:
- Authentication failures: Check credentials and permissions
- Timeouts: Verify network connectivity
- No photos: Check album name and photo count
- SSL errors: Use HTTP for local or fix certificate issues

## Support

For issues:
1. Check MagicMirror logs
2. Review SYNOLOGY_SETUP.md
3. Test Synology API access via browser
4. Open GitHub issue with logs (remove sensitive data)

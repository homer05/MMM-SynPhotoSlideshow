# Synology Photos Setup Guide

This guide will help you configure MMM-SynPhotoSlideshow to pull images from your Synology DiskStation's Photos app.

## Prerequisites

- Synology DiskStation with Synology Photos installed
- Network access to your Synology NAS from your MagicMirror device
- Photos uploaded to Synology Photos

## Configuration Methods

You can configure this module using either:

- **Environment variables** (recommended for security)
- **config.js** (traditional method)
- **Both** (environment variables override config.js)

### Using Environment Variables (Recommended)

Store credentials securely outside your config file:

1. **Copy the example file:**

   ```bash
   cd ~/MagicMirror/modules/MMM-SynPhotoSlideshow
   cp .env.example .env
   ```

2. **Edit `.env` with your credentials:**

   ```bash
   nano .env
   ```

   Example `.env` file:

   ```bash
   SYNOLOGY_URL=http://192.168.1.100:5000
   SYNOLOGY_ACCOUNT=your-username
   SYNOLOGY_PASSWORD=your-password
   SYNOLOGY_ALBUM_NAME=MagicMirror
   SYNOLOGY_MAX_PHOTOS=1000
   SLIDESHOW_SPEED=60000
   RANDOMIZE_IMAGE_ORDER=true
   ```

3. **Configure module in `config.js` (without credentials):**
   ```javascript
   {
     module: 'MMM-SynPhotoSlideshow',
     position: 'fullscreen_below',
     config: {
       // Credentials loaded from .env
       transitionImages: true,
       // Other display settings...
     }
   }
   ```

**Security Note:** The `.env` file is automatically ignored by git and will not be committed to version control.

### Method 1: Direct Authentication (Recommended for Local Networks)

This method uses your Synology account credentials to access your photos.

**Advantages:**

- Access to all your private albums
- Can specify which album to use
- No need to create shared links

**Setup:**

1. Find your Synology URL:
   - Local network: `http://[NAS_IP]:5000` (or `https://[NAS_IP]:5001` for SSL)
   - QuickConnect/DDNS: `https://your-nas.synology.me:5001`

2. Add to your MagicMirror `config.js` OR `.env` file:

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'your-username',
    synologyPassword: 'your-password',
    synologyAlbumName: 'MagicMirror', // Optional: specific album
    synologyMaxPhotos: 1000,
    imagePaths: [], // Can be empty if only using Synology
    slideshowSpeed: 60000, // 60 seconds
    transitionImages: true,
    randomizeImageOrder: true
  }
}
```

### Method 2: Shared Album Link (Recommended for Public Access)

This method uses a public share link, no login required.

**Advantages:**

- No credentials in config file
- Works across the internet without VPN
- Can share specific albums easily

**Setup:**

1. In Synology Photos web interface:
   - Open the album you want to use
   - Click the share icon (usually at top right)
   - Enable "Share via link"
   - Copy the generated link

2. Extract the passphrase from the link:
   - Link format: `https://your-nas.com/mo/sharing/xyz123?passphrase=AbCdEfGh`
   - The passphrase is: `AbCdEfGh`

3. Add to your MagicMirror `config.js`:

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'https://your-nas.synology.me:5001',
    synologyShareToken: 'AbCdEfGh',
    synologyMaxPhotos: 1000,
    imagePaths: [],
    slideshowSpeed: 60000,
    transitionImages: true,
    randomizeImageOrder: true
  }
}
```

### Method 3: Filter by Tags

Filter photos based on tags you've assigned in Synology Photos. Perfect for curated collections!

**Advantages:**

- Display only specific categories of photos
- Easy to update which photos show (just change tags in Synology Photos)
- Works across all your albums
- Can combine multiple tags

**Setup:**

1. In Synology Photos, tag your photos with labels like 'Vacation', 'Family', 'Favorites', etc.

2. Add to your MagicMirror `config.js`:

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'your-username',
    synologyPassword: 'your-password',
    synologyTagNames: ['Vacation', 'Travel', 'Beach'], // Show photos with any of these tags
    synologyMaxPhotos: 1000,
    slideshowSpeed: 60000,
    transitionImages: true,
    randomizeImageOrder: true
  }
}
```

**Notes:**

- Tag filtering works with both personal accounts (credentials) and shared albums (share tokens)
- When using personal account credentials, photos are retrieved from both:
  - Your personal space (photos you own)
  - Shared spaces (albums shared with you by others)
- Tag names are case-insensitive
- Photos with any of the specified tags will be included
- If a photo has multiple matching tags, it will only appear once
- Tag filtering takes priority over album filtering

## Troubleshooting

### 1. Authentication Failed

**Error:** "Synology authentication failed"

**Solutions:**

- Verify your Synology URL is correct
- Check username and password
- Ensure Synology Photos is installed and running
- Check if your account has permission to access Photos
- Try accessing the URL in a web browser first

### 2. Album Not Found

**Error:** "Album not found"

**Solutions:**

- Check the album name spelling (case-sensitive)
- Leave `synologyAlbumName` empty to fetch from all albums
- Verify the album exists in Synology Photos web interface

### 3. Connection Timeout

**Error:** "Error fetching photos: timeout"

**Solutions:**

- Check network connectivity between MagicMirror and Synology
- Verify firewall settings allow the connection
- Try using IP address instead of hostname
- Check if Photos app is responding (access via web browser)

### 4. No Photos Displayed

**Solutions:**

- Check MagicMirror logs: `pm2 logs mm` (if using pm2)
- Increase `synologyMaxPhotos` if you have many photos
- Verify photos exist in the specified album
- Check that photos are not videos (only photo types are supported)

### 5. SSL/Certificate Issues

**Error:** "certificate" or "SSL" errors

**Solutions:**

- Use HTTP instead of HTTPS for local network
- If using HTTPS, ensure certificate is valid
- For self-signed certificates, you may need to configure Node.js to accept them

## Security Best Practices

1. **Local Network Only**: If possible, use local network addresses (`http://192.168.x.x`)
2. **Use Shared Links**: For internet access, prefer shared album links over credentials
3. **Create Dedicated Account**: If using credentials, create a limited account with read-only Photos access
4. **Specific Albums**: Use `synologyAlbumName` to limit access to specific albums
5. **Firewall Rules**: Configure Synology firewall to only allow access from MagicMirror IP

## API Information

This module uses the Synology Photos API:

- `SYNO.API.Auth` - For authentication
- `SYNO.Foto.Browse.Album` - For listing albums
- `SYNO.Foto.Browse.Item` - For fetching photos
- `SYNO.Foto.Thumbnail` - For downloading images

## Performance Considerations

- **Large Albums**: Set `synologyMaxPhotos` appropriately for your album size
- **Network Speed**: Photos are downloaded on-demand, ensure good network speed
- **Caching**: Consider enabling `resizeImages` to reduce bandwidth usage
- **Update Frequency**: By default, the module refreshes the photo list every hour. Adjust `refreshImageListInterval` to control how often new photos are fetched from Synology:
  - Set to `3600000` (1 hour) - default
  - Set to `1800000` (30 minutes) for more frequent updates
  - Set to `0` to disable automatic refreshing (photos only loaded at startup)

## Example Configurations

### Family Photo Frame

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'photoframe',
    synologyPassword: 'secure-password',
    synologyAlbumName: 'Family Favorites',
    refreshImageListInterval: 3600000, // Refresh every hour
    slideshowSpeed: 30000,
    transitionImages: true,
    randomizeImageOrder: true,
    fitPortraitImages: true, // Automatically fit portrait photos without distortion
    showImageInfo: true,
    imageInfo: 'date',
    backgroundSize: 'contain'
  }
}
```

### Vacation Memories

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'https://your-nas.synology.me:5001',
    synologyShareToken: 'your-share-token',
    slideshowSpeed: 45000,
    transitionImages: true,
    transitions: ['opacity', 'slideFromRight', 'slideFromLeft'],
    randomizeImageOrder: true,
    backgroundAnimationEnabled: true
  }
}
```

### Shared Album with Tag Filtering

```javascript
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    useSynologyPhotos: true,
    synologyUrl: 'https://your-nas.synology.me:5001',
    synologyShareToken: 'your-share-token',
    synologyTagNames: ['Favorites', 'Best Shots'], // Filter by tags within shared album
    slideshowSpeed: 60000,
    transitionImages: true,
    randomizeImageOrder: true,
    fitPortraitImages: true
  }
}
```

## Support

For issues or questions:

1. Check MagicMirror logs for detailed error messages
2. Verify Synology Photos API is accessible via web browser
3. Open an issue on the GitHub repository with logs and configuration (remove sensitive data)

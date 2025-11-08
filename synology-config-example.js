// Example MagicMirror config.js configuration for MMM-SynPhotoSlideshow

// Option 1: Using Synology account credentials (Private Albums)
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    // Synology connection (REQUIRED)
    synologyUrl: 'http://192.168.1.100:5000', // Your NAS URL
    synologyAccount: 'your-username',          // Your Synology username
    synologyPassword: 'your-password',         // Your Synology password
    synologyAlbumName: 'MagicMirror',         // Optional: specific album name, leave empty for all photos
    synologyMaxPhotos: 1000,                   // Max photos to fetch
    
    // Display settings
    slideshowSpeed: 60000,        // 60 seconds per image
    transitionImages: true,
    transitionSpeed: '2s',
    randomizeImageOrder: true,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    
    // Optional: show image info
    showImageInfo: false,
    imageInfo: 'date,name'
  }
}

// Option 2: Using shared album link (No credentials needed)
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    // Synology shared album
    synologyUrl: 'https://your-nas.synology.me:5001',
    synologyShareToken: 'your-share-token', // Extract from shared link URL (passphrase parameter)
    synologyMaxPhotos: 1000,
    
    // Display settings
    slideshowSpeed: 60000,
    transitionImages: true,
    randomizeImageOrder: true,
    backgroundSize: 'cover'
  }
}

// Option 3: Fetch all photos from your library
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    // Synology connection - no album specified = all photos
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'your-username',
    synologyPassword: 'your-password',
    // synologyAlbumName left empty to fetch from all albums
    synologyMaxPhotos: 2000,
    
    // Display settings
    slideshowSpeed: 45000,
    transitionImages: true,
    randomizeImageOrder: true,
    showImageInfo: true,
    imageInfo: 'date'
  }
}

// Option 4: Filter by tags (e.g., show only 'Vacation' and 'Family' photos)
{
  module: 'MMM-SynPhotoSlideshow',
  position: 'fullscreen_below',
  config: {
    // Synology connection with tag filtering
    synologyUrl: 'http://192.168.1.100:5000',
    synologyAccount: 'your-username',
    synologyPassword: 'your-password',
    synologyTagNames: ['Vacation', 'Family', 'Favorites'], // Only photos with these tags
    synologyMaxPhotos: 1000,
    
    // Display settings
    slideshowSpeed: 60000,
    transitionImages: true,
    randomizeImageOrder: true,
    backgroundSize: 'cover'
  }
}

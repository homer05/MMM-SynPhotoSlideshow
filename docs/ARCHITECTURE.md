# MMM-SynPhotoSlideshow - Modular Architecture

This document provides an overview of the refactored modular architecture of MMM-SynPhotoSlideshow.

## Architecture Overview

The module has been refactored into modular utilities for better organization:

- **Utility modules** (`utils/` directory) - Both client-side and server-side utilities

## Directory Structure

```
MMM-SynPhotoSlideshow/
├── MMM-SynPhotoSlideshow.js       # Main frontend module (coordinator)
├── node_helper.js                  # Main backend helper (coordinator)
├── SynPhotoSlideshow.css          # Module styles
│
├── utils/                          # Utility modules (frontend & backend)
│   ├── ConfigValidator.js          # Frontend: Configuration validation
│   ├── ImageHandler.js             # Frontend: Image display and orientation
│   ├── UIBuilder.js                # Frontend: UI element creation
│   ├── TransitionHandler.js        # Frontend: Image transitions
│   ├── ImageListManager.js         # Backend: Image list management
│   ├── TimerManager.js             # Backend: Timer management
│   ├── ImageProcessor.js           # Backend: Image processing
│   ├── SynologyManager.js          # Backend: Synology integration
│   ├── SynologyPhotosClient.js     # Backend: Synology Photos API client
│   └── README.md                   # Utilities documentation
│
└── translations/                   # Language files
```

## Module Responsibilities

### Frontend (Browser)

#### Main Module: `MMM-SynPhotoSlideshow.js`

- Coordinates all frontend operations
- Handles socket communication with backend
- Manages DOM updates
- Delegates to specialized utilities

#### Frontend Utilities:

**ConfigValidator.js** - Configuration management

- Validates required config parameters
- Normalizes configuration values
- Sets up defaults

**ImageHandler.js** - Image display

- Creates image div elements
- Detects portrait vs landscape orientation
- Applies fit modes (letterboxing)
- Handles animations (slide, zoom)
- Manages EXIF orientation

**UIBuilder.js** - UI components

- Creates gradient overlays
- Manages image info display
- Handles progress bar
- Formats image metadata

**TransitionHandler.js** - Transitions

- Creates transition effects
- Manages DOM cleanup
- Applies transition animations

### Backend (Node.js)

#### Main Helper: `node_helper.js`

- Coordinates all backend operations
- Handles socket communication with frontend
- Manages image fetching workflow
- Delegates to specialized utilities

#### Backend Utilities:

**ImageListManager.js** - List management

- Maintains image list and index
- Sorts and shuffles images
- Tracks shown images
- Handles list looping

**TimerManager.js** - Timing control

- Manages slideshow timer
- Manages refresh timer
- Provides timer control methods

**ImageProcessor.js** - Image processing

- Reads local image files
- Resizes images using Sharp
- Downloads Synology images
- Converts to base64

**SynologyManager.js** - Synology integration

- Initializes Synology client
- Handles authentication
- Fetches photos from Synology
- Manages Synology client instance

## Data Flow

### Initialization Flow

```
Frontend Module Start
    ↓
Initialize Frontend Utilities
(ConfigValidator, ImageHandler, UIBuilder, TransitionHandler)
    ↓
Validate Configuration
    ↓
Send REGISTER_CONFIG to Backend
    ↓
Backend Receives Config
    ↓
Initialize Backend Utilities
(ImageListManager, TimerManager, ImageProcessor, SynologyManager)
    ↓
Fetch Photos from Synology (SynologyManager)
    ↓
Prepare Image List (ImageListManager)
    ↓
Send READY notification to Frontend
    ↓
Start Slideshow Timer (TimerManager)
    ↓
Start Refresh Timer (TimerManager)
```

### Image Display Flow

```
Timer Triggers (TimerManager)
    ↓
Get Next Image (ImageListManager)
    ↓
Process Image (ImageProcessor)
    ↓
Send to Frontend (node_helper)
    ↓
Receive Image (MMM-SynPhotoSlideshow)
    ↓
Clean up Old Images (TransitionHandler)
    ↓
Create Transition (TransitionHandler)
    ↓
Create Image Div (ImageHandler)
    ↓
Apply Fit Mode (ImageHandler)
    ↓
Apply Animation (ImageHandler - if not fit mode)
    ↓
Update Progress Bar (UIBuilder)
    ↓
Handle EXIF Data (ImageHandler)
    ↓
Update Image Info (UIBuilder)
    ↓
Display Image in DOM
```

### Refresh Flow

```
Refresh Timer Triggers (TimerManager)
    ↓
Fetch New Photos (SynologyManager)
    ↓
Prepare New List (ImageListManager)
    ↓
Maintain Position (ImageListManager)
    ↓
Restart Refresh Timer (TimerManager)
```

## Key Concepts

### Separation of Concerns

Each module focuses on one specific area:

- **Configuration** → ConfigValidator
- **Image Display** → ImageHandler
- **UI Elements** → UIBuilder
- **Transitions** → TransitionHandler
- **List Management** → ImageListManager
- **Timing** → TimerManager
- **Image Processing** → ImageProcessor
- **Synology API** → SynologyManager

### Coordinator Pattern

Both main files act as coordinators:

- They don't implement complex logic themselves
- They delegate work to specialized helpers
- They handle communication between frontend/backend
- They manage the overall workflow

### Dependency Injection

Modules receive their dependencies:

- Config is passed to modules that need it
- Callbacks are passed for async operations
- Modules don't create their own dependencies

## Benefits

### 1. Maintainability

- Changes are localized to specific modules
- Easy to find where specific functionality lives
- Clear boundaries between different concerns

### 2. Testability

- Each module can be tested independently
- Mocking dependencies is straightforward
- Unit tests can focus on specific functionality

### 3. Readability

- Main files are much shorter and clearer
- Each module has a clear, focused purpose
- Code organization mirrors conceptual organization

### 4. Extensibility

- New features can be added to existing modules
- New modules can be created without affecting others
- Easy to swap implementations

### 5. Code Reuse

- Modules can potentially be reused in other contexts
- Common patterns are centralized
- DRY principle is maintained

## File Size Comparison

**Before Refactoring:**

- MMM-SynPhotoSlideshow.js: ~670 lines
- node_helper.js: ~500 lines
- **Total: ~1170 lines in 2 files**

**After Refactoring:**

- MMM-SynPhotoSlideshow.js: ~450 lines (main + coordination)
- node_helper.js: ~230 lines (main + coordination)
- Frontend modules: ~500 lines (4 files)
- Backend helpers: ~500 lines (4 files)
- **Total: ~1680 lines in 10 files**

While total lines increased slightly due to:

- Separate module structure (class definitions, exports)
- Comprehensive comments and documentation
- Better error handling

The code is now:

- ✅ Much more organized
- ✅ Easier to understand
- ✅ Simpler to maintain
- ✅ Better documented
- ✅ More testable

## Usage Notes

### For Developers

When making changes:

1. **Frontend display issues** → Check `ImageHandler.js` or `UIBuilder.js`
2. **Backend image issues** → Check `ImageProcessor.js` or `SynologyManager.js`
3. **Timing issues** → Check `TimerManager.js`
4. **List/sorting issues** → Check `ImageListManager.js`
5. **Transitions** → Check `TransitionHandler.js`
6. **Configuration** → Check `ConfigValidator.js`

### For Users

The refactoring is transparent:

- Same configuration format
- Same functionality
- Same user experience
- Better performance and reliability

## Future Roadmap

The modular architecture enables:

1. **Easy feature additions**
   - New image sources (Google Photos, iCloud, etc.)
   - New transition effects
   - New display modes

2. **Performance improvements**
   - Image caching in ImageProcessor
   - Smarter list management
   - Optimized timer handling

3. **Enhanced testing**
   - Unit tests for each module
   - Integration tests for workflows
   - End-to-end testing

4. **Better error handling**
   - Module-specific error recovery
   - Graceful degradation
   - Improved logging

## Documentation

- Utility modules: See `../utils/README.md`
- Main README: See `../README.md` (user documentation)
- Setup guide: See `SYNOLOGY_SETUP.md` (in this directory)

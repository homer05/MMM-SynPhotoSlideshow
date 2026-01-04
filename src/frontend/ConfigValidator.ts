/**
 * ConfigValidator.ts
 *
 * Handles configuration validation and normalization
 */

import type { ModuleConfig } from '../types';

class ConfigValidator {
  /**
   * Validate and normalize module configuration
   */
  static validateConfig(config: ModuleConfig): ModuleConfig {
    // Ensure image order is in lower case
    config.sortImagesBy = config.sortImagesBy.toLowerCase();

    // Validate imageinfo property
    const imageInfoRegex = /\bname\b|\bdate\b|\bcapturedate\b|\bfulladdress\b|\bshortaddress\b|\baddress\b|\bimagecount\b/giu;
    if (
      config.showImageInfo &&
      !imageInfoRegex.test(config.imageInfo as string)
    ) {
      config.imageInfo = ['name'];
    } else if (typeof config.imageInfo === 'string') {
      // Convert to lower case and replace any spaces with , to make sure we get an array back
      const imageInfoArray = config.imageInfo
        .toLowerCase()
        .replaceAll(/\s/gu, ',')
        .split(',');
      // Filter the array to only those that have values
      config.imageInfo = imageInfoArray.filter(Boolean);
    }

    // Disable transition speed if transitions are disabled
    if (!config.transitionImages) {
      config.transitionSpeed = '0';
    }

    // Match backgroundAnimation duration to slideShowSpeed unless overridden
    if (config.backgroundAnimationDuration === '1s') {
      config.backgroundAnimationDuration = `${config.slideshowSpeed / 1000}s`;
    }

    // Validate fixed frame configuration
    if (config.useFixedFrame) {
      // Ensure frameWidth and frameHeight are valid CSS values
      if (!config.frameWidth || typeof config.frameWidth !== 'string') {
        config.frameWidth = '80%';
      }
      if (!config.frameHeight || typeof config.frameHeight !== 'string') {
        config.frameHeight = '80%';
      }
      
      // Validate framePosition
      const validPositions = [
        'center',
        'top',
        'bottom',
        'left',
        'right',
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right'
      ];
      if (!validPositions.includes(config.framePosition.toLowerCase())) {
        config.framePosition = 'center';
      }
      
      // Ensure frameBackgroundColor is a valid CSS color
      if (!config.frameBackgroundColor || typeof config.frameBackgroundColor !== 'string') {
        config.frameBackgroundColor = 'rgba(0, 0, 0, 0.5)';
      }
    }

    return config;
  }
}

export default ConfigValidator;

/**
 * TransitionHandler.js
 *
 * Handles image transitions and animations
 */

class TransitionHandler {
  constructor (config) {
    this.config = config;
  }

  /**
   * Create transition div with animation
   */
  createTransitionDiv () {
    const transitionDiv = document.createElement('div');
    transitionDiv.className = 'transition';

    if (this.config.transitionImages && this.config.transitions.length > 0) {
      const randomNumber = Math.floor(Math.random() * this.config.transitions.length);
      transitionDiv.style.animationDuration = this.config.transitionSpeed;
      transitionDiv.style.transition = `opacity ${this.config.transitionSpeed} ease-in-out`;
      transitionDiv.style.animationName = this.config.transitions[randomNumber];
      transitionDiv.style.animationTimingFunction = this.config.transitionTimingFunction;
    }

    return transitionDiv;
  }

  /**
   * Clean up old images from DOM
   */
  cleanupOldImages (imagesDiv) {
    // Remove first child if there are more than 2 elements
    if (imagesDiv.childNodes.length > 1) {
      imagesDiv.removeChild(imagesDiv.childNodes[0]);
    }

    // Fade out current image if present
    if (imagesDiv.childNodes.length > 0) {
      imagesDiv.childNodes[0].style.opacity = '0';
    }
  }
}

// Export for Node.js (if needed) or use directly in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransitionHandler;
}

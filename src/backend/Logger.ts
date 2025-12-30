/**
 * Logger.ts
 *
 * Abstraction layer for MagicMirror logger
 * Provides consistent logging with module prefix
 */

const LOG_PREFIX = '[MMM-SynPhotoSlideshow]';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LoggerInterface {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
}

class Logger {
  // Lazily load the MagicMirror logger when first needed
  private _log: LoggerInterface | null = null;
  private _logLevel: LogLevel = 'info';

  /**
   * Set the log level
   * @param level - The minimum log level to display
   */
  setLogLevel(level: LogLevel): void {
    this._logLevel = level;
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this._logLevel;
  }

  /**
   * Check if a log level should be displayed
   * @private
   */
  private _shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this._logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Get the MagicMirror logger instance
   * @private
   */
  private _getLogger(): LoggerInterface {
    if (!this._log) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this._log = require('../../../js/logger.js') as LoggerInterface;
      } catch {
        // Fallback to console if logger not available (e.g., in tests)
        this._log = console;
      }
    }
    return this._log;
  }

  /**
   * Format message with module prefix
   * @private
   */
  private _formatMessage(message: string): string {
    // If message already has the prefix, don't add it again
    if (typeof message === 'string' && message.startsWith(LOG_PREFIX)) {
      return message;
    }
    return `${LOG_PREFIX} ${message}`;
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this._shouldLog('info')) {
      this._getLogger().info(this._formatMessage(message), ...args);
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this._shouldLog('error')) {
      this._getLogger().error(this._formatMessage(message), ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this._shouldLog('warn')) {
      this._getLogger().warn(this._formatMessage(message), ...args);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this._shouldLog('debug')) {
      this._getLogger().debug(this._formatMessage(message), ...args);
    }
  }

  /**
   * Log general message
   */
  log(message: string, ...args: unknown[]): void {
    this._getLogger().log(this._formatMessage(message), ...args);
  }
}

// Export singleton instance
export default new Logger();

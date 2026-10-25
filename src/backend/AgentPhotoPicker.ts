/**
 * AgentPhotoPicker.ts
 *
 * Asks the local Raspberry Pi agent which photo to show next.
 * The agent tool picks uniformly at random. A missing agent falls back
 * to the slideshow's own order.
 */

import Log from './Logger';
import { DEFAULT_AGENT_PICKER_URL, type PhotoItem } from '../types';

const PICK_TIMEOUT_MS = 2000;

type ToolPickBody = {
  ok?: boolean;
  isError?: boolean;
  result?: {
    ok?: boolean;
    path?: string;
  };
};

export default class AgentPhotoPicker {
  private readonly url: string;

  constructor(url?: string) {
    this.url = url || DEFAULT_AGENT_PICKER_URL;
  }

  /**
   * @returns The chosen photo path, or null when the agent cannot choose
   */
  async pick(photos: PhotoItem[]): Promise<string | null> {
    if (!photos.length) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, PICK_TIMEOUT_MS);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: {
            photos: photos.map((photo) => ({
              path: photo.path,
              synologyId: photo.synologyId,
              created: photo.created
            }))
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        Log.warn(`Agent photo picker returned HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as ToolPickBody;
      const path = body.result?.path;
      if (
        body.ok === false ||
        body.isError ||
        body.result?.ok === false ||
        typeof path !== 'string' ||
        path.length === 0
      ) {
        Log.warn('Agent photo picker did not return a photo path');
        return null;
      }

      return path;
    } catch (error) {
      Log.warn(`Agent photo picker failed: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

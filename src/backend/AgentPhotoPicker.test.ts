/**
 * AgentPhotoPicker.test.ts
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';
import AgentPhotoPicker from './AgentPhotoPicker';
import Log from './Logger';

jest.mock('./Logger');

const mockLog = Log as jest.Mocked<typeof Log>;
mockLog.info = jest.fn();
mockLog.error = jest.fn();
mockLog.warn = jest.fn();
mockLog.debug = jest.fn();
mockLog.log = jest.fn();

describe('AgentPhotoPicker', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should return the path chosen by the agent tool', async () => {
    const fetchMock = jest.fn<typeof fetch>();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        isError: false,
        result: { ok: true, path: 'b.jpg' }
      })
    } as Awaited<ReturnType<typeof fetch>>);
    global.fetch = fetchMock;

    const picker = new AgentPhotoPicker(
      'http://127.0.0.1:3000/v1/tools/pick_random_photo'
    );
    const path = await picker.pick([
      { path: 'a.jpg', created: 1, modified: 1, synologyId: 7 },
      { path: 'b.jpg', created: 2, modified: 2 }
    ]);

    expect(path).toBe('b.jpg');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/tools/pick_random_photo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          input: {
            photos: [
              { path: 'a.jpg', synologyId: 7, created: 1 },
              { path: 'b.jpg', created: 2 }
            ]
          }
        })
      })
    );
  });

  it('should return null when the agent responds with an error', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    })) as unknown as typeof fetch;

    const picker = new AgentPhotoPicker('http://127.0.0.1:3000/pick');
    await expect(
      picker.pick([{ path: 'a.jpg', created: 1, modified: 1 }])
    ).resolves.toBeNull();
    expect(mockLog.warn).toHaveBeenCalled();
  });

  it('should return null when the tool result has no path', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { ok: false } })
    })) as unknown as typeof fetch;

    const picker = new AgentPhotoPicker('http://127.0.0.1:3000/pick');
    await expect(
      picker.pick([{ path: 'a.jpg', created: 1, modified: 1 }])
    ).resolves.toBeNull();
  });

  it('should return null when the agent cannot be reached', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const picker = new AgentPhotoPicker('http://127.0.0.1:3000/pick');
    await expect(
      picker.pick([{ path: 'a.jpg', created: 1, modified: 1 }])
    ).resolves.toBeNull();
  });

  it('should skip the request when there are no photos', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const picker = new AgentPhotoPicker('http://127.0.0.1:3000/pick');
    await expect(picker.pick([])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

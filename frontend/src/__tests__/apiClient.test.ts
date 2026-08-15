import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient } from '../api/client';
import { CanonicalRequestModel } from '../types';

describe('ApiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Clear meta tag and token
    const existing = document.querySelector('meta[name="piddi-token"]');
    if (existing) existing.remove();
    apiClient.setSessionToken('');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reads session token from document meta tag', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'piddi-token');
    meta.setAttribute('content', 'meta-test-token-12345');
    document.head.appendChild(meta);

    const token = await apiClient.ensureToken();
    expect(token).toBe('meta-test-token-12345');
  });

  it('falls back to dev /api/bootstrap when meta tag is empty', async () => {
    const mockFetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/bootstrap') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'dev-bootstrap-token-999', workspace_path: '/tmp', port: 4111 }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });
    global.fetch = mockFetch;

    const token = await apiClient.ensureToken();
    expect(token).toBe('dev-bootstrap-token-999');
    expect(mockFetch).toHaveBeenCalledWith('/api/bootstrap', expect.anything());
  });

  it('injects X-Piddi-Token into executeRequest', async () => {
    apiClient.setSessionToken('my-authenticated-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          status_text: 'OK',
          headers: {},
          cookies: {},
          body: '{"ok":true}',
          content_type: 'application/json',
          size_bytes: 11,
          duration_ms: 12.3,
          is_truncated: false,
        }),
    });
    global.fetch = mockFetch;

    const req: CanonicalRequestModel = {
      method: 'GET',
      url: 'http://localhost:8000/test',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', raw: '', form_params: [] },
      settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
    };

    const res = await apiClient.executeRequest(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/execute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Piddi-Token': 'my-authenticated-token',
        }),
      })
    );
  });

  it('returns structured connection error when fetch fails', async () => {
    apiClient.setSessionToken('my-token');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to connect to localhost:4111'));

    const req: CanonicalRequestModel = {
      method: 'GET',
      url: 'http://localhost:8000/test',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', raw: '', form_params: [] },
      settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
    };

    const res = await apiClient.executeRequest(req);
    expect(res.status).toBe(0);
    expect(res.error?.code).toBe('ENGINE_CONNECTION_FAILED');
  });
});

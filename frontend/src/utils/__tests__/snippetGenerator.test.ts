import { describe, it, expect } from 'vitest';
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generateHttpxSnippet,
} from '../snippetGenerator';
import { CanonicalRequestModel } from '../../types';

describe('snippetGenerator', () => {
  const sampleRequest: CanonicalRequestModel = {
    method: 'POST',
    url: 'https://api.example.com/v1/users',
    params: [
      { id: 'p1', key: 'sort', value: 'desc', enabled: true },
      { id: 'p2', key: 'disabled_param', value: 'x', enabled: false },
    ],
    headers: [
      { id: 'h1', key: 'X-Custom-Header', value: 'custom-val', enabled: true },
      { id: 'h2', key: 'Disabled-Header', value: 'off', enabled: false },
    ],
    auth: {
      type: 'bearer',
      token: 'my_active_token_xyz',
      placement: 'header',
    },
    body: {
      type: 'json',
      raw: '{"name":"Alice","role":"admin"}',
      form_params: [],
    },
    settings: {
      timeout_ms: 10000,
      follow_redirects: true,
      verify_ssl: false,
    },
  };

  it('generates valid cURL snippet with current draft credentials verbatim', () => {
    const curl = generateCurlSnippet(sampleRequest);
    expect(curl).toContain('curl');
    expect(curl).toContain('-X POST');
    expect(curl).toContain('https://api.example.com/v1/users?sort=desc');
    expect(curl).toContain('-H "X-Custom-Header: custom-val"');
    expect(curl).toContain('-H "Authorization: Bearer my_active_token_xyz"');
    expect(curl).toContain('-d \'{"name":"Alice","role":"admin"}\'');
    expect(curl).toContain('-k');
    expect(curl).toContain('-L');
    expect(curl).not.toContain('disabled_param');
    expect(curl).not.toContain('Disabled-Header');
  });

  it('generates valid Fetch snippet with headers and body', () => {
    const fetchSnippet = generateFetchSnippet(sampleRequest);
    expect(fetchSnippet).toContain('fetch("https://api.example.com/v1/users?sort=desc"');
    expect(fetchSnippet).toContain('method: "POST"');
    expect(fetchSnippet).toContain('"Authorization": "Bearer my_active_token_xyz"');
    expect(fetchSnippet).toContain('"Content-Type": "application/json"');
  });

  it('generates valid Python httpx snippet', () => {
    const httpxSnippet = generateHttpxSnippet(sampleRequest);
    expect(httpxSnippet).toContain('import httpx');
    expect(httpxSnippet).toContain('client.post(');
    expect(httpxSnippet).toContain('params={"sort":"desc"}');
    expect(httpxSnippet).toContain('verify=False');
    expect(httpxSnippet).toContain('follow_redirects=True');
  });

  it('does NOT redact secrets during explicit code snippet generation (security export semantics)', () => {
    const secretReq: CanonicalRequestModel = {
      ...sampleRequest,
      headers: [{ id: 'h1', key: 'Authorization', value: 'Bearer SUPER_SECRET_LITERAL', enabled: true }],
      auth: { type: 'bearer', token: 'SUPER_SECRET_LITERAL', placement: 'header' },
    };
    const snippet = generateCurlSnippet(secretReq);
    expect(snippet).toContain('SUPER_SECRET_LITERAL');
    expect(snippet).not.toContain('[REDACTED]');
  });
});

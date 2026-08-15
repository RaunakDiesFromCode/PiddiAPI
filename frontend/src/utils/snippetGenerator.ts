import { CanonicalRequestModel } from '../types';

/**
 * Builds the effective URL including enabled query parameters.
 */
export function buildEffectiveUrl(request: CanonicalRequestModel): string {
  let url = request.url.trim();
  const enabledParams = (request.params || []).filter((p) => p.enabled && p.key.trim());

  if (enabledParams.length === 0) {
    return url;
  }

  const hasQuery = url.includes('?');
  const separator = hasQuery ? '&' : '?';
  const queryStr = enabledParams
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');

  return `${url}${separator}${queryStr}`;
}

/**
 * Computes the merged list of headers including Auth configuration.
 */
export function computeEffectiveHeaders(
  request: CanonicalRequestModel
): Record<string, string> {
  const headers: Record<string, string> = {};

  // 1. Explicit headers
  for (const h of request.headers || []) {
    if (h.enabled && h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }

  // 2. Auth headers
  if (request.auth) {
    if (request.auth.type === 'bearer' && request.auth.token) {
      headers['Authorization'] = `Bearer ${request.auth.token}`;
    } else if (
      request.auth.type === 'basic' &&
      (request.auth.username || request.auth.password)
    ) {
      if (typeof btoa !== 'undefined') {
        const creds = `${request.auth.username || ''}:${request.auth.password || ''}`;
        headers['Authorization'] = `Basic ${btoa(creds)}`;
      }
    } else if (
      request.auth.type === 'apikey' &&
      request.auth.placement === 'header' &&
      request.auth.key &&
      request.auth.value
    ) {
      headers[request.auth.key] = request.auth.value;
    }
  }


  // 3. Body Content-Type
  if (request.body && request.body.type === 'json' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  } else if (
    request.body &&
    request.body.type === 'urlencoded' &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  return headers;
}

/**
 * Generates a valid, runnable cURL command from the current draft request.
 */
export function generateCurlSnippet(request: CanonicalRequestModel): string {
  const url = buildEffectiveUrl(request);
  const headers = computeEffectiveHeaders(request);
  const method = request.method || 'GET';

  const parts: string[] = ['curl'];

  if (method !== 'GET') {
    parts.push(`-X ${method}`);
  }

  parts.push(`"${url}"`);

  for (const [k, v] of Object.entries(headers)) {
    const escapedVal = v.replace(/"/g, '\\"');
    parts.push(`-H "${k}: ${escapedVal}"`);
  }

  if (request.body) {
    if (request.body.type === 'json' || request.body.type === 'raw') {
      if (request.body.raw) {
        const escapedBody = request.body.raw.replace(/'/g, "'\\''");
        parts.push(`-d '${escapedBody}'`);
      }
    } else if (request.body.type === 'urlencoded') {
      const enabledForm = (request.body.form_params || []).filter(
        (f) => f.enabled && f.key.trim()
      );
      for (const f of enabledForm) {
        parts.push(`--data-urlencode "${f.key}=${f.value}"`);
      }
    } else if (request.body.type === 'multipart') {
      const enabledForm = (request.body.form_params || []).filter(

        (f) => f.enabled && f.key.trim()
      );
      for (const f of enabledForm) {
        parts.push(`-F "${f.key}=${f.value}"`);
      }
    }
  }

  if (request.settings?.verify_ssl === false) {
    parts.push('-k');
  }

  if (request.settings?.follow_redirects) {
    parts.push('-L');
  }

  return parts.join(' \\\n  ');
}

/**
 * Generates modern JavaScript Fetch snippet from the current draft request.
 */
export function generateFetchSnippet(request: CanonicalRequestModel): string {
  const url = buildEffectiveUrl(request);
  const headers = computeEffectiveHeaders(request);
  const method = request.method || 'GET';

  let bodyStr: string | null = null;
  if (request.body) {
    if (request.body.type === 'json') {
      bodyStr = request.body.raw ? JSON.stringify(request.body.raw) : null;
    } else if (request.body.type === 'raw') {
      bodyStr = request.body.raw ? JSON.stringify(request.body.raw) : null;
    } else if (request.body.type === 'urlencoded') {
      const paramsObj: Record<string, string> = {};
      for (const f of request.body.form_params || []) {
        if (f.enabled && f.key.trim()) paramsObj[f.key] = f.value;
      }
      bodyStr = `new URLSearchParams(${JSON.stringify(paramsObj)}).toString()`;
    }
  }

  const options: string[] = [`method: "${method}"`];
  if (Object.keys(headers).length > 0) {
    options.push(`headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n    ')}`);
  }
  if (bodyStr && method !== 'GET' && method !== 'HEAD') {
    if (request.body?.type === 'urlencoded') {
      options.push(`body: ${bodyStr}`);
    } else {
      options.push(`body: ${bodyStr}`);
    }
  }

  return `const response = await fetch("${url}", {\n  ${options.join(',\n  ')}\n});\nconst data = await response.json();\nconsole.log(data);`;
}

/**
 * Generates Python httpx snippet from the current draft request.
 */
export function generateHttpxSnippet(request: CanonicalRequestModel): string {
  const url = request.url.trim();
  const headers = computeEffectiveHeaders(request);
  const method = (request.method || 'GET').toLowerCase();
  const enabledParams = (request.params || []).filter((p) => p.enabled && p.key.trim());

  const lines: string[] = ['import httpx', ''];

  const callArgs: string[] = [`"${url}"`];

  if (enabledParams.length > 0) {
    const paramsDict: Record<string, string> = {};
    for (const p of enabledParams) paramsDict[p.key] = p.value;
    callArgs.push(`params=${JSON.stringify(paramsDict)}`);
  }

  if (Object.keys(headers).length > 0) {
    callArgs.push(`headers=${JSON.stringify(headers)}`);
  }

  if (request.body && method !== 'get' && method !== 'head') {
    if (request.body.type === 'json' && request.body.raw) {
      try {
        const parsed = JSON.parse(request.body.raw);
        callArgs.push(`json=${JSON.stringify(parsed)}`);
      } catch {
        callArgs.push(`content=${JSON.stringify(request.body.raw)}`);
      }
    } else if (request.body.type === 'raw' && request.body.raw) {
      callArgs.push(`content=${JSON.stringify(request.body.raw)}`);
    } else if (request.body.type === 'urlencoded') {
      const dataDict: Record<string, string> = {};
      for (const f of request.body.form_params || []) {
        if (f.enabled && f.key.trim()) dataDict[f.key] = f.value;
      }
      callArgs.push(`data=${JSON.stringify(dataDict)}`);
    }
  }

  if (request.settings?.verify_ssl === false) {
    callArgs.push('verify=False');
  }
  if (request.settings?.follow_redirects) {
    callArgs.push('follow_redirects=True');
  }

  lines.push(`with httpx.Client() as client:`);
  lines.push(`    response = client.${method}(`);
  lines.push(`        ${callArgs.join(',\n        ')}`);
  lines.push(`    )`);
  lines.push(`    print(response.status_code)`);
  lines.push(`    print(response.text)`);

  return lines.join('\n');
}

import {
  AuthConfig,
  BodyType,
  HTTPMethod,
  KeyValueItem,
  RequestBody,
  RequestSettings,
} from '../types';


let paramIdCounter = 1;

/**
 * Tokenizes a command line string into individual arguments according to POSIX-style shell quoting rules.
 * Strictly forbids command substitution, backticks, pipes, and redirects.
 */
export function tokenizeCurlArguments(command: string): string[] {
  const trimmed = command.trim();

  // 1. Security boundary: Reject unsafe shell constructs
  if (trimmed.includes('$(') || trimmed.includes('`')) {
    throw new Error('Unsupported or unsafe shell command substitution syntax in cURL string.');
  }

  // Check for pipelines or redirects outside of quoted strings
  let insideSingle = false;
  let insideDouble = false;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "'" && !insideDouble) {
      insideSingle = !insideSingle;
    } else if (char === '"' && !insideSingle) {
      insideDouble = !insideDouble;
    } else if (!insideSingle && !insideDouble) {
      if (char === '|' || char === '>' || char === '<' || char === ';') {
        throw new Error(`Unsupported or unsafe shell operator '${char}' in cURL string.`);
      }
    }
  }

  // 2. Tokenize arguments
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let isEscaped = false;

  // Normalize line continuations (e.g. `\ \n`)
  const cleanCmd = trimmed.replace(/\\\r?\n/g, ' ');

  for (let i = 0; i < cleanCmd.length; i++) {
    const char = cleanCmd[i];

    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\' && !inSingle) {
      isEscaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if ((char === ' ' || char === '\t' || char === '\n') && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

export interface ParsedCurlResult {
  method: HTTPMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  body: RequestBody;
  settings: RequestSettings;
}

/**
 * Parses a standard cURL command into CanonicalRequestModel properties.
 */
export function parseCurl(curlString: string): ParsedCurlResult {
  const args = tokenizeCurlArguments(curlString);

  if (args.length === 0 || (args[0] !== 'curl' && !args[0].endsWith('/curl'))) {
    // If not starting with curl, try parsing as arguments directly
    if (args.length === 0) {
      throw new Error('Empty cURL command');
    }
  }

  let explicitMethod: HTTPMethod | null = null;
  let hasDataBody = false;
  let hasFormBody = false;
  let hasUrlEncodedBody = false;
  let url = '';
  const headers: KeyValueItem[] = [];
  const rawDataParts: string[] = [];
  const formParams: KeyValueItem[] = [];
  let basicAuthUser = '';
  let basicAuthPass = '';
  let verifySsl = true;
  let followRedirects = true;
  let timeoutMs = 30000;

  let i = args[0] === 'curl' || args[0].endsWith('/curl') ? 1 : 0;

  while (i < args.length) {
    const arg = args[i];

    // -X / --request
    if (arg === '-X' || arg === '--request') {
      i++;
      if (i < args.length) {
        const m = args[i].toUpperCase() as HTTPMethod;
        explicitMethod = m;
      }
    } else if (arg.startsWith('-X')) {
      explicitMethod = arg.slice(2).toUpperCase() as HTTPMethod;
    }
    // -H / --header
    else if (arg === '-H' || arg === '--header') {
      i++;
      if (i < args.length) {
        const headerStr = args[i];
        const colonIdx = headerStr.indexOf(':');
        if (colonIdx > 0) {
          const key = headerStr.slice(0, colonIdx).trim();
          const value = headerStr.slice(colonIdx + 1).trim();
          headers.push({
            id: `h_${Date.now()}_${paramIdCounter++}`,
            key,
            value,
            enabled: true,
          });
        }
      }
    }
    // -d / --data / --data-raw / --data-ascii / --data-binary
    else if (
      arg === '-d' ||
      arg === '--data' ||
      arg === '--data-raw' ||
      arg === '--data-ascii' ||
      arg === '--data-binary'
    ) {
      hasDataBody = true;
      i++;
      if (i < args.length) {
        rawDataParts.push(args[i]);
      }
    } else if (arg.startsWith('-d')) {
      hasDataBody = true;
      rawDataParts.push(arg.slice(2));
    }
    // --data-urlencode
    else if (arg === '--data-urlencode') {
      hasUrlEncodedBody = true;
      i++;
      if (i < args.length) {
        const val = args[i];
        const eqIdx = val.indexOf('=');
        if (eqIdx > 0) {
          formParams.push({
            id: `f_${Date.now()}_${paramIdCounter++}`,
            key: val.slice(0, eqIdx).trim(),
            value: val.slice(eqIdx + 1).trim(),
            enabled: true,
          });
        } else {
          rawDataParts.push(val);
        }
      }
    }
    // -F / --form
    else if (arg === '-F' || arg === '--form') {
      hasFormBody = true;
      i++;
      if (i < args.length) {
        const formStr = args[i];
        const eqIdx = formStr.indexOf('=');
        if (eqIdx > 0) {
          formParams.push({
            id: `f_${Date.now()}_${paramIdCounter++}`,
            key: formStr.slice(0, eqIdx).trim(),
            value: formStr.slice(eqIdx + 1).trim(),
            enabled: true,
          });
        }
      }
    }
    // -u / --user
    else if (arg === '-u' || arg === '--user') {
      i++;
      if (i < args.length) {
        const userStr = args[i];
        const colonIdx = userStr.indexOf(':');
        if (colonIdx >= 0) {
          basicAuthUser = userStr.slice(0, colonIdx);
          basicAuthPass = userStr.slice(colonIdx + 1);
        } else {
          basicAuthUser = userStr;
        }
      }
    }
    // -k / --insecure
    else if (arg === '-k' || arg === '--insecure') {
      verifySsl = false;
    }
    // -L / --location
    else if (arg === '-L' || arg === '--location') {
      followRedirects = true;
    }
    // -m / --max-time
    else if (arg === '-m' || arg === '--max-time') {
      i++;
      if (i < args.length) {
        const sec = parseFloat(args[i]);
        if (!isNaN(sec)) {
          timeoutMs = Math.round(sec * 1000);
        }
      }
    }
    // --url <url>
    else if (arg === '--url') {
      i++;
      if (i < args.length) {
        url = args[i];
      }
    }
    // Positional URL (starts without hyphen)
    else if (!arg.startsWith('-') && !url) {
      url = arg;
    }

    i++;
  }

  // 3. HTTP Method Inference Rules:
  // - explicit -X / --request takes highest precedence
  // - -d / --data / --data-raw / etc. -> POST
  // - -F / --form -> POST
  // - --data-urlencode -> POST
  // - no body and no -X -> GET
  let finalMethod: HTTPMethod = 'GET';
  if (explicitMethod) {
    finalMethod = explicitMethod;
  } else if (hasDataBody || hasFormBody || hasUrlEncodedBody) {
    finalMethod = 'POST';
  }

  // 4. Parse URL query parameters into params table
  const params: KeyValueItem[] = [];
  let cleanUrl = url;
  if (url && url.includes('?')) {
    try {
      const qIdx = url.indexOf('?');
      const queryString = url.slice(qIdx + 1);
      cleanUrl = url.slice(0, qIdx);
      const urlParams = new URLSearchParams(queryString);
      urlParams.forEach((value, key) => {
        params.push({
          id: `p_${Date.now()}_${paramIdCounter++}`,
          key,
          value,
          enabled: true,
        });
      });
    } catch {
      // Keep full URL if parsing fails
    }
  }

  // 5. Build AuthConfig
  let auth: AuthConfig = { type: 'none', placement: 'header' };
  if (basicAuthUser || basicAuthPass) {
    auth = {
      type: 'basic',
      username: basicAuthUser,
      password: basicAuthPass,
      placement: 'header',
    };
  } else {
    // Check if an Authorization: Bearer <token> header is present
    const authHeaderIdx = headers.findIndex((h) => h.key.toLowerCase() === 'authorization');
    if (authHeaderIdx >= 0) {
      const headerVal = headers[authHeaderIdx].value;
      if (headerVal.toLowerCase().startsWith('bearer ')) {
        auth = {
          type: 'bearer',
          token: headerVal.slice(7).trim(),
          placement: 'header',
        };
      }
    }
  }

  // 6. Build RequestBody
  let bodyType: BodyType = 'none';
  let rawBody = '';

  if (hasFormBody) {
    bodyType = 'multipart';
  } else if (hasUrlEncodedBody) {

    bodyType = 'urlencoded';
  } else if (hasDataBody) {
    rawBody = rawDataParts.join('&');
    // Detect if content is valid JSON or Content-Type is JSON
    const contentTypeHeader = headers.find((h) => h.key.toLowerCase() === 'content-type');
    const isJsonHeader = contentTypeHeader?.value.toLowerCase().includes('application/json');

    let isValidJson = false;
    try {
      if (rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')) {
        JSON.parse(rawBody);
        isValidJson = true;
      }
    } catch {
      isValidJson = false;
    }

    if (isJsonHeader || isValidJson) {
      bodyType = 'json';
    } else {
      bodyType = 'raw';
    }
  }

  return {
    method: finalMethod,
    url: cleanUrl || url,
    params,
    headers,
    auth,
    body: {
      type: bodyType,
      raw: rawBody,
      form_params: formParams,
    },
    settings: {
      timeout_ms: timeoutMs,
      follow_redirects: followRedirects,
      verify_ssl: verifySsl,
    },
  };
}

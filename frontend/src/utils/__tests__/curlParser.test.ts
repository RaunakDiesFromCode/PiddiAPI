import { describe, expect, it } from 'vitest';
import { parseCurl } from '../curlParser';


describe('curlParser', () => {
  it('parses simple GET request', () => {
    const res = parseCurl('curl https://api.dev/v1/users');
    expect(res.method).toBe('GET');
    expect(res.url).toBe('https://api.dev/v1/users');
    expect(res.params).toHaveLength(0);
    expect(res.headers).toHaveLength(0);
    expect(res.body.type).toBe('none');
  });

  it('infers POST when -d / --data is provided without -X', () => {
    const res = parseCurl('curl -d \'{"name":"Alice"}\' https://api.dev/users');
    expect(res.method).toBe('POST');
    expect(res.body.type).toBe('json');
    expect(res.body.raw).toBe('{"name":"Alice"}');
  });

  it('infers POST when -F / --form is provided', () => {
    const res = parseCurl('curl -F "file=@photo.png" -F "desc=My photo" https://api.dev/upload');
    expect(res.method).toBe('POST');
    expect(res.body.type).toBe('multipart');
    expect(res.body.form_params).toHaveLength(2);

    expect(res.body.form_params[0].key).toBe('file');
    expect(res.body.form_params[1].key).toBe('desc');
  });

  it('infers POST when --data-urlencode is provided', () => {
    const res = parseCurl('curl --data-urlencode "q=search query" https://api.dev/search');
    expect(res.method).toBe('POST');
    expect(res.body.type).toBe('urlencoded');
    expect(res.body.form_params[0].key).toBe('q');
    expect(res.body.form_params[0].value).toBe('search query');
  });

  it('honors explicit -X method override with -d body', () => {
    const res = parseCurl('curl -X PUT -d \'{"status":"active"}\' https://api.dev/users/123');
    expect(res.method).toBe('PUT');
    expect(res.body.type).toBe('json');
    expect(res.body.raw).toBe('{"status":"active"}');
  });

  it('extracts query parameters from URL into params table', () => {
    const res = parseCurl('curl "https://api.dev/items?category=books&limit=10"');
    expect(res.method).toBe('GET');
    expect(res.url).toBe('https://api.dev/items');
    expect(res.params).toHaveLength(2);
    expect(res.params[0].key).toBe('category');
    expect(res.params[0].value).toBe('books');
    expect(res.params[1].key).toBe('limit');
    expect(res.params[1].value).toBe('10');
  });

  it('parses headers and extracts Bearer auth', () => {
    const res = parseCurl(
      'curl -H "Authorization: Bearer my_jwt_token" -H "X-Custom-Header: 123" https://api.dev'
    );
    expect(res.headers).toHaveLength(2);
    expect(res.auth.type).toBe('bearer');
    expect(res.auth.token).toBe('my_jwt_token');
  });

  it('parses Basic Auth flag -u', () => {
    const res = parseCurl('curl -u "admin:secretPass" https://api.dev/secure');
    expect(res.auth.type).toBe('basic');
    expect(res.auth.username).toBe('admin');
    expect(res.auth.password).toBe('secretPass');
  });

  it('handles multiline continuations and custom settings', () => {
    const cmd = `curl -k -m 15 \\
      -X DELETE \\
      -H "Accept: application/json" \\
      https://api.dev/resource/1`;

    const res = parseCurl(cmd);
    expect(res.method).toBe('DELETE');
    expect(res.settings.verify_ssl).toBe(false);
    expect(res.settings.timeout_ms).toBe(15000);
    expect(res.headers[0].key).toBe('Accept');
  });

  describe('Security Boundary', () => {
    it('rejects command substitution $(...)', () => {
      expect(() => parseCurl('curl https://api.dev -H "Auth: $(whoami)"')).toThrow(
        /command substitution/i
      );
    });

    it('rejects command substitution with backticks', () => {
      expect(() => parseCurl('curl https://api.dev?key=`cat /etc/passwd`')).toThrow(
        /command substitution/i
      );
    });

    it('rejects pipe operator', () => {
      expect(() => parseCurl('curl https://api.dev | bash')).toThrow(
        /shell operator/i
      );
    });

    it('rejects redirect operator >', () => {
      expect(() => parseCurl('curl https://api.dev > out.txt')).toThrow(
        /shell operator/i
      );
    });
  });
});

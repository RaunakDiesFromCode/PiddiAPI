import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useHistoryStore, hasRedactedSecrets } from '../store/useHistoryStore';
import { useRequestStore } from '../store/useRequestStore';
import { apiClient } from '../api/client';
import { CanonicalRequestModel, HistoryRecord } from '../types';

vi.mock('../api/client', () => ({
  apiClient: {
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
  },
}));

describe('useHistoryStore & hasRedactedSecrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({
      historyRecords: [],
      isLoading: false,
      searchQuery: '',
      statusFilter: null,
      restoredBannerNotice: null,
    });
  });

  it('detects redacted secrets across headers, params, url, and auth', () => {
    const cleanReq: CanonicalRequestModel = {
      method: 'GET',
      url: 'https://api.dev/users',
      params: [{ key: 'page', value: '1', enabled: true }],
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
      auth: { type: 'bearer', token: '{{token}}', placement: 'header' },
      body: { type: 'none', raw: '', form_params: [] },
      settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
    };
    expect(hasRedactedSecrets(cleanReq)).toBe(false);

    const redactedHeaderReq: CanonicalRequestModel = {
      ...cleanReq,
      headers: [{ key: 'Authorization', value: '[REDACTED]', enabled: true }],
    };
    expect(hasRedactedSecrets(redactedHeaderReq)).toBe(true);

    const redactedParamReq: CanonicalRequestModel = {
      ...cleanReq,
      params: [{ key: 'api_key', value: '[REDACTED]', enabled: true }],
    };
    expect(hasRedactedSecrets(redactedParamReq)).toBe(true);

    const redactedAuthReq: CanonicalRequestModel = {
      ...cleanReq,
      auth: { type: 'bearer', token: '[REDACTED]', placement: 'header' },
    };
    expect(hasRedactedSecrets(redactedAuthReq)).toBe(true);
  });

  it('fetches history records successfully', async () => {
    const mockRecords: HistoryRecord[] = [
      {
        id: 'hist_123456abcdef',
        timestamp: '2026-08-15T12:00:00Z',
        method: 'GET',
        url: 'https://api.dev/v1/health',
        status: 200,
        duration_ms: 15.2,
        size_bytes: 48,
        request_snapshot: {
          method: 'GET',
          url: 'https://api.dev/v1/health',
          params: [],
          headers: [],
          auth: { type: 'none', placement: 'header' },
          body: { type: 'none', raw: '', form_params: [] },
          settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
        },
      },
    ];

    vi.mocked(apiClient.getHistory).mockResolvedValue(mockRecords);

    await useHistoryStore.getState().fetchHistory();

    expect(useHistoryStore.getState().historyRecords).toEqual(mockRecords);
    expect(useHistoryStore.getState().isLoading).toBe(false);
  });

  it('clears history records cleanly', async () => {
    useHistoryStore.setState({
      historyRecords: [
        {
          id: 'hist_123',
          timestamp: '2026-08-15T12:00:00Z',
          method: 'GET',
          url: 'http://test',
          status: 200,
          duration_ms: 10,
          size_bytes: 10,
          request_snapshot: {} as any,
        },
      ],
    });

    vi.mocked(apiClient.clearHistory).mockResolvedValue({ cleared: true });

    await useHistoryStore.getState().clearHistory();

    expect(useHistoryStore.getState().historyRecords).toEqual([]);
  });

  it('restores record into active tab and sets banner if redacted', () => {
    const record: HistoryRecord = {
      id: 'hist_abc',
      timestamp: '2026-08-15T12:00:00Z',
      method: 'POST',
      url: 'https://api.dev/auth/login',
      status: 200,
      duration_ms: 25,
      size_bytes: 100,
      request_snapshot: {
        method: 'POST',
        url: 'https://api.dev/auth/login',
        params: [],
        headers: [{ key: 'X-API-Key', value: '[REDACTED]', enabled: true }],
        auth: { type: 'bearer', token: '[REDACTED]', placement: 'header' },
        body: { type: 'json', raw: '{"email":"test@example.com"}', form_params: [] },
        settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
      },
    };

    useHistoryStore.getState().restoreRecord(record);

    const activeTab = useRequestStore.getState().tabs.find(
      (t) => t.id === useRequestStore.getState().activeTabId
    );
    expect(activeTab?.request.url).toBe('https://api.dev/auth/login');
    expect(activeTab?.request.method).toBe('POST');
    expect(useHistoryStore.getState().restoredBannerNotice).toContain('Restored from history with redacted credentials');
  });
});

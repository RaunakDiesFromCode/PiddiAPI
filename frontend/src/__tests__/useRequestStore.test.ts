import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRequestStore } from '../store/useRequestStore';
import { apiClient } from '../api/client';
import { CanonicalResponseModel } from '../types';

describe('useRequestStore', () => {
  beforeEach(() => {
    // Reset store state
    const { tabs, closeTab } = useRequestStore.getState();
    tabs.forEach((t) => closeTab(t.id));
  });

  it('initializes with a default scratchpad tab', () => {
    const { tabs, activeTabId } = useRequestStore.getState();
    expect(tabs.length).toBe(1);
    expect(activeTabId).toBe(tabs[0].id);
    expect(tabs[0].request.method).toBe('GET');
    expect(tabs[0].isDirty).toBe(false);
  });

  it('creates new scratchpad tabs and switches active tab', () => {
    const store = useRequestStore.getState();
    const newTabId = store.createScratchpadTab({ method: 'POST', url: 'http://test.local/api' });

    const state = useRequestStore.getState();
    expect(state.tabs.length).toBe(2);
    expect(state.activeTabId).toBe(newTabId);

    const activeTab = state.tabs.find((t) => t.id === newTabId);
    expect(activeTab?.request.method).toBe('POST');
    expect(activeTab?.request.url).toBe('http://test.local/api');
  });

  it('switches between tabs cleanly', () => {
    const store = useRequestStore.getState();
    const firstTabId = store.activeTabId;
    const secondTabId = store.createScratchpadTab();

    expect(useRequestStore.getState().activeTabId).toBe(secondTabId);

    store.switchTab(firstTabId);
    expect(useRequestStore.getState().activeTabId).toBe(firstTabId);
  });

  it('closes a tab and selects adjacent tab', () => {
    const store = useRequestStore.getState();
    store.createScratchpadTab();
    const tab2 = store.createScratchpadTab();
    const tab3 = store.createScratchpadTab();

    expect(useRequestStore.getState().tabs.length).toBe(4);
    expect(useRequestStore.getState().activeTabId).toBe(tab3);

    store.closeTab(tab3);
    expect(useRequestStore.getState().tabs.length).toBe(3);
    expect(useRequestStore.getState().activeTabId).toBe(tab2);
  });

  it('creates a fresh scratchpad if all tabs are closed', () => {
    const store = useRequestStore.getState();
    expect(store.tabs.length).toBe(1);
    const onlyTabId = store.tabs[0].id;

    store.closeTab(onlyTabId);
    const state = useRequestStore.getState();
    expect(state.tabs.length).toBe(1);
    expect(state.tabs[0].id).not.toBe(onlyTabId);
  });

  it('updates active request fields and marks tab dirty', () => {
    const store = useRequestStore.getState();
    store.setUrl('https://example.com/api/v1/items');
    store.setMethod('POST');

    const state = useRequestStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    expect(activeTab?.request.url).toBe('https://example.com/api/v1/items');
    expect(activeTab?.request.method).toBe('POST');
    expect(activeTab?.isDirty).toBe(true);
  });

  it('executes request and stores response', async () => {
    const mockResponse: CanonicalResponseModel = {
      status: 200,
      status_text: 'OK',
      headers: { 'content-type': 'application/json' },
      cookies: {},
      body: '{"message": "success"}',
      content_type: 'application/json',
      size_bytes: 22,
      duration_ms: 35.5,
      is_truncated: false,
    };

    vi.spyOn(apiClient, 'executeRequest').mockResolvedValueOnce(mockResponse);

    const store = useRequestStore.getState();
    store.setUrl('http://127.0.0.1:4111/api/health');

    const response = await store.sendActiveRequest();
    expect(response).toEqual(mockResponse);

    const state = useRequestStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    expect(activeTab?.response).toEqual(mockResponse);
    expect(activeTab?.isLoading).toBe(false);
    expect(activeTab?.isDirty).toBe(false);
  });
});

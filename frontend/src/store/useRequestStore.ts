import { create } from 'zustand';
import { CanonicalRequestModel, CanonicalResponseModel, HealthInfo, TabItem } from '../types';
import { apiClient } from '../api/client';
import { useWorkspaceStore } from './useWorkspaceStore';

let tabCounter = 1;

export function createDefaultRequest(): CanonicalRequestModel {
  return {
    id: null,
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [{ id: 'p_1', key: '', value: '', enabled: true }],
    headers: [{ id: 'h_1', key: '', value: '', enabled: true }],
    auth: {
      type: 'none',
      placement: 'header',
    },
    body: {
      type: 'none',
      raw: '',
      form_params: [],
    },
    settings: {
      timeout_ms: 30000,
      follow_redirects: true,
      verify_ssl: true,
    },
    environment_id: null,
  };
}

export function createNewTab(
  initialRequest?: Partial<CanonicalRequestModel>,
  collectionId?: string | null,
  requestId?: string | null
): TabItem {
  const id = `tab_${Date.now()}_${tabCounter++}`;
  const baseReq = createDefaultRequest();
  const request: CanonicalRequestModel = {
    ...baseReq,
    ...initialRequest,
    id: requestId || initialRequest?.id || baseReq.id,
    params: initialRequest?.params || baseReq.params,
    headers: initialRequest?.headers || baseReq.headers,
    auth: initialRequest?.auth || baseReq.auth,
    body: initialRequest?.body || baseReq.body,
    settings: initialRequest?.settings || baseReq.settings,
  };

  return {
    id,
    name: request.name || 'Untitled Request',
    isDirty: false,
    request,
    response: null,
    isLoading: false,
    error: null,
    collectionId: collectionId || null,
    requestId: request.id || null,
  };
}

interface RequestStoreState {
  tabs: TabItem[];
  activeTabId: string;
  engineConnected: boolean;
  workspaceInfo: HealthInfo | null;

  // Tab actions
  createScratchpadTab: (initial?: Partial<CanonicalRequestModel>) => string;
  openRequestTab: (collectionId: string, request: CanonicalRequestModel) => string;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;

  // Request editing actions
  updateActiveRequest: (
    updater: Partial<CanonicalRequestModel> | ((prev: CanonicalRequestModel) => CanonicalRequestModel)
  ) => void;
  setMethod: (method: CanonicalRequestModel['method']) => void;
  setUrl: (url: string) => void;
  setParams: (params: CanonicalRequestModel['params']) => void;
  setHeaders: (headers: CanonicalRequestModel['headers']) => void;
  setAuth: (auth: CanonicalRequestModel['auth']) => void;
  setBody: (body: CanonicalRequestModel['body']) => void;
  setSettings: (settings: CanonicalRequestModel['settings']) => void;

  // Persistence actions
  saveActiveTab: (targetCollectionId?: string) => Promise<boolean>;

  // Execution actions
  sendActiveRequest: () => Promise<CanonicalResponseModel | null>;
  clearActiveResponse: () => void;

  // Engine status actions
  setEngineConnected: (connected: boolean) => void;
  setWorkspaceInfo: (info: HealthInfo | null) => void;
}

const initialTab = createNewTab();

export const useRequestStore = create<RequestStoreState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  engineConnected: false,
  workspaceInfo: null,

  createScratchpadTab: (initial) => {
    const newTab = createNewTab(initial);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  },

  openRequestTab: (collectionId, request) => {
    const { tabs } = get();
    // Check if a tab for this request is already open
    const existingTab = tabs.find((t) => t.requestId === request.id);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return existingTab.id;
    }

    const newTab = createNewTab(request, collectionId, request.id);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  },

  switchTab: (tabId) => {
    const exists = get().tabs.some((t) => t.id === tabId);
    if (exists) {
      set({ activeTabId: tabId });
    }
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 1 && tabs[0].id === tabId) {
      // If closing the only tab, replace with a fresh tab
      const freshTab = createNewTab();
      set({
        tabs: [freshTab],
        activeTabId: freshTab.id,
      });
      return;
    }

    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const newTabs = tabs.filter((t) => t.id !== tabId);
    let nextActiveId = activeTabId;

    if (activeTabId === tabId) {
      const nextIndex = tabIndex >= newTabs.length ? newTabs.length - 1 : tabIndex;
      nextActiveId = newTabs[nextIndex].id;
    }

    set({
      tabs: newTabs,
      activeTabId: nextActiveId,
    });
  },

  updateActiveRequest: (updater) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
      if (tabIndex === -1) return state;

      const currentTab = state.tabs[tabIndex];
      const updatedRequest =
        typeof updater === 'function' ? updater(currentTab.request) : { ...currentTab.request, ...updater };

      // Update tab display name if untitled scratchpad and url changed
      let tabName = currentTab.name;
      if (!currentTab.requestId && !currentTab.collectionId) {
        if (updatedRequest.url) {
          try {
            const parsed = new URL(
              updatedRequest.url.startsWith('http') ? updatedRequest.url : `http://${updatedRequest.url}`
            );
            tabName = `${updatedRequest.method} ${parsed.pathname || '/'}`;
          } catch {
            tabName = `${updatedRequest.method} ${updatedRequest.url.slice(0, 20)}`;
          }
        } else {
          tabName = `${updatedRequest.method} Untitled`;
        }
      } else if (updatedRequest.name) {
        tabName = updatedRequest.name;
      }

      const updatedTabs = [...state.tabs];
      updatedTabs[tabIndex] = {
        ...currentTab,
        name: tabName,
        isDirty: true,
        request: updatedRequest,
      };

      return { tabs: updatedTabs };
    });
  },

  setMethod: (method) => {
    get().updateActiveRequest((prev) => ({ ...prev, method }));
  },

  setUrl: (url) => {
    get().updateActiveRequest((prev) => ({ ...prev, url }));
  },

  setParams: (params) => {
    get().updateActiveRequest((prev) => ({ ...prev, params }));
  },

  setHeaders: (headers) => {
    get().updateActiveRequest((prev) => ({ ...prev, headers }));
  },

  setAuth: (auth) => {
    get().updateActiveRequest((prev) => ({ ...prev, auth }));
  },

  setBody: (body) => {
    get().updateActiveRequest((prev) => ({ ...prev, body }));
  },

  setSettings: (settings) => {
    get().updateActiveRequest((prev) => ({ ...prev, settings }));
  },

  saveActiveTab: async (targetCollectionId) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return false;

    const currentTab = tabs[tabIndex];
    const colId = targetCollectionId || currentTab.collectionId;
    if (!colId) {
      return false; // Scratchpad requires selecting a collection
    }

    const { saveActiveRequest } = useWorkspaceStore.getState();
    const savedCol = await saveActiveRequest(colId, currentTab.request);

    // Find the saved request in the collection (it will now have an assigned id if it didn't previously)
    const savedReq =
      savedCol.requests.find((r) => r.id === currentTab.request.id) ||
      savedCol.requests[savedCol.requests.length - 1];

    set((state) => {
      const updated = [...state.tabs];
      const idx = updated.findIndex((t) => t.id === activeTabId);
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          collectionId: colId,
          requestId: savedReq.id || null,
          name: savedReq.name || updated[idx].name,
          isDirty: false,
          request: {
            ...updated[idx].request,
            id: savedReq.id,
          },
        };
      }
      return { tabs: updated };
    });

    return true;
  },

  sendActiveRequest: async () => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return null;

    const currentTab = tabs[tabIndex];
    if (currentTab.isLoading) return null; // Avoid duplicate sending

    // Set loading state
    set((state) => {
      const updated = [...state.tabs];
      updated[tabIndex] = {
        ...currentTab,
        isLoading: true,
        error: null,
      };
      return { tabs: updated };
    });

    try {
      const response = await apiClient.executeRequest(currentTab.request);

      set((state) => {
        const updated = [...state.tabs];
        const idx = updated.findIndex((t) => t.id === activeTabId);
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            isLoading: false,
            response,
            isDirty: false,
          };
        }
        return { tabs: updated };
      });

      return response;
    } catch (err: any) {
      set((state) => {
        const updated = [...state.tabs];
        const idx = updated.findIndex((t) => t.id === activeTabId);
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            isLoading: false,
            error: err?.message || 'Execution error',
          };
        }
        return { tabs: updated };
      });
      return null;
    }
  },

  clearActiveResponse: () => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
      if (tabIndex === -1) return state;

      const updated = [...state.tabs];
      updated[tabIndex] = {
        ...updated[tabIndex],
        response: null,
        error: null,
      };
      return { tabs: updated };
    });
  },

  setEngineConnected: (connected) => set({ engineConnected: connected }),
  setWorkspaceInfo: (info) => set({ workspaceInfo: info }),
}));

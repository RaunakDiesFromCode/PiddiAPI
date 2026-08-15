import { create } from 'zustand';
import { Collection, CollectionCreate, CanonicalRequestModel, HTTPMethod, WorkspaceFileError } from '../types';
import { apiClient } from '../api/client';

interface WorkspaceStoreState {
  collections: Collection[];
  errors: WorkspaceFileError[];
  isLoading: boolean;
  selectedCollectionId: string | null;
  selectedRequestId: string | null;

  // Actions
  loadWorkspace: () => Promise<void>;
  createCollection: (payload: CollectionCreate) => Promise<Collection>;
  renameCollection: (id: string, newName: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  createRequest: (collectionId: string, name?: string, method?: HTTPMethod) => Promise<CanonicalRequestModel>;
  renameRequest: (collectionId: string, requestId: string, newName: string) => Promise<void>;
  deleteRequest: (collectionId: string, requestId: string) => Promise<void>;
  reorderRequests: (collectionId: string, sourceIndex: number, destIndex: number) => Promise<void>;
  saveActiveRequest: (collectionId: string, request: CanonicalRequestModel) => Promise<Collection>;
  setSelectedCollectionId: (id: string | null) => void;
  setSelectedRequestId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  collections: [],
  errors: [],
  isLoading: false,
  selectedCollectionId: null,
  selectedRequestId: null,

  setSelectedCollectionId: (id) => set({ selectedCollectionId: id }),
  setSelectedRequestId: (id) => set({ selectedRequestId: id }),

  loadWorkspace: async () => {
    set({ isLoading: true });
    try {
      const summary = await apiClient.getWorkspace();
      set({
        collections: summary.collections,
        errors: summary.errors || [],
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  createCollection: async (payload) => {
    set({ isLoading: true });
    try {
      const created = await apiClient.createCollection(payload);
      set((state) => ({
        collections: [...state.collections, created].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }));
      return created;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  renameCollection: async (id, newName) => {
    const { collections } = get();
    const col = collections.find((c) => c.id === id);
    if (!col) return;

    const updatedCol: Collection = {
      ...col,
      name: newName.trim() || col.name,
    };

    const saved = await apiClient.updateCollection(id, updatedCol);
    set((state) => ({
      collections: state.collections
        .map((c) => (c.id === id ? saved : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  deleteCollection: async (id) => {
    await apiClient.deleteCollection(id);
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      selectedCollectionId: state.selectedCollectionId === id ? null : state.selectedCollectionId,
    }));
  },

  createRequest: async (collectionId, name = 'Untitled Request', method: HTTPMethod = 'GET') => {
    const newReq: CanonicalRequestModel = {
      id: null,
      name,
      method,
      url: '',
      params: [{ id: 'p_1', key: '', value: '', enabled: true }],
      headers: [{ id: 'h_1', key: '', value: '', enabled: true }],
      auth: { type: 'none', placement: 'header' },
      body: { type: 'none', raw: '', form_params: [] },
      settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
      environment_id: null,
    };

    const updatedCol = await apiClient.addRequestToCollection(collectionId, newReq);
    set((state) => ({
      collections: state.collections.map((c) => (c.id === collectionId ? updatedCol : c)),
    }));

    const createdReq = updatedCol.requests[updatedCol.requests.length - 1];
    return createdReq;
  },

  renameRequest: async (collectionId, requestId, newName) => {
    const { collections } = get();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;

    const req = col.requests.find((r) => r.id === requestId);
    if (!req) return;

    const updatedReq: CanonicalRequestModel = {
      ...req,
      name: newName.trim() || req.name,
    };

    const updatedCol = await apiClient.updateRequestInCollection(collectionId, requestId, updatedReq);
    set((state) => ({
      collections: state.collections.map((c) => (c.id === collectionId ? updatedCol : c)),
    }));
  },

  deleteRequest: async (collectionId, requestId) => {
    const updatedCol = await apiClient.deleteRequestFromCollection(collectionId, requestId);
    set((state) => ({
      collections: state.collections.map((c) => (c.id === collectionId ? updatedCol : c)),
      selectedRequestId: state.selectedRequestId === requestId ? null : state.selectedRequestId,
    }));
  },

  reorderRequests: async (collectionId, sourceIndex, destIndex) => {
    const { collections } = get();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;

    const newRequests = [...col.requests];
    const [moved] = newRequests.splice(sourceIndex, 1);
    newRequests.splice(destIndex, 0, moved);

    const updatedCol: Collection = {
      ...col,
      requests: newRequests,
    };

    const saved = await apiClient.updateCollection(collectionId, updatedCol);
    set((state) => ({
      collections: state.collections.map((c) => (c.id === collectionId ? saved : c)),
    }));
  },

  saveActiveRequest: async (collectionId, request) => {
    let updatedCol: Collection;
    if (request.id) {
      updatedCol = await apiClient.updateRequestInCollection(collectionId, request.id, request);
    } else {
      updatedCol = await apiClient.addRequestToCollection(collectionId, request);
    }

    set((state) => ({
      collections: state.collections.map((c) => (c.id === collectionId ? updatedCol : c)),
    }));

    return updatedCol;
  },
}));

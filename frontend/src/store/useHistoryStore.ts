import { create } from 'zustand';
import { apiClient } from '../api/client';
import { CanonicalRequestModel, HistoryRecord } from '../types';
import { useRequestStore } from './useRequestStore';

export function hasRedactedSecrets(req: CanonicalRequestModel): boolean {
  if (req.headers.some((h) => h.value?.includes('[REDACTED]'))) return true;
  if (req.params.some((p) => p.value?.includes('[REDACTED]'))) return true;
  if (req.url?.includes('[REDACTED]') || req.url?.includes('%5BREDACTED%5D')) return true;
  if (req.auth?.token?.includes('[REDACTED]')) return true;
  if (req.auth?.password?.includes('[REDACTED]')) return true;
  if (req.auth?.value?.includes('[REDACTED]')) return true;
  return false;
}

interface HistoryStoreState {
  historyRecords: HistoryRecord[];
  isLoading: boolean;
  searchQuery: string;
  statusFilter: string | null;
  restoredBannerNotice: string | null;

  // Actions
  fetchHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string | null) => void;
  clearRestoredBanner: () => void;
  restoreRecord: (record: HistoryRecord) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  historyRecords: [],

  isLoading: false,
  searchQuery: '',
  statusFilter: null,
  restoredBannerNotice: null,

  fetchHistory: async () => {
    set({ isLoading: true });
    try {
      const records = await apiClient.getHistory(200);
      set({ historyRecords: records, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  clearHistory: async () => {
    set({ isLoading: true });
    try {
      await apiClient.clearHistory();
      set({ historyRecords: [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  setStatusFilter: (statusFilter: string | null) => set({ statusFilter }),
  clearRestoredBanner: () => set({ restoredBannerNotice: null }),

  restoreRecord: (record: HistoryRecord) => {
    const snapshot = record.request_snapshot;
    if (!snapshot) return;

    // Restore snapshot into the active tab
    useRequestStore.getState().updateActiveRequest({
      name: snapshot.name || `${snapshot.method} ${snapshot.url}`,
      method: snapshot.method,
      url: snapshot.url,
      params: snapshot.params || [],
      headers: snapshot.headers || [],
      auth: snapshot.auth || { type: 'none', placement: 'header' },
      body: snapshot.body || { type: 'none', raw: '', form_params: [] },
      settings: snapshot.settings || { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
      environment_id: snapshot.environment_id || null,
    });

    if (hasRedactedSecrets(snapshot)) {
      set({
        restoredBannerNotice:
          'Restored from history with redacted credentials ([REDACTED]). Please provide secret values or use environment variables before executing.',
      });
    } else {
      set({ restoredBannerNotice: null });
    }
  },
}));

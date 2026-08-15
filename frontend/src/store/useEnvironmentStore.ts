import { create } from 'zustand';
import { Environment, EnvironmentCreate, EnvironmentUpdate } from '../types';
import { apiClient } from '../api/client';

interface EnvironmentStoreState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  isManagerOpen: boolean;
  selectedEnvIdForEditing: string | null;
  revealedSecrets: Record<string, Record<string, string>>; // { [envId]: { [key]: value } }
  isLoading: boolean;
  error: string | null;

  // Lifecycle actions
  loadEnvironments: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  setActiveEnvironment: (envId: string | null) => Promise<void>;

  // Modal UI actions
  openManager: (envId?: string) => void;
  closeManager: () => void;
  selectEnvForEditing: (envId: string) => void;

  // Environment CRUD actions
  createEnvironment: (name: string, description?: string | null) => Promise<Environment>;
  updateEnvironment: (id: string, payload: EnvironmentUpdate) => Promise<Environment>;
  deleteEnvironment: (id: string) => Promise<void>;
  duplicateEnvironment: (id: string) => Promise<Environment>;

  // Secret Operations
  revealSecret: (envId: string, key: string) => Promise<string>;
  hideSecret: (envId: string, key: string) => void;
  setSecretValue: (envId: string, key: string, value: string) => Promise<void>;
  deleteSecretValue: (envId: string, key: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentStoreState>((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  isManagerOpen: false,
  selectedEnvIdForEditing: null,
  revealedSecrets: {},
  isLoading: false,
  error: null,

  loadEnvironments: async () => {
    try {
      set({ isLoading: true, error: null });
      const envs = await apiClient.getEnvironments();
      const currentActive = get().activeEnvironmentId;
      const validActive = currentActive && envs.some((e) => e.id === currentActive) ? currentActive : null;

      set({
        environments: envs,
        activeEnvironmentId: validActive,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        error: err?.message || 'Failed to load environments',
        isLoading: false,
      });
    }
  },

  loadPreferences: async () => {
    try {
      const prefs = await apiClient.getPreferences();
      if (prefs && prefs.active_environment_id !== undefined) {
        set({ activeEnvironmentId: prefs.active_environment_id });
      }
    } catch {
      // Gracefully ignore preference load errors
    }
  },

  setActiveEnvironment: async (envId: string | null) => {
    set({ activeEnvironmentId: envId });
    try {
      await apiClient.updatePreferences({ active_environment_id: envId });
    } catch (err: any) {
      console.error('Failed to persist active environment preference:', err);
    }
  },

  openManager: (envId) => {
    const { environments, activeEnvironmentId } = get();
    const targetId =
      envId ||
      activeEnvironmentId ||
      (environments.length > 0 ? environments[0].id : null);

    set({
      isManagerOpen: true,
      selectedEnvIdForEditing: targetId,
    });
  },

  closeManager: () => {
    set({ isManagerOpen: false });
  },

  selectEnvForEditing: (envId: string) => {
    set({ selectedEnvIdForEditing: envId });
  },

  createEnvironment: async (name: string, description?: string | null) => {
    const payload: EnvironmentCreate = {
      name: name.trim(),
      description: description || null,
      variables: [],
    };
    const newEnv = await apiClient.createEnvironment(payload);
    set((state) => ({
      environments: [...state.environments, newEnv].sort((a, b) => a.name.localeCompare(b.name)),
      selectedEnvIdForEditing: newEnv.id,
    }));
    return newEnv;
  },

  updateEnvironment: async (id: string, payload: EnvironmentUpdate) => {
    const updated = await apiClient.updateEnvironment(id, payload);
    set((state) => ({
      environments: state.environments
        .map((e) => (e.id === id ? updated : e))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return updated;
  },

  deleteEnvironment: async (id: string) => {
    await apiClient.deleteEnvironment(id);
    set((state) => {
      const nextEnvs = state.environments.filter((e) => e.id !== id);
      let nextActive = state.activeEnvironmentId;
      if (state.activeEnvironmentId === id) {
        nextActive = null;
      }
      let nextSelected = state.selectedEnvIdForEditing;
      if (state.selectedEnvIdForEditing === id) {
        nextSelected = nextEnvs.length > 0 ? nextEnvs[0].id : null;
      }
      return {
        environments: nextEnvs,
        activeEnvironmentId: nextActive,
        selectedEnvIdForEditing: nextSelected,
      };
    });

    // Update persisted preference if active environment was deleted
    if (get().activeEnvironmentId === null) {
      try {
        await apiClient.updatePreferences({ active_environment_id: null });
      } catch {
        // Ignore preference error
      }
    }
  },

  duplicateEnvironment: async (id: string) => {
    const { environments } = get();
    const source = environments.find((e) => e.id === id);
    if (!source) {
      throw new Error(`Environment ${id} not found`);
    }

    const payload: EnvironmentCreate = {
      name: `${source.name} (Copy)`,
      description: source.description,
      variables: source.variables.map((v) => ({ ...v, id: undefined })),
    };

    const duplicated = await apiClient.createEnvironment(payload);
    set((state) => ({
      environments: [...state.environments, duplicated].sort((a, b) => a.name.localeCompare(b.name)),
      selectedEnvIdForEditing: duplicated.id,
    }));
    return duplicated;
  },

  revealSecret: async (envId: string, key: string) => {
    const res = await apiClient.revealSecret(envId, key);
    set((state) => {
      const envSecrets = state.revealedSecrets[envId] || {};
      return {
        revealedSecrets: {
          ...state.revealedSecrets,
          [envId]: {
            ...envSecrets,
            [key]: res.value,
          },
        },
      };
    });
    return res.value;
  },

  hideSecret: (envId: string, key: string) => {
    set((state) => {
      const envSecrets = state.revealedSecrets[envId];
      if (!envSecrets || !(key in envSecrets)) return state;
      const nextEnvSecrets = { ...envSecrets };
      delete nextEnvSecrets[key];
      return {
        revealedSecrets: {
          ...state.revealedSecrets,
          [envId]: nextEnvSecrets,
        },
      };
    });
  },

  setSecretValue: async (envId: string, key: string, value: string) => {
    await apiClient.setSecretValue(envId, key, value);
    // Cache in memory revealed secret so user immediately sees their edited value
    set((state) => {
      const envSecrets = state.revealedSecrets[envId] || {};
      return {
        revealedSecrets: {
          ...state.revealedSecrets,
          [envId]: {
            ...envSecrets,
            [key]: value,
          },
        },
      };
    });
  },

  deleteSecretValue: async (envId: string, key: string) => {
    await apiClient.deleteSecretValue(envId, key);
    get().hideSecret(envId, key);
  },
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEnvironmentStore } from '../store/useEnvironmentStore';
import { apiClient } from '../api/client';
import { Environment } from '../types';

vi.mock('../api/client', () => ({
  apiClient: {
    getEnvironments: vi.fn(),
    createEnvironment: vi.fn(),
    getEnvironment: vi.fn(),
    updateEnvironment: vi.fn(),
    deleteEnvironment: vi.fn(),
    revealSecret: vi.fn(),
    setSecretValue: vi.fn(),
    deleteSecretValue: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

describe('useEnvironmentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentStore.setState({
      environments: [],
      activeEnvironmentId: null,
      isManagerOpen: false,
      selectedEnvIdForEditing: null,
      revealedSecrets: {},
      isLoading: false,
      error: null,
    });
  });

  it('loads environments and validates active environment', async () => {
    const mockEnvs: Environment[] = [
      {
        id: 'env_112233445566',
        name: 'Development',
        variables: [
          { key: 'baseUrl', value: 'http://localhost:8000', enabled: true, is_secret: false },
        ],
      },
    ];

    (apiClient.getEnvironments as any).mockResolvedValueOnce(mockEnvs);

    await useEnvironmentStore.getState().loadEnvironments();

    const state = useEnvironmentStore.getState();
    expect(state.environments).toHaveLength(1);
    expect(state.environments[0].name).toBe('Development');
    expect(state.isLoading).toBe(false);
  });

  it('sets active environment and updates preferences', async () => {
    (apiClient.updatePreferences as any).mockResolvedValueOnce({
      active_environment_id: 'env_112233445566',
    });

    await useEnvironmentStore.getState().setActiveEnvironment('env_112233445566');

    expect(useEnvironmentStore.getState().activeEnvironmentId).toBe('env_112233445566');
    expect(apiClient.updatePreferences).toHaveBeenCalledWith({
      active_environment_id: 'env_112233445566',
    });
  });

  it('creates and appends a new environment', async () => {
    const createdEnv: Environment = {
      id: 'env_aabbccddeeff',
      name: 'Staging',
      variables: [],
    };

    (apiClient.createEnvironment as any).mockResolvedValueOnce(createdEnv);

    const result = await useEnvironmentStore.getState().createEnvironment('Staging');

    expect(result.id).toBe('env_aabbccddeeff');
    expect(useEnvironmentStore.getState().environments).toHaveLength(1);
    expect(useEnvironmentStore.getState().selectedEnvIdForEditing).toBe('env_aabbccddeeff');
  });

  it('updates environment definitions', async () => {
    const initialEnv: Environment = {
      id: 'env_1',
      name: 'Old Name',
      variables: [],
    };
    useEnvironmentStore.setState({ environments: [initialEnv] });

    const updatedEnv: Environment = {
      id: 'env_1',
      name: 'New Name',
      variables: [{ key: 'port', value: '3000', enabled: true, is_secret: false }],
    };

    (apiClient.updateEnvironment as any).mockResolvedValueOnce(updatedEnv);

    await useEnvironmentStore.getState().updateEnvironment('env_1', {
      name: 'New Name',
      variables: updatedEnv.variables,
    });

    expect(useEnvironmentStore.getState().environments[0].name).toBe('New Name');
  });

  it('deletes an environment and resets active selection if matching', async () => {
    const env1: Environment = { id: 'env_1', name: 'Dev', variables: [] };
    const env2: Environment = { id: 'env_2', name: 'Prod', variables: [] };

    useEnvironmentStore.setState({
      environments: [env1, env2],
      activeEnvironmentId: 'env_1',
      selectedEnvIdForEditing: 'env_1',
    });

    (apiClient.deleteEnvironment as any).mockResolvedValueOnce({ deleted: true, id: 'env_1' });
    (apiClient.updatePreferences as any).mockResolvedValueOnce({ active_environment_id: null });

    await useEnvironmentStore.getState().deleteEnvironment('env_1');

    const state = useEnvironmentStore.getState();
    expect(state.environments).toHaveLength(1);
    expect(state.environments[0].id).toBe('env_2');
    expect(state.activeEnvironmentId).toBeNull();
    expect(state.selectedEnvIdForEditing).toBe('env_2');
  });

  it('reveals, caches, and hides secrets in-memory', async () => {
    (apiClient.revealSecret as any).mockResolvedValueOnce({
      key: 'apiKey',
      value: 'secret_token_123',
      is_set: true,
    });

    const val = await useEnvironmentStore.getState().revealSecret('env_1', 'apiKey');
    expect(val).toBe('secret_token_123');
    expect(useEnvironmentStore.getState().revealedSecrets['env_1']?.['apiKey']).toBe('secret_token_123');

    useEnvironmentStore.getState().hideSecret('env_1', 'apiKey');
    expect(useEnvironmentStore.getState().revealedSecrets['env_1']?.['apiKey']).toBeUndefined();
  });

  it('sets secret value and updates in-memory cache', async () => {
    (apiClient.setSecretValue as any).mockResolvedValueOnce({
      success: true,
      key: 'token',
      is_set: true,
    });

    await useEnvironmentStore.getState().setSecretValue('env_1', 'token', 'new_val_456');

    expect(apiClient.setSecretValue).toHaveBeenCalledWith('env_1', 'token', 'new_val_456');
    expect(useEnvironmentStore.getState().revealedSecrets['env_1']?.['token']).toBe('new_val_456');
  });
});

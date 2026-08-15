import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { apiClient } from '../api/client';
import { Collection } from '../types';

vi.mock('../api/client', () => ({
  apiClient: {
    getWorkspace: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    addRequestToCollection: vi.fn(),
    updateRequestInCollection: vi.fn(),
    deleteRequestFromCollection: vi.fn(),
  },
}));

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      collections: [],
      errors: [],
      isLoading: false,
      selectedCollectionId: null,
      selectedRequestId: null,
    });
  });

  it('loads workspace collections and diagnostics successfully', async () => {
    const mockCollections: Collection[] = [
      {
        id: 'col_112233445566',
        name: 'Auth API',
        requests: [],
      },
    ];

    (apiClient.getWorkspace as any).mockResolvedValueOnce({
      workspace_path: '/mock/workspace',
      collections: mockCollections,
      errors: [],
    });

    await useWorkspaceStore.getState().loadWorkspace();

    const state = useWorkspaceStore.getState();
    expect(state.collections).toHaveLength(1);
    expect(state.collections[0].name).toBe('Auth API');
    expect(state.isLoading).toBe(false);
  });

  it('creates and appends a new collection', async () => {
    const newCol: Collection = {
      id: 'col_aabbccddeeff',
      name: 'Users API',
      requests: [],
    };

    (apiClient.createCollection as any).mockResolvedValueOnce(newCol);

    const result = await useWorkspaceStore.getState().createCollection({ name: 'Users API' });

    expect(result.id).toBe('col_aabbccddeeff');
    expect(useWorkspaceStore.getState().collections).toHaveLength(1);
    expect(useWorkspaceStore.getState().collections[0].name).toBe('Users API');
  });

  it('renames an existing collection', async () => {
    const initialCol: Collection = {
      id: 'col_112233445566',
      name: 'Old Name',
      requests: [],
    };

    useWorkspaceStore.setState({ collections: [initialCol] });

    (apiClient.updateCollection as any).mockResolvedValueOnce({
      ...initialCol,
      name: 'New Name',
    });

    await useWorkspaceStore.getState().renameCollection('col_112233445566', 'New Name');

    expect(useWorkspaceStore.getState().collections[0].name).toBe('New Name');
  });

  it('deletes a collection and clears selection', async () => {
    const col1: Collection = { id: 'col_1', name: 'A', requests: [] };
    const col2: Collection = { id: 'col_2', name: 'B', requests: [] };

    useWorkspaceStore.setState({
      collections: [col1, col2],
      selectedCollectionId: 'col_1',
    });

    (apiClient.deleteCollection as any).mockResolvedValueOnce({ deleted: true, id: 'col_1' });

    await useWorkspaceStore.getState().deleteCollection('col_1');

    const state = useWorkspaceStore.getState();
    expect(state.collections).toHaveLength(1);
    expect(state.collections[0].id).toBe('col_2');
    expect(state.selectedCollectionId).toBeNull();
  });

  it('reorders requests inside a collection', async () => {
    const col: Collection = {
      id: 'col_1',
      name: 'Payments',
      requests: [
        { id: 'req_1', name: 'Req 1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', raw: '', form_params: [] }, settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true } },
        { id: 'req_2', name: 'Req 2', method: 'POST', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', raw: '', form_params: [] }, settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true } },
      ],
    };

    useWorkspaceStore.setState({ collections: [col] });

    (apiClient.updateCollection as any).mockImplementationOnce(async (_id: string, updated: Collection) => updated);

    await useWorkspaceStore.getState().reorderRequests('col_1', 0, 1);

    const reordered = useWorkspaceStore.getState().collections[0].requests;
    expect(reordered[0].id).toBe('req_2');
    expect(reordered[1].id).toBe('req_1');
  });
});

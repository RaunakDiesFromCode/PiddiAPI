import {
  CanonicalRequestModel,
  CanonicalResponseModel,
  Collection,
  CollectionCreate,
  Environment,
  EnvironmentCreate,
  EnvironmentUpdate,
  HealthInfo,
  HistoryRecord,
  SecretRevealResponse,
  UserPreferences,
  WorkspaceSummary,
} from '../types';



class ApiClient {
  private sessionToken: string | null = null;
  private isBootstrapping: Promise<string | null> | null = null;

  constructor() {
    this.extractTokenFromMeta();
  }

  public extractTokenFromMeta(): string | null {
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="piddi-token"]');
      const token = meta?.getAttribute('content')?.trim();
      if (token) {
        this.sessionToken = token;
        return token;
      }
    }
    return null;
  }

  public setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public async ensureToken(): Promise<string | null> {
    if (this.sessionToken) {
      return this.sessionToken;
    }

    const metaToken = this.extractTokenFromMeta();
    if (metaToken) {
      return metaToken;
    }

    // Dev mode fallback: fetch from internal dev bootstrap endpoint
    if (!this.isBootstrapping) {
      this.isBootstrapping = (async () => {
        try {
          const res = await fetch('/api/bootstrap', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.token) {
              this.sessionToken = data.token;
              return data.token;
            }
          }
        } catch {
          // Dev bootstrap failed or running offline/prod
        } finally {
          this.isBootstrapping = null;
        }
        return null;
      })();
    }

    return await this.isBootstrapping;
  }

  private async getAuthHeaders(includeContentType = true): Promise<Record<string, string>> {
    const token = await this.ensureToken();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['X-Piddi-Token'] = token;
    }
    return headers;
  }

  public async checkHealth(): Promise<HealthInfo> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/health', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }

    return await response.json();
  }

  public async getWorkspace(): Promise<WorkspaceSummary> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/workspace', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to load workspace' }));
      throw new Error(err.detail || `Failed to load workspace (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getCollections(): Promise<Collection[]> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/collections', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to list collections (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async createCollection(payload: CollectionCreate): Promise<Collection> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to create collection' }));
      throw new Error(err.detail || `Failed to create collection (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getCollection(id: string): Promise<Collection> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get collection (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async updateCollection(id: string, collection: Collection): Promise<Collection> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(collection),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to update collection' }));
      throw new Error(err.detail || `Failed to update collection (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async deleteCollection(id: string): Promise<{ deleted: boolean; id: string }> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to delete collection' }));
      throw new Error(err.detail || `Failed to delete collection (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async addRequestToCollection(
    collectionId: string,
    request: CanonicalRequestModel
  ): Promise<Collection> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to add request to collection' }));
      throw new Error(err.detail || `Failed to add request (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async updateRequestInCollection(
    collectionId: string,
    requestId: string,
    request: CanonicalRequestModel
  ): Promise<Collection> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(
      `/api/collections/${encodeURIComponent(collectionId)}/requests/${encodeURIComponent(requestId)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to update request' }));
      throw new Error(err.detail || `Failed to update request (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async deleteRequestFromCollection(
    collectionId: string,
    requestId: string
  ): Promise<Collection> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(
      `/api/collections/${encodeURIComponent(collectionId)}/requests/${encodeURIComponent(requestId)}`,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to delete request' }));
      throw new Error(err.detail || `Failed to delete request (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getEnvironments(): Promise<Environment[]> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/environments', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to list environments (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async createEnvironment(payload: EnvironmentCreate): Promise<Environment> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch('/api/environments', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to create environment' }));
      throw new Error(err.detail || `Failed to create environment (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getEnvironment(id: string): Promise<Environment> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(`/api/environments/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get environment (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async updateEnvironment(id: string, payload: EnvironmentUpdate): Promise<Environment> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(`/api/environments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to update environment' }));
      throw new Error(err.detail || `Failed to update environment (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async deleteEnvironment(id: string): Promise<{ deleted: boolean; id: string }> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(`/api/environments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to delete environment' }));
      throw new Error(err.detail || `Failed to delete environment (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async revealSecret(id: string, key: string): Promise<SecretRevealResponse> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(
      `/api/environments/${encodeURIComponent(id)}/secrets/${encodeURIComponent(key)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to reveal secret' }));
      throw new Error(err.detail || `Failed to reveal secret (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async setSecretValue(
    id: string,
    key: string,
    value: string
  ): Promise<{ success: boolean; key: string; is_set: boolean }> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(
      `/api/environments/${encodeURIComponent(id)}/secrets/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ value }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to set secret value' }));
      throw new Error(err.detail || `Failed to set secret value (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async deleteSecretValue(
    id: string,
    key: string
  ): Promise<{ deleted: boolean; key: string }> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(
      `/api/environments/${encodeURIComponent(id)}/secrets/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to delete secret value' }));
      throw new Error(err.detail || `Failed to delete secret value (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getPreferences(): Promise<UserPreferences> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/preferences', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to load preferences (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async updatePreferences(payload: UserPreferences): Promise<UserPreferences> {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to update preferences' }));
      throw new Error(err.detail || `Failed to update preferences (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async getHistory(limit: number = 200): Promise<HistoryRecord[]> {
    const headers = await this.getAuthHeaders(false);

    const response = await fetch(`/api/history?limit=${limit}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to load history (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async clearHistory(): Promise<{ cleared: boolean }> {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch('/api/history', {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to clear history (HTTP ${response.status})`);
    }

    return await response.json();
  }

  public async executeRequest(request: CanonicalRequestModel): Promise<CanonicalResponseModel> {

    const headers = await this.getAuthHeaders(true);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        let errData: any = null;
        try {
          errData = await res.json();
        } catch {
          // not json
        }
        return {
          status: res.status,
          status_text: res.statusText || 'Error',
          headers: {},
          cookies: {},
          body: '',
          content_type: 'text/plain',
          size_bytes: 0,
          duration_ms: 0,
          is_truncated: false,
          error: {
            code: errData?.code || `HTTP_${res.status}`,
            message: errData?.message || errData?.detail || `Engine returned HTTP ${res.status}: ${res.statusText}`,
          },
        };
      }

      const canonicalResponse: CanonicalResponseModel = await res.json();
      return canonicalResponse;
    } catch (err: any) {
      return {
        status: 0,
        status_text: 'Connection Error',
        headers: {},
        cookies: {},
        body: '',
        content_type: 'text/plain',
        size_bytes: 0,
        duration_ms: 0,
        is_truncated: false,
        error: {
          code: 'ENGINE_CONNECTION_FAILED',
          message: err?.message || 'Could not connect to PiddiAPI backend engine on localhost.',
          details: 'Please make sure the backend process is running.',
        },
      };
    }
  }
}

export const apiClient = new ApiClient();


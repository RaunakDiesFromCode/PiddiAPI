/**
 * Canonical TypeScript models matching PiddiAPI backend schemas.
 */

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export interface AuthConfig {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  placement?: 'header' | 'query';
}

export interface KeyValueItem {
  id?: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  type?: 'text' | 'file';
}

export type BodyType = 'none' | 'json' | 'urlencoded' | 'multipart' | 'raw';

export interface RequestBody {
  type: BodyType;
  raw: string;
  form_params: KeyValueItem[];
}

export interface RequestSettings {
  timeout_ms: number;
  follow_redirects: boolean;
  verify_ssl: boolean;
}

export interface CanonicalRequestModel {
  id?: string | null;
  name?: string | null;
  method: HTTPMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  body: RequestBody;
  settings: RequestSettings;
  environment_id?: string | null;
}

export interface Collection {
  schema_version?: number;
  id: string;
  name: string;
  description?: string | null;
  requests: CanonicalRequestModel[];
}

export interface CollectionCreate {
  name: string;
  description?: string | null;
}

export interface EnvironmentVariableDefinition {
  id?: string;
  key: string;
  value?: string | null;
  enabled: boolean;
  is_secret: boolean;
  description?: string | null;
}

export interface Environment {
  schema_version?: number;
  id: string;
  name: string;
  description?: string | null;
  variables: EnvironmentVariableDefinition[];
}

export interface EnvironmentCreate {
  name: string;
  description?: string | null;
  variables?: EnvironmentVariableDefinition[];
}

export interface EnvironmentUpdate {
  name: string;
  description?: string | null;
  variables?: EnvironmentVariableDefinition[];
}

export interface SecretValueUpdate {
  value: string;
}

export interface SecretRevealResponse {
  key: string;
  value: string;
  is_set: boolean;
}

export interface UserPreferences {
  schema_version?: number;
  active_environment_id?: string | null;
}

export interface WorkspaceFileError {
  file: string;
  error: string;
  code: string;
}

export interface WorkspaceSummary {
  workspace_path: string;
  collections: Collection[];
  environments: Environment[];
  errors: WorkspaceFileError[];
}

export interface TimingMetrics {
  dns_ms: number;
  connect_ms: number;
  tls_ms: number;
  ttfb_ms: number;
  transfer_ms: number;
}

export interface ResponseError {
  code: string;
  message: string;
  details?: string | null;
}

export interface CanonicalResponseModel {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: string;
  content_type: string;
  size_bytes: number;
  duration_ms: number;
  timing?: TimingMetrics | null;
  is_truncated: boolean;
  temp_file_path?: string | null;
  error?: ResponseError | null;
}

export interface TabItem {
  id: string;
  name: string;
  isDirty: boolean;
  request: CanonicalRequestModel;
  response: CanonicalResponseModel | null;
  isLoading: boolean;
  error: string | null;
  collectionId?: string | null;
  requestId?: string | null;
}

export interface HealthInfo {
  status: string;
  version: string;
  workspace_path: string;
  port: number;
}

export interface HistoryRecord {
  id: string;
  timestamp: string;
  method: HTTPMethod;
  url: string;
  status: number;
  duration_ms: number;
  size_bytes: number;
  request_snapshot: CanonicalRequestModel;
}


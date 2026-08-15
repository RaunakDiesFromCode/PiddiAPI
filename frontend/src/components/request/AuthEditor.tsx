import React, { useState } from 'react';
import { Key, Lock, Shield, Eye, EyeOff, Info } from 'lucide-react';
import { AuthConfig, AuthType } from '../../types';

interface AuthEditorProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

export const AuthEditor: React.FC<AuthEditorProps> = ({ auth, onChange }) => {
  const [showSecret, setShowSecret] = useState(false);

  const handleTypeChange = (type: AuthType) => {
    onChange({
      ...auth,
      type,
    });
  };

  const handleFieldChange = (field: keyof AuthConfig, value: string) => {
    onChange({
      ...auth,
      [field]: value,
    });
  };

  return (
    <div className="p-4 space-y-5 max-w-2xl text-xs overflow-y-auto h-full">
      <div className="flex items-center gap-3">
        <label className="text-text-muted font-medium w-24 flex items-center gap-1.5 flex-shrink-0">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>Auth Type</span>
        </label>
        <select
          value={auth.type}
          onChange={(e) => handleTypeChange(e.target.value as AuthType)}
          aria-label="Authentication Type"
          className="bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 text-text-primary text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer min-w-[200px]"
        >
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apikey">API Key</option>
        </select>
      </div>

      {auth.type === 'none' && (
        <div className="flex items-center gap-2 p-3 bg-bg-card/40 border border-border-subtle rounded-md text-text-muted">
          <Info className="w-4 h-4 text-text-faint flex-shrink-0" />
          <span>This request does not include explicit authentication headers.</span>
        </div>
      )}

      {auth.type === 'bearer' && (
        <div className="space-y-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex items-center gap-1.5 flex-shrink-0">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Token</span>
            </label>
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={auth.token || ''}
                placeholder="e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... or {{token}}"
                onChange={(e) => handleFieldChange('token', e.target.value)}
                aria-label="Bearer Token"
                className="w-full bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 pr-10 text-text-primary placeholder:text-text-faint font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded"
                aria-label={showSecret ? 'Hide token' : 'Show token'}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-text-faint text-[11px] pl-28 font-mono">
            Injected as header: <code className="text-text-muted">Authorization: Bearer &lt;token&gt;</code>
          </p>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="space-y-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex items-center gap-1.5 flex-shrink-0">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Username</span>
            </label>
            <input
              type="text"
              value={auth.username || ''}
              placeholder="Username or API user"
              onChange={(e) => handleFieldChange('username', e.target.value)}
              aria-label="Basic Auth Username"
              className="flex-1 bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 text-text-primary placeholder:text-text-faint font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex items-center gap-1.5 flex-shrink-0">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span>Password</span>
            </label>
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={auth.password || ''}
                placeholder="Password or API secret"
                onChange={(e) => handleFieldChange('password', e.target.value)}
                aria-label="Basic Auth Password"
                className="w-full bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 pr-10 text-text-primary placeholder:text-text-faint font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded"
                aria-label={showSecret ? 'Hide password' : 'Show password'}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-text-faint text-[11px] pl-28 font-mono">
            Base64 encoded as: <code className="text-text-muted">Authorization: Basic &lt;base64(user:pass)&gt;</code>
          </p>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="space-y-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex-shrink-0">Key Name</label>
            <input
              type="text"
              value={auth.key || ''}
              placeholder="e.g. X-API-Key or api_key"
              onChange={(e) => handleFieldChange('key', e.target.value)}
              aria-label="API Key Name"
              className="flex-1 bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 text-text-primary placeholder:text-text-faint font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex-shrink-0">Value</label>
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={auth.value || ''}
                placeholder="API Key value"
                onChange={(e) => handleFieldChange('value', e.target.value)}
                aria-label="API Key Value"
                className="w-full bg-bg-darkest border border-border-default rounded-md px-3 py-1.5 pr-10 text-text-primary placeholder:text-text-faint font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded"
                aria-label={showSecret ? 'Hide value' : 'Show value'}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-text-muted font-medium w-24 flex-shrink-0">Add To</label>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary">
                <input
                  type="radio"
                  name="placement"
                  value="header"
                  checked={auth.placement !== 'query'}
                  onChange={() => handleFieldChange('placement', 'header')}
                  className="text-blue-500 bg-bg-darkest border-border-default focus:ring-0 cursor-pointer"
                />
                <span>Header</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary">
                <input
                  type="radio"
                  name="placement"
                  value="query"
                  checked={auth.placement === 'query'}
                  onChange={() => handleFieldChange('placement', 'query')}
                  className="text-blue-500 bg-bg-darkest border-border-default focus:ring-0 cursor-pointer"
                />
                <span>Query Params</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

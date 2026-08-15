import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Lock,
  Globe,
  Layers,
  AlertCircle,
  Key,
} from 'lucide-react';
import { useEnvironmentStore } from '../../store/useEnvironmentStore';
import { EnvironmentVariableDefinition } from '../../types';

export const EnvironmentModal: React.FC = () => {
  const {
    environments,
    activeEnvironmentId,
    isManagerOpen,
    selectedEnvIdForEditing,
    revealedSecrets,
    closeManager,
    selectEnvForEditing,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    setActiveEnvironment,
    revealSecret,
    hideSecret,
    setSecretValue,
  } = useEnvironmentStore();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Local draft state for the selected environment
  const selectedEnv = useMemo(
    () => environments.find((e) => e.id === selectedEnvIdForEditing) || null,
    [environments, selectedEnvIdForEditing]
  );

  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftVariables, setDraftVariables] = useState<EnvironmentVariableDefinition[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [secretEditKey, setSecretEditKey] = useState<string | null>(null);
  const [secretEditValue, setSecretEditValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync draft when selected environment changes
  useEffect(() => {
    if (selectedEnv) {
      setDraftName(selectedEnv.name);
      setDraftDescription(selectedEnv.description || '');
      setDraftVariables(selectedEnv.variables.map((v) => ({ ...v })));
      setIsDirty(false);
      setSaveError(null);
    } else if (environments.length > 0 && !selectedEnvIdForEditing) {
      selectEnvForEditing(environments[0].id);
    }
  }, [selectedEnv, selectedEnvIdForEditing, environments, selectEnvForEditing]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isManagerOpen) {
        closeManager();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isManagerOpen, closeManager]);


  // Duplicate key detection in draft
  const duplicateKeys = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of draftVariables) {
      const k = v.key.trim();
      if (k) {
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    return Object.keys(counts).filter((k) => counts[k] > 1);
  }, [draftVariables]);

  if (!isManagerOpen) return null;

  const handleAddVariableRow = () => {
    setDraftVariables((prev) => [
      ...prev,
      {
        id: `var_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        key: '',
        value: '',
        enabled: true,
        is_secret: false,
        description: '',
      },
    ]);
    setIsDirty(true);
  };

  const handleUpdateVariable = (
    index: number,
    updater: Partial<EnvironmentVariableDefinition>
  ) => {
    setDraftVariables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updater };
      // If toggled to secret, clear plain value in definition
      if (updater.is_secret === true) {
        next[index].value = null;
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleDeleteVariable = (index: number) => {
    setDraftVariables((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleSaveEnvironment = async () => {
    if (!selectedEnv) return;
    if (!draftName.trim()) {
      setSaveError('Environment name cannot be empty');
      return;
    }
    if (duplicateKeys.length > 0) {
      setSaveError(`Duplicate variable keys found: ${duplicateKeys.join(', ')}`);
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      // Clean variables: omit empty keys
      const cleanVariables = draftVariables
        .filter((v) => v.key.trim())
        .map((v) => ({
          ...v,
          key: v.key.trim(),
          value: v.is_secret ? null : (v.value || ''),
        }));

      await updateEnvironment(selectedEnv.id, {
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        variables: cleanVariables,
      });

      setIsDirty(false);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save environment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvName.trim()) return;
    try {
      const created = await createEnvironment(newEnvName.trim());
      setNewEnvName('');
      setIsCreating(false);
      selectEnvForEditing(created.id);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to create environment');
    }
  };

  const handleCopyValue = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSaveSecretValueModal = async () => {
    if (!selectedEnv || !secretEditKey) return;
    try {
      await setSecretValue(selectedEnv.id, secretEditKey, secretEditValue);
      setSecretEditKey(null);
      setSecretEditValue('');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to update secret value');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div
        className="bg-bg-card border border-border-default rounded-xl w-full max-w-4xl h-[650px] shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-modal-title"
      >
        {/* Modal Top Header */}
        <div className="h-13 px-5 border-b border-border-default flex items-center justify-between bg-bg-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h2 id="env-modal-title" className="font-semibold text-sm text-text-primary">
              Manage Environments & Secrets
            </h2>
          </div>
          <button
            type="button"
            onClick={closeManager}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Split Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Environment List */}
          <div className="w-64 border-r border-border-default bg-bg-surface flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Environments ({environments.length})
              </span>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="p-1 text-text-muted hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                title="Create New Environment"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Inline Creation Input */}
            {isCreating && (
              <form onSubmit={handleCreateNew} className="p-2 border-b border-border-subtle bg-bg-card">
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  placeholder="Environment name..."
                  autoFocus
                  className="w-full text-xs px-2 py-1.5 bg-bg-input border border-purple-500/50 rounded text-text-primary placeholder:text-text-faint focus:outline-none"
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewEnvName('');
                    }}
                    className="px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-1 text-[11px] bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Environments Navigation List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {environments.length === 0 ? (
                <div className="p-4 text-center text-xs text-text-muted">
                  No environments yet. Click + to create one.
                </div>
              ) : (
                environments.map((env) => {
                  const isSelected = env.id === selectedEnvIdForEditing;
                  const isActive = env.id === activeEnvironmentId;

                  return (
                    <div
                      key={env.id}
                      onClick={() => selectEnvForEditing(env.id)}
                      className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-purple-500/15 border border-purple-500/30 text-purple-200'
                          : 'hover:bg-bg-hover text-text-secondary border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-text-muted'}`} />
                        <span className="font-medium truncate">{env.name}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full font-mono">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateEnvironment(env.id);
                          }}
                          className="p-1 hover:text-text-primary hover:bg-bg-surface rounded"
                          title="Duplicate environment"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete environment "${env.name}"?`)) {
                              deleteEnvironment(env.id);
                            }
                          }}
                          className="p-1 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                          title="Delete environment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Safe Git Footer Notice */}
            <div className="p-3 border-t border-border-subtle bg-bg-surface text-[11px] text-text-muted flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
              <span>
                Secrets are stored in <code className="text-purple-300 font-mono text-[10px]">.secrets.json</code> and excluded from Git.
              </span>
            </div>
          </div>

          {/* Right Pane: Selected Environment Details & Variables Grid */}
          <div className="flex-1 flex flex-col bg-bg-card overflow-hidden">
            {selectedEnv ? (
              <>
                {/* Environment Metadata Header */}
                <div className="p-4 border-b border-border-default bg-bg-surface/50 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => {
                          setDraftName(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="Environment Name"
                        className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border-default focus:border-purple-500 text-text-primary focus:outline-none transition-colors px-1 py-0.5"
                      />
                      <span className="text-xs font-mono text-text-faint">({selectedEnv.id})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveEnvironment(activeEnvironmentId === selectedEnv.id ? null : selectedEnv.id)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                          activeEnvironmentId === selectedEnv.id
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-hover'
                        }`}
                      >
                        {activeEnvironmentId === selectedEnv.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Active Environment</span>
                          </>
                        ) : (
                          <span>Set as Active</span>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={!isDirty || isSaving}
                        onClick={handleSaveEnvironment}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          isDirty
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-xs'
                            : 'bg-bg-surface text-text-muted cursor-not-allowed border border-border-subtle'
                        }`}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={draftDescription}
                    onChange={(e) => {
                      setDraftDescription(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Optional description (e.g. Local developer environment with custom auth)"
                    className="text-xs px-2 py-1 bg-bg-surface border border-border-subtle rounded text-text-secondary placeholder:text-text-faint focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Error Banner */}
                {saveError && (
                  <div className="mx-4 mt-3 p-2.5 bg-rose-500/15 border border-rose-500/30 rounded text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Duplicate Key Warning */}
                {duplicateKeys.length > 0 && (
                  <div className="mx-4 mt-3 p-2.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Duplicate variable keys detected: {duplicateKeys.join(', ')}. Keys must be unique.</span>
                  </div>
                )}

                {/* Variables Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="border border-border-default rounded-lg overflow-hidden bg-bg-surface">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-default bg-bg-card/60 text-text-muted font-mono text-[11px]">
                          <th className="py-2 px-3 w-8 text-center">✓</th>
                          <th className="py-2 px-3 w-1/4">VARIABLE NAME</th>
                          <th className="py-2 px-3 w-28">TYPE</th>
                          <th className="py-2 px-3">VALUE</th>
                          <th className="py-2 px-3 w-20 text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle font-mono">
                        {draftVariables.map((variable, idx) => {
                          const isSecret = variable.is_secret;
                          const isRevealed = Boolean(
                            selectedEnv && revealedSecrets[selectedEnv.id]?.[variable.key]
                          );
                          const revealedVal =
                            selectedEnv && revealedSecrets[selectedEnv.id]?.[variable.key];
                          const hasDuplicate = duplicateKeys.includes(variable.key.trim());

                          return (
                            <tr
                              key={variable.id || idx}
                              className={`hover:bg-bg-hover/50 group transition-colors ${
                                !variable.enabled ? 'opacity-50' : ''
                              }`}
                            >
                              {/* Enabled Checkbox */}
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={variable.enabled}
                                  onChange={(e) =>
                                    handleUpdateVariable(idx, { enabled: e.target.checked })
                                  }
                                  className="rounded border-border-default text-purple-600 focus:ring-0 focus:outline-none"
                                />
                              </td>

                              {/* Variable Key */}
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={variable.key}
                                  onChange={(e) => handleUpdateVariable(idx, { key: e.target.value })}
                                  placeholder="VARIABLE_KEY"
                                  className={`w-full bg-transparent px-1.5 py-1 rounded text-text-primary placeholder:text-text-faint focus:outline-none ${
                                    hasDuplicate
                                      ? 'border border-amber-500/50 bg-amber-500/10'
                                      : 'focus:bg-bg-input'
                                  }`}
                                />
                              </td>

                              {/* Type Toggle (Plain / Secret) */}
                              <td className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateVariable(idx, { is_secret: !variable.is_secret })
                                  }
                                  className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium flex items-center gap-1 border transition-colors ${
                                    isSecret
                                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                      : 'bg-bg-card text-text-muted border-border-default hover:text-text-primary'
                                  }`}
                                >
                                  {isSecret ? (
                                    <>
                                      <Lock className="w-3 h-3 text-purple-400" />
                                      <span>Secret</span>
                                    </>
                                  ) : (
                                    <>
                                      <Key className="w-3 h-3 text-text-muted" />
                                      <span>Plain</span>
                                    </>
                                  )}
                                </button>
                              </td>

                              {/* Value Editor */}
                              <td className="py-2 px-3">
                                {isSecret ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 px-2 py-1 bg-bg-input/60 border border-border-subtle rounded text-text-muted flex items-center justify-between">
                                      <span className="font-mono text-xs truncate">
                                        {isRevealed
                                          ? revealedVal
                                          : '••••••••••••••••'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!selectedEnv) return;
                                          if (isRevealed) {
                                            hideSecret(selectedEnv.id, variable.key);
                                          } else {
                                            try {
                                              await revealSecret(selectedEnv.id, variable.key);
                                            } catch {
                                              // Not yet set
                                              setSecretEditKey(variable.key);
                                              setSecretEditValue('');
                                            }
                                          }
                                        }}
                                        className="p-0.5 text-text-muted hover:text-text-primary transition-colors"
                                        title={isRevealed ? 'Hide Secret' : 'Reveal Secret'}
                                      >
                                        {isRevealed ? (
                                          <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                          <Eye className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSecretEditKey(variable.key);
                                        setSecretEditValue(revealedVal || '');
                                      }}
                                      className="px-2 py-1 text-[10px] bg-bg-surface hover:bg-bg-hover text-text-secondary border border-border-default rounded font-sans"
                                    >
                                      Edit Secret
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={variable.value || ''}
                                    onChange={(e) =>
                                      handleUpdateVariable(idx, { value: e.target.value })
                                    }
                                    placeholder="Value string"
                                    className="w-full bg-transparent px-1.5 py-1 rounded text-text-primary placeholder:text-text-faint focus:outline-none focus:bg-bg-input"
                                  />
                                )}
                              </td>

                              {/* Actions (Copy / Delete) */}
                              <td className="py-2 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const valToCopy = isSecret
                                        ? revealedVal || ''
                                        : variable.value || '';
                                      if (valToCopy) {
                                        handleCopyValue(variable.key, valToCopy);
                                      }
                                    }}
                                    className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-card rounded"
                                    title="Copy Value"
                                  >
                                    {copiedKey === variable.key ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVariable(idx)}
                                    className="p-1 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded"
                                    title="Delete variable"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Add Variable Button */}
                    <div className="p-2 border-t border-border-subtle bg-bg-surface">
                      <button
                        type="button"
                        onClick={handleAddVariableRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Variable</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-8 text-center">
                <Globe className="w-10 h-10 text-text-faint mb-3" />
                <p className="text-sm font-medium text-text-secondary">No Environment Selected</p>
                <p className="text-xs text-text-muted mt-1">
                  Select an environment from the sidebar or click + to create a new one.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Secret Value Editor Dialog */}
      {secretEditKey && selectedEnv && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-bg-surface border border-border-default rounded-xl w-full max-w-md p-5 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-purple-400" />
              <h3 className="font-semibold text-sm text-text-primary">
                Set Secret: <span className="font-mono text-purple-300">{secretEditKey}</span>
              </h3>
            </div>
            <p className="text-xs text-text-muted mb-4 leading-relaxed">
              Secret values are saved strictly to <code className="text-purple-300 font-mono">.secrets.json</code> on your local disk and will not appear in Git diffs or shared collections.
            </p>
            <input
              type="text"
              value={secretEditValue}
              onChange={(e) => setSecretEditValue(e.target.value)}
              placeholder="Enter secret token / password..."
              autoFocus
              className="w-full text-xs font-mono px-3 py-2 bg-bg-input border border-border-default focus:border-purple-500 rounded text-text-primary focus:outline-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSecretEditKey(null);
                  setSecretEditValue('');
                }}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded border border-border-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSecretValueModal}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium shadow-xs"
              >
                Save Secret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

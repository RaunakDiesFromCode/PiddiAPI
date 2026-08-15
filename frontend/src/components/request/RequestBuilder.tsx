import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Code,
  FileText,
  Loader2,
  Plus,
  Save,
  Send,
  X,
} from 'lucide-react';
import { useHistoryStore } from '../../store/useHistoryStore';
import { useRequestStore } from '../../store/useRequestStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { HTTPMethod } from '../../types';
import { parseCurl } from '../../utils/curlParser';
import { Modal } from '../common/Modal';
import { SnippetModal } from '../common/SnippetModal';
import { AuthEditor } from './AuthEditor';
import { BodyEditor } from './BodyEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { SettingsEditor } from './SettingsEditor';

const HTTP_METHODS: { method: HTTPMethod; color: string; bg: string }[] = [
  { method: 'GET', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { method: 'POST', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { method: 'PUT', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { method: 'PATCH', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { method: 'DELETE', color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { method: 'HEAD', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { method: 'OPTIONS', color: 'text-slate-400', bg: 'bg-slate-500/10' },
];

type ComposerTab = 'params' | 'headers' | 'auth' | 'body' | 'settings';

export const RequestBuilder: React.FC = () => {
  const { restoredBannerNotice, clearRestoredBanner } = useHistoryStore();
  const {
    tabs,
    activeTabId,
    createScratchpadTab,
    switchTab,
    closeTab,
    updateActiveRequest,
    setMethod,
    setUrl,
    setParams,
    setHeaders,
    setAuth,
    setBody,
    setSettings,
    sendActiveRequest,
    saveActiveTab,
  } = useRequestStore();

  const { collections, createCollection } = useWorkspaceStore();

  const [activeComposerTab, setActiveComposerTab] = useState<ComposerTab>('params');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCurlText, setImportCurlText] = useState('');
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [requestSaveName, setRequestSaveName] = useState('');

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const req = currentTab.request;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

  const getMethodBadge = (m: HTTPMethod) => {
    switch (m) {
      case 'GET':
        return 'text-emerald-400';
      case 'POST':
        return 'text-blue-400';
      case 'PUT':
        return 'text-amber-400';
      case 'PATCH':
        return 'text-purple-400';
      case 'DELETE':
        return 'text-rose-400';
      case 'HEAD':
        return 'text-cyan-400';
      case 'OPTIONS':
        return 'text-slate-400';
      default:
        return 'text-text-primary';
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendActiveRequest();
    }
  };

  const handleSaveClick = async () => {
    if (currentTab.collectionId) {
      const success = await saveActiveTab(currentTab.collectionId);
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } else {
      setRequestSaveName(req.name || 'Untitled Request');
      setTargetCollectionId(collections[0]?.id || 'new');
      setIsSaveModalOpen(true);
    }
  };

  const handleModalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    let colId = targetCollectionId;

    if (colId === 'new') {
      if (!newCollectionName.trim()) return;
      const createdCol = await createCollection({ name: newCollectionName.trim() });
      colId = createdCol.id;
    }

    if (!colId) return;

    if (requestSaveName.trim()) {
      req.name = requestSaveName.trim();
    }

    const success = await saveActiveTab(colId);
    if (success) {
      setIsSaveModalOpen(false);
      setNewCollectionName('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const activeParamsCount = (req.params || []).filter((p) => p.enabled && p.key).length;
  const activeHeadersCount = (req.headers || []).filter((h) => h.enabled && h.key).length;

  const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (
      text.trim().startsWith('curl ') ||
      text.trim().startsWith('curl\n') ||
      text.trim().startsWith('curl\r\n')
    ) {
      e.preventDefault();
      try {
        const parsed = parseCurl(text);
        updateActiveRequest({
          name: parsed.url ? `${parsed.method} ${parsed.url}` : req.name,
          method: parsed.method,
          url: parsed.url,
          params: parsed.params.length > 0 ? parsed.params : req.params,
          headers: parsed.headers.length > 0 ? parsed.headers : req.headers,
          auth: parsed.auth,
          body: parsed.body,
          settings: parsed.settings,
        });
        setImportNotice('cURL command imported successfully');
        setTimeout(() => setImportNotice(null), 3000);
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse cURL command');
        setTimeout(() => setImportError(null), 4000);
      }
    }
  };

  const handleExplicitImportCurl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCurlText.trim()) return;
    try {
      const parsed = parseCurl(importCurlText);
      updateActiveRequest({
        name: parsed.url ? `${parsed.method} ${parsed.url}` : req.name,
        method: parsed.method,
        url: parsed.url,
        params: parsed.params.length > 0 ? parsed.params : req.params,
        headers: parsed.headers.length > 0 ? parsed.headers : req.headers,
        auth: parsed.auth,
        body: parsed.body,
        settings: parsed.settings,
      });
      setIsImportModalOpen(false);
      setImportCurlText('');
      setImportNotice('cURL command imported successfully');
      setTimeout(() => setImportNotice(null), 3000);
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse cURL command');
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-darkest select-none">
      {/* 1. Top Tabs Manager */}
      <div className="flex items-center bg-bg-surface border-b border-border-subtle overflow-x-auto no-scrollbar flex-shrink-0">
        <div className="flex items-center flex-1 min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => switchTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') switchTab(tab.id);
                }}
                className={`group flex items-center gap-2 px-3 py-2 border-r border-border-subtle cursor-pointer transition-colors max-w-[180px] flex-shrink-0 text-xs focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
                  isActive
                    ? 'bg-bg-darkest text-text-primary font-medium border-t-2 border-t-blue-500 shadow-xs'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-card'
                }`}
              >
                <span
                  className={`font-mono text-[11px] font-bold flex-shrink-0 ${getMethodBadge(
                    tab.request.method
                  )}`}
                >
                  {tab.request.method}
                </span>
                <span className="truncate flex-1 text-left" title={tab.name}>
                  {tab.name}
                </span>
                {tab.isDirty && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"
                    title="Unsaved changes"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 hover:bg-bg-overlay p-0.5 rounded text-text-muted hover:text-text-primary transition-opacity focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
                  title="Close tab"
                  aria-label={`Close tab ${tab.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => createScratchpadTab()}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors flex-shrink-0 focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
          title="New Request Tab"
          aria-label="New request tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Restored Credential Notice Banner */}
      {restoredBannerNotice && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-2 flex items-center justify-between text-xs text-amber-300 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{restoredBannerNotice}</span>
          </div>
          <button
            type="button"
            onClick={clearRestoredBanner}
            className="p-1 hover:bg-amber-500/20 rounded text-amber-400"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Import Status / Error Banner */}
      {importNotice && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1.5 flex items-center justify-between text-xs text-emerald-300 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>{importNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="p-0.5 hover:bg-emerald-500/20 rounded text-emerald-400"
            aria-label="Dismiss import notice"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {importError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-3 py-1.5 flex items-center justify-between text-xs text-rose-300 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            <span>{importError}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="p-0.5 hover:bg-rose-500/20 rounded text-rose-400"
            aria-label="Dismiss import error"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. Responsive Primary Request Action Bar */}
      <div className="p-2.5 sm:p-3 border-b border-border-subtle bg-bg-surface flex-shrink-0 space-y-2">
        {/* Responsive flex wrapping container: URL Priority */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Method & URL Group: gets priority and flex-grow */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px] sm:min-w-[320px]">
            {/* Method Select */}
            <select
              value={req.method}
              onChange={(e) => setMethod(e.target.value as HTTPMethod)}
              aria-label="HTTP Method"
              className={`bg-bg-darkest border border-border-default rounded-md px-2.5 py-1.5 font-mono font-bold text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer flex-shrink-0 w-24 sm:w-28 ${getMethodBadge(
                req.method
              )}`}
            >
              {HTTP_METHODS.map((m) => (
                <option
                  key={m.method}
                  value={m.method}
                  className="text-text-primary bg-bg-darkest font-mono font-semibold"
                >
                  {m.method}
                </option>
              ))}
            </select>

            {/* URL Input */}
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={req.url}
                placeholder="Enter request URL (e.g. https://api.example.com or {{base_url}}/users)..."
                onChange={(e) => setUrl(e.target.value)}
                onPaste={handleUrlPaste}
                onKeyDown={handleUrlKeyDown}
                aria-label="Request URL"
                className="w-full bg-bg-darkest border border-border-default rounded-md pl-3 pr-8 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-faint focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />

              {req.url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded"
                  title="Clear URL"
                  aria-label="Clear URL input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons Group: wraps cleanly on narrower viewports */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Import cURL Button (Tertiary) */}
            <button
              type="button"
              onClick={() => {
                setImportCurlText('');
                setImportError(null);
                setIsImportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md font-medium text-xs bg-bg-card hover:bg-bg-overlay border-border-subtle hover:border-border-default text-text-secondary hover:text-text-primary transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
              title="Import cURL command"
              aria-label="Import cURL command"
            >
              <FileText className="w-3.5 h-3.5 text-text-muted" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {/* Code Snippets Button (Tertiary) */}
            <button
              type="button"
              onClick={() => setIsSnippetModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md font-medium text-xs bg-bg-card hover:bg-bg-overlay border-border-subtle hover:border-border-default text-text-secondary hover:text-text-primary transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
              title="Generate Code Snippet"
              aria-label="Generate code snippet"
            >
              <Code className="w-3.5 h-3.5 text-text-muted" />
              <span className="hidden sm:inline">Code</span>
            </button>

            {/* Save Button (Secondary) */}
            <button
              type="button"
              onClick={handleSaveClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md font-medium text-xs transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
                saveSuccess
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-bg-card hover:bg-bg-overlay border-border-default hover:border-border-strong text-text-secondary hover:text-text-primary'
              }`}
              title="Save Request to Collection"
              aria-label="Save request"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>

            {/* Send Button (Primary) */}
            <button
              type="button"
              data-testid="send-request-btn"
              aria-label="Send Request"
              onClick={() => sendActiveRequest()}
              disabled={currentTab.isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-medium text-xs rounded-md shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              {currentTab.isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                  <kbd className="hidden md:inline-block ml-0.5 px-1.5 py-0.2 bg-blue-700/60 rounded text-[10px] font-mono">
                    {isMac ? '⌘↵' : '↵'}
                  </kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Composer Sub-Tabs */}
      <div className="flex items-center justify-between px-3 border-b border-border-subtle bg-bg-surface flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveComposerTab('params')}
            className={`px-3 py-2 border-b-2 font-medium text-xs transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeComposerTab === 'params'
                ? 'border-b-blue-500 text-text-primary'
                : 'border-b-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Params
            {activeParamsCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded-full text-[10px] font-mono">
                {activeParamsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveComposerTab('headers')}
            className={`px-3 py-2 border-b-2 font-medium text-xs transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeComposerTab === 'headers'
                ? 'border-b-blue-500 text-text-primary'
                : 'border-b-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Headers
            {activeHeadersCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded-full text-[10px] font-mono">
                {activeHeadersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveComposerTab('auth')}
            className={`px-3 py-2 border-b-2 font-medium text-xs transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeComposerTab === 'auth'
                ? 'border-b-blue-500 text-text-primary'
                : 'border-b-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Auth
            {req.auth.type !== 'none' && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-mono uppercase">
                {req.auth.type}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveComposerTab('body')}
            className={`px-3 py-2 border-b-2 font-medium text-xs transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeComposerTab === 'body'
                ? 'border-b-blue-500 text-text-primary'
                : 'border-b-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Body
            {req.body.type !== 'none' && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-purple-500/20 text-purple-400 rounded-full text-[10px] font-mono uppercase">
                {req.body.type}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveComposerTab('settings')}
            className={`px-3 py-2 border-b-2 font-medium text-xs transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeComposerTab === 'settings'
                ? 'border-b-blue-500 text-text-primary'
                : 'border-b-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* 4. Active Sub-View */}
      <div className="flex-1 min-h-0 overflow-hidden bg-bg-base">
        {activeComposerTab === 'params' && (
          <KeyValueEditor
            items={req.params || []}
            onChange={setParams}
            keyPlaceholder="Parameter Name"
            valuePlaceholder="Value"
            showDescription={true}
          />
        )}

        {activeComposerTab === 'headers' && (
          <KeyValueEditor
            items={req.headers || []}
            onChange={setHeaders}
            keyPlaceholder="Header Name"
            valuePlaceholder="Value"
            showDescription={true}
          />
        )}

        {activeComposerTab === 'auth' && (
          <AuthEditor auth={req.auth} onChange={setAuth} />
        )}

        {activeComposerTab === 'body' && (
          <BodyEditor body={req.body} onChange={setBody} />
        )}

        {activeComposerTab === 'settings' && (
          <SettingsEditor settings={req.settings} onChange={setSettings} />
        )}
      </div>

      {/* Save Request to Collection Modal */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title="Save Request to Collection"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsSaveModalOpen(false)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleModalSave}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors text-xs"
            >
              Save to Collection
            </button>
          </>
        }
      >
        <form onSubmit={handleModalSave} className="space-y-4 font-sans">
          <div>
            <label className="block text-text-muted text-[11px] mb-1 font-medium">
              Request Name
            </label>
            <input
              type="text"
              value={requestSaveName}
              onChange={(e) => setRequestSaveName(e.target.value)}
              placeholder="e.g. List Users"
              className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs font-sans"
            />
          </div>

          <div>
            <label className="block text-text-muted text-[11px] mb-1 font-medium">
              Select Collection
            </label>
            <select
              value={targetCollectionId}
              onChange={(e) => setTargetCollectionId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs font-sans cursor-pointer"
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">+ Create New Collection...</option>
            </select>
          </div>

          {targetCollectionId === 'new' && (
            <div>
              <label className="block text-text-muted text-[11px] mb-1 font-medium">
                New Collection Name *
              </label>
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="e.g. User Management"
                autoFocus
                className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs font-sans"
              />
            </div>
          )}

          {/* Security Notice */}
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[11px] text-text-muted space-y-1">
            <div className="flex items-center gap-1.5 text-blue-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Credential Protection Policy</span>
            </div>
            <p className="text-text-faint leading-relaxed">
              Known credentials (Bearer tokens, Basic passwords, API keys, Authorization headers) are sanitized on disk. Request body contents are persisted verbatim. Use <code className="text-blue-300 font-mono">{'{{variableName}}'}</code> for persistent secrets.
            </p>
          </div>
        </form>
      </Modal>

      {/* Explicit Import cURL Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import cURL Command"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExplicitImportCurl}
              disabled={!importCurlText.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md font-medium transition-colors text-xs"
            >
              Import Request
            </button>
          </>
        }
      >
        <form onSubmit={handleExplicitImportCurl} className="space-y-3 font-sans">
          <p className="text-xs text-text-muted">
            Paste any standard cURL command. Method, URL, headers, authentication, and payload will be parsed into the active tab.
          </p>
          <textarea
            value={importCurlText}
            onChange={(e) => setImportCurlText(e.target.value)}
            placeholder={`curl -X POST https://api.example.com/v1/users \\\n  -H "Authorization: Bearer token" \\\n  -d '{"name":"Alice"}'`}
            rows={6}
            className="w-full p-2.5 bg-bg-darkest border border-border-default rounded-md text-xs font-mono text-text-primary placeholder:text-text-faint focus:border-blue-500 focus:outline-none leading-relaxed"
            autoFocus
          />
          {importError && (
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{importError}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* Code Snippet Modal */}
      <SnippetModal
        isOpen={isSnippetModalOpen}
        onClose={() => setIsSnippetModalOpen(false)}
        request={req}
      />
    </div>
  );
};

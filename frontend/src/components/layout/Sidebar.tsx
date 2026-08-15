import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  FileCode,
  FolderArchive,
  FolderOpen,
  History,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useHistoryStore } from '../../store/useHistoryStore';
import { useRequestStore } from '../../store/useRequestStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { HTTPMethod } from '../../types';
import { Modal } from '../common/Modal';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  initialTab?: 'collections' | 'history' | 'tabs';
}

type SidebarTab = 'collections' | 'history' | 'tabs';

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  initialTab = 'collections',
}) => {
  const { tabs, activeTabId, createScratchpadTab, switchTab, openRequestTab } =
    useRequestStore();
  const {
    collections,
    errors,
    isLoading,
    loadWorkspace,
    createCollection,
    renameCollection,
    deleteCollection,
    createRequest,
    renameRequest,
    deleteRequest,
    reorderRequests,
  } = useWorkspaceStore();

  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab);
  const [collapsedCollections, setCollapsedCollections] = useState<
    Record<string, boolean>
  >({});

  // Modals state
  const [isCreateColOpen, setIsCreateColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  const [renameTarget, setRenameTarget] = useState<{
    type: 'collection' | 'request';
    collectionId: string;
    requestId?: string;
    currentName: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'collection' | 'request';
    collectionId: string;
    requestId?: string;
    name: string;
  } | null>(null);

  const [isClearHistoryOpen, setIsClearHistoryOpen] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const {
    historyRecords,
    isLoading: isHistoryLoading,
    searchQuery: historySearchQuery,
    setSearchQuery: setHistorySearchQuery,
    fetchHistory,
    clearHistory,
    restoreRecord,
  } = useHistoryStore();

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const filteredHistory = historyRecords.filter((rec) => {
    if (!historySearchQuery.trim()) return true;
    const q = historySearchQuery.toLowerCase();
    return (
      rec.url.toLowerCase().includes(q) ||
      rec.method.toLowerCase().includes(q) ||
      rec.status.toString().includes(q)
    );
  });

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300)
      return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
    if (status >= 300 && status < 400)
      return 'text-sky-400 bg-sky-950/40 border-sky-800/50';
    if (status >= 400 && status < 500)
      return 'text-amber-400 bg-amber-950/40 border-amber-800/50';
    if (status >= 500 || status === 0)
      return 'text-rose-400 bg-rose-950/40 border-rose-800/50';
    return 'text-text-secondary bg-bg-card border-border-subtle';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleClearHistoryConfirm = async () => {
    await clearHistory();
    setIsClearHistoryOpen(false);
  };

  const toggleCollectionCollapse = (colId: string) => {
    setCollapsedCollections((prev) => ({
      ...prev,
      [colId]: !prev[colId],
    }));
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    try {
      await createCollection({
        name: newColName.trim(),
        description: newColDesc.trim() || undefined,
      });
      setIsCreateColOpen(false);
      setNewColName('');
      setNewColDesc('');
    } catch {
      // Error handled by store
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;

    if (renameTarget.type === 'collection') {
      await renameCollection(renameTarget.collectionId, renameValue.trim());
    } else if (renameTarget.requestId) {
      await renameRequest(
        renameTarget.collectionId,
        renameTarget.requestId,
        renameValue.trim()
      );
    }
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'collection') {
      await deleteCollection(deleteTarget.collectionId);
    } else if (deleteTarget.requestId) {
      await deleteRequest(deleteTarget.collectionId, deleteTarget.requestId);
    }
    setDeleteTarget(null);
  };

  const handleAddRequest = async (colId: string) => {
    const createdReq = await createRequest(colId, 'New Request', 'GET');
    openRequestTab(colId, createdReq);
  };

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

  if (isCollapsed) {
    return (
      <aside className="w-12 bg-bg-surface border-r border-border-default flex flex-col items-center py-2.5 justify-between flex-shrink-0 select-none">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => createScratchpadTab()}
            className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
            title="New Scratchpad"
            aria-label="New Scratchpad"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onToggle();
              setActiveTab('collections');
            }}
            className={`p-2 rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeTab === 'collections'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-card'
            }`}
            title="Collections"
            aria-label="View Collections"
          >
            <FolderArchive className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onToggle();
              setActiveTab('tabs');
            }}
            className={`p-2 rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeTab === 'tabs'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-card'
            }`}
            title="Active Tabs"
            aria-label="View Active Tabs"
          >
            <FileCode className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onToggle();
              setActiveTab('history');
            }}
            className={`p-2 rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
              activeTab === 'history'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-card'
            }`}
            title="Request History"
            aria-label="View Request History"
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-card rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
          title="Expand Sidebar"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-60 lg:w-64 bg-bg-surface border-r border-border-default flex flex-col h-full flex-shrink-0 select-none text-xs">
      {/* Top Action Bar */}
      <div className="p-2.5 border-b border-border-subtle flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => createScratchpadTab()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md shadow-xs transition-colors text-xs focus-visible:ring-1 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
          title="New Request Scratchpad"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Scratchpad</span>
        </button>
        <button
          type="button"
          onClick={() => setIsCreateColOpen(true)}
          className="p-1.5 bg-bg-card hover:bg-bg-overlay border border-border-subtle text-text-secondary hover:text-text-primary rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
          title="New Collection"
          aria-label="Create collection"
        >
          <FolderOpen className="w-4 h-4 text-blue-400" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-card rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
          title="Collapse Sidebar"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Sidebar Navigation Tabs */}
      <div className="flex items-center border-b border-border-subtle bg-bg-card/40 px-1.5 py-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('collections')}
          className={`flex-1 py-1 px-1.5 rounded font-medium text-xs text-center transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
            activeTab === 'collections'
              ? 'bg-bg-overlay text-text-primary shadow-xs'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Collections ({collections.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tabs')}
          className={`flex-1 py-1 px-1.5 rounded font-medium text-xs text-center transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
            activeTab === 'tabs'
              ? 'bg-bg-overlay text-text-primary shadow-xs'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Tabs ({tabs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-1 px-1.5 rounded font-medium text-xs text-center transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none ${
            activeTab === 'history'
              ? 'bg-bg-overlay text-text-primary shadow-xs'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          History
        </button>
      </div>

      {/* Diagnostics / Error Warning Banner */}
      {errors && errors.length > 0 && (
        <div
          onClick={() => setShowErrorModal(true)}
          className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors"
        >
          <div className="flex items-center gap-1.5 truncate">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {errors.length} file issue{errors.length > 1 ? 's' : ''} detected
            </span>
          </div>
          <span className="text-[10px] underline">View</span>
        </div>
      )}

      {/* Sidebar Tab Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* COLLECTIONS VIEW */}
        {activeTab === 'collections' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <span>Workspace Collections</span>
              <button
                type="button"
                onClick={() => loadWorkspace()}
                className="p-0.5 hover:text-text-primary rounded transition-colors"
                title="Reload from Disk"
                aria-label="Reload collections"
              >
                <RotateCw
                  className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {collections.length === 0 ? (
              /* Compact Empty Collection State */
              <div className="p-3 bg-bg-card/30 border border-border-subtle rounded-lg text-center space-y-2.5">
                <div className="flex items-center justify-center gap-1.5 text-text-muted">
                  <FolderOpen className="w-4 h-4 text-blue-400 opacity-70" />
                  <span className="text-xs font-medium text-text-secondary">
                    No collections yet
                  </span>
                </div>
                <p className="text-[11px] text-text-faint leading-relaxed">
                  Organize saved endpoints directly in{' '}
                  <code className="text-blue-400 font-mono">.piddi/</code>
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreateColOpen(true)}
                  className="w-full py-1.5 px-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-400 font-medium rounded-md text-xs transition-colors"
                >
                  + Create Collection
                </button>
              </div>
            ) : (
              collections.map((col) => {
                const isColCollapsed = collapsedCollections[col.id];
                return (
                  <div
                    key={col.id}
                    className="rounded-md border border-border-subtle/50 bg-bg-card/20 overflow-hidden"
                  >
                    {/* Collection Header Row */}
                    <div
                      className="group flex items-center justify-between px-2 py-1.5 hover:bg-bg-card cursor-pointer transition-colors"
                      onClick={() => toggleCollectionCollapse(col.id)}
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                        {isColCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        )}
                        <FolderArchive className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span
                          className="font-medium text-text-primary truncate"
                          title={col.name}
                        >
                          {col.name}
                        </span>
                        <span className="text-[10px] text-text-faint ml-0.5 flex-shrink-0">
                          ({col.requests.length})
                        </span>
                      </div>

                      {/* Collection Context Actions */}
                      <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddRequest(col.id);
                          }}
                          className="p-1 rounded hover:bg-bg-overlay text-text-muted hover:text-text-primary transition-colors"
                          title="Add Request"
                          aria-label={`Add request to ${col.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTarget({
                              type: 'collection',
                              collectionId: col.id,
                              currentName: col.name,
                            });
                            setRenameValue(col.name);
                          }}
                          className="p-1 rounded hover:bg-bg-overlay text-text-muted hover:text-text-primary transition-colors"
                          title="Rename Collection"
                          aria-label={`Rename collection ${col.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              type: 'collection',
                              collectionId: col.id,
                              name: col.name,
                            });
                          }}
                          className="p-1 rounded hover:bg-bg-overlay text-text-muted hover:text-rose-400 transition-colors"
                          title="Delete Collection"
                          aria-label={`Delete collection ${col.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Collection Requests List */}
                    {!isColCollapsed && (
                      <div className="pl-4 pr-1 py-1 space-y-0.5 border-t border-border-subtle/30 bg-bg-base/40">
                        {col.requests.length === 0 ? (
                          <div className="py-1.5 text-[11px] text-text-faint text-center">
                            <span>No requests. </span>
                            <button
                              type="button"
                              onClick={() => handleAddRequest(col.id)}
                              className="text-blue-400 hover:underline cursor-pointer"
                            >
                              Add one
                            </button>
                          </div>
                        ) : (
                          col.requests.map((req, reqIdx) => {
                            const isTabActive = tabs.some(
                              (t) =>
                                t.id === activeTabId && t.requestId === req.id
                            );
                            return (
                              <div
                                key={req.id || reqIdx}
                                onClick={() => openRequestTab(col.id, req)}
                                className={`group/req flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                                  isTabActive
                                    ? 'bg-bg-card text-text-primary font-medium border border-border-subtle/60'
                                    : 'text-text-secondary hover:bg-bg-card/50 hover:text-text-primary'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <span
                                    className={`font-mono text-[10px] font-bold flex-shrink-0 ${getMethodBadge(
                                      req.method
                                    )}`}
                                  >
                                    {req.method}
                                  </span>
                                  <span
                                    className="truncate text-xs"
                                    title={req.name || 'Untitled'}
                                  >
                                    {req.name || 'Untitled'}
                                  </span>
                                </div>

                                {/* Request Context Actions */}
                                <div className="opacity-0 group-hover/req:opacity-100 group-focus-within/req:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                                  {reqIdx > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        reorderRequests(
                                          col.id,
                                          reqIdx,
                                          reqIdx - 1
                                        );
                                      }}
                                      className="p-0.5 rounded hover:bg-bg-overlay text-text-muted hover:text-text-primary"
                                      title="Move Up"
                                      aria-label="Move request up"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                  )}
                                  {reqIdx < col.requests.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        reorderRequests(
                                          col.id,
                                          reqIdx,
                                          reqIdx + 1
                                        );
                                      }}
                                      className="p-0.5 rounded hover:bg-bg-overlay text-text-muted hover:text-text-primary"
                                      title="Move Down"
                                      aria-label="Move request down"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenameTarget({
                                        type: 'request',
                                        collectionId: col.id,
                                        requestId: req.id || undefined,
                                        currentName: req.name || 'Untitled',
                                      });
                                      setRenameValue(req.name || 'Untitled');
                                    }}
                                    className="p-0.5 rounded hover:bg-bg-overlay text-text-muted hover:text-text-primary"
                                    title="Rename Request"
                                    aria-label={`Rename request ${req.name}`}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (req.id) {
                                        setDeleteTarget({
                                          type: 'request',
                                          collectionId: col.id,
                                          requestId: req.id,
                                          name: req.name || 'Untitled',
                                        });
                                      }
                                    }}
                                    className="p-0.5 rounded hover:bg-bg-overlay text-text-muted hover:text-rose-400"
                                    title="Delete Request"
                                    aria-label={`Delete request ${req.name}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TABS VIEW */}
        {activeTab === 'tabs' && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Open Request Tabs
            </div>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                  tab.id === activeTabId
                    ? 'bg-bg-card text-text-primary font-medium border border-border-subtle'
                    : 'text-text-secondary hover:bg-bg-card/50 hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`font-mono text-[10px] font-bold ${getMethodBadge(
                      tab.request.method
                    )}`}
                  >
                    {tab.request.method}
                  </span>
                  <span className="truncate">{tab.name}</span>
                </div>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* HISTORY VIEW */}
        {activeTab === 'history' && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Search & Actions Bar */}
            <div className="p-1.5 border-b border-border-subtle flex items-center gap-1.5 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter history..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle rounded px-2.5 py-1 pl-8 text-xs text-text-primary placeholder:text-text-faint focus:border-blue-500 focus:outline-none font-sans"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchHistory()}
                className="p-1.5 hover:bg-bg-overlay text-text-muted hover:text-text-primary rounded transition-colors"
                title="Refresh history"
                aria-label="Refresh history"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 ${
                    isHistoryLoading ? 'animate-spin' : ''
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsClearHistoryOpen(true)}
                disabled={historyRecords.length === 0}
                className="p-1.5 hover:bg-rose-500/10 text-text-muted hover:text-rose-400 disabled:opacity-30 rounded transition-colors"
                title="Clear history"
                aria-label="Clear all history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center p-3 text-text-muted space-y-1.5">
                  <Clock className="w-6 h-6 opacity-30 text-text-muted" />
                  <h4 className="text-xs font-medium text-text-primary">
                    {historySearchQuery
                      ? 'No matching requests'
                      : 'No history yet'}
                  </h4>
                  <p className="text-[11px] text-text-faint">
                    {historySearchQuery
                      ? 'Try a different search query.'
                      : 'Executed requests appear here automatically.'}
                  </p>
                </div>
              ) : (
                filteredHistory.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => restoreRecord(rec)}
                    className="w-full text-left p-2 rounded-md hover:bg-bg-card border border-transparent hover:border-border-subtle transition-colors group space-y-1 cursor-pointer"
                    title={`Click to restore: ${rec.method} ${rec.url}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadge(
                          rec.status
                        )}`}
                      >
                        {rec.status || 'ERR'}
                      </span>
                      <span
                        className={`font-mono text-[10px] font-bold ${getMethodBadge(
                          rec.method
                        )}`}
                      >
                        {rec.method}
                      </span>
                      <span className="truncate text-text-primary text-[11px] font-medium flex-1">
                        {rec.url}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-text-muted pl-1">
                      <span className="font-mono">
                        {Math.round(rec.duration_ms)} ms
                      </span>
                      <span className="font-mono">
                        {formatSize(rec.size_bytes)}
                      </span>
                      <span>{formatTime(rec.timestamp)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {/* 1. Create Collection Modal */}
      <Modal
        isOpen={isCreateColOpen}
        onClose={() => setIsCreateColOpen(false)}
        title="Create New Collection"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateColOpen(false)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCollection}
              disabled={!newColName.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              Create
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateCollection} className="space-y-3">
          <div>
            <label className="block text-text-muted text-[11px] mb-1 font-medium">
              Collection Name *
            </label>
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="e.g. Authentication API"
              autoFocus
              className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs font-sans"
            />
          </div>
          <div>
            <label className="block text-text-muted text-[11px] mb-1 font-medium">
              Description (Optional)
            </label>
            <textarea
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
              placeholder="Brief summary of endpoints in this collection"
              rows={2}
              className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs resize-none font-sans"
            />
          </div>
        </form>
      </Modal>

      {/* 2. Rename Modal */}
      <Modal
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={
          renameTarget?.type === 'collection'
            ? 'Rename Collection'
            : 'Rename Request'
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRename}
              disabled={!renameValue.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              Save
            </button>
          </>
        }
      >
        <form onSubmit={handleRename} className="space-y-3">
          <div>
            <label className="block text-text-muted text-[11px] mb-1 font-medium">
              New Name *
            </label>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="w-full px-2.5 py-1.5 bg-bg-darkest border border-border-default rounded-md text-text-primary focus:outline-none focus:border-blue-500 text-xs font-sans"
            />
          </div>
        </form>
      </Modal>

      {/* 3. Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={
          deleteTarget?.type === 'collection'
            ? 'Delete Collection'
            : 'Delete Request'
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-medium transition-colors"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-xs text-text-secondary">
          Are you sure you want to delete{' '}
          <strong className="text-text-primary">{deleteTarget?.name}</strong>?
          {deleteTarget?.type === 'collection' &&
            ' This will remove the collection file from .piddi/collections/.'}
        </p>
      </Modal>

      {/* 4. Diagnostics & File Errors Modal */}
      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Workspace File Diagnostics"
        footer={
          <button
            type="button"
            onClick={() => setShowErrorModal(false)}
            className="px-3 py-1.5 bg-bg-card hover:bg-bg-overlay text-text-primary border border-border-subtle rounded-md transition-colors"
          >
            Close
          </button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            The following files in{' '}
            <code className="text-blue-400">.piddi/collections/</code> could not
            be loaded cleanly. Valid collections were loaded normally without
            crashing.
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {errors.map((err, i) => (
              <div
                key={i}
                className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-md space-y-1"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-rose-400 font-semibold">
                  <span>{err.file}</span>
                  <span className="px-1.5 py-0.5 bg-rose-500/20 rounded text-[10px]">
                    {err.code}
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary">{err.error}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* 5. Clear History Confirmation Modal */}
      <Modal
        isOpen={isClearHistoryOpen}
        onClose={() => setIsClearHistoryOpen(false)}
        title="Clear Request History"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsClearHistoryOpen(false)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-overlay rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearHistoryConfirm}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-medium transition-colors"
            >
              Clear All History
            </button>
          </>
        }
      >
        <p className="text-xs text-text-secondary">
          Are you sure you want to clear your entire request history? This will
          permanently delete all records from{' '}
          <code className="text-purple-400">~/.piddi/history.jsonl</code>.
        </p>
      </Modal>
    </aside>
  );
};

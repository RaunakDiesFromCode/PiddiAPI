import React, { useEffect, useState, useCallback } from 'react';
import { useRequestStore } from './store/useRequestStore';
import { useWorkspaceStore } from './store/useWorkspaceStore';
import { useEnvironmentStore } from './store/useEnvironmentStore';
import { apiClient } from './api/client';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SplitPane } from './components/layout/SplitPane';
import { Footer } from './components/layout/Footer';
import { RequestBuilder } from './components/request/RequestBuilder';
import { ResponseViewer } from './components/response/ResponseViewer';
import { ShortcutsModal } from './components/common/ShortcutsModal';
import { EnvironmentModal } from './components/environment/EnvironmentModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const {
    tabs,
    activeTabId,
    createScratchpadTab,
    closeTab,
    sendActiveRequest,
    saveActiveTab,
    engineConnected,
    setEngineConnected,
    setWorkspaceInfo,
  } = useRequestStore();

  const { loadWorkspace } = useWorkspaceStore();
  const {
    loadEnvironments,
    loadPreferences,
  } = useEnvironmentStore();

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Initialize and periodically poll backend engine health, workspace, and environments
  const checkEngineHealth = useCallback(async () => {
    try {
      const info = await apiClient.checkHealth();
      setWorkspaceInfo(info);
      setEngineConnected(true);
    } catch {
      setEngineConnected(false);
    }
  }, [setEngineConnected, setWorkspaceInfo]);

  useEffect(() => {
    checkEngineHealth();
    const interval = setInterval(checkEngineHealth, 10000);
    return () => clearInterval(interval);
  }, [checkEngineHealth]);

  useEffect(() => {
    if (engineConnected) {
      loadWorkspace().catch(() => {});
      loadEnvironments().catch(() => {});
      loadPreferences().catch(() => {});
    }
  }, [engineConnected, loadWorkspace, loadEnvironments, loadPreferences]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const targetEl = e.target instanceof Element ? e.target : null;
      const isInsideEditable = targetEl
        ? ['INPUT', 'TEXTAREA'].includes(targetEl.tagName) || !!targetEl.closest('.cm-editor')
        : false;

      // 1. Cmd+Enter / Ctrl+Enter -> Send active request
      if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        sendActiveRequest();
        return;
      }

      // 2. Piddi Application Shortcuts (designed to avoid browser-reserved collisions)
      // 2a. Cmd+Shift+N / Ctrl+Shift+N -> New scratchpad tab
      if (isCmdOrCtrl && isShift && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        createScratchpadTab();
        return;
      }

      // 2b. Cmd+Shift+W / Ctrl+Shift+W -> Close active tab
      if (isCmdOrCtrl && isShift && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      // 2c. Cmd+Shift+S / Ctrl+Shift+S -> Save active request
      if (isCmdOrCtrl && isShift && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveActiveTab();
        return;
      }

      // 2d. Cmd+Shift+K / Ctrl+Shift+K -> Command Palette
      if (isCmdOrCtrl && isShift && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // 2e. Cmd+Shift+B / Ctrl+Shift+B -> Toggle sidebar
      if (isCmdOrCtrl && isShift && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }

      // 3. Browser-Reserved Shortcuts (Best-Effort when delivered by the host browser)
      // 3a. Cmd+T / Ctrl+T -> New scratchpad tab
      if (isCmdOrCtrl && !isShift && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        createScratchpadTab();
        return;
      }

      // 3b. Cmd+W / Ctrl+W -> Close active tab
      if (isCmdOrCtrl && !isShift && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      // 3c. Cmd+S / Ctrl+S -> Save active request
      if (isCmdOrCtrl && !isShift && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveActiveTab();
        return;
      }

      // 3d. Cmd+K / Ctrl+K -> Command Palette
      if (isCmdOrCtrl && !isShift && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // 3e. Cmd+B / Ctrl+B -> Toggle sidebar
      if (isCmdOrCtrl && !isShift && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }

      // 4. ? -> Shortcuts modal (when not inside an input, textarea, or codemirror)
      if (e.key === '?' && !isInsideEditable) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTabId,
    closeTab,
    createScratchpadTab,
    saveActiveTab,
    sendActiveRequest,
  ]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-base text-text-primary">
      {/* Top Application Header */}
      <Header
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Resizable Request / Response Split Pane */}
        <SplitPane
          left={<RequestBuilder />}
          right={
            <ResponseViewer
              response={currentTab.response}
              isLoading={currentTab.isLoading}
              error={currentTab.error}
              onSend={sendActiveRequest}
            />
          }
        />
      </div>

      {/* Bottom Status Footer */}
      <Footer />

      {/* Environment Manager Modal */}
      <EnvironmentModal />

      {/* Shortcuts Help Modal */}
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Command Palette Modal */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenShortcuts={() => {
          setCommandPaletteOpen(false);
          setShortcutsOpen(true);
        }}
        onOpenImportCurl={() => {
          setCommandPaletteOpen(false);
        }}
        onOpenSnippet={() => {
          setCommandPaletteOpen(false);
        }}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        onOpenHistory={() => {
          setSidebarCollapsed(false);
        }}
      />
    </div>
  );
};

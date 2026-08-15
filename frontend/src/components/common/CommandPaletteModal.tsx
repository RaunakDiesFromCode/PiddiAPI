import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Send,
  Plus,
  Save,
  X,
  PanelLeft,
  Layers,
  History,
  FileCode,
  Code,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { useRequestStore } from '../../store/useRequestStore';
import { useEnvironmentStore } from '../../store/useEnvironmentStore';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
  onOpenImportCurl: () => void;
  onOpenSnippet: () => void;
  onToggleSidebar: () => void;
  onOpenHistory: () => void;
  onFormatJson?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Request' | 'Navigation' | 'Environment' | 'Tools' | 'Help';
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onOpenShortcuts,
  onOpenImportCurl,
  onOpenSnippet,
  onToggleSidebar,
  onOpenHistory,
  onFormatJson,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    activeTabId,
    sendActiveRequest,
    saveActiveTab,
    createScratchpadTab,
    closeTab,
  } = useRequestStore();

  const { environments, setActiveEnvironment, openManager } = useEnvironmentStore();

  // Assemble commands directly referencing existing store actions
  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: 'send-request',
        title: 'Send Active Request',
        category: 'Request',
        shortcut: '⌘↵ / Ctrl+↵',
        icon: <Send className="w-4 h-4 text-blue-400" />,
        action: () => {
          sendActiveRequest();
        },
      },
      {
        id: 'new-scratchpad',
        title: 'New Scratchpad Tab',
        category: 'Request',
        shortcut: '⌘⇧N / Ctrl+⇧+N',
        icon: <Plus className="w-4 h-4 text-emerald-400" />,
        action: () => {
          createScratchpadTab();
        },
      },
      {
        id: 'save-request',
        title: 'Save Active Request',
        category: 'Request',
        shortcut: '⌘⇧S / Ctrl+⇧+S',
        icon: <Save className="w-4 h-4 text-amber-400" />,
        action: () => {
          saveActiveTab();
        },
      },
      {
        id: 'close-request',
        title: 'Close Active Tab',
        category: 'Request',
        shortcut: '⌘⇧W / Ctrl+⇧+W',
        icon: <X className="w-4 h-4 text-rose-400" />,
        action: () => {
          if (activeTabId) {
            closeTab(activeTabId);
          }
        },
      },
      {
        id: 'toggle-sidebar',
        title: 'Toggle Navigation Sidebar',
        category: 'Navigation',
        shortcut: '⌘⇧B / Ctrl+⇧+B',
        icon: <PanelLeft className="w-4 h-4 text-text-muted" />,
        action: onToggleSidebar,
      },
      {
        id: 'open-history',
        title: 'View Request History',
        category: 'Navigation',
        icon: <History className="w-4 h-4 text-text-muted" />,
        action: onOpenHistory,
      },
      {
        id: 'manage-environments',
        title: 'Manage Environments & Secrets Vault',
        category: 'Environment',
        icon: <Layers className="w-4 h-4 text-purple-400" />,
        action: () => {
          openManager();
        },
      },
      {
        id: 'env-none',
        title: 'Set Environment: No Environment',
        category: 'Environment',
        icon: <Layers className="w-4 h-4 text-text-faint" />,
        action: () => {
          setActiveEnvironment(null);
        },
      },
      ...environments.map((env) => ({
        id: `env-${env.id}`,
        title: `Switch Environment: ${env.name}`,
        category: 'Environment' as const,
        icon: <Layers className="w-4 h-4 text-purple-400" />,
        action: () => {
          setActiveEnvironment(env.id);
        },
      })),
      {
        id: 'import-curl',
        title: 'Import cURL Command',
        category: 'Tools',
        icon: <FileCode className="w-4 h-4 text-text-muted" />,
        action: onOpenImportCurl,
      },
      {
        id: 'generate-snippet',
        title: 'Generate Code Snippets (Python / JS / cURL)',
        category: 'Tools',
        icon: <Code className="w-4 h-4 text-text-muted" />,
        action: onOpenSnippet,
      },
      ...(onFormatJson
        ? [
            {
              id: 'format-json',
              title: 'Format / Prettify JSON Body',
              category: 'Tools' as const,
              icon: <Sparkles className="w-4 h-4 text-amber-400" />,
              action: onFormatJson,
            },
          ]
        : []),
      {
        id: 'shortcuts-help',
        title: 'Keyboard Shortcuts Reference',
        category: 'Help',
        shortcut: '?',
        icon: <HelpCircle className="w-4 h-4 text-text-muted" />,
        action: onOpenShortcuts,
      },
    ];
    return list;
  }, [
    sendActiveRequest,
    createScratchpadTab,
    saveActiveTab,
    closeTab,
    activeTabId,
    onToggleSidebar,
    onOpenHistory,
    openManager,
    environments,
    setActiveEnvironment,
    onOpenImportCurl,
    onOpenSnippet,
    onFormatJson,
    onOpenShortcuts,
  ]);

  // Filter commands by search term
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Window Escape key handling
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-surface border border-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans text-xs"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center px-3.5 py-3 border-b border-border-subtle bg-bg-card/40 gap-2.5">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="command-palette-title"
            placeholder="Type a command or search actions (e.g. send, new, save, env)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-text-primary placeholder:text-text-faint text-xs focus:outline-none font-sans"
            aria-label="Command palette input"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-text-faint bg-bg-darkest border border-border-default rounded flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div
          ref={listRef}
          className="max-h-[320px] overflow-y-auto p-1.5 divide-y divide-transparent space-y-0.5"
          role="listbox"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-text-muted space-y-1">
              <p className="text-xs font-medium text-text-secondary">No matching commands</p>
              <p className="text-[11px] text-text-faint">Try searching for &quot;send&quot;, &quot;new&quot;, &quot;save&quot;, or &quot;env&quot;</p>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/15 text-text-primary font-medium'
                      : 'text-text-secondary hover:bg-bg-card'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex-shrink-0">{cmd.icon}</span>
                    <span className="truncate">{cmd.title}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-[10px] font-medium text-text-faint uppercase tracking-wider">
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-bg-darkest text-text-muted border border-border-subtle rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-3.5 py-2 border-t border-border-subtle bg-bg-card/20 flex items-center justify-between text-[11px] text-text-faint select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono text-[10px] text-text-muted">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono text-[10px] text-text-muted">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono text-[10px] text-text-muted">esc</kbd> close
            </span>
          </div>
          <span>Piddi Quick Actions</span>
        </div>
      </div>
    </div>
  );
};

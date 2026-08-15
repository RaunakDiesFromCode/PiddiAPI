import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  WifiOff,
  HelpCircle,
  Layers,
  ChevronDown,
  Check,
  Plus,
  Globe,
  Search,
} from 'lucide-react';
import { useRequestStore } from '../../store/useRequestStore';
import { useEnvironmentStore } from '../../store/useEnvironmentStore';
import { apiClient } from '../../api/client';

interface HeaderProps {
  onOpenShortcuts: () => void;
  onOpenCommandPalette?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenShortcuts,
  onOpenCommandPalette = () => {},
}) => {
  const { engineConnected, workspaceInfo, setEngineConnected, setWorkspaceInfo } =
    useRequestStore();
  const {
    environments,
    activeEnvironmentId,
    setActiveEnvironment,
    openManager,
  } = useEnvironmentStore();

  const [isEnvDropdownOpen, setIsEnvDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || null;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsEnvDropdownOpen(false);
      }
    };
    if (isEnvDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isEnvDropdownOpen]);

  const handleRetryHealth = async () => {
    try {
      const info = await apiClient.checkHealth();
      setWorkspaceInfo(info);
      setEngineConnected(true);
    } catch {
      setEngineConnected(false);
    }
  };

  return (
    <header className="h-12 border-b border-border-default bg-bg-surface px-3 sm:px-4 flex items-center justify-between flex-shrink-0 select-none">
      {/* Left: Brand & Workspace */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono font-bold text-sm">
            π
          </div>
          <span className="font-bold text-sm tracking-tight text-text-primary">
            PiddiAPI
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-bg-card border border-border-default rounded text-text-muted hidden sm:inline-block">
            v0.1.0
          </span>
        </div>

        {/* Workspace Path Indicator */}
        <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-border-subtle text-xs text-text-muted min-w-0">
          <Folder className="w-3.5 h-3.5 text-text-faint flex-shrink-0" />
          <span className="text-text-faint flex-shrink-0">Workspace:</span>
          <span
            className="font-mono text-text-secondary truncate max-w-xs"
            title={workspaceInfo?.workspace_path || 'Local Directory'}
          >
            {workspaceInfo?.workspace_path
              ? workspaceInfo.workspace_path.split('/').slice(-2).join('/')
              : 'Local Workspace'}
          </span>
        </div>
      </div>

      {/* Right: Quick Actions & Status */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        {/* Command Palette Trigger Button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-card hover:bg-bg-overlay border border-border-default hover:border-blue-500/40 rounded-md text-xs text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
          title={`Command Palette (${isMac ? '⌘K' : 'Ctrl+K'})`}
          aria-label="Open command palette"
        >
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <span className="hidden sm:inline font-medium">Commands</span>
          <kbd className="hidden lg:inline-block text-[10px] font-mono text-text-faint bg-bg-darkest px-1 py-0.2 rounded border border-border-subtle ml-1">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>

        {/* Environment Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsEnvDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-md text-xs transition-colors focus-visible:ring-1 focus-visible:ring-purple-500 focus-visible:outline-none cursor-pointer ${
              activeEnv
                ? 'bg-purple-950/30 border-purple-500/40 text-purple-300 hover:border-purple-400'
                : 'bg-bg-card border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong'
            }`}
            title="Switch Environment"
            aria-label="Select environment"
            aria-expanded={isEnvDropdownOpen}
          >
            <Layers
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                activeEnv ? 'text-purple-400' : 'text-text-muted'
              }`}
            />
            <span className="font-medium max-w-[120px] sm:max-w-[150px] truncate">
              {activeEnv ? activeEnv.name : 'No Environment'}
            </span>
            <ChevronDown className="w-3 h-3 text-text-muted ml-0.5 flex-shrink-0" />
          </button>

          {isEnvDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-bg-surface border border-border-strong rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100 font-sans text-xs">
              <div className="px-3 py-1.5 border-b border-border-subtle text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
                <span>Environments</span>
                <span className="text-[10px] font-normal text-text-faint font-mono">
                  {environments.length} available
                </span>
              </div>

              {/* No Environment option */}
              <button
                type="button"
                onClick={() => {
                  setActiveEnvironment(null);
                  setIsEnvDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-bg-card transition-colors cursor-pointer ${
                  activeEnvironmentId === null
                    ? 'text-purple-300 font-medium bg-purple-500/10'
                    : 'text-text-secondary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-border-default" />
                  <span>No Environment</span>
                </div>
                {activeEnvironmentId === null && (
                  <Check className="w-3.5 h-3.5 text-purple-400" />
                )}
              </button>

              {/* Environment items */}
              {environments.map((env) => {
                const isActive = env.id === activeEnvironmentId;
                return (
                  <button
                    key={env.id}
                    type="button"
                    onClick={() => {
                      setActiveEnvironment(env.id);
                      setIsEnvDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-bg-card transition-colors cursor-pointer ${
                      isActive
                        ? 'text-purple-300 font-medium bg-purple-500/10'
                        : 'text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <Globe
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isActive ? 'text-purple-400' : 'text-text-muted'
                        }`}
                      />
                      <span className="truncate">{env.name}</span>
                    </div>
                    {isActive && (
                      <Check className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}

              <div className="border-t border-border-subtle my-1" />

              {/* Manage Environments */}
              <button
                type="button"
                onClick={() => {
                  setIsEnvDropdownOpen(false);
                  openManager();
                }}
                className="w-full px-3 py-2 flex items-center gap-2 text-left text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manage Environments...</span>
              </button>
            </div>
          )}
        </div>

        {/* Backend Engine Live Status */}
        <button
          type="button"
          onClick={handleRetryHealth}
          className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 rounded-md text-xs font-medium border transition-colors focus-visible:ring-1 focus-visible:ring-emerald-500 focus-visible:outline-none ${
            engineConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20 cursor-pointer'
          }`}
          title={
            engineConnected
              ? 'Backend engine is healthy and online (127.0.0.1)'
              : 'Backend engine offline — click to retry connection'
          }
          aria-label={engineConnected ? 'Engine Online' : 'Engine Offline - Click to retry'}
        >
          {engineConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Engine Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Offline</span>
            </>
          )}
        </button>

        {/* Shortcuts Help Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-card rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
          title="Keyboard Shortcuts (?)"
          aria-label="View keyboard shortcuts"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

import React from 'react';
import { Terminal, ShieldCheck, Cpu } from 'lucide-react';
import { useRequestStore } from '../../store/useRequestStore';

export const Footer: React.FC = () => {
  const { engineConnected, workspaceInfo } = useRequestStore();

  const port = workspaceInfo?.port || 4111;
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

  const modKey = isMac ? '⌘' : 'Ctrl+';

  return (
    <footer className="h-7 border-t border-border-default bg-bg-surface px-3 flex items-center justify-between text-[11px] text-text-muted flex-shrink-0 select-none">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-1.5 font-mono truncate">
          <Terminal className="w-3 h-3 text-text-faint flex-shrink-0" />
          <span className="text-text-faint hidden xs:inline">Engine:</span>
          <span className={engineConnected ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
            127.0.0.1:{port}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-text-faint">
          <ShieldCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />
          <span>Loopback Protected (Token Verified)</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 font-mono text-[10px] text-text-faint">
          <span>{modKey}↵ Send</span>
          <span>•</span>
          <span>{modKey}K Commands</span>
          <span>•</span>
          <span>? Shortcuts</span>
        </div>
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-text-faint flex-shrink-0" />
          <span className="font-mono text-text-muted">v0.1.0</span>
        </div>
      </div>
    </footer>
  );
};

import React, { useEffect } from 'react';
import { X, Command, AlertCircle } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

  const modKey = isMac ? '⌘' : 'Ctrl';

  const piddiShortcuts: ShortcutEntry[] = [
    { keys: [modKey, 'Shift', 'N'], description: 'Open new request scratchpad tab' },
    { keys: [modKey, 'Shift', 'W'], description: 'Close active request tab' },
    { keys: [modKey, 'Enter'], description: 'Send active HTTP request' },
    { keys: [modKey, 'Shift', 'S'], description: 'Save current request to collection' },
    { keys: [modKey, 'Shift', 'K'], description: 'Open Command Palette' },
    { keys: [modKey, 'Shift', 'B'], description: 'Toggle navigation sidebar' },
    { keys: ['?'], description: 'Open keyboard shortcuts reference' },
    { keys: ['Esc'], description: 'Close active modal / dialog' },
  ];

  const browserReservedShortcuts: ShortcutEntry[] = [
    { keys: [modKey, 'T'], description: 'New Scratchpad Tab (Browser-Reserved: may open new browser tab)' },
    { keys: [modKey, 'W'], description: 'Close Active Tab (Browser-Reserved: may close browser tab)' },
    { keys: [modKey, 'S'], description: 'Save Request (Browser-Reserved: may trigger browser save dialog)' },
    { keys: [modKey, 'K'], description: 'Command Palette / Search (Browser-Reserved: may focus browser URL bar)' },
    { keys: [modKey, 'B'], description: 'Toggle Sidebar (Browser-Reserved: may toggle browser bookmarks)' },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-surface border border-border-strong rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-bg-card/50 flex-shrink-0">
          <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
            <Command className="w-4 h-4 text-blue-400" />
            <span id="shortcuts-title">Keyboard Shortcuts</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-bg-overlay transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto text-xs">
          {/* Notice */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-text-secondary flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              All actions are accessible via visible UI buttons. Shortcuts below provide power-user speed.
            </p>
          </div>

          {/* 1. Piddi Application Shortcuts */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-text-primary uppercase tracking-wider">
              Piddi Application Shortcuts
            </div>
            <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg overflow-hidden bg-bg-card/20">
              {piddiShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-bg-card/40 transition-colors"
                >
                  <span className="text-text-secondary">{item.description}</span>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    {item.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-1.5 py-0.5 text-[11px] font-mono bg-bg-darkest text-text-primary border border-border-strong rounded shadow-xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Browser-Reserved Shortcuts (Best-Effort) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                Browser-Reserved Shortcuts (Best-Effort)
              </span>
              <span className="text-[10px] text-amber-400/90 font-mono">May be intercepted</span>
            </div>
            <p className="text-[11px] text-text-faint leading-relaxed">
              Web browsers may intercept standard browser keys before delivering them to Piddi. When delivered, Piddi prevents the default browser action and executes the command.
            </p>
            <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg overflow-hidden bg-bg-card/20">
              {browserReservedShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-bg-card/40 transition-colors"
                >
                  <span className="text-text-muted">{item.description}</span>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    {item.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-1.5 py-0.5 text-[11px] font-mono bg-bg-darkest text-text-muted border border-border-subtle rounded"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-bg-card/40 border-t border-border-subtle flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-text-primary bg-bg-card hover:bg-bg-overlay border border-border-default rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

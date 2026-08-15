import React, { useState } from 'react';
import { Copy, Check, Search } from 'lucide-react';

interface ResponseHeadersProps {
  headers: Record<string, string>;
}

export const ResponseHeaders: React.FC<ResponseHeadersProps> = ({ headers }) => {
  const [filter, setFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const headerEntries = Object.entries(headers);
  const filtered = headerEntries.filter(
    ([k, v]) =>
      k.toLowerCase().includes(filter.toLowerCase()) || v.toLowerCase().includes(filter.toLowerCase())
  );

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(`${key}: ${value}`);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  if (headerEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-muted select-none">
        No response headers received.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      <div className="p-2 border-b border-border-subtle bg-bg-card/30 flex items-center justify-between gap-2 select-none">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={filter}
            placeholder="Filter headers..."
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter headers"
            className="w-full bg-bg-darkest border border-border-default rounded-md pl-8 pr-3 py-1 text-xs text-text-primary placeholder:text-text-faint focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <span className="text-text-faint text-[11px] font-mono">
          {filtered.length} of {headerEntries.length} header(s)
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-card/60 text-text-muted font-medium sticky top-0 select-none">
              <th className="px-3 py-2 font-medium w-1/3 min-w-[140px]">Header Name</th>
              <th className="px-3 py-2 font-medium min-w-[200px]">Value</th>
              <th className="w-10 px-2 py-2 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle font-mono text-[12px]">
            {filtered.map(([k, v]) => (
              <tr key={k} className="group hover:bg-bg-card/40 transition-colors">
                <td className="px-3 py-1.5 text-text-secondary font-medium select-all break-all">{k}</td>
                <td className="px-3 py-1.5 text-text-primary break-all select-all">{v}</td>
                <td className="w-10 px-2 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleCopy(k, v)}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 text-text-muted hover:text-text-primary p-1 rounded hover:bg-bg-overlay transition-opacity focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
                    title="Copy Header"
                    aria-label={`Copy header ${k}`}
                  >
                    {copiedKey === k ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

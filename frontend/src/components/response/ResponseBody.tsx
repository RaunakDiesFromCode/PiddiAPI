import React, { useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';
import { CodeEditor } from '../common/CodeEditor';

interface ResponseBodyProps {
  body: string;
  contentType: string;
  isTruncated: boolean;
  tempFilePath?: string | null;
}

export const ResponseBody: React.FC<ResponseBodyProps> = ({
  body,
  contentType,
  isTruncated,
  tempFilePath,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  const isJson = contentType.toLowerCase().includes('json');

  let formattedJson = body;
  if (isJson && viewMode === 'formatted') {
    try {
      const parsed = JSON.parse(body);
      formattedJson = JSON.stringify(parsed, null, 2);
    } catch {
      formattedJson = body;
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Response body top toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-bg-card/40 flex-shrink-0 text-xs select-none">
        <div className="flex items-center gap-1.5">
          {isJson && (
            <div className="flex items-center bg-bg-darkest p-0.5 rounded border border-border-subtle">
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
                  viewMode === 'formatted'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
                  viewMode === 'raw'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Raw
              </button>
            </div>
          )}
          <span className="text-text-faint text-[11px] font-mono">{contentType || 'text/plain'}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs text-text-muted hover:text-text-primary bg-bg-surface hover:bg-bg-overlay border border-border-default rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
          title="Copy response body"
          aria-label="Copy response body"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-text-muted" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Body content */}
      <div className="flex-1 min-h-0 p-1.5 overflow-hidden">
        {isTruncated ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 bg-bg-card/20 rounded border border-border-subtle">
            <FileText className="w-9 h-9 text-amber-400" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Response Payload Exceeds 10MB</h4>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                The full response stream was captured and written directly to disk to preserve browser performance.
              </p>
            </div>
            {tempFilePath && (
              <div className="bg-bg-darkest p-2 rounded border border-border-default font-mono text-[11px] text-text-secondary max-w-lg truncate">
                Saved at: {tempFilePath}
              </div>
            )}
          </div>
        ) : (
          <CodeEditor
            value={viewMode === 'formatted' ? formattedJson : body}
            language={isJson && viewMode === 'formatted' ? 'json' : 'raw'}
            readOnly={true}
          />
        )}
      </div>
    </div>
  );
};

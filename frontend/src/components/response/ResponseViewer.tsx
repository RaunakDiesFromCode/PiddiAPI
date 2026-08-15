import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Database,
  Loader2,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useRequestStore } from '../../store/useRequestStore';
import { CanonicalResponseModel } from '../../types';
import { generateCurlSnippet } from '../../utils/snippetGenerator';
import { ResponseBody } from './ResponseBody';
import { ResponseCookies } from './ResponseCookies';
import { ResponseHeaders } from './ResponseHeaders';
import { ResponseTiming } from './ResponseTiming';

interface ResponseViewerProps {
  response: CanonicalResponseModel | null;
  isLoading: boolean;
  error: string | null;
  onSend: () => void;
}

type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing';

export const ResponseViewer: React.FC<ResponseViewerProps> = ({
  response,
  isLoading,
  error,
  onSend,
}) => {
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const { tabs, activeTabId } = useRequestStore();
  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
    if (status >= 300 && status < 400) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    if (status >= 400 && status < 500) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
    if (status >= 500) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
    return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-3 p-6 bg-bg-base select-none">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <div className="text-center space-y-1">
          <h3 className="text-xs font-semibold text-text-primary">Executing HTTP Request...</h3>
          <p className="text-[11px] text-text-faint">Waiting for dispatcher response</p>
        </div>
      </div>
    );
  }

  // Execution Error (Client / Store failed before response)
  if (error && !response) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-rose-400 space-y-3 p-6 bg-bg-base select-none">
        <ShieldAlert className="w-9 h-9 text-rose-400" />
        <div className="text-center space-y-1">
          <h3 className="text-xs font-semibold text-text-primary">Execution Error</h3>
          <p className="text-[11px] text-rose-300 max-w-md font-mono">{error}</p>
        </div>
      </div>
    );
  }

  // Empty State (No request executed yet)
  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-3 p-6 bg-bg-base select-none text-center">
        <div className="w-10 h-10 rounded-full bg-bg-card border border-border-default flex items-center justify-center text-text-faint">
          <Send className="w-4 h-4 translate-x-0.5 -translate-y-0.5 text-blue-400/80" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h3 className="text-xs font-semibold text-text-primary">No Response Yet</h3>
          <p className="text-[11px] text-text-muted">
            Enter a destination URL and click Send to execute your request.
          </p>
        </div>
        <button
          type="button"
          onClick={onSend}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 rounded-md transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Request</span>
        </button>
      </div>
    );
  }

  const headerCount = Object.keys(response.headers || {}).length;
  const cookieCount = Object.keys(response.cookies || {}).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-base text-xs">
      {/* Response Status Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-border-subtle bg-bg-surface gap-2 flex-shrink-0 select-none">
        {/* Left Status Metrics */}
        <div className="flex items-center gap-2.5">
          {response.status > 0 ? (
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono font-bold text-xs ${getStatusColor(
                response.status
              )}`}
            >
              <span>{response.status}</span>
              <span>{response.status_text}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono font-bold text-xs bg-rose-500/10 text-rose-400 border-rose-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{response.error?.code || 'ERROR'}</span>
            </div>
          )}

          {response.duration_ms > 0 && (
            <div className="flex items-center gap-1 text-text-secondary text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              <span>{response.duration_ms} ms</span>
            </div>
          )}

          {response.size_bytes > 0 && (
            <div className="flex items-center gap-1 text-text-secondary text-xs font-mono">
              <Database className="w-3.5 h-3.5 text-text-muted" />
              <span>{formatBytes(response.size_bytes)}</span>
            </div>
          )}
        </div>

        {/* Right Sub-Tabs & Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('body')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
              activeTab === 'body'
                ? 'bg-bg-overlay text-text-primary border border-border-default shadow-xs'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
              activeTab === 'headers'
                ? 'bg-bg-overlay text-text-primary border border-border-default shadow-xs'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Headers <span className="text-text-faint text-[10px]">({headerCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cookies')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
              activeTab === 'cookies'
                ? 'bg-bg-overlay text-text-primary border border-border-default shadow-xs'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Cookies <span className="text-text-faint text-[10px]">({cookieCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timing')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
              activeTab === 'timing'
                ? 'bg-bg-overlay text-text-primary border border-border-default shadow-xs'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Timing
          </button>

          <div className="h-3.5 w-px bg-border-subtle mx-1" />

          {/* Quick Copy as cURL Action */}
          <button
            type="button"
            onClick={async () => {
              if (currentTab?.request) {
                try {
                  const curlCmd = generateCurlSnippet(currentTab.request);
                  await navigator.clipboard.writeText(curlCmd);
                  setCopiedCurl(true);
                  setTimeout(() => setCopiedCurl(false), 2000);
                } catch {
                  // ignore
                }
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
              copiedCurl
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-bg-card hover:bg-bg-overlay text-text-secondary hover:text-text-primary border-border-subtle'
            }`}
            title="Copy current request as cURL command"
            aria-label="Copy request as cURL"
          >
            {copiedCurl ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-text-muted" />
                <span>cURL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Structured Error Banner if Request Failed */}
      {response.error && (
        <div className="m-2.5 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 space-y-1 flex-shrink-0">
          <div className="flex items-center gap-2 font-semibold text-xs text-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{response.error.code}</span>
          </div>
          <p className="text-xs leading-relaxed">{response.error.message}</p>
          {response.error.details && (
            <p className="text-[11px] text-rose-400/80 font-mono break-all">{response.error.details}</p>
          )}
        </div>
      )}

      {/* Main Response Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'body' && (
          <ResponseBody
            body={response.body}
            contentType={response.content_type}
            isTruncated={response.is_truncated}
            tempFilePath={response.temp_file_path}
          />
        )}
        {activeTab === 'headers' && <ResponseHeaders headers={response.headers} />}
        {activeTab === 'cookies' && <ResponseCookies cookies={response.cookies} />}
        {activeTab === 'timing' && (
          <ResponseTiming timing={response.timing} durationMs={response.duration_ms} />
        )}
      </div>
    </div>
  );
};

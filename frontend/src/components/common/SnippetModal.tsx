import { Check, Copy } from 'lucide-react';
import React, { useState } from 'react';
import { CanonicalRequestModel } from '../../types';
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generateHttpxSnippet,
} from '../../utils/snippetGenerator';
import { Modal } from './Modal';


interface SnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: CanonicalRequestModel;
}

type SnippetLang = 'curl' | 'fetch' | 'httpx';

export const SnippetModal: React.FC<SnippetModalProps> = ({
  isOpen,
  onClose,
  request,
}) => {
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState(false);

  const getCode = () => {
    switch (lang) {
      case 'curl':
        return generateCurlSnippet(request);
      case 'fetch':
        return generateFetchSnippet(request);
      case 'httpx':
        return generateHttpxSnippet(request);
      default:
        return '';
    }
  };

  const code = getCode();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Code Snippet"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-text-muted">
            Code snippets reflect current draft values.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-bg-card hover:bg-bg-overlay text-text-primary border border-border-subtle rounded-md text-xs transition-colors"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Language Selector Bar */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <div className="flex items-center gap-1 bg-bg-darkest p-0.5 rounded-md border border-border-subtle">
            <button
              type="button"
              onClick={() => setLang('curl')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                lang === 'curl'
                  ? 'bg-blue-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              cURL
            </button>
            <button
              type="button"
              onClick={() => setLang('fetch')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                lang === 'fetch'
                  ? 'bg-blue-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              JavaScript (Fetch)
            </button>
            <button
              type="button"
              onClick={() => setLang('httpx')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                lang === 'httpx'
                  ? 'bg-blue-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Python (HTTPX)
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors border ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-bg-card hover:bg-bg-overlay text-text-primary border-border-subtle'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Code Display Area */}
        <div className="relative">
          <pre className="p-3 bg-bg-darkest border border-border-subtle rounded-md font-mono text-xs text-text-primary overflow-x-auto max-h-80 leading-relaxed select-all">
            {code}
          </pre>
        </div>
      </div>
    </Modal>
  );
};

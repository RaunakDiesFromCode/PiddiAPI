import React from 'react';
import { Sliders, Clock, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import { RequestSettings } from '../../types';

interface SettingsEditorProps {
  settings: RequestSettings;
  onChange: (settings: RequestSettings) => void;
}

export const SettingsEditor: React.FC<SettingsEditorProps> = ({ settings, onChange }) => {
  const handleFieldChange = <K extends keyof RequestSettings>(field: K, value: RequestSettings[K]) => {
    onChange({
      ...settings,
      [field]: value,
    });
  };

  return (
    <div className="p-4 space-y-5 max-w-xl text-xs overflow-y-auto h-full font-sans">
      <div className="flex items-center gap-2 pb-2 border-b border-border-subtle text-text-muted font-semibold text-xs">
        <Sliders className="w-3.5 h-3.5 text-blue-400" />
        <span>Request Execution Settings</span>
      </div>

      <div className="space-y-4">
        {/* Timeout */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label className="text-text-primary font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              <span>Request Timeout</span>
            </label>
            <p className="text-text-faint text-[11px]">Maximum time to wait before timing out execution</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={100}
              max={300000}
              step={500}
              value={settings.timeout_ms}
              onChange={(e) => handleFieldChange('timeout_ms', parseInt(e.target.value, 10) || 30000)}
              aria-label="Request Timeout in milliseconds"
              className="w-24 bg-bg-darkest border border-border-default rounded-md px-2.5 py-1 text-right font-mono text-text-primary focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <span className="text-text-muted font-mono">ms</span>
          </div>
        </div>

        {/* Follow Redirects */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border-subtle">
          <div className="space-y-0.5">
            <label className="text-text-primary font-medium flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-text-muted" />
              <span>Follow HTTP Redirects</span>
            </label>
            <p className="text-text-faint text-[11px]">Automatically follow 301, 302, 307, and 308 redirect status codes</p>
          </div>
          <input
            type="checkbox"
            checked={settings.follow_redirects}
            onChange={(e) => handleFieldChange('follow_redirects', e.target.checked)}
            aria-label="Follow HTTP Redirects"
            className="rounded border-border-default bg-bg-darkest text-blue-500 focus:ring-0 w-4 h-4 cursor-pointer"
          />
        </div>

        {/* Verify SSL */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border-subtle">
          <div className="space-y-0.5">
            <label className="text-text-primary font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-text-muted" />
              <span>Verify SSL Certificates</span>
            </label>
            <p className="text-text-faint text-[11px]">Validate server TLS certificates (disable for self-signed development)</p>
          </div>
          <input
            type="checkbox"
            checked={settings.verify_ssl}
            onChange={(e) => handleFieldChange('verify_ssl', e.target.checked)}
            aria-label="Verify SSL Certificates"
            className="rounded border-border-default bg-bg-darkest text-blue-500 focus:ring-0 w-4 h-4 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

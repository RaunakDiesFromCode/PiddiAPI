import React from 'react';
import { Sparkles, Code2, AlertCircle } from 'lucide-react';
import { BodyType, RequestBody } from '../../types';
import { CodeEditor } from '../common/CodeEditor';
import { KeyValueEditor } from './KeyValueEditor';

interface BodyEditorProps {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

const BODY_TYPES: { id: BodyType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'urlencoded', label: 'URL-Encoded' },
  { id: 'multipart', label: 'Multipart Form' },
  { id: 'raw', label: 'Raw Text' },
];

export const BodyEditor: React.FC<BodyEditorProps> = ({ body, onChange }) => {
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  const handleTypeChange = (type: BodyType) => {
    onChange({
      ...body,
      type,
    });
  };

  const handleRawChange = (raw: string) => {
    onChange({
      ...body,
      raw,
    });
    if (body.type === 'json' && raw.trim() !== '') {
      try {
        JSON.parse(raw);
        setJsonError(null);
      } catch (err: any) {
        setJsonError(err.message);
      }
    } else {
      setJsonError(null);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(body.raw || '{}');
      const formatted = JSON.stringify(parsed, null, 2);
      onChange({
        ...body,
        raw: formatted,
      });
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {/* Body type pill selector */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-bg-card/40 flex-shrink-0 select-none">
        <div className="flex items-center gap-1 overflow-x-auto">
          {BODY_TYPES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              onClick={() => handleTypeChange(bt.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer ${
                body.type === bt.id
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-overlay'
              }`}
            >
              {bt.label}
            </button>
          ))}
        </div>

        {body.type === 'json' && (
          <div className="flex items-center gap-2">
            {jsonError ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>Invalid JSON</span>
              </span>
            ) : (
              body.raw.trim() !== '' && (
                <span className="text-[11px] text-emerald-400 font-mono">Valid JSON</span>
              )
            )}
            <button
              type="button"
              onClick={handleFormatJson}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-surface hover:bg-bg-overlay border border-border-default rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
              title="Prettify JSON"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Format</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor container */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {body.type === 'none' && (
          <div className="flex flex-col items-center justify-center h-full text-text-faint space-y-2 p-6 select-none">
            <Code2 className="w-8 h-8 opacity-40" />
            <p className="text-text-secondary">This request does not include a body payload.</p>
            <p className="text-[11px]">Select JSON, URL-Encoded, or Multipart above to send data.</p>
          </div>
        )}

        {body.type === 'json' && (
          <div className="h-full p-1.5">
            <CodeEditor
              value={body.raw || ''}
              onChange={handleRawChange}
              language="json"
              placeholder='{\n  "key": "value"\n}'
            />
          </div>
        )}

        {body.type === 'raw' && (
          <div className="h-full p-1.5">
            <CodeEditor
              value={body.raw || ''}
              onChange={handleRawChange}
              language="raw"
              placeholder="Enter raw text content..."
            />
          </div>
        )}

        {body.type === 'urlencoded' && (
          <KeyValueEditor
            items={body.form_params || []}
            onChange={(form_params) => onChange({ ...body, form_params })}
            keyPlaceholder="Parameter Name"
            valuePlaceholder="Value"
          />
        )}

        {body.type === 'multipart' && (
          <KeyValueEditor
            items={body.form_params || []}
            onChange={(form_params) => onChange({ ...body, form_params })}
            keyPlaceholder="Field Name"
            valuePlaceholder="Value or Path"
            showTypeSelector={true}
          />
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { KeyValueItem } from '../../types';

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showTypeSelector?: boolean;
  showDescription?: boolean;
}

export const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showTypeSelector = false,
  showDescription = false,
}) => {
  const rows =
    items.length === 0
      ? [{ id: 'init_0', key: '', value: '', enabled: true, type: 'text' as const }]
      : items;

  const handleItemChange = (index: number, field: keyof KeyValueItem, value: any) => {
    const updated = [...rows];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };

    // Auto-append row if typing into the last row
    if (index === rows.length - 1 && (field === 'key' || field === 'value') && value !== '') {
      updated.push({
        id: `kv_${Date.now()}_${updated.length}`,
        key: '',
        value: '',
        enabled: true,
        type: 'text',
      });
    }

    onChange(updated);
  };

  const handleDelete = (index: number) => {
    if (rows.length === 1) {
      // If only one row, reset it
      onChange([{ id: `kv_${Date.now()}_0`, key: '', value: '', enabled: true, type: 'text' }]);
      return;
    }
    const updated = rows.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAddRow = () => {
    const updated = [
      ...rows,
      { id: `kv_${Date.now()}_${rows.length}`, key: '', value: '', enabled: true, type: 'text' as const },
    ];
    onChange(updated);
  };

  const handleToggleAll = (enabled: boolean) => {
    const updated = rows.map((r) => ({ ...r, enabled }));
    onChange(updated);
  };

  return (
    <div className="w-full flex flex-col h-full overflow-hidden text-xs">
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-card/60 text-text-muted font-medium sticky top-0 z-10 select-none">
              <th className="w-9 px-2 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label="Toggle all items"
                  checked={rows.length > 0 && rows.every((r) => r.enabled)}
                  onChange={(e) => handleToggleAll(e.target.checked)}
                  className="rounded border-border-default bg-bg-darkest text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              <th className="px-2.5 py-2 font-medium w-[28%] min-w-[120px]">{keyPlaceholder}</th>
              {showTypeSelector && <th className="w-20 px-2 py-2 font-medium text-center">Type</th>}
              <th className="px-2.5 py-2 font-medium min-w-[180px]">{valuePlaceholder}</th>
              {showDescription && <th className="px-2.5 py-2 font-medium w-[22%] min-w-[110px]">Description</th>}
              <th className="w-9 px-2 py-2 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((item, index) => (
              <tr
                key={item.id || `row_${index}`}
                className={`group hover:bg-bg-card/30 transition-colors ${!item.enabled ? 'opacity-50' : ''}`}
              >
                <td className="w-9 px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Toggle item ${index + 1}`}
                    checked={item.enabled}
                    onChange={(e) => handleItemChange(index, 'enabled', e.target.checked)}
                    className="rounded border-border-default bg-bg-darkest text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={item.key}
                    placeholder={keyPlaceholder}
                    onChange={(e) => handleItemChange(index, 'key', e.target.value)}
                    className="w-full bg-bg-darkest/30 hover:bg-bg-darkest/60 focus:bg-bg-darkest border border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-text-primary placeholder:text-text-faint font-mono text-xs focus:outline-none transition-colors"
                  />
                </td>
                {showTypeSelector && (
                  <td className="w-20 px-1 py-1 text-center">
                    <select
                      value={item.type || 'text'}
                      onChange={(e) => handleItemChange(index, 'type', e.target.value as 'text' | 'file')}
                      className="bg-bg-darkest border border-border-subtle rounded px-1.5 py-1 text-text-secondary text-xs focus:border-blue-500 focus:ring-0 cursor-pointer"
                    >
                      <option value="text">Text</option>
                      <option value="file">File</option>
                    </select>
                  </td>
                )}
                <td className="px-2 py-1">
                  {showTypeSelector && item.type === 'file' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.value}
                        placeholder="File path (e.g. /path/to/file.png)"
                        onChange={(e) => handleItemChange(index, 'value', e.target.value)}
                        className="flex-1 bg-bg-darkest/30 hover:bg-bg-darkest/60 focus:bg-bg-darkest border border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-text-primary placeholder:text-text-faint font-mono text-xs focus:outline-none transition-colors"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={item.value}
                      placeholder={valuePlaceholder}
                      onChange={(e) => handleItemChange(index, 'value', e.target.value)}
                      className="w-full bg-bg-darkest/30 hover:bg-bg-darkest/60 focus:bg-bg-darkest border border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-text-primary placeholder:text-text-faint font-mono text-xs focus:outline-none transition-colors"
                    />
                  )}
                </td>
                {showDescription && (
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={item.description || ''}
                      placeholder="Description"
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      className="w-full bg-bg-darkest/30 hover:bg-bg-darkest/60 focus:bg-bg-darkest border border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-text-muted placeholder:text-text-faint text-xs focus:outline-none transition-colors"
                    />
                  </td>
                )}
                <td className="w-9 px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete item ${index + 1}`}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 text-text-muted hover:text-rose-400 p-1 rounded hover:bg-bg-overlay transition-opacity focus-visible:ring-1 focus-visible:ring-rose-500 focus-visible:outline-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-2 border-t border-border-subtle bg-bg-card/20 flex justify-between items-center select-none">
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-surface hover:bg-bg-overlay border border-border-default rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Row</span>
        </button>
        <span className="text-text-faint text-[11px] font-mono">
          {rows.filter((r) => r.enabled && (r.key || r.value)).length} active
        </span>
      </div>
    </div>
  );
};

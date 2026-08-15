import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyValueEditor } from '../components/request/KeyValueEditor';
import { KeyValueItem } from '../types';

describe('KeyValueEditor', () => {
  it('renders key and value inputs with initial items', () => {
    const items: KeyValueItem[] = [
      { id: '1', key: 'Accept', value: 'application/json', enabled: true },
      { id: '2', key: 'X-Custom', value: 'custom-val', enabled: false },
    ];
    const onChange = vi.fn();

    render(<KeyValueEditor items={items} onChange={onChange} keyPlaceholder="Header" />);

    expect(screen.getByDisplayValue('Accept')).toBeInTheDocument();
    expect(screen.getByDisplayValue('application/json')).toBeInTheDocument();
    expect(screen.getByDisplayValue('X-Custom')).toBeInTheDocument();
  });

  it('preserves duplicate keys across multiple rows', () => {
    const items: KeyValueItem[] = [
      { id: '1', key: 'Accept', value: 'text/html', enabled: true },
      { id: '2', key: 'Accept', value: 'application/xhtml+xml', enabled: true },
    ];
    const onChange = vi.fn();

    render(<KeyValueEditor items={items} onChange={onChange} />);

    const inputs = screen.getAllByDisplayValue('Accept');
    expect(inputs.length).toBe(2);
  });

  it('toggles item enabled state', () => {
    const items: KeyValueItem[] = [
      { id: '1', key: 'Auth', value: 'secret', enabled: true },
    ];
    const onChange = vi.fn();

    render(<KeyValueEditor items={items} onChange={onChange} />);

    const checkbox = screen.getByLabelText('Toggle item 1');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith([
      { id: '1', key: 'Auth', value: 'secret', enabled: false },
    ]);
  });

  it('adds a new row when clicking Add Row', () => {
    const items: KeyValueItem[] = [
      { id: '1', key: 'A', value: '1', enabled: true },
    ];
    const onChange = vi.fn();

    render(<KeyValueEditor items={items} onChange={onChange} />);

    const addBtn = screen.getByRole('button', { name: /Add Row/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalled();
    const callArg = onChange.mock.calls[0][0];
    expect(callArg.length).toBe(2);
  });

  it('deletes a row on trash button click', () => {
    const items: KeyValueItem[] = [
      { id: '1', key: 'A', value: '1', enabled: true },
      { id: '2', key: 'B', value: '2', enabled: true },
    ];
    const onChange = vi.fn();

    render(<KeyValueEditor items={items} onChange={onChange} />);

    const deleteBtn = screen.getByLabelText('Delete item 1');
    fireEvent.click(deleteBtn);

    expect(onChange).toHaveBeenCalledWith([
      { id: '2', key: 'B', value: '2', enabled: true },
    ]);
  });
});

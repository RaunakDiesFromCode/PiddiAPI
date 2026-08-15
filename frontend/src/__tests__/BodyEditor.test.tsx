import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BodyEditor } from '../components/request/BodyEditor';
import { RequestBody } from '../types';

describe('BodyEditor', () => {
  it('displays empty state for body type none', () => {
    const body: RequestBody = { type: 'none', raw: '', form_params: [] };
    const onChange = vi.fn();

    render(<BodyEditor body={body} onChange={onChange} />);

    expect(screen.getByText(/does not include a body payload/i)).toBeInTheDocument();
  });

  it('switches between body types', () => {
    const body: RequestBody = { type: 'none', raw: '', form_params: [] };
    const onChange = vi.fn();

    render(<BodyEditor body={body} onChange={onChange} />);

    const jsonBtn = screen.getByRole('button', { name: 'JSON' });
    fireEvent.click(jsonBtn);

    expect(onChange).toHaveBeenCalledWith({ type: 'json', raw: '', form_params: [] });
  });

  it('formats valid JSON on Format button click', () => {
    const body: RequestBody = { type: 'json', raw: '{"a":1,"b":"hello"}', form_params: [] };
    const onChange = vi.fn();

    render(<BodyEditor body={body} onChange={onChange} />);

    const formatBtn = screen.getByTitle('Prettify JSON');
    fireEvent.click(formatBtn);

    expect(onChange).toHaveBeenCalledWith({
      type: 'json',
      raw: '{\n  "a": 1,\n  "b": "hello"\n}',
      form_params: [],
    });
  });
});

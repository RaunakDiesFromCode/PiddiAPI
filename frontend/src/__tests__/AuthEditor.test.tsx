import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthEditor } from '../components/request/AuthEditor';
import { AuthConfig } from '../types';

describe('AuthEditor', () => {
  it('switches auth type to bearer and updates token', () => {
    const auth: AuthConfig = { type: 'none' };
    const onChange = vi.fn();

    const { rerender } = render(<AuthEditor auth={auth} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'bearer' } });

    expect(onChange).toHaveBeenCalledWith({ type: 'bearer' });

    // Rerender with bearer
    rerender(<AuthEditor auth={{ type: 'bearer', token: '' }} onChange={onChange} />);

    const tokenInput = screen.getByPlaceholderText(/eyJhbGciOi/i);
    fireEvent.change(tokenInput, { target: { value: 'my-jwt-token' } });

    expect(onChange).toHaveBeenCalledWith({ type: 'bearer', token: 'my-jwt-token' });
  });

  it('configures basic auth username and password', () => {
    const auth: AuthConfig = { type: 'basic', username: 'admin', password: 'secretpassword' };
    const onChange = vi.fn();

    render(<AuthEditor auth={auth} onChange={onChange} />);

    expect(screen.getByDisplayValue('admin')).toBeInTheDocument();
    expect(screen.getByDisplayValue('secretpassword')).toBeInTheDocument();
  });

  it('configures API Key with placement header or query', () => {
    const auth: AuthConfig = { type: 'apikey', key: 'X-API-KEY', value: '12345', placement: 'header' };
    const onChange = vi.fn();

    render(<AuthEditor auth={auth} onChange={onChange} />);

    expect(screen.getByDisplayValue('X-API-KEY')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12345')).toBeInTheDocument();

    const queryRadio = screen.getByLabelText('Query Params');
    fireEvent.click(queryRadio);

    expect(onChange).toHaveBeenCalledWith({
      type: 'apikey',
      key: 'X-API-KEY',
      value: '12345',
      placement: 'query',
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponseViewer } from '../components/response/ResponseViewer';
import { CanonicalResponseModel } from '../types';

describe('ResponseViewer', () => {
  it('displays empty state when response is null', () => {
    const onSend = vi.fn();
    render(<ResponseViewer response={null} isLoading={false} error={null} onSend={onSend} />);

    expect(screen.getByText(/No Response Yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Send Request/i)).toBeInTheDocument();
  });

  it('displays loading state when request is running', () => {
    const onSend = vi.fn();
    render(<ResponseViewer response={null} isLoading={true} error={null} onSend={onSend} />);

    expect(screen.getByText(/Executing HTTP Request/i)).toBeInTheDocument();
  });

  it('renders status badge, duration, and response body for 200 OK', () => {
    const response: CanonicalResponseModel = {
      status: 200,
      status_text: 'OK',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_123' },
      cookies: { session: 'abc' },
      body: '{"message": "Hello World"}',
      content_type: 'application/json',
      size_bytes: 26,
      duration_ms: 45.2,
      is_truncated: false,
    };
    const onSend = vi.fn();

    render(<ResponseViewer response={response} isLoading={false} error={null} onSend={onSend} />);

    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('45.2 ms')).toBeInTheDocument();
  });

  it('renders structured error banner for failed responses', () => {
    const response: CanonicalResponseModel = {
      status: 0,
      status_text: 'Error',
      headers: {},
      cookies: {},
      body: '',
      content_type: 'text/plain',
      size_bytes: 0,
      duration_ms: 10.0,
      is_truncated: false,
      error: {
        code: 'CONNECTION_REFUSED',
        message: 'Could not connect to target host',
      },
    };
    const onSend = vi.fn();

    render(<ResponseViewer response={response} isLoading={false} error={null} onSend={onSend} />);

    const errorCodes = screen.getAllByText('CONNECTION_REFUSED');
    expect(errorCodes.length).toBeGreaterThan(0);
    expect(screen.getByText('Could not connect to target host')).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../App';
import { apiClient } from '../api/client';
import { CanonicalResponseModel } from '../types';

describe('App End-to-End Interactive Flow', () => {
  beforeEach(() => {
    // Mock health check and bootstrap
    vi.spyOn(apiClient, 'checkHealth').mockResolvedValue({
      status: 'ok',
      version: '0.1.0',
      workspace_path: '/Users/dev/my-project',
      port: 4111,
    });
    vi.spyOn(apiClient, 'ensureToken').mockResolvedValue('test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes the full flow: Open app -> Enter URL -> Select POST -> Send -> Display Response', async () => {
    const mockExecutionResponse: CanonicalResponseModel = {
      status: 201,
      status_text: 'Created',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_7788',
      },
      cookies: {
        session_id: 'sess_123',
      },
      body: '{\n  "id": "item_99",\n  "status": "created"\n}',
      content_type: 'application/json',
      size_bytes: 42,
      duration_ms: 28.4,
      timing: {
        dns_ms: 0,
        connect_ms: 2.1,
        tls_ms: 0,
        ttfb_ms: 22.0,
        transfer_ms: 4.3,
      },
      is_truncated: false,
      error: null,
    };

    const executeSpy = vi
      .spyOn(apiClient, 'executeRequest')
      .mockResolvedValueOnce(mockExecutionResponse);

    render(<App />);

    // 1. Verify workspace shell loaded
    expect(screen.getByText('PiddiAPI')).toBeInTheDocument();

    // 2. Enter URL
    const urlInput = screen.getByPlaceholderText(/Enter request URL/i);
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: 'http://127.0.0.1:4111/api/v1/items' } });
    });
    expect(urlInput).toHaveValue('http://127.0.0.1:4111/api/v1/items');

    // 3. Select HTTP Method: POST
    const methodSelect = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(methodSelect, { target: { value: 'POST' } });
    });
    expect(methodSelect).toHaveValue('POST');

    // 4. Click Send button
    const sendBtn = screen.getByTestId('send-request-btn');
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // 5. Verify execution called with correct CanonicalRequestModel
    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://127.0.0.1:4111/api/v1/items',
        })
      );
    });

    // 6. Verify response rendered in response panel
    await waitFor(() => {
      expect(screen.getByText('201')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('28.4 ms')).toBeInTheDocument();
    });
  });
});

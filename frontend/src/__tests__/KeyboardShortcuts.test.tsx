import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react';
import { App } from '../App';
import { useRequestStore } from '../store/useRequestStore';
import { apiClient } from '../api/client';

describe('Global Keyboard Shortcuts', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'checkHealth').mockResolvedValue({
      status: 'ok',
      version: '0.1.0',
      workspace_path: '/workspace',
      port: 4111,
    });
    vi.spyOn(apiClient, 'ensureToken').mockResolvedValue('token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers new scratchpad on Piddi shortcut Cmd+Shift+N / Ctrl+Shift+N', async () => {
    render(<App />);
    const initialTabsCount = useRequestStore.getState().tabs.length;

    await act(async () => {
      fireEvent.keyDown(window, { key: 'N', shiftKey: true, metaKey: true });
    });

    const newTabsCount = useRequestStore.getState().tabs.length;
    expect(newTabsCount).toBe(initialTabsCount + 1);
  });

  it('triggers new scratchpad on best-effort Cmd+T / Ctrl+T', async () => {
    render(<App />);
    const initialTabsCount = useRequestStore.getState().tabs.length;

    await act(async () => {
      fireEvent.keyDown(window, { key: 't', metaKey: true });
    });

    const newTabsCount = useRequestStore.getState().tabs.length;
    expect(newTabsCount).toBe(initialTabsCount + 1);
  });

  it('triggers close tab on Piddi shortcut Cmd+Shift+W / Ctrl+Shift+W', async () => {
    render(<App />);
    // Create an extra tab first
    await act(async () => {
      fireEvent.keyDown(window, { key: 'N', shiftKey: true, metaKey: true });
    });
    const tabsBeforeClose = useRequestStore.getState().tabs.length;

    await act(async () => {
      fireEvent.keyDown(window, { key: 'W', shiftKey: true, metaKey: true });
    });

    expect(useRequestStore.getState().tabs.length).toBe(tabsBeforeClose - 1);
  });

  it('triggers send on Cmd+Enter / Ctrl+Enter', async () => {
    const executeSpy = vi.spyOn(apiClient, 'executeRequest').mockResolvedValueOnce({
      status: 200,
      status_text: 'OK',
      headers: {},
      cookies: {},
      body: 'ok',
      content_type: 'text/plain',
      size_bytes: 2,
      duration_ms: 10,
      is_truncated: false,
    });

    render(<App />);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    });

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled();
    });
  });

  it('opens and closes command palette on Cmd+K and Escape', async () => {
    render(<App />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens shortcuts help on ? key press', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.keyDown(window, { key: '?' });
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText(/Piddi Application Shortcuts/i)).toBeInTheDocument();
  });
});

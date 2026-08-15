import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RequestBuilder } from '../components/request/RequestBuilder';
import { useRequestStore } from '../store/useRequestStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

describe('RequestBuilder Toolbar and Ergonomics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      collections: [{ id: 'col_1', name: 'User API', requests: [] }],
    });
  });

  it('renders method selector, URL input with variable placeholder, and primary action buttons', () => {
    render(<RequestBuilder />);

    // Method selector
    const methodSelect = screen.getByRole('combobox', { name: /HTTP Method/i });
    expect(methodSelect).toBeInTheDocument();
    expect(methodSelect).toHaveValue('GET');

    // URL input
    const urlInput = screen.getByRole('textbox', { name: /Request URL/i });
    expect(urlInput).toBeInTheDocument();
    expect(urlInput).toHaveAttribute(
      'placeholder',
      expect.stringContaining('base_url')
    );

    // Primary action button: Send
    const sendBtn = screen.getByTestId('send-request-btn');
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn).toHaveTextContent('Send');

    // Secondary action button: Save
    expect(screen.getByRole('button', { name: /Save request/i })).toBeInTheDocument();

    // Tertiary buttons: Import and Code
    expect(screen.getByRole('button', { name: /Import cURL command/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate code snippet/i })).toBeInTheDocument();
  });

  it('shows clear URL button only when URL has text and clears on click', async () => {
    render(<RequestBuilder />);

    const urlInput = screen.getByRole('textbox', { name: /Request URL/i });

    // Initially no clear button
    expect(screen.queryByLabelText(/Clear URL input/i)).not.toBeInTheDocument();

    // Type a URL
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: 'https://api.example.com/items' } });
    });

    const clearBtn = screen.getByLabelText(/Clear URL input/i);
    expect(clearBtn).toBeInTheDocument();

    // Click clear button
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(urlInput).toHaveValue('');
    expect(screen.queryByLabelText(/Clear URL input/i)).not.toBeInTheDocument();
  });

  it('switches composer subtabs between Params, Headers, Auth, Body, and Settings', async () => {
    render(<RequestBuilder />);

    expect(screen.getByText('Parameter Name')).toBeInTheDocument();

    // Switch to Headers
    const headersTab = screen.getByRole('button', { name: /Headers/i });
    await act(async () => {
      fireEvent.click(headersTab);
    });
    expect(screen.getByText('Header Name')).toBeInTheDocument();

    // Switch to Auth
    const authTab = screen.getByRole('button', { name: /Auth/i });
    await act(async () => {
      fireEvent.click(authTab);
    });
    expect(screen.getByText('Auth Type')).toBeInTheDocument();

    // Switch to Body
    const bodyTab = screen.getByRole('button', { name: /Body/i });
    await act(async () => {
      fireEvent.click(bodyTab);
    });
    expect(screen.getByText('JSON')).toBeInTheDocument();

    // Switch to Settings
    const settingsTab = screen.getByRole('button', { name: /Settings/i });
    await act(async () => {
      fireEvent.click(settingsTab);
    });
    expect(screen.getByText('Request Timeout')).toBeInTheDocument();
  });

  it('allows closing tab via close button without crashing', async () => {
    render(<RequestBuilder />);

    const closeBtn = screen.getAllByLabelText(/Close tab/i)[0];

    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // Closing the only tab replaces with a clean scratchpad
    expect(useRequestStore.getState().tabs.length).toBe(1);
  });
});

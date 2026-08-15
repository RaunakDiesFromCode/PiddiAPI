import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/layout/Sidebar';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useRequestStore } from '../store/useRequestStore';
import { Collection } from '../types';

describe('Sidebar Collections Component', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      collections: [],
      errors: [],
      isLoading: false,
      selectedCollectionId: null,
      selectedRequestId: null,
    });
  });

  it('renders empty collections state and "+ Create Collection" button', () => {
    render(<Sidebar isCollapsed={false} onToggle={() => {}} />);

    expect(screen.getByText('No collections yet')).toBeInTheDocument();
    expect(screen.getByText('+ Create Collection')).toBeInTheDocument();
  });

  it('renders collection list with requests and opens request in tab on click', async () => {
    const mockCollection: Collection = {
      id: 'col_123',
      name: 'Auth Endpoints',
      requests: [
        {
          id: 'req_456',
          name: 'User Login',
          method: 'POST',
          url: 'http://localhost:8000/login',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { type: 'none', raw: '', form_params: [] },
          settings: { timeout_ms: 30000, follow_redirects: true, verify_ssl: true },
        },
      ],
    };

    useWorkspaceStore.setState({
      collections: [mockCollection],
    });

    render(<Sidebar isCollapsed={false} onToggle={() => {}} />);

    expect(screen.getByText('Auth Endpoints')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('User Login')).toBeInTheDocument();

    // Click request to open in tab
    fireEvent.click(screen.getByText('User Login'));

    const { tabs, activeTabId } = useRequestStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    expect(activeTab).toBeDefined();
    expect(activeTab?.requestId).toBe('req_456');
    expect(activeTab?.collectionId).toBe('col_123');
    expect(activeTab?.request.url).toBe('http://localhost:8000/login');
  });

  it('displays diagnostics warning banner when file errors exist', () => {
    useWorkspaceStore.setState({
      errors: [
        { file: 'broken.json', error: 'Invalid JSON syntax', code: 'MALFORMED_JSON' },
      ],
    });

    render(<Sidebar isCollapsed={false} onToggle={() => {}} />);

    expect(screen.getByText('1 file issue detected')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPaletteModal } from '../components/common/CommandPaletteModal';
import { useRequestStore } from '../store/useRequestStore';
import { useEnvironmentStore } from '../store/useEnvironmentStore';

describe('CommandPaletteModal', () => {
  const onOpenShortcuts = vi.fn();
  const onOpenImportCurl = vi.fn();
  const onOpenSnippet = vi.fn();
  const onToggleSidebar = vi.fn();
  const onOpenHistory = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentStore.setState({
      environments: [
        { id: 'env_prod', name: 'Production', variables: [] },
        { id: 'env_dev', name: 'Development', variables: [] },
      ],
      activeEnvironmentId: null,
    });
  });

  it('renders commands list when open and filters by query', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onOpenShortcuts={onOpenShortcuts}
        onOpenImportCurl={onOpenImportCurl}
        onOpenSnippet={onOpenSnippet}
        onToggleSidebar={onToggleSidebar}
        onOpenHistory={onOpenHistory}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Active Request')).toBeInTheDocument();
    expect(screen.getByText('New Scratchpad Tab')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Type a command/i);
    fireEvent.change(input, { target: { value: 'Production' } });

    expect(screen.getByText('Switch Environment: Production')).toBeInTheDocument();
    expect(screen.queryByText('Send Active Request')).not.toBeInTheDocument();
  });

  it('executes selected command on Enter and closes modal', () => {
    const sendSpy = vi.fn();
    useRequestStore.setState({ sendActiveRequest: sendSpy });

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onOpenShortcuts={onOpenShortcuts}
        onOpenImportCurl={onOpenImportCurl}
        onOpenSnippet={onOpenSnippet}
        onToggleSidebar={onToggleSidebar}
        onOpenHistory={onOpenHistory}
      />
    );

    const input = screen.getByPlaceholderText(/Type a command/i);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sendSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates command list with arrow keys', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onOpenShortcuts={onOpenShortcuts}
        onOpenImportCurl={onOpenImportCurl}
        onOpenSnippet={onOpenSnippet}
        onToggleSidebar={onToggleSidebar}
        onOpenHistory={onOpenHistory}
      />
    );

    const input = screen.getByPlaceholderText(/Type a command/i);
    const options = screen.getAllByRole('option');

    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('closes on Escape key press', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onOpenShortcuts={onOpenShortcuts}
        onOpenImportCurl={onOpenImportCurl}
        onOpenSnippet={onOpenSnippet}
        onToggleSidebar={onToggleSidebar}
        onOpenHistory={onOpenHistory}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

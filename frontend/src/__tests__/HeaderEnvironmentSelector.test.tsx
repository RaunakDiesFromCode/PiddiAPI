import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/layout/Header';
import { useEnvironmentStore } from '../store/useEnvironmentStore';
import { useRequestStore } from '../store/useRequestStore';
import { Environment } from '../types';

describe('Header Environment Selector', () => {
  const mockEnvs: Environment[] = [
    { id: 'env_dev', name: 'Development', variables: [] },
    { id: 'env_stg', name: 'Staging', variables: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentStore.setState({
      environments: mockEnvs,
      activeEnvironmentId: 'env_dev',
      isManagerOpen: false,
    });
    useRequestStore.setState({
      engineConnected: true,
      workspaceInfo: {
        status: 'ok',
        version: '0.1.0',
        workspace_path: '/mock/workspace',
        port: 4111,
      },
    });
  });

  it('displays active environment name in header', () => {
    render(<Header onOpenShortcuts={vi.fn()} />);
    expect(screen.getByText('Development')).toBeInTheDocument();
  });

  it('opens dropdown menu and selects a different environment', () => {
    const setActiveMock = vi.fn();
    useEnvironmentStore.setState({ setActiveEnvironment: setActiveMock });

    render(<Header onOpenShortcuts={vi.fn()} />);

    const button = screen.getByTitle(/Switch Environment/i);
    fireEvent.click(button);

    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('No Environment')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Staging'));
    expect(setActiveMock).toHaveBeenCalledWith('env_stg');
  });

  it('opens environment manager modal from dropdown', () => {
    const openManagerMock = vi.fn();
    useEnvironmentStore.setState({ openManager: openManagerMock });

    render(<Header onOpenShortcuts={vi.fn()} />);

    const button = screen.getByTitle(/Switch Environment/i);
    fireEvent.click(button);

    const manageBtn = screen.getByText('Manage Environments...');
    fireEvent.click(manageBtn);

    expect(openManagerMock).toHaveBeenCalled();
  });
});

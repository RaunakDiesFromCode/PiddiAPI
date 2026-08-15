import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnvironmentModal } from '../components/environment/EnvironmentModal';
import { useEnvironmentStore } from '../store/useEnvironmentStore';
import { Environment } from '../types';

describe('EnvironmentModal', () => {
  const mockEnv: Environment = {
    id: 'env_1',
    name: 'Development',
    description: 'Dev env',
    variables: [
      { key: 'baseUrl', value: 'http://localhost:8000', enabled: true, is_secret: false },
      { key: 'apiKey', value: null, enabled: true, is_secret: true },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentStore.setState({
      environments: [mockEnv],
      activeEnvironmentId: 'env_1',
      isManagerOpen: true,
      selectedEnvIdForEditing: 'env_1',
      revealedSecrets: {},
      isLoading: false,
      error: null,
    });
  });

  it('renders environment details and masked secret value', () => {
    render(<EnvironmentModal />);

    expect(screen.getByText('Manage Environments & Secrets')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Development')).toBeInTheDocument();
    expect(screen.getByDisplayValue('baseUrl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:8000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('apiKey')).toBeInTheDocument();

    // Secret variable renders masked dots
    expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();
  });

  it('adds a new variable row', () => {
    render(<EnvironmentModal />);

    const addBtn = screen.getByText('Add Variable');
    fireEvent.click(addBtn);

    const inputs = screen.getAllByPlaceholderText('VARIABLE_KEY');
    expect(inputs.length).toBe(3); // 2 existing + 1 new
  });

  it('detects duplicate keys and displays duplicate warning', () => {
    render(<EnvironmentModal />);

    const inputs = screen.getAllByPlaceholderText('VARIABLE_KEY');
    // Change second key to "baseUrl" to create duplicate
    fireEvent.change(inputs[1], { target: { value: 'baseUrl' } });

    expect(screen.getByText(/Duplicate variable keys detected: baseUrl/i)).toBeInTheDocument();
  });

  it('reveals secret when clicking eye toggle', async () => {
    const revealSecretMock = vi.fn().mockResolvedValue('unmasked_secret_999');
    useEnvironmentStore.setState({
      revealSecret: revealSecretMock,
      revealedSecrets: { env_1: { apiKey: 'unmasked_secret_999' } },
    });

    render(<EnvironmentModal />);

    expect(screen.getByText('unmasked_secret_999')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PwaInstallPanel } from '../pwa/PwaInstallPanel';
import { usePwaInstall } from '../pwa/use-pwa-install';

vi.mock('../pwa/use-pwa-install', () => ({ usePwaInstall: vi.fn() }));

const mockedUsePwaInstall = vi.mocked(usePwaInstall);

describe('PwaInstallPanel', () => {
  it('mostra e aciona Instalar Casaê quando elegível', async () => {
    const promptInstall = vi.fn().mockResolvedValue('accepted');
    mockedUsePwaInstall.mockReturnValue({
      installed: false,
      installable: true,
      installing: false,
      ios: false,
      lastChoice: null,
      promptInstall,
    });
    render(<PwaInstallPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Instalar Casaê' }));
    expect(promptInstall).toHaveBeenCalledOnce();
  });

  it('esconde o botão e informa quando já está instalado', () => {
    mockedUsePwaInstall.mockReturnValue({
      installed: true,
      installable: false,
      installing: false,
      ios: false,
      lastChoice: 'accepted',
      promptInstall: vi.fn(),
    });
    render(<PwaInstallPanel />);

    expect(screen.queryByRole('button', { name: 'Instalar Casaê' })).not.toBeInTheDocument();
    expect(screen.getByText('Casaê instalado')).toBeVisible();
  });

  it('mostra a instrução correta no iOS', () => {
    mockedUsePwaInstall.mockReturnValue({
      installed: false,
      installable: false,
      installing: false,
      ios: true,
      lastChoice: null,
      promptInstall: vi.fn(),
    });
    render(<PwaInstallPanel />);

    expect(screen.queryByRole('button', { name: 'Instalar Casaê' })).not.toBeInTheDocument();
    expect(screen.getByText(/Compartilhar → Adicionar à Tela de Início/)).toBeVisible();
  });
});

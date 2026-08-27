import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyDataRecoverySection } from '../features/settings/LegacyDataRecoverySection';

const baseProps = () => ({
  houseId: 'house-a',
  profileId: 'profile-a',
  shopping: null,
  catalog: null,
  purchases: null,
  avatarAvailable: false,
  importShopping: vi.fn().mockResolvedValue(undefined),
  importCatalog: vi.fn().mockResolvedValue(undefined),
  importPurchases: vi.fn().mockResolvedValue(undefined),
  importAvatar: vi.fn().mockResolvedValue(undefined),
});

describe('LegacyDataRecoverySection', () => {
  beforeEach(() => localStorage.clear());

  it('mostra Lista e catálogo somente em Configurações, sem abrir modal', () => {
    render(
      <LegacyDataRecoverySection
        {...baseProps()}
        catalog={{
          categories: 11,
          products: 9,
          stores: 1,
          importIntoHouse: vi.fn(),
        }}
        shopping={{ count: 8, importIntoHouse: vi.fn() }}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dados locais antigos' })).toBeVisible();
    expect(screen.getByText('8 itens da lista')).toBeVisible();
    expect(screen.getByText('9 produtos')).toBeVisible();
    expect(screen.getByText('11 categorias')).toBeVisible();
    expect(screen.getByText('1 mercado')).toBeVisible();
  });

  it('não renderiza área vazia quando não existe dado legacy elegível', () => {
    render(<LegacyDataRecoverySection {...baseProps()} />);
    expect(screen.queryByRole('heading', { name: 'Dados locais antigos' })).not.toBeInTheDocument();
  });

  it('importa explicitamente todos os grupos disponíveis', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(
      <LegacyDataRecoverySection
        {...props}
        avatarAvailable
        purchases={{ sessions: 2, items: 4, importIntoHouse: vi.fn() }}
        shopping={{ count: 8, importIntoHouse: vi.fn() }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar à Casa' }));
    expect(props.importShopping).toHaveBeenCalledOnce();
    expect(props.importPurchases).toHaveBeenCalledOnce();
    expect(props.importAvatar).toHaveBeenCalledOnce();
    expect(props.importCatalog).not.toHaveBeenCalled();
  });

  it('oculta neste dispositivo sem importar nem destruir os candidatos', async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps(),
      shopping: { count: 8, importIntoHouse: vi.fn() },
    };
    const { rerender } = render(<LegacyDataRecoverySection {...props} />);
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByRole('heading', { name: 'Dados locais antigos' })).not.toBeInTheDocument();
    expect(props.importShopping).not.toHaveBeenCalled();

    rerender(<LegacyDataRecoverySection {...props} />);
    expect(screen.queryByRole('heading', { name: 'Dados locais antigos' })).not.toBeInTheDocument();
  });
});

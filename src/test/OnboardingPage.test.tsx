import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingPage } from '../features/house/OnboardingPage';

describe('OnboardingPage', () => {
  it('cria a primeira Casa', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <OnboardingPage displayName="Raabe" error={null} onCreate={onCreate} onJoin={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Criar minha Casa' }));
    await user.type(screen.getByLabelText('Nome da Casa'), 'Casa Raabe & Sidney');
    await user.click(screen.getByRole('button', { name: 'Criar Casa' }));
    expect(onCreate).toHaveBeenCalledWith('Casa Raabe & Sidney');
  });

  it('aceita código de convite e mostra rejeição amigável', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockRejectedValue(new Error('Este convite não é válido ou expirou.'));
    render(<OnboardingPage displayName="Sidney" error={null} onCreate={vi.fn()} onJoin={onJoin} />);
    await user.click(screen.getByRole('button', { name: 'Entrar com convite' }));
    await user.type(screen.getByLabelText('Código do convite'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: 'Entrar na Casa' }));
    expect(onJoin).toHaveBeenCalledWith('ABCD-1234');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este convite não é válido ou expirou.',
    );
  });
});

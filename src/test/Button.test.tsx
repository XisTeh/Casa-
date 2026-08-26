import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { vi } from 'vitest';
import { Button } from '../components/Button/Button';

describe('Button', () => {
  it('aciona o callback quando habilitado', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Salvar</Button>);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fica indisponível e informa carregamento', () => {
    render(<Button loading>Salvar</Button>);

    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('mantém ícone e texto dentro do mesmo rótulo compartilhado', () => {
    render(
      <Button>
        <Plus aria-hidden="true" /> Adicionar membro
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Adicionar membro' });
    const label = button.querySelector('.button__label');
    expect(label).not.toBeNull();
    expect(label?.querySelector('svg')).toBeInTheDocument();
    expect(label).toHaveTextContent('Adicionar membro');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';

describe('App', () => {
  it('renderiza a fundação e o resumo persistente da lista', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /olá, raabe/i })).toBeInTheDocument();
    expect(screen.getAllByText('Casa Raabe & Sidney').length).toBeGreaterThan(0);
    expect(await screen.findByText('8 itens faltando')).toBeInTheDocument();
  });

  it('navega para uma rota principal sem recarregar a aplicação', async () => {
    const user = userEvent.setup();
    render(<App />);

    const listLinks = await screen.findAllByRole('link', { name: 'Lista' });
    await user.click(listLinks[0]!);

    expect(screen.getByRole('heading', { name: 'Lista de compras' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lista');
  });
});

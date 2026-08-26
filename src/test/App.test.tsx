import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { App } from '../app/App';
import { resolveAppRuntimeMode } from '../lib/env';

describe('App', () => {
  beforeEach(() => window.history.pushState({}, '', '/'));

  it('renderiza a fundação e o resumo persistente da lista', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /olá, raabe/i })).toBeInTheDocument();
    expect(screen.getAllByText('Casa Raabe & Sidney').length).toBeGreaterThan(0);
    expect(await screen.findByText('8 itens faltando')).toBeInTheDocument();
  });

  it('nunca permite fallback local silencioso em Production sem Supabase', () => {
    expect(
      resolveAppRuntimeMode({
        allowLocalFallback: false,
        production: true,
        supabaseConfigured: false,
      }),
    ).toBe('configuration-error');
    expect(
      resolveAppRuntimeMode({
        allowLocalFallback: false,
        production: true,
        remoteMode: false,
        supabaseConfigured: false,
      }),
    ).toBe('configuration-error');
  });

  it('navega para uma rota principal sem recarregar a aplicação', async () => {
    const user = userEvent.setup();
    render(<App />);

    const listLinks = await screen.findAllByRole('link', { name: 'Lista' });
    await user.click(listLinks[0]!);

    expect(screen.getByRole('heading', { name: 'Lista de compras' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lista');
  });

  it('usa a marca Casaê como atalho para a tela de Início', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/produtos');
    render(<App />);

    const homeLinks = await screen.findAllByRole('link', { name: 'Ir para Início' });
    await user.click(homeLinks.at(-1)!);

    expect(await screen.findByRole('heading', { name: /olá, raabe/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('mostra Instalar Casaê no menu e leva às instruções quando não há prompt', async () => {
    const user = userEvent.setup();
    render(<App />);

    const profileButtons = await screen.findAllByRole('button', { name: 'Abrir perfil de Raabe' });
    await user.click(profileButtons.at(-1)!);
    const install = screen.getByRole('menuitem', { name: 'Instalar Casaê' });
    expect(install).toBeVisible();
    await user.click(install);

    expect(window.location.pathname).toBe('/configuracoes');
    expect(window.location.hash).toBe('#aplicativo');
    expect(await screen.findByRole('heading', { name: 'Aplicativo', level: 3 })).toBeVisible();
  });
});

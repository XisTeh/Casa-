import { vi } from 'vitest';
import { finishLaunchScreen } from '../pwa/launch-screen';

describe('tela de abertura do PWA', () => {
  it('faz a transição e libera a aplicação depois da abertura', () => {
    vi.useFakeTimers();
    document.documentElement.classList.add('is-launching');
    document.body.innerHTML = `
      <div id="app-launch-screen"></div>
      <div aria-hidden="true" id="root" inert></div>
    `;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    finishLaunchScreen({
      delay: 100,
      fadeDuration: 50,
      windowRef: {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        requestAnimationFrame,
        setTimeout: window.setTimeout.bind(window),
      } as Pick<Window, 'matchMedia' | 'requestAnimationFrame' | 'setTimeout'>,
    });

    vi.advanceTimersByTime(100);
    expect(document.getElementById('app-launch-screen')).toHaveClass('is-leaving');
    expect(document.documentElement).not.toHaveClass('is-launching');

    vi.advanceTimersByTime(50);
    expect(document.getElementById('app-launch-screen')).not.toBeInTheDocument();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
    expect(document.getElementById('root')).not.toHaveAttribute('aria-hidden');
    vi.useRealTimers();
  });
});

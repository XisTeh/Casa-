import { vi } from 'vitest';
import { PwaInstallManager, type BeforeInstallPromptEvent } from '../pwa/install-manager';

function mockDisplayMode(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe('PwaInstallManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('captura beforeinstallprompt, exibe a instalação e verifica userChoice', async () => {
    mockDisplayMode(false);
    const manager = new PwaInstallManager(window, navigator);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    }) as BeforeInstallPromptEvent;

    manager.start();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ installable: true, installed: false });
    await expect(manager.promptInstall()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(manager.getSnapshot()).toMatchObject({
      installable: false,
      installed: false,
      installing: true,
    });
    manager.destroy();
  });

  it('esconde a instalação após appinstalled', () => {
    mockDisplayMode(false);
    const manager = new PwaInstallManager(window, navigator);
    manager.start();
    window.dispatchEvent(new Event('appinstalled'));

    expect(manager.getSnapshot()).toMatchObject({
      installable: false,
      installed: true,
      installing: false,
    });
    manager.destroy();
  });

  it('começa instalado em display-mode standalone', () => {
    mockDisplayMode(true);
    const manager = new PwaInstallManager(window, navigator);

    expect(manager.getSnapshot()).toMatchObject({ installable: false, installed: true });
  });

  it('reconhece iPhone e iPadOS sem oferecer prompt programático falso', () => {
    mockDisplayMode(false);
    const iphone = new PwaInstallManager(window, {
      userAgent: 'Mozilla/5.0 (iPhone)',
      maxTouchPoints: 5,
    } as Navigator);
    const ipad = new PwaInstallManager(window, {
      userAgent: 'Mozilla/5.0 (Macintosh)',
      maxTouchPoints: 5,
    } as Navigator);

    expect(iphone.getSnapshot()).toMatchObject({ ios: true, installable: false });
    expect(ipad.getSnapshot()).toMatchObject({ ios: true, installable: false });
  });
});

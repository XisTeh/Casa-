export type InstallChoice = 'accepted' | 'dismissed';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: InstallChoice; platform: string }>;
}

export type PwaInstallSnapshot = {
  installed: boolean;
  installable: boolean;
  installing: boolean;
  ios: boolean;
  lastChoice: InstallChoice | null;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type SnapshotListener = () => void;

export class PwaInstallManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly listeners = new Set<SnapshotListener>();
  private mediaQuery: MediaQueryList | null = null;
  private started = false;
  private snapshot: PwaInstallSnapshot;

  constructor(
    private readonly windowRef: Window,
    private readonly navigatorRef: NavigatorWithStandalone,
  ) {
    this.snapshot = {
      installed: this.detectStandalone(),
      installable: false,
      installing: false,
      ios: this.detectIos(),
      lastChoice: null,
    };
  }

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: SnapshotListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started) return;
    this.started = true;
    this.windowRef.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    this.windowRef.addEventListener('appinstalled', this.onAppInstalled);
    this.mediaQuery = this.windowRef.matchMedia?.('(display-mode: standalone)') ?? null;
    this.mediaQuery?.addEventListener?.('change', this.onDisplayModeChange);
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.windowRef.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    this.windowRef.removeEventListener('appinstalled', this.onAppInstalled);
    this.mediaQuery?.removeEventListener?.('change', this.onDisplayModeChange);
    this.mediaQuery = null;
    this.listeners.clear();
  }

  async promptInstall(): Promise<InstallChoice | null> {
    const prompt = this.deferredPrompt;
    if (!prompt || this.snapshot.installed) return null;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      this.deferredPrompt = null;
      this.updateSnapshot({ installable: false, installing: true, lastChoice: outcome });
    } else {
      this.updateSnapshot({ lastChoice: outcome });
    }
    return outcome;
  }

  private readonly onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.updateSnapshot({
      installed: this.detectStandalone(),
      installable: !this.detectStandalone(),
      installing: false,
      lastChoice: null,
    });
  };

  private readonly onAppInstalled = () => {
    this.deferredPrompt = null;
    this.updateSnapshot({
      installed: true,
      installable: false,
      installing: false,
      lastChoice: 'accepted',
    });
  };

  private readonly onDisplayModeChange = () => {
    const installed = this.detectStandalone();
    this.updateSnapshot({
      installed,
      installable: installed ? false : this.snapshot.installable,
      installing: installed ? false : this.snapshot.installing,
    });
  };

  private detectStandalone() {
    return (
      this.windowRef.matchMedia?.('(display-mode: standalone)').matches === true ||
      this.navigatorRef.standalone === true
    );
  }

  private detectIos() {
    const userAgent = this.navigatorRef.userAgent;
    return (
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && this.navigatorRef.maxTouchPoints > 1)
    );
  }

  private updateSnapshot(changes: Partial<PwaInstallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}

export const pwaInstallManager = new PwaInstallManager(window, navigator);

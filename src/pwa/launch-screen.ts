type LaunchScreenWindow = Pick<Window, 'matchMedia' | 'requestAnimationFrame' | 'setTimeout'>;

type FinishLaunchScreenOptions = {
  delay?: number;
  documentRef?: Document;
  fadeDuration?: number;
  windowRef?: LaunchScreenWindow;
};

export function finishLaunchScreen({
  delay = 1050,
  documentRef = document,
  fadeDuration = 360,
  windowRef = window,
}: FinishLaunchScreenOptions = {}) {
  const launchScreen = documentRef.getElementById('app-launch-screen');
  if (!launchScreen) return;

  const root = documentRef.getElementById('root');
  const reduceMotion = windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const visibleDelay = reduceMotion ? 80 : delay;
  const exitDuration = reduceMotion ? 0 : fadeDuration;

  const removeLaunchScreen = () => {
    launchScreen.remove();
    root?.removeAttribute('aria-hidden');
    root?.removeAttribute('inert');
  };

  windowRef.requestAnimationFrame(() => {
    windowRef.setTimeout(() => {
      launchScreen.classList.add('is-leaving');
      documentRef.documentElement.classList.remove('is-launching');
      windowRef.setTimeout(removeLaunchScreen, exitDuration);
    }, visibleDelay);
  });
}

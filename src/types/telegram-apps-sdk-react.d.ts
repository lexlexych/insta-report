declare module '@telegram-apps/sdk-react' {
  type Callable<R = void> = {
    (): R;
    isAvailable(): boolean;
  };

  type Signal<T> = {
    (): T;
    sub(listener: () => void): () => void;
  };

  export function init(): void;
  export function retrieveLaunchParams(): unknown;
  export function retrieveRawInitData(): string | undefined;

  export const miniApp: {
    mount: Callable;
    ready: Callable;
  };

  export const mainButton: {
    mount: Callable;
    setParams: Callable<void> &
      ((params: { text?: string; isVisible?: boolean; isEnabled?: boolean }) => void);
    onClick(handler: () => void): () => void;
  };

  export const backButton: {
    mount: Callable;
    show: Callable;
    hide: Callable;
    onClick: Callable<() => void> & ((handler: () => void) => () => void);
    unmount(): void;
  };

  export const viewport: {
    mount: Callable<Promise<void>>;
    expand: Callable;
  };

  export const themeParams: {
    mount: Callable;
    state: Signal<Record<string, string | undefined>>;
  };

  type LaunchParams = {
    tgWebAppData?: {
      user?: {
        language_code?: string;
        languageCode?: string;
      };
    };
  };

  export function useLaunchParams(): LaunchParams;
  export function useLaunchParams(camelCase: true): LaunchParams & { tgWebAppStartParam?: string };
}

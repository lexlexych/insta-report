declare module '@telegram-apps/sdk-react' {
  export function init(): void;

  export const miniApp: {
    ready(): void;
  };

  export const viewport: {
    expand(): void;
  };

  export const themeParams: {
    state?: Record<string, string | undefined>;
    on(event: 'change', handler: () => void): () => void;
  };

  export function retrieveRawInitData(): string | undefined;

  export function useLaunchParams(): {
    initDataUnsafe?: {
      user?: {
        languageCode?: string;
        language_code?: string;
      };
    };
  };
}

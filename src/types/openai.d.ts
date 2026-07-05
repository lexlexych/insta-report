declare module 'openai' {
  export type OpenAIOptions = {
    baseURL?: string;
    apiKey?: string;
    /**
     * Кастомная реализация fetch. Передаём нативный global fetch, чтобы SDK не
     * использовал свой node-fetch-шим с устаревшим `url.parse()` (DEP0169).
     */
    fetch?: typeof fetch;
  };

  export default class OpenAI {
    constructor(options?: OpenAIOptions);
    chat: {
      completions: {
        create(params: unknown, options?: { timeout?: number }): Promise<unknown>;
      };
    };
  }
}

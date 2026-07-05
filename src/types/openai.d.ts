declare module 'openai' {
  export type OpenAIOptions = {
    baseURL?: string;
    apiKey?: string;
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

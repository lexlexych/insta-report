declare module 'grammy' {
  export type Context = {
    from?: { id: number; language_code?: string };
    chat?: { id: number };
    reply(text: string, options?: { reply_markup?: InlineKeyboard }): Promise<unknown>;
    answerCallbackQuery(options?: { text?: string }): Promise<unknown>;
  };

  export class InlineKeyboard {
    webApp(text: string, url: string): this;
    url(text: string, url: string): this;
    row(): this;
    text(text: string, callbackData: string): this;
  }

  export class Bot<C extends Context = Context> {
    readonly api: {
      sendMessage(chatId: number | string, text: string, options?: unknown): Promise<unknown>;
      editMessageText(
        chatId: number | string,
        messageId: number,
        text: string,
        options?: unknown,
      ): Promise<unknown>;
      deleteMessage(chatId: number | string, messageId: number): Promise<unknown>;
      answerCallbackQuery(id: string, options?: { text?: string }): Promise<unknown>;
      setWebhook(
        url: string,
        options?: { secret_token?: string; allowed_updates?: string[] },
      ): Promise<unknown>;
      setMyCommands(
        commands: Array<{ command: string; description: string }>,
        options?: { language_code?: string },
      ): Promise<unknown>;
      setChatMenuButton(options: {
        menu_button: { type: 'web_app'; text: string; web_app: { url: string } };
      }): Promise<unknown>;
      getWebhookInfo(): Promise<unknown>;
    };

    constructor(token: string);
    command(command: string, handler: (ctx: C) => unknown): void;
    on(filter: string, handler: (ctx: C) => unknown): void;
  }

  export function webhookCallback(
    bot: Bot,
    adapter: 'std/http',
  ): (req: Request) => Promise<Response>;
}

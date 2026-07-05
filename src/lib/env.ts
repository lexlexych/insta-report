import { z } from 'zod';

/**
 * Единственная точка доступа к process.env во всём проекте (см. docs/plan.md §5).
 * Схема НЕ парсится на этапе импорта модуля — только при первом обращении к `env.*`
 * или явном вызове `getEnv()`. Это позволяет безопасно импортировать модуль там,
 * где переменные окружения ещё не заданы (например, в скриптах/раннем этапе сборки).
 */
export const envSchema = z.object({
  /** Токен центрального Telegram-бота (BotFather) */
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  /** secret_token, передаваемый в setWebhook и сверяемый в заголовке запроса */
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  /** Секрет для подписи JWT сессий Mini App */
  MINIAPP_JWT_SECRET: z.string().min(1),
  /** Base64 от 32 байт — ключ AES-256-GCM для шифрования секретов тенантов */
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine(
      (value) => {
        try {
          return Buffer.from(value, 'base64').length === 32;
        } catch {
          return false;
        }
      },
      {
        message:
          'ENCRYPTION_KEY должен быть строкой в base64, декодирующейся ровно в 32 байта (ключ AES-256-GCM)',
      },
    ),
  /** URL проекта Supabase */
  SUPABASE_URL: z.string().min(1),
  /** Secret key Supabase (доступ к БД только с сервера, обходит RLS) */
  SUPABASE_SECRET_KEY: z.string().min(1),
  /** Базовый URL LLM-провайдера, например https://openrouter.ai/api/v1 */
  LLM_BASE_URL: z.string().min(1),
  /** API-ключ LLM-провайдера */
  LLM_API_KEY: z.string().min(1),
  /** Модель для классификации сообщений по меткам, например openai/gpt-4o-mini */
  LLM_MODEL_CLASSIFY: z.string().min(1),
  /** Модель для генерации черновиков ответов, например openai/gpt-4o-mini */
  LLM_MODEL_DRAFT: z.string().min(1),
  /** Публичный базовый URL приложения, например https://<project>.vercel.app */
  APP_BASE_URL: z.string().min(1),
  /** Секрет для защиты роутов /api/cron/* (заголовок Authorization: Bearer) */
  CRON_SECRET: z.string().min(1),
  /** CSV telegram_user_id администраторов для алертов; может быть пустым */
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  /** Суточный лимит запросов к симулятору тест-чата на tenant */
  SIMULATOR_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Мемоизированный парсинг process.env по envSchema. Бросает ZodError при первом
 * обращении, если переменные отсутствуют/некорректны (fail-fast, но лениво).
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

/**
 * Типобезопасный доступ к переменным окружения: `env.TELEGRAM_BOT_TOKEN` и т.п.
 * Реальный парсинг (и возможная ошибка) происходит только при обращении к полю,
 * а не при импорте модуля.
 */
export const env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    return getEnv()[prop as keyof Env];
  },
  has(_target, prop: string | symbol) {
    return prop in getEnv();
  },
}) as Env;

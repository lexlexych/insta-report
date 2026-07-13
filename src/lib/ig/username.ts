/** Нормализация username, безопасная для использования и в клиентском визарде, и в API. */
export function normalizeIgUsername(input: string): string | null {
  const normalized = input.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(normalized) ? normalized : null;
}

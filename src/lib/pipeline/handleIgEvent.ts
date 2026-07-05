// TODO(T-016): реализовать обработку события Meta-вебхука (Instagram DM webhook payload).
export async function handleIgEvent(tenantId: string, body: unknown): Promise<void> {
  // TODO(T-016)
  void tenantId;
  void body;
}

export function logPipelineError(tenantId: string, error: unknown): void {
  console.error(`[pipeline] tenant=${tenantId}`, error);
}

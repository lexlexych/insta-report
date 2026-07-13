function normalizePromptValue(value: string): string {
  return value.trim();
}

export function defaultSystemPrompt(orgName: string): string {
  return `Ты — ассистент службы поддержки компании «${normalizePromptValue(orgName)}».
Отвечай кратко, дружелюбно и на языке клиента. Опирайся только на базу знаний.
Не выдумывай цены, сроки, факты или обещания. Если точного ответа нет, предложи дождаться ответа сотрудника.`;
}

export type ClassifyLabelPromptInput = {
  name: string;
  description: string | null;
};

export type ClassifyPrompt = {
  system: string;
  user: string;
};

export type DraftPrompt = {
  system: string;
  user: string;
};

export function classifyPrompt(
  labels: ClassifyLabelPromptInput[],
  history: string,
  pendingText: string,
): ClassifyPrompt {
  const categories = labels
    .map(
      (label) =>
        `- ${normalizePromptValue(label.name)}: ${normalizePromptValue(label.description ?? '')}`,
    )
    .join('\n');

  return {
    system:
      'Ты — классификатор обращений клиентов. Выбери РОВНО ОДНУ категорию из списка или верни пустую строку, если ни одна не подходит. Отвечай JSON {"label": "..."}',
    user: `Категории:
${categories}

История диалога:
${history}

Новое обращение:
${pendingText}`,
  };
}

export function draftPrompt(
  tenant: { system_prompt: string | null; knowledge_base: string | null },
  label: { instruction: string | null },
  history: string,
  pendingText: string,
): DraftPrompt {
  return {
    system: `${normalizePromptValue(tenant.system_prompt ?? '')}

=== База знаний ===
${normalizePromptValue(tenant.knowledge_base ?? '')}

Правила:
- Отвечай на языке, на котором пишет клиент.
- Не выдумывай факты, цены и обещания — если данных нет в базе знаний, вежливо скажи, что уточнишь.
- Пиши как живой сотрудник, без подписи и без markdown.
- Верни ТОЛЬКО текст ответа.`,
    user: `История диалога:
${history}

Неотвеченные сообщения клиента:
${pendingText}

Инструкция для этой категории обращений: ${normalizePromptValue(label.instruction ?? '')}`,
  };
}

export type KbGenerationPrompt = {
  system: string;
  user: string;
};

function normalizePromptValue(value: string): string {
  return value.trim();
}

export function kbGenerationPrompt(orgName: string, orgDescription: string): KbGenerationPrompt {
  const safeOrgName = normalizePromptValue(orgName);
  const safeOrgDescription = normalizePromptValue(orgDescription);

  return {
    system: `Ты помогаешь владельцу бизнеса подготовить базу знаний и системную инструкцию для AI-ассистента службы поддержки.
Верни строго JSON-объект с полями knowledge_base и system_prompt. Не добавляй другие поля.
Не выдумывай факты, цены, адреса, сроки, гарантии или обещания: используй только описание владельца.`,
    user: `Организация: ${safeOrgName}

Описание владельца:
${safeOrgDescription}

Сформируй knowledge_base в markdown со строго такими разделами:
# ${safeOrgName}
## О компании
## Услуги и цены
## Практическая информация
## Тон общения
## Частые вопросы

Требования к knowledge_base:
- В разделе «О компании» кратко опиши компанию только по описанию владельца.
- В разделе «Услуги и цены» перечисли услуги, товары, пакеты и цены только если они явно есть в описании; отсутствующие цены помечай как «уточнить у владельца».
- В разделе «Практическая информация» укажи адрес, часы работы и контакты только если они явно есть в описании; каждый отсутствующий пункт пометь как «уточнить у владельца».
- В разделе «Тон общения» опиши стиль ответов, выведенный из описания, без выдуманных обещаний.
- В разделе «Частые вопросы» добавь 3–5 пар вопрос/ответ, выведенных из описания; если данных для точного ответа нет, ответ должен предлагать уточнить у владельца.

Требования к system_prompt:
- Это инструкция ассистенту службы поддержки от имени «${safeOrgName}».
- Ассистент отвечает кратко, дружелюбно и на языке клиента.
- Ассистент опирается только на базу знаний.
- Если ассистент не уверен или данных нет, он предлагает дождаться ответа сотрудника.
- Ассистенту запрещено выдумывать цены, сроки, факты и обещания.

JSON-схема ответа:
{"knowledge_base":"markdown...","system_prompt":"инструкция..."}`,
  };
}

export function classifyPrompt(...args: unknown[]): never {
  void args;
  throw new Error('TODO T-018: implement classifyPrompt');
}

export function draftPrompt(...args: unknown[]): never {
  void args;
  throw new Error('TODO T-019: implement draftPrompt');
}

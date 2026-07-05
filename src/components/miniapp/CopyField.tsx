'use client';

import { useCallback, useRef, useState } from 'react';

import { useT } from '@/lib/i18n';

const COPIED_TIMEOUT_MS = 1500;

/**
 * Моноширинное read-only значение (webhook URL, verify token и т.п.) с кнопкой
 * копирования в буфер обмена. Если `navigator.clipboard` недоступен (нет HTTPS-контекста,
 * старый WebView и т.п.) — не бросаем необработанное исключение, просто не показываем
 * фидбек «Скопировано».
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }

    setCopied(ok);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (ok) {
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_TIMEOUT_MS);
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-tg-hint">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-tg-secondary-bg bg-tg-secondary-bg p-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
        <button
          className="shrink-0 rounded-lg bg-tg-button px-3 py-1.5 text-xs font-medium text-tg-button-text"
          type="button"
          onClick={() => void handleCopy()}
        >
          {copied ? t('igCopied') : t('igCopy')}
        </button>
      </div>
    </div>
  );
}

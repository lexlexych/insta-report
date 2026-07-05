'use client';

import type { ReactNode } from 'react';

/** Один шаг вертикального аккордеона-инструкции подключения Instagram (T-012). */
export function GuideStep({
  index,
  title,
  isOpen,
  isDone = false,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  isOpen: boolean;
  isDone?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-tg-secondary-bg">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 bg-tg-secondary-bg px-4 py-3 text-left"
        type="button"
        onClick={onToggle}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            isDone ? 'bg-green-600 text-white' : 'bg-tg-button text-tg-button-text'
          }`}
        >
          {isDone ? '✓' : index}
        </span>
        <span className="flex-1 font-medium">{title}</span>
        <span aria-hidden="true" className={`text-tg-hint transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>
      {isOpen ? <div className="space-y-3 px-4 py-4 text-sm leading-6">{children}</div> : null}
    </div>
  );
}

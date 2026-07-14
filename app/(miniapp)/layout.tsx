import type { ReactNode } from 'react';

import { BottomNav } from '@/components/miniapp/BottomNav';
import { TmaProvider } from '@/components/miniapp/TmaProvider';

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return (
    <TmaProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-tg-bg text-tg-text">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <BottomNav />
      </div>
    </TmaProvider>
  );
}

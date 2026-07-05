import type { ReactNode } from 'react';

import { BottomNav } from '@/components/miniapp/BottomNav';
import { TmaProvider } from '@/components/miniapp/TmaProvider';

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return (
    <TmaProvider>
      <div className="min-h-screen bg-tg-bg pb-24 text-tg-text">
        {children}
        <BottomNav />
      </div>
    </TmaProvider>
  );
}

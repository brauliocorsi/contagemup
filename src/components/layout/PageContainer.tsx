import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Consistent page wrapper for all views. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6 animate-fade-in', className)}>{children}</div>;
}

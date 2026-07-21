import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

/** Card wrapper for content sections with a consistent header. */
export function SectionCard({
  title, description, icon, actions, children, className, contentClassName, noPadding,
}: SectionCardProps) {
  const hasHeader = title || description || actions;
  return (
    <Card className={cn('border-border-subtle', className)}>
      {hasHeader && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <CardTitle className="font-heading text-base font-semibold">
                  {title}
                </CardTitle>
              )}
              {description && (
                <CardDescription className="text-sm mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(noPadding ? 'p-0' : 'pt-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

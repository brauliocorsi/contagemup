import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, { icon: string; badge: string }> = {
  default: { icon: 'bg-muted text-foreground', badge: 'bg-muted text-foreground' },
  primary: { icon: 'bg-primary/10 text-primary', badge: 'bg-primary/10 text-primary' },
  success: { icon: 'bg-success-soft text-success', badge: 'bg-success-soft text-success' },
  warning: { icon: 'bg-warning-soft text-warning', badge: 'bg-warning-soft text-warning' },
  danger:  { icon: 'bg-danger-soft text-danger',   badge: 'bg-danger-soft text-danger' },
  info:    { icon: 'bg-info-soft text-info',       badge: 'bg-info-soft text-info' },
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  label, value, hint, icon, badge, tone = 'default', onClick, className,
}: StatCardProps) {
  const t = toneClasses[tone];
  return (
    <Card
      onClick={onClick}
      className={cn(
        'group border-border-subtle transition-all duration-150',
        onClick && 'cursor-pointer hover:shadow-md hover:border-border',
        className,
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          {icon && (
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', t.icon)}>
              {icon}
            </div>
          )}
          {badge && (
            <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', t.badge)}>
              {badge}
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="font-heading text-2xl font-semibold tabular-nums leading-none text-foreground">
            {value}
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          {hint && <p className="text-xs text-muted-foreground pt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

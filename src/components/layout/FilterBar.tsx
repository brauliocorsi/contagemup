import { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  children?: ReactNode;
  className?: string;
}

export function FilterBar({
  search, onSearchChange, placeholder = 'Pesquisar...', onClear, children, className,
}: FilterBarProps) {
  const showSearch = typeof onSearchChange === 'function';
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border border-border-subtle bg-surface p-2 mb-4',
        className,
      )}
    >
      {showSearch && (
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={placeholder}
            className="pl-9 h-9 border-0 bg-transparent shadow-none focus-visible:ring-1"
          />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}

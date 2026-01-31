import { Button } from '@/components/ui/button';
import { Tags } from 'lucide-react';

interface Session {
  id: string;
  name: string;
  category: string;
}

interface CountingHeaderProps {
  currentSession: Session | undefined;
  totalProducts: number;
  onChangeSession: () => void;
}

export function CountingHeader({
  currentSession,
  totalProducts,
  onChangeSession,
}: CountingHeaderProps) {
  if (!currentSession) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">{currentSession.name}</h2>
          {currentSession.category !== 'Todas' && (
            <>
              {currentSession.category.split(',').map((cat, i) => (
                <span key={i} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <Tags className="h-3 w-3 mr-1" />
                  {cat.trim()}
                </span>
              ))}
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Sessão ativa • {totalProducts} produtos
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onChangeSession}>
        Mudar sessão
      </Button>
    </div>
  );
}

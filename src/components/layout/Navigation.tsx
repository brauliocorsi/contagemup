import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Package, ClipboardList, History, BarChart3, Tags } from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'counting', label: 'Contagem', icon: ClipboardList },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'categories', label: 'Categorias', icon: Tags },
  { id: 'sessions', label: 'Sessões', icon: History },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
];

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <nav className="border-b bg-background">
      <div className="container">
        <div className="flex gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap',
                activeTab === tab.id && 'shadow-sm'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
    </nav>
  );
}

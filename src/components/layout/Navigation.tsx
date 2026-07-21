import { cn } from '@/lib/utils';
import { 
  Package, ClipboardList, History, BarChart3, Tags,
  TrendingUp, TrendingDown, Warehouse, AlertTriangle, AlertOctagon,
  ChevronDown, Settings, LayoutDashboard
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Grupo de itens de Stock
const stockItems = [
  { id: 'entries', label: 'Entradas', icon: TrendingUp },
  { id: 'exits', label: 'Saídas', icon: TrendingDown },
  { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
  { id: 'damages', label: 'Avarias', icon: AlertOctagon },
];

// Grupo de itens de Gestão
const managementItems = [
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'categories', label: 'Categorias', icon: Tags },
  { id: 'sessions', label: 'Sessões', icon: History },
  { id: 'recent', label: 'Recentes', icon: History },
];

// Items principais (não agrupados)
const mainTabs = [
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'counting', label: 'Contagem', icon: ClipboardList },
];

// Items finais

// Items finais
const endTabs = [
  { id: 'warehouse', label: 'Armazém', icon: Warehouse },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const isStockActive = stockItems.some(item => item.id === activeTab);
  const isManagementActive = managementItems.some(item => item.id === activeTab);
  
  const getActiveStockLabel = () => {
    const active = stockItems.find(item => item.id === activeTab);
    return active?.label || 'Stock';
  };
  
  const getActiveManagementLabel = () => {
    const active = managementItems.find(item => item.id === activeTab);
    return active?.label || 'Gestão';
  };

  const navBtnBase = 'flex items-center gap-2 whitespace-nowrap h-9 px-3 rounded-md text-sm font-medium transition-colors';
  const activeCls = 'bg-primary/10 text-primary hover:bg-primary/15';
  const idleCls = 'text-muted-foreground hover:text-foreground hover:bg-muted/60';

  return (
    <nav className="sticky top-16 z-30 border-b border-border-subtle bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container">
        <div className="flex gap-1 flex-wrap py-2 overflow-x-auto">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(navBtnBase, isActive ? activeCls : idleCls)}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(navBtnBase, isManagementActive ? activeCls : idleCls)}>
                <Package className="h-4 w-4" />
                {isManagementActive ? getActiveManagementLabel() : 'Gestão'}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {managementItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn('gap-2 cursor-pointer', activeTab === item.id && 'bg-primary/10 text-primary font-medium')}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(navBtnBase, isStockActive ? activeCls : idleCls)}>
                <TrendingUp className="h-4 w-4" />
                {isStockActive ? getActiveStockLabel() : 'Stock'}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {stockItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn('gap-2 cursor-pointer', activeTab === item.id && 'bg-primary/10 text-primary font-medium')}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {endTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(navBtnBase, isActive ? activeCls : idleCls)}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

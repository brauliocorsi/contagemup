import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  Package, ClipboardList, History, BarChart3, Tags, Scale, 
  TrendingUp, TrendingDown, Warehouse, AlertTriangle, AlertOctagon,
  ChevronDown, Settings, ArrowLeftRight, ShoppingBag
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
  { id: 'counting', label: 'Contagem', icon: ClipboardList },
];

// Items finais
const endTabs = [
  { id: 'reconciliation', label: 'Separação', icon: Scale },
  { id: 'erp', label: 'Conciliação ERP', icon: ArrowLeftRight },
  { id: 'purchases', label: 'Compras', icon: ShoppingBag },
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

  return (
    <nav className="border-b bg-background">
      <div className="container">
        <div className="flex gap-1 overflow-x-auto py-2">
          {/* Contagem - sempre visível */}
          {mainTabs.map((tab) => (
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

          {/* Grupo Gestão */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isManagementActive ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap',
                  isManagementActive && 'shadow-sm'
                )}
              >
                <Package className="h-4 w-4" />
                {isManagementActive ? getActiveManagementLabel() : 'Gestão'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {managementItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'flex items-center gap-2 cursor-pointer',
                    activeTab === item.id && 'bg-accent'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Grupo Stock */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isStockActive ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap',
                  isStockActive && 'shadow-sm'
                )}
              >
                <TrendingUp className="h-4 w-4" />
                {isStockActive ? getActiveStockLabel() : 'Stock'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {stockItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'flex items-center gap-2 cursor-pointer',
                    activeTab === item.id && 'bg-accent'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Items finais */}
          {endTabs.map((tab) => (
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

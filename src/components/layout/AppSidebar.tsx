import {
  LayoutDashboard, ClipboardList, TrendingUp, TrendingDown, AlertTriangle,
  AlertOctagon, Package, Tags, History,
  BarChart3, Warehouse, Settings, ScanBarcode,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operação',
    items: [
      { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'counting', label: 'Contagem', icon: ClipboardList },
      { id: 'entries', label: 'Entradas', icon: TrendingUp },
      { id: 'exits', label: 'Saídas', icon: TrendingDown },
      { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { id: 'products', label: 'Produtos', icon: Package },
      { id: 'recent', label: 'Recentes', icon: History },
      { id: 'categories', label: 'Categorias', icon: Tags },
      { id: 'damages', label: 'Avarias', icon: AlertOctagon },
    ],
  },
  {

    label: 'Análise',
    items: [
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
      { id: 'warehouse', label: 'Armazém', icon: Warehouse },
      { id: 'sessions', label: 'Sessões', icon: History },
    ],
  },
  {
    label: 'Sistema',
    items: [{ id: 'settings', label: 'Configurações', icon: Settings }],
  },
];

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/60 py-4">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-accent text-sidebar-primary-foreground shadow-elegant">
            <Package className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-heading font-bold text-[15px] tracking-tight text-sidebar-foreground truncate">
                UP Móveis
              </span>
              <span className="text-[11px] text-sidebar-foreground/60 -mt-0.5">
                Contagem &amp; Stock
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-gradient-sidebar px-1.5 py-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="mb-1">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 px-2 mb-1">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => onTabChange(item.id)}
                        isActive={isActive}
                        tooltip={collapsed ? item.label : undefined}
                        className={cn(
                          'group/item h-9 rounded-lg gap-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                          isActive &&
                            'bg-sidebar-primary/15 text-sidebar-primary-foreground hover:bg-sidebar-primary/20 font-semibold shadow-sm',
                        )}
                      >
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/55 group-hover/item:text-sidebar-foreground',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {isActive && !collapsed && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mb-1">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 px-2 mb-1">
              Mobile
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={collapsed ? 'Scanner' : undefined}
                  className="group/item h-9 rounded-lg gap-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  <a href="/scanner" target="_blank" rel="noreferrer">
                    <ScanBarcode className="h-4 w-4 shrink-0 text-sidebar-foreground/55 group-hover/item:text-sidebar-foreground" />
                    <span className="truncate">Scanner</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

import { useAuth } from '@/hooks/useAuth';
import { useActiveSession } from '@/hooks/useActiveSession';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Package, LogOut, User, ClipboardList, Moon, Sun, Download, Scale, ArrowLeftRight, ShoppingBag, FileText, MapPin, ChevronDown, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StockAlertsBell } from '@/components/stock/StockAlertsBell';
import { GlobalProductSearch } from '@/components/search/GlobalProductSearch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const erpItems = [
  { id: 'reconciliation', label: 'Separação', icon: Scale },
  { id: 'erp', label: 'Conciliação ERP', icon: ArrowLeftRight },
  { id: 'purchases', label: 'Compras', icon: ShoppingBag },
  { id: 'pending-sales', label: 'Vendas Pendentes', icon: FileText },
  { id: 'cancellations', label: 'Cancelamentos', icon: XCircle },
  { id: 'routes', label: 'Rotas', icon: MapPin },
];

interface HeaderProps {
  onNavigateToProducts?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function Header({ onNavigateToProducts, activeTab, onTabChange }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { activeSession } = useActiveSession();
  const { canInstall, isInstalled, install } = usePWAInstall();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const isErpActive = erpItems.some(item => item.id === activeTab);
  const activeErpLabel = erpItems.find(item => item.id === activeTab)?.label || 'ERP & Operações';

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-elegant">
              <Package className="h-5 w-5" />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-heading font-semibold text-[15px] tracking-tight">UP Móveis</span>
              <span className="text-[11px] text-muted-foreground -mt-0.5">Contagem &amp; Stock</span>
            </div>
          </div>

          {activeSession && (
            <div className="flex items-center gap-2 pl-3 border-l border-border-subtle">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-medium">
                {activeSession.name}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* ERP & Operations dropdown */}
          {onTabChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isErpActive ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'gap-2 whitespace-nowrap',
                    isErpActive && 'shadow-sm'
                  )}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="hidden sm:inline">{isErpActive ? activeErpLabel : 'ERP & Operações'}</span>
                  <span className="sm:hidden">ERP</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>ERP & Operações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {erpItems.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer',
                      activeTab === item.id && 'bg-accent font-medium'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isInstalled && (
            <Button
              variant="outline"
              size="sm"
              onClick={canInstall ? install : () => navigate('/install')}
              className="hidden sm:flex"
            >
              <Download className="h-4 w-4 mr-1" />
              Instalar
            </Button>
          )}
          <GlobalProductSearch />
          <StockAlertsBell onNavigateToProducts={onNavigateToProducts} />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={profile.name || 'Avatar'} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {profile?.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === 'dark' ? (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    Modo claro
                  </>
                ) : (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    Modo escuro
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-danger focus:text-danger">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

import { useAuth } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, User, ClipboardList, Moon, Sun, Download, ScanBarcode } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StockAlertsBell } from '@/components/stock/StockAlertsBell';
import { GlobalProductSearch } from '@/components/search/GlobalProductSearch';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface HeaderProps {
  onNavigateToProducts?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function Header({ onNavigateToProducts }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { canInstall, isInstalled, install } = usePWAInstall();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border-subtle bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-full items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="h-9 w-9 shrink-0" />

        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && (
            <Button
              variant="outline"
              size="sm"
              onClick={canInstall ? install : () => navigate('/install')}
              className="hidden md:flex h-9"
            >
              <Download className="h-4 w-4 mr-1" />
              Instalar
            </Button>
          )}
          <GlobalProductSearch />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="App Código de Barras"
          >
            <a href="/scanner" target="_blank" rel="noreferrer" aria-label="Abrir app de código de barras">
              <ScanBarcode className="h-[18px] w-[18px]" />
            </a>
          </Button>
          <StockAlertsBell onNavigateToProducts={onNavigateToProducts} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={profile.name || 'Avatar'} />
                  )}
                  <AvatarFallback className="bg-primary-soft text-primary font-semibold">
                    {profile?.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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

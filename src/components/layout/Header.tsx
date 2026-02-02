import { useAuth } from '@/hooks/useAuth';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Package, LogOut, User, ClipboardList, Moon, Sun } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StockAlertsBell } from '@/components/stock/StockAlertsBell';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  onNavigateToProducts?: () => void;
}

export function Header({ onNavigateToProducts }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { activeSession } = useActiveSession();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg hidden sm:inline">Conferências UP Móveis</span>
          </div>
          
          {activeSession && (
            <div className="flex items-center gap-2 pl-3 border-l">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-medium">
                {activeSession.name}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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
              <DropdownMenuItem onClick={signOut} className="text-destructive">
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
import { useState, useMemo, forwardRef } from 'react';
import { Check, ChevronsUpDown, MapPin, Plus, Forklift, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useWarehouseLocations } from '@/hooks/useWarehouseConfig';
import { useAuth } from '@/hooks/useAuth';

interface LocationSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Cores predefinidas para ruas (aisles)
const AISLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  'B': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  'C': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'D': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'E': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  'F': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'G': { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
  'H': { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300' },
};

const getAisleColor = (aisleName: string | undefined) => {
  if (!aisleName) return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted' };
  const firstChar = aisleName.charAt(0).toUpperCase();
  return AISLE_COLORS[firstChar] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
};

export const LocationSelect = forwardRef<HTMLButtonElement, LocationSelectProps>(({ 
  value, 
  onValueChange, 
  placeholder = "Selecionar localização...",
  className,
  disabled = false
}, ref) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { locations, isLoading, createLocation } = useWarehouseLocations();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const locationOptions = useMemo(() => locations
    .filter(loc => loc.code && loc.code.trim() !== '')
    .map(loc => ({
      value: loc.code,
      label: loc.code,
      aisle: loc.aisle?.name,
      aisleColor: loc.aisle?.color,
      level: loc.level?.name,
      levelShort: loc.level?.short_name,
      requiresForklift: loc.level?.requires_forklift ?? false,
    })), [locations]);

  // Group locations by aisle
  const groupedLocations = useMemo(() => {
    const groups: Record<string, typeof locationOptions> = {};
    locationOptions.forEach(opt => {
      const key = opt.aisle || 'Sem Rua';
      if (!groups[key]) groups[key] = [];
      groups[key].push(opt);
    });
    return groups;
  }, [locationOptions]);

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue === value ? '' : selectedValue);
    setOpen(false);
    setInputValue('');
  };

  // Texto livre não é permitido: uma localização só pode ser usada depois de
  // existir no cadastro. Administradores podem criá-la aqui mesmo.
  const handleCreateCustom = async () => {
    const code = inputValue.trim().toUpperCase();
    if (!code || !isAdmin) return;
    await createLocation.mutateAsync({
      code,
      position_in_aisle: 0,
      is_staging: false,
      location_type: 'stock',
    } as never);
    onValueChange(code);
    setOpen(false);
    setInputValue('');
  };

  const filteredGroups = useMemo(() => {
    if (!inputValue.trim()) return groupedLocations;
    
    const result: Record<string, typeof locationOptions> = {};
    Object.entries(groupedLocations).forEach(([aisle, opts]) => {
      const filtered = opts.filter(opt =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.aisle?.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.level?.toLowerCase().includes(inputValue.toLowerCase())
      );
      if (filtered.length > 0) result[aisle] = filtered;
    });
    return result;
  }, [groupedLocations, inputValue]);

  const totalFiltered = Object.values(filteredGroups).flat().length;

  const showCreateOption = isAdmin && !!inputValue.trim() &&
    !locationOptions.some(opt => opt.value.toLowerCase() === inputValue.toLowerCase());

  // Get selected option for display
  const selectedOption = locationOptions.find(opt => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn(
            "w-full justify-between h-8 text-sm font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            {selectedOption ? (
              <>
                <span>{selectedOption.label}</span>
                {selectedOption.requiresForklift ? (
                  <Forklift className="h-3 w-3 text-amber-600" />
                ) : (
                  <Footprints className="h-3 w-3 text-green-600" />
                )}
              </>
            ) : value ? (
              <span>{value}</span>
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Procurar localização..." 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              {inputValue.trim() && isAdmin ? (
                <button
                  onClick={handleCreateCustom}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Criar localização "{inputValue.trim().toUpperCase()}"
                </button>
              ) : inputValue.trim() ? (
                <span className="text-xs text-muted-foreground">
                  Localização não existe no cadastro. Peça a um administrador para a criar.
                </span>
              ) : (
                "Nenhuma localização configurada."
              )}
            </CommandEmpty>
            
            {Object.entries(filteredGroups).map(([aisle, options]) => {
              const aisleColor = getAisleColor(aisle);
              return (
                <CommandGroup 
                  key={aisle} 
                  heading={
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs px-1.5 py-0", aisleColor.bg, aisleColor.text, aisleColor.border)}
                      >
                        {aisle}
                      </Badge>
                      <span className="text-xs text-muted-foreground">({options.length})</span>
                    </div>
                  }
                >
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={handleSelect}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 flex-shrink-0",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium">{option.label}</span>
                        {option.levelShort && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-xs px-1 py-0 h-4",
                              option.requiresForklift 
                                ? "bg-amber-50 text-amber-700 border-amber-300" 
                                : "bg-green-50 text-green-700 border-green-300"
                            )}
                          >
                            {option.levelShort}
                          </Badge>
                        )}
                      </div>
                      {option.requiresForklift ? (
                        <Forklift className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      ) : (
                        <Footprints className="h-4 w-4 text-green-600 flex-shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            
            {showCreateOption && totalFiltered > 0 && (
              <CommandGroup heading="Personalizado">
                <CommandItem
                  value={inputValue}
                  onSelect={handleCreateCustom}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Usar "{inputValue}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

LocationSelect.displayName = 'LocationSelect';

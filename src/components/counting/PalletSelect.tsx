import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Box, Plus, MapPin, Forklift, Footprints } from 'lucide-react';
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
import { useWarehousePallets } from '@/hooks/useWarehouseConfig';
import { Badge } from '@/components/ui/badge';

interface PalletSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const STATUS_CONFIG = {
  'available': { 
    label: 'Livre', 
    bg: 'bg-green-100', 
    text: 'text-green-700',
    border: 'border-green-300',
    icon: '✓'
  },
  'in_use': { 
    label: 'Em uso', 
    bg: 'bg-blue-100', 
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: '●'
  },
  'maintenance': { 
    label: 'Manutenção', 
    bg: 'bg-amber-100', 
    text: 'text-amber-700',
    border: 'border-amber-300',
    icon: '⚠'
  },
} as const;

export function PalletSelect({ 
  value, 
  onValueChange, 
  placeholder = "Selecionar palete...",
  className,
  disabled = false
}: PalletSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { pallets, isLoading } = useWarehousePallets();

  const palletOptions = useMemo(() => pallets.map(p => ({
    value: p.code,
    label: p.code,
    status: p.status as keyof typeof STATUS_CONFIG,
    location: p.location?.code,
    aisle: p.location?.aisle?.name,
    level: p.location?.level?.name,
    requiresForklift: p.location?.level?.requires_forklift ?? false,
  })), [pallets]);

  // Group by status
  const groupedPallets = useMemo(() => {
    const groups: Record<string, typeof palletOptions> = {
      'available': [],
      'in_use': [],
      'maintenance': [],
    };
    palletOptions.forEach(opt => {
      const key = opt.status || 'available';
      if (groups[key]) groups[key].push(opt);
    });
    return groups;
  }, [palletOptions]);

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue === value ? '' : selectedValue);
    setOpen(false);
    setInputValue('');
  };

  const handleCreateCustom = () => {
    if (inputValue.trim()) {
      onValueChange(inputValue.trim());
      setOpen(false);
      setInputValue('');
    }
  };

  const filteredGroups = useMemo(() => {
    if (!inputValue.trim()) return groupedPallets;
    
    const result: Record<string, typeof palletOptions> = {};
    Object.entries(groupedPallets).forEach(([status, opts]) => {
      const filtered = opts.filter(opt =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.location?.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.aisle?.toLowerCase().includes(inputValue.toLowerCase())
      );
      if (filtered.length > 0) result[status] = filtered;
    });
    return result;
  }, [groupedPallets, inputValue]);

  const totalFiltered = Object.values(filteredGroups).flat().length;

  const showCreateOption = inputValue.trim() && 
    !palletOptions.some(opt => opt.value.toLowerCase() === inputValue.toLowerCase());

  // Get selected option for display
  const selectedOption = palletOptions.find(opt => opt.value === value);
  const selectedStatus = selectedOption ? STATUS_CONFIG[selectedOption.status] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
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
            <Box className="h-3.5 w-3.5 flex-shrink-0" />
            {selectedOption ? (
              <>
                <span>{selectedOption.label}</span>
                {selectedStatus && (
                  <span className={cn("text-xs", selectedStatus.text)}>
                    {selectedStatus.icon}
                  </span>
                )}
                {selectedOption.requiresForklift ? (
                  <Forklift className="h-3 w-3 text-amber-600" />
                ) : selectedOption.location ? (
                  <Footprints className="h-3 w-3 text-green-600" />
                ) : null}
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
            placeholder="Procurar palete..." 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              {inputValue.trim() ? (
                <button
                  onClick={handleCreateCustom}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Usar "{inputValue}"
                </button>
              ) : (
                "Nenhum palete configurado."
              )}
            </CommandEmpty>
            
            {Object.entries(filteredGroups).map(([status, options]) => {
              if (options.length === 0) return null;
              const statusConfig = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
              if (!statusConfig) return null;
              
              return (
                <CommandGroup 
                  key={status} 
                  heading={
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs px-1.5 py-0", statusConfig.bg, statusConfig.text, statusConfig.border)}
                      >
                        {statusConfig.icon} {statusConfig.label}
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
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium">{option.label}</span>
                        {option.location && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {option.location}
                            {option.aisle && ` • ${option.aisle}`}
                          </span>
                        )}
                      </div>
                      {option.requiresForklift ? (
                        <Forklift className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      ) : option.location ? (
                        <Footprints className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : null}
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
}

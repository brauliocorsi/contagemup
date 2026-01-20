import { useState } from 'react';
import { Check, ChevronsUpDown, Box, Plus } from 'lucide-react';
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

  const palletOptions = pallets.map(p => ({
    value: p.code,
    label: p.code,
    status: p.status,
    location: p.location?.code,
  }));

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

  const filteredOptions = palletOptions.filter(opt =>
    opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
    opt.location?.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showCreateOption = inputValue.trim() && 
    !filteredOptions.some(opt => opt.value.toLowerCase() === inputValue.toLowerCase());

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'in_use': return 'bg-blue-100 text-blue-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return 'Disponível';
      case 'in_use': return 'Em uso';
      case 'maintenance': return 'Manutenção';
      default: return status;
    }
  };

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
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Procurar ou digitar..." 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
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
            {filteredOptions.length > 0 && (
              <CommandGroup heading="Paletes">
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{option.label}</span>
                        <Badge className={cn("text-xs px-1 py-0", getStatusColor(option.status))}>
                          {getStatusLabel(option.status)}
                        </Badge>
                      </div>
                      {option.location && (
                        <span className="text-xs text-muted-foreground">
                          Em: {option.location}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreateOption && filteredOptions.length > 0 && (
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

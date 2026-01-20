import { useState } from 'react';
import { Check, ChevronsUpDown, MapPin, Plus } from 'lucide-react';
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
import { useWarehouseLocations } from '@/hooks/useWarehouseConfig';

interface LocationSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function LocationSelect({ 
  value, 
  onValueChange, 
  placeholder = "Selecionar localização...",
  className,
  disabled = false
}: LocationSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { locations, isLoading } = useWarehouseLocations();

  const locationOptions = locations.map(loc => ({
    value: loc.code,
    label: loc.code,
    aisle: loc.aisle?.name,
    level: loc.level?.name,
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

  const filteredOptions = locationOptions.filter(opt =>
    opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
    opt.aisle?.toLowerCase().includes(inputValue.toLowerCase()) ||
    opt.level?.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showCreateOption = inputValue.trim() && 
    !filteredOptions.some(opt => opt.value.toLowerCase() === inputValue.toLowerCase());

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
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
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
                "Nenhuma localização configurada."
              )}
            </CommandEmpty>
            {filteredOptions.length > 0 && (
              <CommandGroup heading="Localizações">
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
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      {(option.aisle || option.level) && (
                        <span className="text-xs text-muted-foreground">
                          {[option.aisle, option.level].filter(Boolean).join(' • ')}
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

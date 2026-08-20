import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useSuppliers } from '@/hooks/useSuppliers';

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** Seletor de fornecedores do GestãoClick com pesquisa e opção de texto livre. */
export function SupplierSelect({ value, onValueChange, placeholder = 'Fornecedor…', className }: Props) {
  const { suppliers, isLoading, refetch } = useSuppliers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term ? suppliers.filter((s) => s.name.toLowerCase().includes(term)) : suppliers;
    return list.slice(0, 100);
  }, [suppliers, search]);

  const pick = (name: string) => {
    onValueChange(name);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Pesquisar fornecedor…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> A carregar fornecedores…
              </div>
            )}
            {!isLoading && (
              <>
                <CommandEmpty>
                  <div className="space-y-2 px-2 py-3 text-sm">
                    <p className="text-muted-foreground">Nenhum fornecedor encontrado.</p>
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => refetch()}>
                      <RefreshCw className="h-3.5 w-3.5" /> Atualizar lista
                    </Button>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {value && (
                    <CommandItem value="__clear" onSelect={() => pick('')}>
                      <span className="text-muted-foreground">Limpar seleção</span>
                    </CommandItem>
                  )}
                  {search.trim() && !suppliers.some((s) => s.name.toLowerCase() === search.trim().toLowerCase()) && (
                    <CommandItem value="__custom" onSelect={() => pick(search.trim())}>
                      Usar “{search.trim()}”
                    </CommandItem>
                  )}
                  {filtered.map((s) => (
                    <CommandItem key={s.id || s.name} value={s.name} onSelect={() => pick(s.name)}>
                      <Check className={cn('mr-2 h-4 w-4', value === s.name ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{s.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

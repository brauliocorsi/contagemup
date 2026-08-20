import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Tags, MapPin, X } from 'lucide-react';

interface FilterOption {
  name: string;
  count: number;
}

interface StatusCounts {
  incomplete: number;
  complete: number;
  excess: number;
  notCounted: number;
}

interface CountingFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (value: string) => void;
  filterLocation: string;
  onFilterLocationChange: (value: string) => void;
  totalProducts: number;
  statusCounts: StatusCounts;
  categoriesWithCounts: FilterOption[];
  locationsWithCounts: FilterOption[];
  productsWithoutLocation: number;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  children?: React.ReactNode; // For export menu
}

export function CountingFilters({
  searchTerm,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterCategory,
  onFilterCategoryChange,
  filterLocation,
  onFilterLocationChange,
  totalProducts,
  statusCounts,
  categoriesWithCounts,
  locationsWithCounts,
  productsWithoutLocation,
  onClearFilters,
  hasActiveFilters,
  children,
}: CountingFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, código ou localização..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={filterStatus} onValueChange={onFilterStatusChange}>
          <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterStatus !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status ({totalProducts})</SelectItem>
            <SelectItem value="incomplete">Incompletos ({statusCounts.incomplete})</SelectItem>
            <SelectItem value="complete">Completos ({statusCounts.complete})</SelectItem>
            <SelectItem value="excess">Excesso ({statusCounts.excess})</SelectItem>
            <SelectItem value="not_counted">Não contados ({statusCounts.notCounted})</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
          <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterCategory !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
            <Tags className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias ({totalProducts})</SelectItem>
            {categoriesWithCounts.map(({ name, count }) => (
              <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterLocation} onValueChange={onFilterLocationChange}>
          <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterLocation !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
            <MapPin className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Localização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas localizações ({totalProducts})</SelectItem>
            {productsWithoutLocation > 0 && (
              <SelectItem value="__empty__">Sem localização ({productsWithoutLocation})</SelectItem>
            )}
            {locationsWithCounts.map(({ name, count }) => (
              <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
            ))}
          </SelectContent>
        </Select>


        {hasActiveFilters && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onClearFilters}
            className="whitespace-nowrap"
          >
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}

        {children}
      </div>
    </div>
  );
}

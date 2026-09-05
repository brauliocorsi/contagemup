import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OrphanColiLocation {
  location: string;
  quantity: number;
}

export interface OrphanColiDetail {
  colis_number: number;
  quantity: number;
  locations: OrphanColiLocation[];
}

export interface OrphanProduct {
  product_id: string;
  code: string;
  name: string;
  category: string;
  total_colis: number;
  complete_sets: number;
  physical_units: number;
  orphan_units: number;
  /** Colis em falta (os que estão no mínimo). */
  missing_colis: number[];
  colis: OrphanColiDetail[];
  /** Data do registo mais antigo entre as unidades órfãs. */
  oldest_at: string | null;
}

export interface OrphanFlag {
  id: string;
  product_id: string;
  missing_coli: number | null;
  status: string;
  note: string | null;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchAllCounts() {
  const rows: {
    product_id: string;
    colis_number: number;
    quantity: number;
    location: string | null;
    counted_at: string;
  }[] = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('counts')
      .select('product_id, colis_number, quantity, location, counted_at')
      .gt('quantity', 0)
      .order('product_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    rows.push(...((data as typeof rows) || []));
    if (!data || data.length < step) break;
    from += step;
  }
  return rows;
}

export function useOrphanColis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quarantine = new Set<string>() } = useQuery({
    queryKey: ['quarantine-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('code, location_type')
        .eq('location_type', 'quarantine');
      if (error) throw error;
      return new Set((data || []).map(l => (l.code || '').trim().toUpperCase()));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['orphan-colis', Array.from(quarantine).sort().join('|')],
    queryFn: async (): Promise<OrphanProduct[]> => {
      const [countsRows, productsRes, categoriesRes] = await Promise.all([
        fetchAllCounts(),
        supabase.from('products').select('id, code, name, category, total_colis, current_stock, unidades_fisicas, colis_orfaos'),
        supabase.from('categories').select('name, colis_names'),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const catColis = new Map<string, number>();
      (categoriesRes.data || []).forEach(c => {
        const names = (c.colis_names as Record<string, string> | null) || null;
        catColis.set(c.name, names ? Object.keys(names).length : 0);
      });

      const byProduct = new Map<string, typeof countsRows>();
      countsRows.forEach(r => {
        const loc = (r.location || '').trim().toUpperCase();
        if (quarantine.has(loc)) return;
        const arr = byProduct.get(r.product_id) || [];
        arr.push(r);
        byProduct.set(r.product_id, arr);
      });

      const result: OrphanProduct[] = [];

      (productsRes.data || []).forEach(p => {
        const eff = Math.max(p.total_colis || 1, catColis.get(p.category) || 0, 1);
        if (eff <= 1) return;
        const rows = byProduct.get(p.id) || [];
        if (rows.length === 0) return;

        const perColi = new Map<number, OrphanColiDetail>();
        let oldest: string | null = null;
        for (let i = 1; i <= eff; i++) perColi.set(i, { colis_number: i, quantity: 0, locations: [] });
        rows.forEach(r => {
          const detail = perColi.get(r.colis_number);
          if (!detail) return;
          detail.quantity += r.quantity;
          const locKey = r.location || 'Sem localização';
          const existing = detail.locations.find(l => l.location === locKey);
          if (existing) existing.quantity += r.quantity;
          else detail.locations.push({ location: locKey, quantity: r.quantity });
          if (!oldest || r.counted_at < oldest) oldest = r.counted_at;
        });

        const colis = Array.from(perColi.values());
        const min = Math.min(...colis.map(c => c.quantity));
        const physical = colis.reduce((s, c) => s + c.quantity, 0);
        const orphan = physical - Math.max(min, 0) * eff;
        if (orphan <= 0) return;

        result.push({
          product_id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          total_colis: eff,
          complete_sets: Math.max(min, 0),
          physical_units: physical,
          orphan_units: orphan,
          missing_colis: colis.filter(c => c.quantity === min).map(c => c.colis_number),
          colis,
          oldest_at: oldest,
        });
      });

      // Mais antigos primeiro — são os que têm mais dinheiro parado
      result.sort((a, b) => (a.oldest_at || '').localeCompare(b.oldest_at || ''));
      return result;
    },
    staleTime: 60 * 1000,
  });

  const { data: flags = [] } = useQuery({
    queryKey: ['orphan-colis-flags'],
    queryFn: async (): Promise<OrphanFlag[]> => {
      const { data, error } = await supabase
        .from('orphan_colis_flags')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as OrphanFlag[];
    },
    staleTime: 60 * 1000,
  });

  const flagOrdered = useMutation({
    mutationFn: async ({ productId, missingColi, note }: { productId: string; missingColi: number | null; note: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('orphan_colis_flags').insert({
        product_id: productId,
        missing_coli: missingColi,
        status: 'encomendado',
        note: note || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Sinalizado', description: 'Coli marcado como encomendado ao fornecedor' });
      queryClient.invalidateQueries({ queryKey: ['orphan-colis-flags'] });
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível guardar a sinalização', variant: 'destructive' });
    },
  });

  const clearFlag = useMutation({
    mutationFn: async (flagId: string) => {
      const { error } = await supabase
        .from('orphan_colis_flags')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', flagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orphan-colis-flags'] });
    },
  });

  return { products, flags, isLoading, flagOrdered, clearFlag };
}

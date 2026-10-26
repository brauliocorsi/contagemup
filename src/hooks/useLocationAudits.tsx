import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { mapDatabaseError } from '@/lib/errorMessages';

export interface LocationAudit {
  id: string;
  name: string;
  locations: string[];
  status: 'pending' | 'in_progress' | 'completed';
  created_by: string | null;
  assigned_to: string | null;
  blind_mode: boolean;
  /** 'global' = conferência por categoria/palavra, sem localização. */
  scope?: 'location' | 'global';
  scope_filter?: { category?: string | null; keyword?: string | null } | null;
  started_at: string | null;
  completed_at: string | null;
  /** Momento em que o operador entregou a contagem ao responsável. */
  delivered_at?: string | null;
  delivered_by?: string | null;
  access_code?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocationAuditItem {
  id: string;
  audit_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  location: string;
  colis_number: number | null;
  expected_quantity: number;
  counted_quantity: number | null;
  difference: number | null;
  status: 'pending' | 'counted';
  counted_by: string | null;
  counted_at: string | null;
  notes: string | null;
  created_at: string;
  /** Preenchidos quando o ajuste desta linha já foi aplicado ao stock. */
  applied_at?: string | null;
  movement_id?: string | null;
  quantity_before?: number | null;
  quantity_after?: number | null;
  /** Decisão do responsável sobre a divergência. */
  resolution?: 'ajustar' | 'sem_ajuste' | null;
  resolved_at?: string | null;
}

/** Localização usada nas linhas de uma conferência global. */
export const GLOBAL_AUDIT_LOCATION = 'TODAS';

/** Linha cujo saldo mudou entre a contagem e o fecho. */
export interface AuditDriftLine {
  item_id: string;
  product_code: string;
  location: string;
  colis_number: number | null;
  reference: number;
  current: number;
}

export interface CompleteAuditResult {
  status: 'fechada' | 'ja_fechada' | 'movimentado';
  adjustments?: number;
  drift?: AuditDriftLine[];
  completed_at?: string;
}

export interface AuditWithItems extends LocationAudit {
  items: LocationAuditItem[];
}

export interface CreateAuditInput {
  name: string;
  locations: string[];
  notes?: string;
  assignedTo?: string | null;
  blindMode?: boolean;
  /** Conferência global por categoria e/ou palavra-chave. */
  global?: { category?: string | null; keyword?: string | null };
}

const normTxt = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Produtos que correspondem ao filtro (categoria e todas as palavras no nome/código). */
export async function fetchGlobalAuditProducts(filter: { category?: string | null; keyword?: string | null }) {
  const out: { id: string; code: string; name: string; total_colis: number; category: string }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('products').select('id, code, name, total_colis, category').order('id').range(from, from + 999);
    if (filter.category) q = q.eq('category', filter.category);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as typeof out));
    if (!data || data.length < 1000) break;
  }
  const words = normTxt(filter.keyword ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return out;
  return out.filter((p) => {
    const hay = normTxt(`${p.name} ${p.code}`);
    return words.every((w) => hay.includes(w));
  });
}


export function useLocationAudits() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all audits
  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['location-audits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_audits')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LocationAudit[];
    },
  });

  // Fetch single audit with items
  const useAuditWithItems = (auditId: string | null) => {
    return useQuery({
      queryKey: ['location-audit', auditId],
      queryFn: async (): Promise<AuditWithItems | null> => {
        if (!auditId) return null;

        const auditRes = await supabase
          .from('location_audits')
          .select('*')
          .eq('id', auditId)
          .single();
        if (auditRes.error) throw auditRes.error;

        // Conferências grandes ultrapassam o limite de 1000 linhas por pedido.
        const items: LocationAuditItem[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('location_audit_items')
            .select('*')
            .eq('audit_id', auditId)
            .order('location', { ascending: true })
            .order('product_code', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          items.push(...((data ?? []) as LocationAuditItem[]));
          if (!data || data.length < pageSize) break;
        }

        return {
          ...(auditRes.data as LocationAudit),
          items,
        };

      },
      enabled: !!auditId,
    });
  };

  // Create new audit
  const createAudit = useMutation({
    mutationFn: async (input: CreateAuditInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create audit
      const { data: audit, error: auditError } = await supabase
        .from('location_audits')
        .insert({
          name: input.name,
          locations: input.locations,
          notes: input.notes || null,
          created_by: user?.id || null,
          assigned_to: input.assignedTo || null,
          blind_mode: input.blindMode ?? false,
          scope: input.global ? 'global' : 'location',
          scope_filter: input.global ?? null,
          status: 'pending',
        })
        .select()
        .single();

      if (auditError) throw auditError;

      if (input.global) {
        const prods = await fetchGlobalAuditProducts(input.global);
        const ids = prods.map((p) => p.id);
        const sums = new Map<string, number>();
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase
              .from('counts')
              .select('product_id, colis_number, quantity')
              .in('product_id', chunk)
              .gt('quantity', 0)
              .order('id')
              .range(from, from + 999);
            if (error) throw error;
            (data ?? []).forEach((c) => {
              const k = `${c.product_id}|${c.colis_number}`;
              sums.set(k, (sums.get(k) ?? 0) + c.quantity);
            });
            if (!data || data.length < 1000) break;
          }
        }
        const rows: Record<string, unknown>[] = [];
        prods.forEach((p) => {
          const colis = new Set<number>();
          for (let c = 1; c <= Math.max(1, p.total_colis || 1); c++) colis.add(c);
          sums.forEach((_, k) => {
            const [pid, c] = k.split('|');
            if (pid === p.id) colis.add(Number(c));
          });
          Array.from(colis).sort((a, b) => a - b).forEach((c) => {
            rows.push({
              audit_id: audit.id,
              product_id: p.id,
              product_code: p.code,
              product_name: p.name,
              location: GLOBAL_AUDIT_LOCATION,
              colis_number: c,
              expected_quantity: sums.get(`${p.id}|${c}`) ?? 0,
              status: 'pending',
            });
          });
        });
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from('location_audit_items').insert(rows.slice(i, i + 500) as never);
          if (error) throw error;
        }
        return audit;
      }

      // Fetch products in these locations from counts
      const { data: counts, error: countsError } = await supabase
        .from('counts')
        .select(`
          id,
          product_id,
          location,
          colis_number,
          quantity,
          products (id, code, name)
        `)
        .in('location', input.locations)
        .gt('quantity', 0);

      if (countsError) throw countsError;

      // Create audit items for each count
      if (counts && counts.length > 0) {
        const items = counts.map((count) => ({
          audit_id: audit.id,
          product_id: count.product_id,
          product_code: (count.products as any)?.code || '',
          product_name: (count.products as any)?.name || '',
          location: count.location || '',
          colis_number: count.colis_number,
          expected_quantity: count.quantity,
          status: 'pending',
        }));

        const { error: itemsError } = await supabase
          .from('location_audit_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return audit;
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Conferência criada com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível criar a conferência'),
        variant: 'destructive',
      });
    },
  });

  // Start audit
  const startAudit = useMutation({
    mutationFn: async (auditId: string) => {
      const { error } = await supabase
        .from('location_audits')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', auditId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
      queryClient.invalidateQueries({ queryKey: ['location-audit'] });
    },
  });

  // Update audit item (count)
  const updateAuditItem = useMutation({
    mutationFn: async ({
      itemId,
      countedQuantity,
      notes,
    }: {
      itemId: string;
      countedQuantity: number;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get item to calculate difference
      const { data: item } = await supabase
        .from('location_audit_items')
        .select('expected_quantity')
        .eq('id', itemId)
        .single();

      const difference = countedQuantity - (item?.expected_quantity || 0);

      const { error } = await supabase
        .from('location_audit_items')
        .update({
          counted_quantity: countedQuantity,
          difference,
          status: 'counted',
          counted_by: user?.id || null,
          counted_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-audit'] });
    },
  });

  /**
   * Entrega da contagem pelo operador. Não mexe em stock — apenas fecha a
   * recolha e avisa o responsável de que pode fechar a conferência.
   */
  const deliverAudit = useMutation({
    mutationFn: async (auditId: string) => {
      const { data, error } = await supabase.rpc('deliver_location_audit', { p_audit_id: auditId });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
      queryClient.invalidateQueries({ queryKey: ['location-audit'] });
      queryClient.invalidateQueries({ queryKey: ['my-location-audits'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Não foi possível entregar a contagem',
        description: mapDatabaseError(error, error.message),
        variant: 'destructive',
      });
    },
  });

  /**
   * Fecho da conferência: uma única transação no servidor
   * (`complete_location_audit`) que valida permissões, exige motivo em cada
   * divergência, deteta stock movimentado desde a contagem, aplica os ajustes
   * por diferença (nunca por valor absoluto) e escreve movimento + linha de
   * movimento com saldo antes e depois. Repetir o fecho não duplica ajustes.
   */
  const completeAudit = useMutation({
    mutationFn: async (
      input: string | { auditId: string; acceptDrift?: boolean },
    ): Promise<CompleteAuditResult> => {
      const auditId = typeof input === 'string' ? input : input.auditId;
      const acceptDrift = typeof input === 'string' ? false : !!input.acceptDrift;

      const { data, error } = await supabase.rpc('complete_location_audit', {
        p_audit_id: auditId,
        p_accept_drift: acceptDrift,
      });
      if (error) throw error;
      return data as unknown as CompleteAuditResult;
    },
    onSuccess: (result) => {
      if (result?.status === 'movimentado') {
        toast({
          title: 'Stock movimentado desde a contagem',
          description: `${result.drift?.length ?? 0} linha(s) mudaram depois da contagem. Reveja antes de fechar.`,
          variant: 'destructive',
        });
        return;
      }
      if (result?.status === 'ja_fechada') {
        toast({ title: 'Conferência já estava fechada', description: 'Nada foi duplicado.' });
      } else {
        toast({
          title: 'Conferência finalizada',
          description: result?.adjustments
            ? `${result.adjustments} ajuste(s) de stock registados`
            : 'Sem divergências a ajustar',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
      queryClient.invalidateQueries({ queryKey: ['location-audit'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Não foi possível finalizar',
        description: mapDatabaseError(error, error.message),
        variant: 'destructive',
      });
    },
  });


  /** Regista a causa e a decisão (ajustar / sem ajuste) de uma divergência. */
  const resolveItem = useMutation({
    mutationFn: async (v: { itemId: string; resolution: 'ajustar' | 'sem_ajuste' | null; reason: string }) => {
      const { error } = await supabase.rpc('resolve_audit_item', {
        p_item_id: v.itemId,
        p_resolution: v.resolution as string,
        p_reason: v.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['location-audit'] }),
    onError: (error: Error) =>
      toast({ title: 'Não foi possível guardar', description: mapDatabaseError(error, error.message), variant: 'destructive' }),
  });

  // Delete audit
  const deleteAudit = useMutation({
    mutationFn: async (auditId: string) => {
      const { error } = await supabase
        .from('location_audits')
        .delete()
        .eq('id', auditId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Conferência eliminada' });
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
    },
  });

  // Assign audit to a user
  const assignAudit = useMutation({
    mutationFn: async ({ auditId, userId }: { auditId: string; userId: string | null }) => {
      const { error } = await supabase
        .from('location_audits')
        .update({ assigned_to: userId })
        .eq('id', auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Responsável atualizado' });
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
      queryClient.invalidateQueries({ queryKey: ['my-location-audits'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível atribuir a conferência'),
        variant: 'destructive',
      });
    },
  });

  return {
    audits,
    isLoading,
    assignAudit,
    useAuditWithItems,
    createAudit,
    startAudit,
    updateAuditItem,
    deliverAudit,
    completeAudit,
    resolveItem,
    deleteAudit,
  };
}

/** Conferências abertas e atribuídas ao utilizador autenticado. */
export function useMyLocationAudits() {
  return useQuery({
    queryKey: ['my-location-audits'],
    queryFn: async (): Promise<LocationAudit[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      let query = supabase
        .from('location_audits')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        // Uma contagem já entregue sai da lista do operador.
        .is('delivered_at', null)

        .order('created_at', { ascending: false });
      if (!uid) return [];
      // Atribuídas a mim ou sem responsável ("Qualquer utilizador").
      query = query.or(`assigned_to.eq.${uid},assigned_to.is.null`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LocationAudit[];
    },
    staleTime: 10 * 1000,
  });
}

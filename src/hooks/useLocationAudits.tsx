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
  started_at: string | null;
  completed_at: string | null;
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

        const [auditRes, itemsRes] = await Promise.all([
          supabase
            .from('location_audits')
            .select('*')
            .eq('id', auditId)
            .single(),
          supabase
            .from('location_audit_items')
            .select('*')
            .eq('audit_id', auditId)
            .order('location', { ascending: true })
            .order('product_code', { ascending: true }),
        ]);

        if (auditRes.error) throw auditRes.error;
        if (itemsRes.error) throw itemsRes.error;

        return {
          ...(auditRes.data as LocationAudit),
          items: itemsRes.data as LocationAuditItem[],
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
          status: 'pending',
        })
        .select()
        .single();

      if (auditError) throw auditError;

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

  // Complete audit — gera os ajustes das divergências
  const completeAudit = useMutation({
    mutationFn: async (auditId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: items, error: itemsError } = await supabase
        .from('location_audit_items')
        .select('*')
        .eq('audit_id', auditId)
        .eq('status', 'counted');
      if (itemsError) throw itemsError;

      const divergent = (items || []).filter(
        (i) => i.difference !== null && i.difference !== 0,
      );

      const semMotivo = divergent.filter((i) => !i.notes || !i.notes.trim());
      if (semMotivo.length > 0) {
        throw new Error(
          `Indique o motivo em ${semMotivo.length} linha(s) com divergência antes de finalizar.`,
        );
      }

      for (const item of divergent) {
        if (!item.product_id) continue;
        const counted = item.counted_quantity ?? 0;

        // Acerta o saldo da localização conferida
        let query = supabase
          .from('counts')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('location', item.location);
        if (item.colis_number !== null) query = query.eq('colis_number', item.colis_number);
        const { data: countRows } = await query.order('quantity', { ascending: false }).limit(1);

        if (countRows && countRows.length > 0) {
          await supabase
            .from('counts')
            .update({ quantity: counted, updated_at: new Date().toISOString() })
            .eq('id', countRows[0].id);
        } else if (counted > 0) {
          await supabase.from('counts').insert({
            product_id: item.product_id,
            colis_number: item.colis_number ?? 1,
            quantity: counted,
            location: item.location,
            counted_by: user?.id ?? null,
          });
        }

        await supabase.from('stock_movements').insert({
          product_id: item.product_id,
          movement_type: 'ajuste',
          quantity: Math.abs(item.difference || 0),
          reason: item.notes,
          reference: `Conferência ${auditId.slice(0, 8)}`,
          notes: `${item.location} · coli ${item.colis_number ?? '—'} · esperado ${item.expected_quantity} · contado ${counted}`,
          created_by: user?.id ?? null,
        });
      }

      const { error } = await supabase
        .from('location_audits')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', auditId);

      if (error) throw error;
      return divergent.length;
    },
    onSuccess: (adjustments) => {
      toast({
        title: 'Conferência finalizada',
        description: adjustments
          ? `${adjustments} ajuste(s) de stock registados`
          : 'Sem divergências a ajustar',
      });
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
    completeAudit,
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
        .order('created_at', { ascending: false });
      if (!uid) return [];
      query = query.eq('assigned_to', uid);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LocationAudit[];
    },
    staleTime: 10 * 1000,
  });
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WeekPlan } from '@/lib/logistics/types';

export type SavedWeekPlan = {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  plan: WeekPlan;
  createdAt: string;
};

export function useWeekPlans() {
  const [plans, setPlans] = useState<SavedWeekPlan[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('week_plans')
      .select('id, name, date_from, date_to, plan, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    setPlans(
      (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        dateFrom: row.date_from,
        dateTo: row.date_to,
        plan: row.plan as unknown as WeekPlan,
        createdAt: row.created_at,
      })),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: { name: string; from: string; to: string; plan: WeekPlan }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('week_plans').insert({
        name: input.name,
        date_from: input.from,
        date_to: input.to,
        plan: input.plan as unknown as never,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('week_plans').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
  );

  return { plans, refresh, save, remove };
}

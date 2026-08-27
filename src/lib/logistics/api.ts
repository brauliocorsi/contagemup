import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type {
  GcDocument,
  GuideRecord,
  GuideResult,
  RoutePlan,
  SepOrder,
  WeekPlan,
} from './types';

async function invoke<T>(fn: 'logistics-gc' | 'logistics-maps', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const raw = await error.context.text().catch(() => '');
      try {
        message = (JSON.parse(raw) as { error?: string }).error ?? raw ?? message;
      } catch {
        message = raw || message;
      }
    }
    throw new Error(message);
  }
  return data as T;
}

export function fetchSeparationOrders(from: string, to: string) {
  return invoke<{ orders: SepOrder[]; scanned: number; truncated: boolean }>('logistics-gc', {
    action: 'orders',
    from,
    to,
  });
}

export function fetchOrdersByCode(codes: string[]) {
  return invoke<{ orders: SepOrder[]; notFound: string[] }>('logistics-gc', {
    action: 'orders-by-code',
    codes,
  });
}

export function fetchOrderDocuments(ids: string[]) {
  return invoke<{ documents: GcDocument[] }>('logistics-gc', { action: 'documents', ids });
}


export function fetchGuideHistory(ids: string[]) {
  return invoke<{ history: GuideRecord[] }>('logistics-gc', { action: 'guide-history', ids });
}

export function createTransportGuides(input: {
  ids: string[];
  addressFrom: string;
  plate: string;
  loadedAt: string;
}) {
  return invoke<{ results: GuideResult[]; batchId: string }>('logistics-gc', {
    action: 'guides',
    ...input,
  });
}

export function buildDeliveryRoute(input: {
  origin: string;
  stops: { id?: string; label: string; address?: string }[];
}) {
  return invoke<RoutePlan>('logistics-maps', { action: 'route', ...input });
}

export type OptimizeStop = {
  id: string;
  codigo: string;
  cliente: string;
  address: string;
  entrega: string;
  situacao?: string;
  valorEntrega?: number;
  valorMontagem?: number;
};

export function optimizeWeekRoutes(input: {
  origin: string;
  days: string[];
  maxPerDay: number;
  maxRunsPerDay: number;
  consumption: number;
  fuelPrice: number;
  stops: OptimizeStop[];
}) {
  return invoke<WeekPlan>('logistics-maps', { action: 'optimize', ...input });
}

export function applyExternalPlan(input: {
  origin: string;
  consumption: number;
  fuelPrice: number;
  assignments: { date: string; run: number; codigo: string }[];
  stops: OptimizeStop[];
}) {
  return invoke<WeekPlan>('logistics-maps', { action: 'apply', ...input });
}

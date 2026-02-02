import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ColisLocationInfo {
  colisNumber: number;
  quantity: number;
  location: string | null;
  palletNumber: string | null;
  countId: string;
}

// Represents a split entry (same coli in multiple locations)
interface SplitEntry {
  colisNumber: number;
  entries: {
    countId: string;
    quantity: number;
    location: string | null;
    palletNumber: string | null;
  }[];
  totalQuantity: number;
}

interface LastCountInfo {
  productId: string;
  sessionId: string;
  sessionName: string;
  totalQuantity: number;
  countedAt: string;
  colisLocations: ColisLocationInfo[];
  uniqueLocations: string[];
  uniquePallets: string[];
  // New: split tracking
  splitEntries: SplitEntry[];
  hasSplitColis: boolean;
  splitColisCount: number;
}

interface CountRow {
  id: string;
  product_id: string;
  session_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
  counted_at: string;
}

interface SessionRow {
  id: string;
  name: string;
}

const fetchCountsAndSessions = async () => {
  const [countsResult, sessionsResult] = await Promise.all([
    supabase
      .from('counts')
      .select('id, product_id, session_id, colis_number, quantity, location, pallet_number, counted_at')
      .order('counted_at', { ascending: false }),
    supabase
      .from('counting_sessions')
      .select('id, name')
  ]);

  if (countsResult.error) throw countsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;

  return {
    counts: (countsResult.data as CountRow[]) || [],
    sessions: (sessionsResult.data as SessionRow[]) || []
  };
};

const processLastCounts = (counts: CountRow[], sessions: SessionRow[]): Record<string, LastCountInfo> => {
  const sessionMap: Record<string, string> = {};
  sessions.forEach(s => {
    sessionMap[s.id] = s.name;
  });

  // First pass: find the most recent session for each product
  const productRecentSession: Record<string, { sessionId: string; countedAt: string }> = {};
  counts.forEach(count => {
    const existing = productRecentSession[count.product_id];
    if (!existing || new Date(count.counted_at) > new Date(existing.countedAt)) {
      productRecentSession[count.product_id] = {
        sessionId: count.session_id,
        countedAt: count.counted_at
      };
    }
  });

  // Second pass: collect all colis info for the most recent session of each product
  const productDataMap: Record<string, {
    sessionId: string;
    totalQuantity: number;
    countedAt: string;
    allEntries: Array<{
      countId: string;
      colisNumber: number;
      quantity: number;
      location: string | null;
      palletNumber: string | null;
    }>;
  }> = {};

  counts.forEach(count => {
    const recentSession = productRecentSession[count.product_id];
    if (recentSession && count.session_id === recentSession.sessionId && count.quantity > 0) {
      const key = count.product_id;
      if (!productDataMap[key]) {
        productDataMap[key] = {
          sessionId: count.session_id,
          totalQuantity: 0,
          countedAt: count.counted_at,
          allEntries: []
        };
      }

      productDataMap[key].totalQuantity += count.quantity;
      productDataMap[key].allEntries.push({
        countId: count.id,
        colisNumber: count.colis_number,
        quantity: count.quantity,
        location: count.location,
        palletNumber: count.pallet_number
      });
    }
  });

  // Build final map
  const result: Record<string, LastCountInfo> = {};
  Object.entries(productDataMap).forEach(([productId, info]) => {
    // Group entries by colis number to detect splits
    const coliGroups: Record<number, typeof info.allEntries> = {};
    info.allEntries.forEach(entry => {
      if (!coliGroups[entry.colisNumber]) {
        coliGroups[entry.colisNumber] = [];
      }
      coliGroups[entry.colisNumber].push(entry);
    });

    // Build colisLocations (aggregated view - one entry per coli with primary location)
    const colisLocations: ColisLocationInfo[] = Object.entries(coliGroups)
      .map(([colisNum, entries]) => {
        const totalQty = entries.reduce((sum, e) => sum + e.quantity, 0);
        const primary = entries[0];
        return {
          colisNumber: parseInt(colisNum),
          quantity: totalQty,
          location: primary.location,
          palletNumber: primary.palletNumber,
          countId: primary.countId
        };
      })
      .sort((a, b) => a.colisNumber - b.colisNumber);

    // Build splitEntries (colis that have multiple location entries)
    const splitEntries: SplitEntry[] = Object.entries(coliGroups)
      .filter(([_, entries]) => entries.length > 1)
      .map(([colisNum, entries]) => ({
        colisNumber: parseInt(colisNum),
        entries: entries.map(e => ({
          countId: e.countId,
          quantity: e.quantity,
          location: e.location,
          palletNumber: e.palletNumber
        })),
        totalQuantity: entries.reduce((sum, e) => sum + e.quantity, 0)
      }));

    // Collect all unique locations from ALL entries
    const uniqueLocations = [...new Set(
      info.allEntries
        .map(e => e.location)
        .filter((loc): loc is string => loc !== null && loc.trim() !== '')
    )].sort();

    const uniquePallets = [...new Set(
      info.allEntries
        .map(e => e.palletNumber)
        .filter((p): p is string => p !== null && p.trim() !== '')
    )].sort();

    result[productId] = {
      productId,
      sessionId: info.sessionId,
      sessionName: sessionMap[info.sessionId] || 'Sessão desconhecida',
      totalQuantity: info.totalQuantity,
      countedAt: info.countedAt,
      colisLocations,
      uniqueLocations,
      uniquePallets,
      splitEntries,
      hasSplitColis: splitEntries.length > 0,
      splitColisCount: splitEntries.length
    };
  });

  return result;
};

export function useLastCounts() {
  const queryClient = useQueryClient();

  const { data: rawData, isLoading: loading } = useQuery({
    queryKey: ['last-counts'],
    queryFn: fetchCountsAndSessions,
    staleTime: 5000, // 5 segundos - sincronizado com counts e products
    gcTime: 30000, // 30 segundos
  });

  // Memoize the processing - only recalculate when raw data changes
  const lastCounts = useMemo(() => {
    if (!rawData) return {};
    return processLastCounts(rawData.counts, rawData.sessions);
  }, [rawData]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['last-counts'] });
  };

  return {
    lastCounts,
    loading,
    refetch
  };
}

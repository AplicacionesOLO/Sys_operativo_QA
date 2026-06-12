import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ZonaCluster } from '@/components/feature/ZonaClusterManager';

export type { ZonaCluster };

/** Generic hook to load clusters for any costos module. */
export function useZonaClusters(tableName: string) {
  const [clusters, setClusters] = useState<ZonaCluster[]>([]);

  const loadClusters = useCallback(async () => {
    const { data } = await supabase.from(tableName).select('*').order('orden');
    setClusters((data ?? []) as ZonaCluster[]);
  }, [tableName]);

  return { clusters, loadClusters };
}

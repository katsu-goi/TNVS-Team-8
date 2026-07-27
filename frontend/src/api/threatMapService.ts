import { supabase } from '../lib/supabaseClient';
import { IpThreatEntry, ThreatMapStats } from '../types/threatMap';

export interface ThreatMapApiResponse {
  threats: IpThreatEntry[];
  stats: ThreatMapStats;
}

// Maps the snake_case Supabase row to our camelCase IpThreatEntry
function rowToEntry(row: Record<string, any>): IpThreatEntry {
  return {
    ip:         row.ip,
    country:    row.country ?? '',
    city:       row.city ?? '',
    latitude:   Number(row.latitude ?? 0),
    longitude:  Number(row.longitude ?? 0),
    threatType: row.threat_type,
    severity:   row.severity,
    requests:   Number(row.requests ?? 1),
    status:     row.status,
    firstSeen:  row.first_seen ?? row.created_at ?? new Date().toISOString(),
    lastSeen:   row.last_seen ?? row.updated_at ?? new Date().toISOString(),
    asn:        row.asn ?? undefined,
    isp:        row.isp ?? undefined,
    flag:       row.flag ?? undefined,
  };
}

function computeStats(entries: IpThreatEntry[]): ThreatMapStats {
  const countries = new Set(entries.filter(e => e.country).map(e => e.country));
  const blocked   = entries.filter(e => e.status === 'BLOCKED').length;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const recent    = entries.filter(e => e.firstSeen >= yesterday).length;
  const failedLogins = entries.filter(e => e.threatType === 'FAILED_LOGIN').length;

  return {
    totalThreatIps:      entries.length,
    detectedLast24h:     recent,
    countriesAffected:   countries.size,
    blockedIps:          blocked,
    activeSessions:      entries.filter(e => e.status === 'ACTIVE').length,
    failedLoginAttempts: failedLogins,
  };
}

export const threatMapService = {
  /**
   * Fetch all rows from the `ip_threats` Supabase table.
   */
  async fetchThreats(): Promise<ThreatMapApiResponse> {
    try {
      const { data, error } = await supabase
        .from('ip_threats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const entries: IpThreatEntry[] = (data ?? []).map(rowToEntry);
      return { threats: entries, stats: computeStats(entries) };
    } catch {
      return {
        threats: [],
        stats: {
          totalThreatIps: 0, detectedLast24h: 0, countriesAffected: 0,
          blockedIps: 0, activeSessions: 0, failedLoginAttempts: 0,
        },
      };
    }
  },

  /**
   * Subscribe to Supabase Realtime for INSERT / UPDATE events on ip_threats.
   * Returns a cleanup function.
   */
  openThreatStream(onThreat: (entry: IpThreatEntry) => void): () => void {
    const channel = supabase
      .channel('ip_threats_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ip_threats' },
        (payload) => {
          const row = payload.new as Record<string, any>;
          if (row && row.ip) {
            onThreat(rowToEntry(row));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};

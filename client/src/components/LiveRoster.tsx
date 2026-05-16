/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Key, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface LiveRosterProps {
  eventId: string;
}

interface RosterEntry {
  user_id: string;
  username: string | null;
  keys_balance: number;
}

export default function LiveRoster({ eventId }: LiveRosterProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;

    const fetchRoster = async () => {
      const { data, error } = await supabase
        .from('event_participants')
        .select('user_id, keys_balance, profiles!inner(username)')
        .eq('event_id', eventId)
        .order('keys_balance', { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error('LiveRoster fetch error:', error);
        setLoading(false);
        return;
      }

      const rows: RosterEntry[] = (data || []).map((row: any) => ({
        user_id: row.user_id,
        username: row.profiles?.username ?? null,
        keys_balance: row.keys_balance ?? 0,
      }));

      setRoster(rows);
      setLoading(false);
    };

    fetchRoster();
    const id = setInterval(fetchRoster, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventId]);

  return (
    <div className="absolute top-36 right-3 z-30 w-56 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/80">Live Roster</span>
          {!loading && (
            <span className="text-[9px] text-white/40">{roster.length}</span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-white/60" /> : <ChevronUp className="w-3.5 h-3.5 text-white/60" />}
      </button>

      {!collapsed && (
        <div className="border-t border-white/10 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
            </div>
          ) : roster.length === 0 ? (
            <div className="px-3 py-3 text-[10px] text-white/40 tracking-wider uppercase text-center">
              No operatives
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {roster.map((entry, i) => {
                const isMe = entry.user_id === currentUserId;
                return (
                  <li
                    key={entry.user_id}
                    className={`flex items-center justify-between px-3 py-2 ${isMe ? 'bg-green-500/10' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[9px] font-mono w-4 ${i === 0 ? 'text-yellow-400' : 'text-white/40'}`}>
                        {i + 1}
                      </span>
                      <span
                        className={`text-[11px] font-mono truncate ${isMe ? 'text-green-300' : 'text-white/80'}`}
                        style={{ textTransform: 'none' }}
                      >
                        {entry.username || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Key className="w-3 h-3 text-yellow-400" />
                      <span className="text-[11px] font-mono text-white tabular-nums">{entry.keys_balance}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, X, Loader2, Medal, Crown } from 'lucide-react';

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: string | null;
}

interface Operative {
  id: string;
  username: string | null;
  balance: number;
}

export default function Leaderboard({ open, onClose, currentUserId }: LeaderboardProps) {
  const [rows, setRows] = useState<Operative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const fetchTop = async () => {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('id, username, balance')
        .order('balance', { ascending: false })
        .limit(10);

      if (dbError) {
        console.error('Leaderboard fetch error:', dbError);
        setError(dbError.message);
        setLoading(false);
        return;
      }

      setRows((data as Operative[]) || []);
      setLoading(false);
    };

    fetchTop();
  }, [open]);

  if (!open) return null;

  const rankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-300';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-white/40';
  };

  const rankBorder = (rank: number) => {
    if (rank === 1) return 'border-yellow-400/40 shadow-[0_0_25px_rgba(250,204,21,0.15)]';
    if (rank === 2) return 'border-gray-300/30 shadow-[0_0_20px_rgba(209,213,219,0.1)]';
    if (rank === 3) return 'border-amber-700/40';
    return 'border-white/10';
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-[#0B0B0F] border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(74,222,128,0.05)]">
        {/* Neon edge */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />

        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-base font-light text-white tracking-tight">Top Operatives</h2>
              <p className="text-[10px] text-white/40 tracking-[0.2em] uppercase">Global Equity Ranking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-500/5 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-xs text-white/40 tracking-wider py-10 uppercase">
              No operatives ranked yet
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((op, i) => {
                const rank = i + 1;
                const isMe = op.id === currentUserId;
                return (
                  <li
                    key={op.id}
                    className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border ${rankBorder(rank)} ${isMe ? 'ring-1 ring-green-400/40' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-black/40 border border-white/10 flex-shrink-0`}>
                      {rank === 1 ? (
                        <Crown className={`w-4 h-4 ${rankColor(rank)}`} />
                      ) : rank === 2 || rank === 3 ? (
                        <Medal className={`w-4 h-4 ${rankColor(rank)}`} />
                      ) : (
                        <span className={`text-[11px] font-mono ${rankColor(rank)}`}>{String(rank).padStart(2, '0')}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm text-white truncate"
                          style={{ textTransform: 'none' }}
                        >
                          {op.username || '—'}
                        </span>
                        {isMe && (
                          <span className="text-[8px] text-green-300 tracking-[0.2em] uppercase">you</span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/40 tracking-[0.2em] uppercase">Rank #{rank}</span>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className={`text-sm font-light tabular-nums ${rank === 1 ? 'text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]' : rank === 2 ? 'text-gray-100' : 'text-white'}`}>
                        {op.balance.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-white/40 tracking-wider uppercase">DOX</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

interface ProfileProps {
  onLogout: () => void;
  balance: number;
  username: string | null;
  userId: string | null;
}

export default function Profile({ onLogout, balance, username, userId }: ProfileProps) {
  const [extractionsCount, setExtractionsCount] = useState<number>(0);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from('claims')
        .select('amount')
        .eq('player_id', userId);

      if (dbError) {
        console.error('Profile stats fetch error:', dbError);
        setError(dbError.message);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setExtractionsCount(rows.length);
      setTotalProfit(rows.reduce((sum, r: { amount: number | null }) => sum + (r.amount || 0), 0));
      setLoading(false);
    };

    fetchStats();
  }, [userId]);

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-32 bg-[#09090B]">
      {/* Alias */}
      <div className="py-6">
        <div className="text-[10px] text-white/40 tracking-[0.25em] mb-2 uppercase">Alias</div>
        <h2 className="text-4xl font-light text-white tracking-tight" style={{ textTransform: 'none' }}>
          {username || 'ghost_user'}
        </h2>
      </div>

      {/* Equity glass panel */}
      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <div className="text-[10px] text-white/40 tracking-[0.25em] uppercase mb-3">Equity</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-light text-white tracking-tight">{balance.toLocaleString()}</span>
          <span className="text-sm text-white/40 tracking-wider">CZK</span>
        </div>
      </div>

      {/* Stats */}
      {error && (
        <div className="bg-red-500/5 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5">
          <div className="text-[10px] text-white/40 tracking-[0.2em] uppercase mb-3">Total Extractions</div>
          <div className="text-3xl font-light text-white tracking-tight">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : extractionsCount}
          </div>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5">
          <div className="text-[10px] text-white/40 tracking-[0.2em] uppercase mb-3">Total Profit</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-light text-white tracking-tight">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : totalProfit.toLocaleString()}
            </span>
            {!loading && <span className="text-xs text-white/40">CZK</span>}
          </div>
        </div>
      </div>

      {/* Disconnect */}
      <div className="mt-auto">
        <button
          onClick={onLogout}
          className="w-full py-3.5 bg-white/[0.03] backdrop-blur-xl border border-white/10 text-red-400 text-sm tracking-wider rounded-2xl hover:border-red-500/30 hover:bg-red-500/5 transition-all"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}


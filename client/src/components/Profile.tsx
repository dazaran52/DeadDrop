/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, TrendingUp, Target, Loader2 } from 'lucide-react';

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
        .eq('user_id', userId);

      if (dbError) {
        console.error('Profile stats fetch error:', dbError);
        setError(`DB ERROR: ${dbError.message}`);
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
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-32 bg-[#09090B] font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-3 border-b border-green-500/30 pb-3">
        <Terminal className="w-4 h-4 text-green-400" />
        <span className="text-[10px] text-green-400 uppercase tracking-[0.3em]">OPERATIVE_DOSSIER.SH</span>
        <span className="ml-auto text-[10px] text-white/30 uppercase tracking-widest">$ whoami</span>
      </div>

      {/* ALIAS with glitch */}
      <div className="text-center py-4 space-y-1">
        <div className="text-[10px] text-green-400 uppercase tracking-[0.4em]">&gt; ALIAS</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-white to-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.6)] animate-pulse">
          {username || 'GHOST_USER'}
        </h2>
      </div>

      {/* EQUITY */}
      <div className="bg-black border border-green-500/30 rounded-lg p-6 text-center shadow-[0_0_20px_rgba(74,222,128,0.1)]">
        <div className="text-[10px] text-green-400 uppercase tracking-[0.3em] mb-2">&gt; EQUITY</div>
        <div className="text-5xl font-black text-green-300 tracking-tighter drop-shadow-[0_0_10px_rgba(74,222,128,0.4)]">
          {balance.toLocaleString()}
        </div>
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">CZK</div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="text-[10px] text-green-400 uppercase tracking-[0.3em] px-1">&gt; FIELD_STATS</div>

        {error && (
          <div className="bg-red-950 border border-red-500 text-red-400 font-mono text-xs uppercase tracking-wider p-3 rounded">
            ERR: {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black border border-green-500/20 rounded-lg p-5 flex flex-col gap-2 hover:border-green-500/40 transition-all">
            <div className="flex items-center gap-2 text-white/40">
              <Target className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest">Total Extractions</span>
            </div>
            <div className="text-3xl font-black text-green-300 tracking-tighter">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : extractionsCount}
            </div>
          </div>

          <div className="bg-black border border-green-500/20 rounded-lg p-5 flex flex-col gap-2 hover:border-green-500/40 transition-all">
            <div className="flex items-center gap-2 text-white/40">
              <TrendingUp className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest">Total Profit</span>
            </div>
            <div className="text-3xl font-black text-green-300 tracking-tighter">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : `${totalProfit.toLocaleString()}`}
            </div>
            <div className="text-[8px] text-white/30 uppercase tracking-widest">CZK</div>
          </div>
        </div>
      </div>

      {/* Disconnect */}
      <div className="mt-auto">
        <button
          onClick={onLogout}
          className="w-full py-4 bg-transparent border-2 border-red-500 text-red-500 font-black text-sm uppercase tracking-[0.3em] rounded-lg hover:bg-red-500/10 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all"
        >
          [ DISCONNECT ]
        </button>
      </div>
    </div>
  );
}


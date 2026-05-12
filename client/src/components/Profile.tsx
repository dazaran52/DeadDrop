/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut } from 'lucide-react';

interface ProfileProps {
  onLogout: () => void;
  balance: number;
}

export default function Profile({ onLogout, balance }: ProfileProps) {
  const [username, setUsername] = useState<string>('GHOST_USER');

  useEffect(() => {
    const fetchUsername = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.username) {
        setUsername(user.user_metadata.username);
      }
    };
    fetchUsername();
  }, []);

  return (
    <div className="flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-32 bg-[#09090B] font-mono">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-sm font-black text-white/60 uppercase tracking-[0.3em] mb-2">Operative Dossier</h1>
      </div>

      {/* Username */}
      <div className="text-center">
        <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{username}</h2>
      </div>

      {/* Balance */}
      <div className="text-center py-8">
        <div className="text-6xl font-black text-white tracking-tighter">{balance.toLocaleString()}</div>
        <div className="text-sm font-bold text-white/40 uppercase tracking-widest mt-2">CZK</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
          <div className="text-3xl font-black text-white tracking-tighter">0</div>
          <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest text-center">OPS COMPLETED</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
          <div className="text-3xl font-black text-white tracking-tighter">0</div>
          <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest text-center">VAULTS SECURED</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
          <div className="text-3xl font-black text-white tracking-tighter">0</div>
          <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest text-center">TOTAL EARNINGS</div>
        </div>
      </div>

      {/* Disconnect Button */}
      <div className="mt-auto">
        <button
          onClick={onLogout}
          className="w-full py-4 bg-transparent border-2 border-red-500 text-red-500 font-black text-sm uppercase tracking-widest rounded-lg hover:bg-red-500/10 transition-all"
        >
          [ DISCONNECT ]
        </button>
      </div>
    </div>
  );
}


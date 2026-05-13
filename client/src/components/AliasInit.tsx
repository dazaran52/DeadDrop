/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, Loader2 } from 'lucide-react';

interface AliasInitProps {
  userId: string;
  onComplete: (username: string) => void;
}

export default function AliasInit({ userId, onComplete }: AliasInitProps) {
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = alias.trim().toLowerCase();

    // Validate: only lowercase letters and digits, 3-16 chars
    if (!/^[a-z0-9]{3,16}$/.test(trimmed)) {
      setError('ALIAS MUST BE 3-16 CHARS, [a-z0-9] ONLY');
      return;
    }

    setLoading(true);

    // Check uniqueness
    const { data: existing, error: selectError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .maybeSingle();

    if (selectError) {
      console.error('Uniqueness check error:', selectError);
      setError(`DB ERROR: ${selectError.message}`);
      setLoading(false);
      return;
    }

    if (existing) {
      setError('ALIAS ALREADY TAKEN. CHOOSE ANOTHER.');
      setLoading(false);
      return;
    }

    // Persist
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', userId);

    if (updateError) {
      console.error('Update username error:', updateError);
      setError(`DB ERROR: ${updateError.message}`);
      setLoading(false);
      return;
    }

    setLoading(false);
    onComplete(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[999999999] flex items-center justify-center bg-black/95 backdrop-blur-md p-6 font-mono">
      {/* Noise overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
      }} />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-black border border-green-500/40 rounded-lg p-8 space-y-6 shadow-[0_0_40px_rgba(74,222,128,0.2)]"
      >
        <div className="flex items-center gap-3 border-b border-green-500/30 pb-4">
          <Terminal className="w-5 h-5 text-green-400" />
          <span className="text-xs text-green-400 uppercase tracking-[0.3em]">SYSTEM PROMPT</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-white to-green-400 uppercase tracking-tighter drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]">
            INITIALIZE ALIAS
          </h1>
          <p className="text-xs text-white/50 uppercase tracking-widest">
            Identity required. Select operative callsign.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-green-400 uppercase tracking-[0.3em]">&gt; ENTER_ALIAS</label>
          <div className="flex items-center gap-2 bg-black border border-green-500/40 rounded px-3 py-3 focus-within:border-green-400 focus-within:shadow-[0_0_20px_rgba(74,222,128,0.3)] transition-all">
            <span className="text-green-400">$</span>
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              maxLength={16}
              placeholder="ghost_user"
              className="flex-1 bg-transparent outline-none text-green-300 font-mono text-lg tracking-wider placeholder:text-green-900"
            />
          </div>
          <p className="text-[10px] text-white/40 uppercase tracking-widest">
            3-16 chars / lowercase / a-z 0-9
          </p>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-500 text-red-400 font-mono text-xs uppercase tracking-wider p-3 rounded">
            &gt; ERR: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || alias.length < 3}
          className="w-full py-4 bg-green-500/20 border border-green-400 text-green-300 font-black uppercase tracking-[0.3em] hover:bg-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 rounded"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>COMMITTING...</span>
            </>
          ) : (
            <span>[ COMMIT IDENTITY ]</span>
          )}
        </button>
      </form>
    </div>
  );
}

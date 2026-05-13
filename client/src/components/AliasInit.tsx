/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface AliasInitProps {
  userId: string;
  onComplete: (username: string) => void;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const ALIAS_REGEX = /^[a-z0-9_]+$/;
const MIN_LEN = 3;
const MAX_LEN = 16;

export default function AliasInit({ userId, onComplete }: AliasInitProps) {
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<Availability>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced availability check
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (alias.length === 0) {
      setAvailability('idle');
      return;
    }

    if (alias.length < MIN_LEN || alias.length > MAX_LEN || !ALIAS_REGEX.test(alias)) {
      setAvailability('invalid');
      return;
    }

    setAvailability('checking');

    debounceTimer.current = setTimeout(async () => {
      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', alias)
        .maybeSingle();

      if (selectError) {
        console.error('Uniqueness check error:', selectError);
        setAvailability('idle');
        return;
      }

      setAvailability(data ? 'taken' : 'available');
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [alias]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ALIAS_REGEX.test(alias) || alias.length < MIN_LEN || alias.length > MAX_LEN) {
      setError(`ALIAS MUST BE ${MIN_LEN}-${MAX_LEN} CHARS, [a-z0-9_] ONLY`);
      return;
    }

    if (availability === 'taken') {
      setError('ALIAS ALREADY COMPROMISED');
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: alias })
        .eq('id', userId);

      if (updateError) {
        console.error('Update username error:', updateError);

        // Postgres unique_violation
        if (updateError.code === '23505') {
          setToast('SYSTEM ERROR: ALIAS INTERCEPTED BY ANOTHER USER');
          setAvailability('taken');
        } else {
          setError(`DB ERROR: ${updateError.message} (${updateError.code})`);
        }
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onComplete(alias);
    } catch (err: any) {
      console.error('Unexpected error during alias commit:', err);
      setToast(`SYSTEM ERROR: ${err?.message || 'UNKNOWN'}`);
      setSubmitting(false);
    }
  };

  const isTaken = availability === 'taken';
  const isAvailable = availability === 'available';
  const isChecking = availability === 'checking';
  const canSubmit = isAvailable && !submitting;

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
          <div className={`flex items-center gap-2 bg-black border rounded px-3 py-3 transition-all ${
            isTaken
              ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
              : isAvailable
                ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.3)]'
                : 'border-green-500/40 focus-within:border-green-400 focus-within:shadow-[0_0_20px_rgba(74,222,128,0.3)]'
          }`}>
            <span className={isTaken ? 'text-red-500' : 'text-green-400'}>$</span>
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              maxLength={MAX_LEN}
              placeholder="ghost_user"
              className={`flex-1 bg-transparent outline-none font-mono text-lg tracking-wider placeholder:text-green-900 ${
                isTaken ? 'text-red-400' : 'text-green-300'
              }`}
            />
            {isChecking && <Loader2 className="w-4 h-4 text-green-400 animate-spin" />}
            {isAvailable && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {isTaken && <XCircle className="w-4 h-4 text-red-500" />}
          </div>

          {/* Status line */}
          {availability === 'taken' ? (
            <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold animate-pulse">
              &gt; ALIAS ALREADY COMPROMISED
            </p>
          ) : availability === 'available' ? (
            <p className="text-[10px] text-green-400 uppercase tracking-widest font-bold">
              &gt; ALIAS AVAILABLE
            </p>
          ) : availability === 'invalid' && alias.length > 0 ? (
            <p className="text-[10px] text-yellow-400 uppercase tracking-widest">
              &gt; {MIN_LEN}-{MAX_LEN} CHARS / [a-z0-9_] ONLY
            </p>
          ) : (
            <p className="text-[10px] text-white/40 uppercase tracking-widest">
              {MIN_LEN}-{MAX_LEN} chars / lowercase / a-z 0-9 _
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-950 border border-red-500 text-red-400 font-mono text-xs uppercase tracking-wider p-3 rounded">
            &gt; ERR: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-4 bg-green-500/20 border border-green-400 text-green-300 font-black uppercase tracking-[0.3em] hover:bg-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 rounded"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>COMMITTING...</span>
            </>
          ) : (
            <span>[ COMMIT IDENTITY ]</span>
          )}
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999999999] pointer-events-none">
          <div className="flex items-center gap-3 bg-red-950 border border-red-500 text-red-300 font-mono text-xs uppercase tracking-widest px-5 py-3 rounded shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse">
            <AlertTriangle className="w-4 h-4" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

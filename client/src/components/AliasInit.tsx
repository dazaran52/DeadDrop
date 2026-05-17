/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { User, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

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
    <div className="fixed inset-0 z-[999999999] flex items-center justify-center bg-[#0A0A0A] p-6">
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-[#1C1C1E] border border-white/10 rounded-2xl p-8 space-y-6"
      >
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-orange/10 flex items-center justify-center">
            <User className="w-5 h-5 text-accent-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Choose Your Alias</h1>
            <p className="text-xs text-white/40">This will be your callsign</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Alias</label>
          <div className={`flex items-center gap-3 bg-black/40 border rounded-xl px-4 py-3.5 transition-all ${
            isTaken
              ? 'border-red-500/50'
              : isAvailable
                ? 'border-green-500/50'
                : 'border-white/10 focus-within:border-white/30'
          }`}>
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              maxLength={MAX_LEN}
              placeholder="your_alias"
              className={`flex-1 bg-transparent outline-none text-white text-lg tracking-wide placeholder:text-white/20 ${
                isTaken ? 'text-red-400' : 'text-white'
              }`}
            />
            {isChecking && <Loader2 className="w-5 h-5 text-white/40 animate-spin" />}
            {isAvailable && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {isTaken && <XCircle className="w-5 h-5 text-red-500" />}
          </div>

          {/* Status line */}
          {availability === 'taken' ? (
            <p className="text-[11px] text-red-400 font-medium">
              This alias is already taken
            </p>
          ) : availability === 'available' ? (
            <p className="text-[11px] text-green-400 font-medium">
              Alias is available
            </p>
          ) : availability === 'invalid' && alias.length > 0 ? (
            <p className="text-[11px] text-yellow-400/80">
              {MIN_LEN}-{MAX_LEN} characters, lowercase letters, numbers and underscore only
            </p>
          ) : (
            <p className="text-[11px] text-white/30">
              {MIN_LEN}-{MAX_LEN} chars · lowercase · a-z 0-9 _
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-4 bg-accent-orange text-white font-bold text-sm uppercase tracking-wider rounded-xl hover:bg-accent-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Confirm Alias</span>
          )}
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999999999] pointer-events-none">
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-5 py-3 rounded-xl">
            <AlertTriangle className="w-4 h-4" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

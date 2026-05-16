import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AliasInitProps {
  userId: string;
  onComplete: (username: string) => void;
}

const ALIAS_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export default function AliasInit({ userId, onComplete }: AliasInitProps) {
  const [alias, setAlias] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const checkUniqueness = useCallback(
    debounce(async (value: string) => {
      if (!ALIAS_REGEX.test(value)) {
        setStatus('invalid');
        return;
      }
      setStatus('checking');
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', value)
        .maybeSingle();
      if (error) { setStatus('idle'); return; }
      setStatus(data ? 'taken' : 'available');
    }, 500),
    []
  );

  useEffect(() => {
    if (alias.length === 0) { setStatus('idle'); return; }
    if (!ALIAS_REGEX.test(alias)) { setStatus('invalid'); return; }
    checkUniqueness(alias);
  }, [alias, checkUniqueness]);

  const handleSubmit = async () => {
    if (status !== 'available' || submitting) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: alias })
      .eq('id', userId);

    if (error) {
      setSubmitting(false);
      if (error.code === '23505') {
        setStatus('taken');
        showToast('ALIAS ALREADY CLAIMED. CHOOSE ANOTHER.');
      } else {
        showToast(`ERROR: ${error.message}`);
      }
      return;
    }
    onComplete(alias);
  };

  const statusIcon = () => {
    if (status === 'checking') return <Loader2 className="w-4 h-4 text-white/40 animate-spin" />;
    if (status === 'available') return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (status === 'taken' || status === 'invalid') return <AlertCircle className="w-4 h-4 text-red-400" />;
    return null;
  };

  const statusText = () => {
    if (status === 'checking') return 'Verifying...';
    if (status === 'available') return 'ALIAS AVAILABLE';
    if (status === 'taken') return 'ALIAS TAKEN';
    if (status === 'invalid') return '3-20 chars · letters, numbers, _ only';
    return '';
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-center p-6">
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8 relative z-10"
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full border-2 border-accent-orange/50 flex items-center justify-center mx-auto">
            <Terminal className="w-8 h-8 text-accent-orange" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
            CHOOSE YOUR ALIAS
          </h1>
          <p className="text-xs text-white/40 font-mono uppercase tracking-widest">
            This identifier cannot be changed after assignment
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-orange font-mono font-black text-sm select-none">
              //
            </span>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value.replace(/\s/g, '_').slice(0, 20))}
              placeholder="YOUR_ALIAS"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-4 text-white font-mono text-lg font-black tracking-widest uppercase placeholder:text-white/20 outline-none focus:border-accent-orange/60 transition-colors"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {statusIcon()}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status !== 'idle' && (
              <motion.p
                key={status}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-[11px] font-mono font-bold uppercase tracking-widest px-1 ${
                  status === 'available' ? 'text-green-400' :
                  status === 'taken' || status === 'invalid' ? 'text-red-400' :
                  'text-white/40'
                }`}
              >
                {statusText()}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={status !== 'available' || submitting}
          className="w-full py-4 bg-accent-orange text-white font-black uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {submitting ? 'REGISTERING...' : 'CONFIRM ALIAS'}
        </button>

        <p className="text-center text-[10px] text-white/20 font-mono uppercase tracking-widest">
          Unique · Permanent · Encrypted
        </p>
      </motion.div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/50 text-red-300 font-mono text-xs font-bold uppercase tracking-widest px-6 py-3 rounded-xl shadow-2xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

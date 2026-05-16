import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Users, Key, Trophy, Clock, Zap, ChevronRight, Radio } from 'lucide-react';

interface Operation {
  id: string;
  title: string;
  reward_pool: number;
  entry_fee: number;
  required_keys: number;
  min_participants: number;
  max_participants: number;
  participants_count: number;
  status: 'live' | 'upcoming' | 'ended';
  zone: string;
  start_offset_ms: number;
}

const MOCK_OPS: Operation[] = [
  {
    id: 'op-blackout',
    title: 'OPERATION BLACKOUT',
    reward_pool: 50000,
    entry_fee: 1000,
    required_keys: 3,
    min_participants: 5,
    max_participants: 20,
    participants_count: 14,
    status: 'live',
    zone: 'LETNA DISTRICT',
    start_offset_ms: 0,
  },
  {
    id: 'op-cipher',
    title: 'CIPHER SWEEP',
    reward_pool: 25000,
    entry_fee: 500,
    required_keys: 2,
    min_participants: 3,
    max_participants: 15,
    participants_count: 7,
    status: 'upcoming',
    zone: 'ANDEL SECTOR',
    start_offset_ms: 3600000,
  },
  {
    id: 'op-ghost',
    title: 'GHOST PROTOCOL',
    reward_pool: 100000,
    entry_fee: 5000,
    required_keys: 5,
    min_participants: 10,
    max_participants: 30,
    participants_count: 3,
    status: 'upcoming',
    zone: 'VINOHRADY GRID',
    start_offset_ms: 7200000,
  },
];

interface LobbyProps {
  onStartHunt: () => void;
}

function formatTimeUntil(ms: number): string {
  if (ms <= 0) return 'NOW';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Lobby({ onStartHunt }: LobbyProps) {
  const [joining, setJoining] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeploy = (op: Operation) => {
    if (op.status !== 'live') {
      showToast('OPERATION NOT LIVE. STAND BY.');
      return;
    }
    setJoining(op.id);
    setTimeout(() => {
      setJoining(null);
      onStartHunt();
    }, 800);
  };

  const statusBadge = (op: Operation) => {
    if (op.status === 'live')
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/40 text-green-400 text-[8px] font-black uppercase tracking-widest rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      );
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 text-white/40 text-[8px] font-black uppercase tracking-widest rounded">
        <Clock className="w-2.5 h-2.5" />
        {formatTimeUntil(op.start_offset_ms)}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-deep overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-deep/95 backdrop-blur-md px-6 py-4 border-b border-border-main">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-text-main uppercase leading-none">
              ACTIVE DROPS
            </h1>
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.3em] mt-0.5">
              {MOCK_OPS.filter(o => o.status === 'live').length} LIVE · {MOCK_OPS.filter(o => o.status === 'upcoming').length} STAGED
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-orange/10 border border-accent-orange/20 rounded-lg">
            <Radio className="w-3 h-3 text-accent-orange animate-pulse" />
            <span className="text-[9px] font-black text-accent-orange uppercase tracking-widest">UPLINK</span>
          </div>
        </div>
      </div>

      {/* Operation Cards */}
      <div className="px-4 py-4 space-y-4">
        {MOCK_OPS.map((op, i) => (
          <motion.div
            key={op.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`relative rounded-xl border overflow-hidden ${
              op.status === 'live'
                ? 'border-accent-orange/40 bg-gradient-to-br from-bg-card to-bg-inner shadow-[0_0_30px_rgba(255,69,0,0.08)]'
                : 'border-border-main bg-bg-card/60'
            }`}
          >
            {/* Live glow line */}
            {op.status === 'live' && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-orange to-transparent" />
            )}

            <div className="p-5 space-y-4">
              {/* Title row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.3em] mb-1">{op.zone}</p>
                  <h3 className={`text-base font-black uppercase tracking-tighter leading-tight ${
                    op.status === 'live' ? 'text-text-main' : 'text-text-muted'
                  }`}>
                    {op.title}
                  </h3>
                </div>
                {statusBadge(op)}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {/* REWARD POOL */}
                <div className="flex flex-col bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[7px] font-black text-text-muted uppercase tracking-widest mb-0.5 flex items-center gap-1">
                    <Trophy className="w-2.5 h-2.5" />REWARD POOL
                  </span>
                  <span className="text-xs font-black text-accent-orange leading-tight">
                    {op.reward_pool.toLocaleString()}
                  </span>
                  <span className="text-[7px] text-accent-orange/60 font-bold">NXC</span>
                </div>

                {/* TARGET KEYS */}
                <div className="flex flex-col bg-yellow-500/5 rounded-lg p-2.5 border border-yellow-500/20">
                  <span className="text-[7px] font-black text-yellow-500/70 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                    <Key className="w-2.5 h-2.5" />TARGET
                  </span>
                  <span className="text-xs font-black text-yellow-400 leading-tight">{op.required_keys}</span>
                  <span className="text-[7px] text-yellow-500/60 font-bold">KEYS</span>
                </div>

                {/* ENTRY FEE */}
                <div className="flex flex-col bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[7px] font-black text-text-muted uppercase tracking-widest mb-0.5 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" />ENTRY
                  </span>
                  <span className="text-xs font-black text-text-main leading-tight">
                    {op.entry_fee.toLocaleString()}
                  </span>
                  <span className="text-[7px] text-white/40 font-bold">NXC</span>
                </div>
              </div>

              {/* Hunters row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-[10px] font-black text-text-main">
                    {op.participants_count}
                    <span className="text-text-muted font-bold">/{op.max_participants}</span>
                    <span className="text-text-muted font-bold"> HUNTERS</span>
                  </span>
                </div>
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                  MIN: <span className="text-accent-orange">{op.min_participants}</span>
                </span>
              </div>

              {/* Hunter bar */}
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(op.participants_count / op.max_participants) * 100}%` }}
                  transition={{ delay: i * 0.08 + 0.3, duration: 0.6 }}
                  className={`h-full rounded-full ${
                    op.status === 'live' ? 'bg-accent-orange' : 'bg-white/20'
                  }`}
                />
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleDeploy(op)}
                disabled={joining === op.id}
                className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  op.status === 'live'
                    ? 'bg-accent-orange text-white hover:brightness-110 active:scale-[0.98] shadow-lg shadow-accent-orange/20'
                    : 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
                }`}
              >
                {joining === op.id ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    DEPLOYING...
                  </span>
                ) : op.status === 'live' ? (
                  <>
                    <Target className="w-4 h-4" />
                    DEPLOY OPERATIVE
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    STAGING IN {formatTimeUntil(op.start_offset_ms)}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-bg-card border border-border-main rounded-xl shadow-2xl text-[10px] font-black text-text-muted uppercase tracking-widest whitespace-nowrap"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

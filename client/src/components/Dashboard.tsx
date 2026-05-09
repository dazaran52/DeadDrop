/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Key as KeyIcon, TrendingUp, Target, Shield, Clock } from 'lucide-react';

interface DashboardProps {
  onStartHunt: () => void;
  onToggleSuperUser: () => void;
  balance: number;
  keys: number;
}

export default function Dashboard({ onStartHunt, onToggleSuperUser, balance, keys }: DashboardProps) {
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleTitleClick = () => {
    const now = Date.now();
    if (now - lastClickTime < 500) {
      const newCount = clickCount + 1;
      setClickCount(newCount);
      if (newCount >= 5) {
        onToggleSuperUser();
        setClickCount(0);
      }
    } else {
      setClickCount(1);
    }
    setLastClickTime(now);
  };

  const stats = [
    { label: 'EQUITY:', value: `${balance.toLocaleString()} CZK`, icon: Wallet },
    { label: 'KEYS:', value: keys.toString(), icon: KeyIcon },
    { label: 'SESSION RANK:', value: '#1,230', icon: TrendingUp },
  ];

  return (
    <div className="flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-20 bg-bg-deep">
      {/* Header Info */}
      <div className="flex flex-col space-y-1">
        <h1 
          className="text-4xl font-black tracking-tighter text-text-main leading-none cursor-pointer select-none active:scale-95 transition-transform"
          onClick={handleTitleClick}
        >
          NEXUS.
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] bg-white/5 py-1 px-3 border border-border-main rounded-lg">Operative Level 012</span>
          <div className="px-2 py-1 bg-accent-orange/10 border border-accent-orange/20 rounded-lg">
            <span className="text-[8px] font-black text-accent-orange uppercase tracking-widest">Active</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="premium-panel p-6 flex flex-col justify-between hover:border-text-muted/40 transition-all bg-gradient-to-br from-bg-card to-bg-inner"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-accent-purple opacity-60" />
            </div>
            <span className="text-3xl font-black text-text-main tracking-tighter">{stat.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Action Area */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-border-main pb-2">
          <Shield className="w-4 h-4 text-text-muted" />
          <h4 className="text-xs font-black text-text-main uppercase tracking-widest italic">Mission Parameters</h4>
        </div>
        
        <div className="flex flex-col gap-4">
          <button
            onClick={onStartHunt}
            className="w-full py-6 bg-accent-orange text-white font-black text-xl italic tracking-tighter rounded-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-4 shadow-xl shadow-accent-orange/10 border border-white/10"
          >
            <Target className="w-6 h-6" />
            <span>LOCATE DEADDROP</span>
          </button>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="premium-panel p-4 flex items-center gap-3 bg-bg-inner/50">
               <Clock className="w-4 h-4 text-text-muted" />
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Est. Time</span>
                  <span className="text-xs font-black text-text-main">18 MINS</span>
               </div>
            </div>
            <div className="premium-panel p-4 flex items-center gap-3 bg-bg-inner/50">
               <Target className="w-4 h-4 text-text-muted" />
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Nearest</span>
                  <span className="text-xs font-black text-text-main">LETNA PK</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[8px] text-center text-text-muted font-mono uppercase opacity-30 mt-auto pt-4 leading-relaxed">
        System integrity verified :: 0.001ms latency <br/>
        Encrypted Feed :: 256-bit AES
      </div>
    </div>
  );
}

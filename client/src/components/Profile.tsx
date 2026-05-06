/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, 
  Sun, 
  Moon, 
  Skull, 
  Activity, 
  Wallet, 
  Key as KeyIcon, 
  Lock,
  Terminal,
  Zap,
  ShieldAlert,
  ArrowRight,
  Cpu,
  CheckCircle2,
  Edit2,
  Save,
  X,
  Camera
} from 'lucide-react';

interface ProfileProps {
  onLogout: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export default function Profile({ onLogout, theme, onThemeToggle }: ProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [userName, setUserName] = useState('GHOST_USER');
  const keys = [
    { label: 'KEY_ALPHA :: LETNA', status: 'acquired', id: '0x1' },
    { label: 'KEY_SIGMA :: ANDEL', status: 'acquired', id: '0x2' },
    { label: 'EMPTY_SLOT', status: 'empty', id: '0x3' },
    { label: 'EMPTY_SLOT', status: 'empty', id: '0x4' },
  ];

  const activityLog = [
    { 
      type: 'SUCCESS', 
      msg: 'VAULT UNLOCKED: LETNA', 
      reward: '+10,000 CZK', 
      icon: Zap, 
      color: 'text-accent-green',
      bg: 'bg-accent-green/10',
      border: 'border-accent-green/20'
    },
    { 
      type: 'ALERT', 
      msg: 'EMP JAMMER SURVIVED', 
      reward: 'SHIELD_STRETCH', 
      icon: ShieldAlert, 
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20'
    },
    { 
      type: 'SYSTEM', 
      msg: 'WITHDRAWAL: CRYPTO WALLET', 
      reward: '-5,000 CZK', 
      icon: Wallet, 
      color: 'text-accent-pink',
      bg: 'bg-accent-pink/10',
      border: 'border-accent-pink/20'
    },
  ];

  return (
    <div className="flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-20 bg-bg-deep">
      {/* 1. OPERATIVE STATUS HEADER */}
      <div className="flex items-center justify-between border-b border-border-main pb-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.4em]">Operative Profile</span>
          <h2 className="text-3xl font-black text-text-main tracking-tighter leading-none mt-1">DOSSIER.</h2>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={`p-2 rounded-lg border transition-all ${isEditing ? 'border-accent-orange text-accent-orange' : 'border-border-main text-text-muted hover:text-text-main'}`}
        >
          {isEditing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
        </button>
      </div>

      {/* 2. IDENTIFICATION CARD */}
      <div className="flex items-center gap-6 pt-4">
        <div className="relative">
          <div className="w-20 h-20 bg-bg-inner border border-border-main flex items-center justify-center relative overflow-hidden rounded-lg group">
            <Cpu className="w-10 h-10 text-accent-purple opacity-50" />
            <div className="absolute inset-0 bg-white/5 mix-blend-overlay" />
            {isEditing && (
              <button className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </button>
            )}
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent-orange rounded-full border-2 border-bg-deep shadow-[0_0_8px_rgba(255,69,0,0.5)]" />
        </div>

        <div className="flex flex-col gap-1">
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value.toUpperCase())}
                  className="bg-bg-inner border border-accent-orange/30 px-2 py-1 text-xl font-black text-text-main tracking-tighter w-48 outline-none focus:border-accent-orange"
                  autoFocus
                />
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-1 bg-accent-orange text-white rounded shadow-lg shadow-accent-orange/20"
                >
                  <Save className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.h3 
                key="viewing"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="text-2xl font-black text-text-main tracking-tighter uppercase"
              >
                {userName}
              </motion.h3>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest bg-white/5 px-2 py-0.5 border border-border-main">RANK #1,230</span>
            <div className="w-2 h-2 bg-accent-orange rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Editing Options (Placeholders) */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-1 gap-2 overflow-hidden"
          >
            <button 
              onClick={() => alert("Wallet Integration Module: [REDACTED]")}
              className="w-full p-4 bg-bg-inner border border-border-main rounded-lg flex items-center justify-between group hover:border-accent-orange/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <Wallet className="w-4 h-4 text-accent-orange" />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted group-hover:text-text-main transition-colors">Link Crypto Wallet</span>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted opacity-40 group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={() => alert("Biometric Identity Module: OFFLINE")}
              className="w-full p-4 bg-bg-inner border border-border-main rounded-lg flex items-center justify-between group hover:border-accent-purple/40 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Skull className="w-4 h-4 text-accent-purple" />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted group-hover:text-text-main transition-colors">Change Operative Avatar</span>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted opacity-40 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. TOTAL BALANCE */}
      <div className="flex flex-col p-6 bg-bg-inner border border-border-main rounded-xl relative overflow-hidden">
        <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] mb-1">Total Assets</span>
        <div className="flex items-baseline gap-2">
          <h3 className="text-4xl font-black text-text-main tracking-tighter">10,000</h3>
          <span className="text-xl font-bold text-text-main opacity-40 italic uppercase">CZK</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-text-muted uppercase border-t border-border-main pt-4">
          <span className="bg-white/5 px-2 py-1">~396 EUR</span>
          <span className="bg-white/5 px-2 py-1">~1,712 PLN</span>
          <span className="bg-white/5 px-2 py-1">~16,850 UAH</span>
        </div>
      </div>

      {/* 3. CRYPTOGRAPHIC KEYS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyIcon className="w-4 h-4 text-accent-orange" />
            <h4 className="text-xs font-black text-text-main uppercase tracking-widest italic">DeadDrop Inventory</h4>
          </div>
          <span className="text-[10px] font-bold text-text-muted">2/4 SLOTS</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {keys.map((key) => (
            <div 
              key={key.id}
              className={`p-4 border transition-all relative rounded-lg ${
                key.status === 'acquired' 
                  ? 'border-accent-purple/40 bg-accent-purple/5' 
                  : 'border-border-main bg-transparent opacity-40'
              }`}
            >
              {key.status === 'acquired' && (
                <div className="absolute top-2 right-2">
                   <CheckCircle2 className="w-3 h-3 text-accent-purple" />
                </div>
              )}
              <div className="flex flex-col gap-3">
                <div className={`w-10 h-10 flex items-center justify-center border rounded-md ${key.status === 'acquired' ? 'border-accent-purple/30 bg-accent-purple/10' : 'border-border-main'}`}>
                   <KeyIcon className={`w-5 h-5 ${key.status === 'acquired' ? 'text-accent-purple' : 'text-text-muted'}`} />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-tight leading-tight ${key.status === 'acquired' ? 'text-text-main' : 'text-text-muted'}`}>
                  {key.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. ACTIVITY LOG */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border-main pb-2">
          <Activity className="w-4 h-4 text-text-muted" />
          <h4 className="text-xs font-black text-text-main uppercase tracking-widest italic">Security Logs</h4>
        </div>
        
        <div className="flex flex-col gap-2">
          {activityLog.map((log, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              key={i}
              className="flex items-center justify-between p-4 bg-bg-inner border border-border-main rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-bg-deep border border-border-main flex items-center justify-center">
                  <log.icon className="w-5 h-5 text-text-muted" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-text-main uppercase tracking-tight">{log.msg}</span>
                  <span className="text-[10px] font-black text-accent-orange tracking-widest">{log.reward}</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted opacity-30" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* SETTINGS & SYSTEM */}
      <div className="space-y-4 mb-4">
         <div className="flex gap-4">
            <button 
              onClick={onThemeToggle}
              className="flex-1 p-4 bg-bg-inner border border-border-glass flex items-center justify-between hover:border-accent-purple transition-all rounded-lg group"
            >
               <span className="text-[10px] font-black uppercase tracking-widest text-text-main">Neural Link</span>
               {theme === 'dark' ? <Moon className="w-4 h-4 text-accent-purple" /> : <Sun className="w-4 h-4 text-accent-orange" />}
            </button>
            <button 
              onClick={onLogout}
              className="flex-1 p-4 bg-bg-inner border border-accent-orange/30 flex items-center justify-between hover:bg-accent-orange/5 transition-all text-accent-orange rounded-lg"
            >
               <span className="text-[10px] font-black uppercase tracking-widest">Terminate</span>
               <LogOut className="w-4 h-4" />
            </button>
         </div>
      </div>

      <div className="text-[8px] text-center text-text-muted uppercase font-mono border-t border-border-glass pt-4 flex flex-col items-center gap-1 opacity-50">
        <span>ENCRYPTED_CONNECTION_ACTIVE :: ID_77AF29</span>
        <span className="font-bold">v9.2.1 :: CORE_MODULE</span>
      </div>
    </div>
  );
}


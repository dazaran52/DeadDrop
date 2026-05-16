/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  MapPin, 
  Zap, 
  RefreshCw, 
  Radar, 
  Activity, 
  Database, 
  Crosshair, 
  ChevronRight,
  TrendingUp,
  Lock,
  Unlock
} from 'lucide-react';

export default function AdminPanel() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const [vaultData, setVaultData] = useState({
    lat: '50.0964',
    lng: '14.4255',
    prize: '10000'
  });

  const operatives = [
    { name: 'Jan_K', dist: '450m', status: 'IN_SECTOR', color: 'text-green-500' },
    { name: 'Petr_Novak', dist: '1.2km', status: 'OUT_OF_BOUNDS', color: 'text-[#ff003c]' },
    { name: 'Anna_V', dist: '800m', status: 'IN_SECTOR', color: 'text-green-500' },
    { name: 'Marek_S', dist: '3.5km', status: 'STALE_SIGNAL', color: 'text-zinc-500' },
  ];

  const handlePinSubmit = (digit: string) => {
    const newPin = pin + digit;
    if (newPin.length <= 4) {
      setPin(newPin);
      setPinError(false);
      
      if (newPin === '1337') {
        setTimeout(() => setIsAdminAuthenticated(true), 300);
      } else if (newPin.length === 4) {
        setPinError(true);
        setTimeout(() => setPin(''), 500);
      }
    }
  };

  const handleDeploy = () => {
    alert(`CRITICAL: New DeadDrop Deployed to [${vaultData.lat}, ${vaultData.lng}] with ${vaultData.prize} NXC reward pool.`);
  };

  const triggerEMP = () => {
    alert("CRITICAL SYSTEM OVERRIDE: Global EMP Triggered. All proximity signals jammed for 30s.");
  };

  if (!isAdminAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-black font-mono">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-xs space-y-12"
        >
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 border-2 border-accent-orange rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-accent-orange" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-accent-orange tracking-tighter uppercase">Restricted Access</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 font-bold">Encrypted Admin Terminal</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pin.length > i 
                      ? 'bg-accent-orange border-accent-orange' 
                      : pinError ? 'border-red-500' : 'border-zinc-800'
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'].map((key) => (
                <button
                  key={key}
                  disabled={key === 'ENT'}
                  onClick={() => {
                    if (key === 'CLR') setPin('');
                    else if (key !== 'ENT') handlePinSubmit(key);
                  }}
                  className={`py-4 text-sm font-black border transition-all ${
                    key === 'CLR' ? 'border-zinc-800 text-zinc-500' :
                    'border-zinc-800 text-white hover:bg-accent-orange/10 hover:border-accent-orange'
                  } disabled:opacity-20`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[8px] text-center text-zinc-700 leading-relaxed font-bold uppercase tracking-widest">
            Warning: Multiple failed attempts <br/>
            will trigger localized signal blackout.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-24 bg-bg-deep font-mono">
      {/* 1. HEADER - RESTRICTED ACCESS */}
      <div className="flex items-center justify-between border-b border-accent-orange pb-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-black text-accent-orange tracking-tighter leading-none">GOD_MODE</h2>
          <span className="text-[10px] font-bold text-accent-orange/60 uppercase tracking-[0.4em] mt-2">Overwatch Terminal Alpha</span>
        </div>
        <div className="flex items-center gap-4">
           <button 
            onClick={() => setIsAdminAuthenticated(false)}
            className="p-2 border border-zinc-800 hover:border-accent-orange transition-colors"
           >
            <Unlock className="w-4 h-4 text-zinc-500" />
           </button>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-accent-orange">SYSTEM_LIVE</span>
              <div className="w-2 h-2 bg-accent-orange animate-pulse shadow-[0_0_8px_rgba(255,69,0,0.5)]" />
            </div>
            <span className="text-[8px] text-zinc-500 font-bold">ID::ADMIN_0x1F7A</span>
          </div>
        </div>
      </div>

      {/* 2. LIVE TELEMETRY */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-accent-orange" />
          <h4 className="text-xs font-black text-white uppercase tracking-widest">Active Operatives</h4>
        </div>
        
        <div className="flex flex-col gap-2">
          {operatives.map((op, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="premium-panel p-4 flex items-center justify-between border border-border-main hover:border-accent-orange/40 transition-all cursor-crosshair group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center border border-border-main bg-black">
                  <Activity className="w-5 h-5 text-accent-orange opacity-50 group-hover:opacity-100" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-black text-white uppercase tracking-tight">{op.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-500 font-bold tracking-widest">DIST: {op.dist}</span>
                    <span className={`text-[8px] font-black border px-1 border-current opacity-70 ${op.status === 'IN_SECTOR' ? 'text-green-500' : 'text-accent-orange'}`}>{op.status}</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 opacity-20 group-hover:opacity-100" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* 3. DEADDROP DEPLOYMENT SYSTEM */}
      <div className="p-6 bg-bg-inner/50 border-t-2 border-b-2 border-border-main relative">
        <div className="absolute -top-3 left-4 px-2 bg-bg-deep flex items-center gap-2 text-accent-orange">
          <Database className="w-3 h-3" />
          <span className="text-[10px] font-black uppercase tracking-widest">Deployment_Grid</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6 pt-2">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Target Latitude</label>
            <input 
              type="text" 
              value={vaultData.lat}
              onChange={(e) => setVaultData({...vaultData, lat: e.target.value})}
              className="w-full bg-[#111] border border-zinc-800 p-3 text-xs text-white focus:border-accent-orange outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Target Longitude</label>
            <input 
              type="text" 
              value={vaultData.lng}
              onChange={(e) => setVaultData({...vaultData, lng: e.target.value})}
              className="w-full bg-[#111] border border-zinc-800 p-3 text-xs text-white focus:border-accent-orange outline-none transition-colors"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">REWARD POOL (NXC)</label>
            <div className="relative">
              <input 
                type="text" 
                value={vaultData.prize}
                onChange={(e) => setVaultData({...vaultData, prize: e.target.value})}
                className="w-full bg-[#111] border border-zinc-800 p-3 pl-10 text-xs text-white focus:border-accent-orange outline-none font-black transition-colors"
              />
              <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-orange" />
            </div>
          </div>
        </div>

        <button 
          onClick={handleDeploy}
          className="w-full py-5 bg-accent-orange text-white font-black text-sm italic tracking-[0.2em] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,69,0,0.1)]"
        >
          <Crosshair className="w-5 h-5" />
          DEPLOY NEW DEADDROP TO GRID
        </button>
      </div>

      {/* 4. GOD-MODE CONTROLS */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent-orange" />
          <h4 className="text-xs font-black text-white uppercase tracking-widest italic">Global Event Trigger</h4>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={triggerEMP}
            className="p-5 bg-black border border-accent-orange flex flex-col items-center gap-2 group hover:bg-accent-orange/5 transition-all"
          >
            <Zap className="w-8 h-8 text-accent-orange animate-pulse" />
            <span className="text-[10px] font-black text-accent-orange uppercase tracking-widest text-center mt-2">TRIGGER GLOBAL EMP</span>
          </button>
          <button 
            onClick={() => alert("FORCING SYSTEM REBOOT. DISCONNECTING ALL SESSIONS...")}
            className="p-5 bg-black border border-zinc-800 flex flex-col items-center gap-2 hover:border-white transition-all"
          >
            <RefreshCw className="w-8 h-8 text-zinc-500" />
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center mt-2">FORCE SYSTEM REBOOT</span>
          </button>
        </div>
      </div>

      <div className="mt-auto border-t border-zinc-900 pt-6">
         <p className="text-[10px] text-accent-orange/40 uppercase leading-relaxed font-bold italic">
           CRITICAL: Secure channel established. <br/>
           All actions are non-reversible and logged to the central ledger.
         </p>
      </div>
    </div>
  );
}

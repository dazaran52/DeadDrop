/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, QrCode, X } from 'lucide-react';

export default function UnlockScreen() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 space-y-8">
      <AnimatePresence mode="wait">
        {!unlocked ? (
          <motion.div 
            key="lock"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="flex flex-col items-center space-y-8"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="w-64 h-64 rounded-full border-2 border-dashed border-accent-green/30 flex items-center justify-center"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 rounded-full bg-accent-green/10 border border-accent-green/50 flex items-center justify-center shadow-[0_0_50px_rgba(57,255,20,0.3)]">
                  <Lock className="w-20 h-20 text-accent-green animate-pulse" />
                </div>
              </div>
            </div>

            <button
              onClick={() => setUnlocked(true)}
              className="group relative px-12 py-6 bg-accent-red text-white font-black text-xl rounded-lg shadow-[0_0_40px_rgba(255,0,60,0.6)] uppercase tracking-widest border-t-2 border-white/30 transition-transform active:scale-95"
            >
              <span className="relative z-10">UNLOCK DEADDROP</span>
              {/* Internal glow animation */}
              <motion.div
                animate={{ x: ['100%', '-100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none"
              />
            </button>
            <p className="text-accent-green/60 text-xs font-mono uppercase animate-pulse">Encryption sequence ready</p>
          </motion.div>
        ) : (
          <motion.div 
            key="success"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-sm bg-gray-900/80 backdrop-blur-xl border border-green-500/30 p-8 rounded-2xl shadow-[0_0_100px_rgba(34,197,94,0.1)] relative overflow-hidden"
          >
             {/* Success background effect */}
             <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
             
             <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center">
                  <Unlock className="w-10 h-10 text-green-500" />
                </div>
                
                <div>
                  <h3 className="text-2xl font-black text-green-500 tracking-wider">DEADDROP ACCESSED</h3>
                  <p className="text-gray-400 text-sm mt-2 font-mono uppercase">Decryption complete. Scanner online.</p>
                </div>

                <div className="w-full aspect-square bg-gray-950 border-2 border-dashed border-green-500/30 rounded-xl relative flex flex-items justify-center group overflow-hidden">
                  {/* Scanner line */}
                  <motion.div
                    animate={{ top: ['5%', '95%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute left-[5%] right-[5%] h-0.5 bg-green-400 shadow-[0_0_15px_rgba(74,222,128,1)] z-10"
                  />
                  <div className="flex flex-col items-center justify-center space-y-4 opacity-40 group-hover:opacity-100 transition-opacity">
                    <QrCode className="w-32 h-32 text-green-500" />
                    <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">Awaiting Artifact Scan</span>
                  </div>
                </div>

                <button 
                  onClick={() => setUnlocked(false)}
                  className="text-xs uppercase text-gray-500 flex items-center space-x-2 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span>Resume Hunt</span>
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

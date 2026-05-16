/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';
import { Target, Compass } from 'lucide-react';

interface RadarProps {
  distance: number;
}

export default function Radar({ distance }: RadarProps) {
  let status: 'COLD' | 'WARM' | 'HOT' = 'COLD';
  let color = 'text-white/40';
  let pulseColor = 'rgba(255, 255, 255, 0.1)';
  let bgColor = 'bg-white/5';
  let borderColor = 'border-white/10';
  let pulseDuration = 3;

  if (distance <= 50) {
    status = 'HOT';
    color = 'text-accent-orange';
    pulseColor = 'rgba(255, 69, 0, 0.5)';
    bgColor = 'bg-accent-orange/10';
    borderColor = 'border-accent-orange/40';
    pulseDuration = 0.6;
  } else if (distance <= 500) {
    status = 'WARM';
    color = 'text-accent-purple';
    pulseColor = 'rgba(138, 43, 226, 0.5)';
    bgColor = 'bg-accent-purple/10';
    borderColor = 'border-accent-purple/30';
    pulseDuration = 1.5;
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center">
        {/* Decorative Compass markings */}
        <div className="absolute inset-[-40px] border border-white/5 rounded-full pointer-events-none" />
        <div className="absolute inset-[-40px] flex justify-center py-1">
          <span className="text-[8px] font-bold text-white/20">N</span>
        </div>
        
        {/* Conic Gradient Radar Effect */}
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
           className="absolute w-48 h-48 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,currentColor_20deg,transparent_40deg)] opacity-20"
            style={{ color: status === 'HOT' ? '#FF4500' : status === 'WARM' ? '#8A2BE2' : '#ffffff' }}
          />

          {/* Pulse rings */}
          <motion.div
            animate={{ scale: [1, 1.4, 1.8], opacity: [0.3, 0.1, 0] }}
            transition={{ duration: pulseDuration, repeat: Infinity, ease: "easeOut" }}
            className="absolute w-32 h-32 rounded-full border border-white/20"
            style={{ borderColor: pulseColor }}
          />
          
          {/* Central Unit - Liquid Core */}
          <div className={`relative z-10 w-32 h-32 rounded-full glass-panel flex flex-col items-center justify-center border-2 backdrop-blur-xl ${borderColor} ${bgColor} shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
            <div className="relative">
               <Target className={`w-8 h-8 ${color} drop-shadow-[0_0_10px_currentColor]`} />
               <motion.div 
                 animate={{ rotate: 360 }}
                 transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                 className="absolute inset-[-10px]"
               >
                  <Compass className="w-4 h-4 text-white/20 absolute -top-2 left-1/2 -translate-x-1/2" />
               </motion.div>
            </div>
            
            <div className="mt-2 flex flex-col items-center">
              <motion.span 
                key={status}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-2xl font-black tracking-tighter ${color}`}
              >
                {status}
              </motion.span>
              <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest leading-none">Scanning...</span>
            </div>
          </div>
        </div>
  
        <div className="mt-12 flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1">Target Proximity</span>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-light text-white font-mono">{distance.toFixed(1)}</span>
            <span className="text-sm font-bold text-accent-orange/60 italic font-mono uppercase tracking-tighter">METERS</span>
          </div>
        </div>
    </div>
  );
}

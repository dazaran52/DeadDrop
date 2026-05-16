/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';
import { Home, User, Shield, Crosshair } from 'lucide-react';

export type ViewType = 'dashboard' | 'lobby' | 'profile' | 'admin' | 'hunt';

interface BottomNavProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  isSuperUser: boolean;
}

export default function BottomNav({ currentView, onViewChange, isSuperUser }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as ViewType, label: 'Main', icon: Home },
    { id: 'lobby' as ViewType, label: 'OPS', icon: Crosshair },
    { id: 'profile' as ViewType, label: 'Profile', icon: User },
    ...(isSuperUser ? [{ id: 'admin' as ViewType, label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <nav className="z-50 p-6 pt-0 mt-auto bg-bg-deep border-t border-border-main">
      <div className="mx-auto w-full max-w-sm flex items-center justify-between gap-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 rounded-lg transition-all relative ${
              currentView === item.id 
                ? 'text-accent-orange bg-accent-orange/5' 
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <item.icon className="w-5 h-5 mb-1.5" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{item.label}</span>
            {currentView === item.id && (
              <motion.div 
                layoutId="nav-indicator"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent-orange shadow-[0_0_10px_rgba(255,69,0,0.4)]" 
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

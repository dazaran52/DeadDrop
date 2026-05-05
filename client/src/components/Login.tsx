/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (error: any) {
      console.error('OAuth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-8 pt-20 pb-12 bg-[#0B0C10] relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-accent-purple/10 rounded-full blur-[80px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-accent-orange/5 rounded-full blur-[80px]" />

      <div className="w-full flex flex-col items-center space-y-2 z-10">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-purple/10 border border-accent-purple/20 mb-4">
            <ShieldCheck className="w-3 h-3 text-accent-purple" />
            <span className="text-[10px] font-bold text-accent-purple uppercase tracking-widest">Secure Uplink</span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-text-main leading-none">DEADDROP<span className="text-accent-orange">.</span></h1>
          <p className="text-xs uppercase tracking-[0.4em] text-text-muted mt-2 font-medium">Protocol Terminal v4.1</p>
        </motion.div>
      </div>

      <div className="w-full max-w-sm z-10">
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full py-4 bg-[#1e1f26] border border-border-main text-text-main font-bold rounded-xl flex items-center justify-center space-x-4 hover:bg-[#25262e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <div className="w-5 h-5 flex items-center justify-center bg-white rounded-full p-1">
                <svg viewBox="0 0 24 24" className="w-full h-full text-black">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                </svg>
              </div>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-col items-center gap-4 opacity-50 z-10">
        <p className="text-[10px] text-text-muted leading-relaxed text-center max-w-[240px]">
          By continuing, you agree to the <span className="text-text-main underline cursor-pointer">Protocol Agreement</span> and <span className="text-text-main underline cursor-pointer">Security Standards</span>.
        </p>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-accent-orange animate-pulse" />
          <span className="text-[8px] font-mono tracking-[0.4em] uppercase">Ready for Deployment</span>
        </div>
      </div>
    </div>
  );
}

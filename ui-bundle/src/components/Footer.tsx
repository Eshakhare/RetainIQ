import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-slate-500 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
          <p className="font-medium text-slate-700">
            Advice for a human: nothing is sent to customers automatically. Based on weekly login counts only.
          </p>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>RetainIQ Platform</span>
          <span>•</span>
          <span>Customer Success Early Warning System</span>
        </div>
      </div>
    </footer>
  );
};

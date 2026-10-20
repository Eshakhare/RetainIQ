import React, { useState } from 'react';
import { ReplayTab } from './ReplayTab';
import { HowItWorksTab } from './HowItWorksTab';
import { WhatIfTab } from './WhatIfTab';
import {
  AccountResult,
  ConfigResponse,
} from '../../types';
import {
  History,
  BookOpen,
  Sliders,
} from 'lucide-react';

interface TabsSectionProps {
  dataset: string;
  config: ConfigResponse | null;
  results: AccountResult[];
}

type TabKey = 'replay' | 'howItWorks' | 'whatIf';

export const TabsSection: React.FC<TabsSectionProps> = ({
  dataset,
  config,
  results,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('replay');

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    {
      key: 'replay',
      label: 'Historical Replay',
      icon: <History className="w-4 h-4" />,
    },
    {
      key: 'howItWorks',
      label: 'How It Works',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      key: 'whatIf',
      label: 'What-If Simulation',
      icon: <Sliders className="w-4 h-4" />,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-12">
      {/* Tab Navigation Strip */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 flex space-x-1 sm:space-x-2 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'border-sky-600 text-sky-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span className={isActive ? 'text-sky-600' : 'text-slate-400'}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panel */}
      <div className="p-6">
        {activeTab === 'replay' && <ReplayTab dataset={dataset} />}
        {activeTab === 'howItWorks' && <HowItWorksTab config={config} />}
        {activeTab === 'whatIf' && (
          <WhatIfTab
            currentResults={results}
            config={config}
            selectedDataset={dataset}
          />
        )}
      </div>
    </div>
  );
};

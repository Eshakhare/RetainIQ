import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DismissibleBanner } from './components/DismissibleBanner';
import { PlatformBanner } from './components/PlatformBanner';
import { SummaryStrip } from './components/SummaryStrip';
import { WeeklyBriefingCard } from './components/WeeklyBriefingCard';
import { RankedTable } from './components/RankedTable';
import { AccountDetailDrawer } from './components/AccountDetailDrawer';
import { TabsSection } from './components/tabs/TabsSection';
import { Footer } from './components/Footer';

import {
  HealthResponse,
  DatasetItem,
  ConfigResponse,
  AnalyzeResponse,
  AccountResult,
  AgentBriefingResponse,
  Tier,
} from './types';
import { api, ApiError } from './api';

export const App: React.FC = () => {
  // Global Application State
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDataset, setSelectedDataset] = useState('seed');

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountResult | null>(null);

  const [briefing, setBriefing] = useState<AgentBriefingResponse | null>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  const [errorBanner, setErrorBanner] = useState<{ code?: string; message: string } | null>(null);

  // Load Health & Metadata
  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await api.getHealth();
      setHealth(data);
      setHealthError(false);
    } catch {
      setHealthError(true);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadInitialMeta = useCallback(async () => {
    try {
      const [dsList, cfg] = await Promise.all([
        api.getDatasets(),
        api.getConfig(),
      ]);
      setDatasets(dsList);
      setConfig(cfg);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorBanner({ code: err.code, message: err.message });
      } else {
        setErrorBanner({
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to connect to backend',
        });
      }
    }
  }, []);

  // Run Analyze on selected dataset
  const runAnalyze = useCallback(async (datasetId: string) => {
    setIsAnalyzing(true);
    setErrorBanner(null);
    try {
      const data = await api.analyze({ dataset: datasetId });
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorBanner({ code: err.code, message: err.message });
      } else {
        setErrorBanner({
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Analysis failed',
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Run initial bootstrap on mount
  useEffect(() => {
    checkHealth();
    loadInitialMeta();
    runAnalyze(selectedDataset);
  }, [checkHealth, loadInitialMeta, runAnalyze, selectedDataset]);

  // When dataset changes, automatically re-analyze and clear sub-selections
  const handleDatasetChange = (newDs: string) => {
    setSelectedDataset(newDs);
    setSelectedTier(null);
    setSelectedAccount(null);
    setBriefing(null);
    runAnalyze(newDs);
  };

  // Re-run on settings URL change
  const handleBaseUrlChange = () => {
    checkHealth();
    loadInitialMeta();
    runAnalyze(selectedDataset);
  };

  // Briefing generation
  const handleGenerateBriefing = async (forceTemplate: boolean, refresh: boolean) => {
    setIsBriefingLoading(true);
    setErrorBanner(null);
    try {
      const mode = forceTemplate ? 'template' : 'auto';
      const result = await api.getAgentBriefing(selectedDataset, mode, refresh);
      setBriefing(result);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorBanner({ code: err.code, message: err.message });
      } else {
        setErrorBanner({
          code: 'BRIEFING_ERROR',
          message: err instanceof Error ? err.message : 'Briefing generation failed',
        });
      }
    } finally {
      setIsBriefingLoading(false);
    }
  };

  // When clicking an account in briefing priorities, find it and open the drawer
  const handleSelectAccountById = (accId: string) => {
    const acc = report?.results.find((r) => r.account_id === accId);
    if (acc) {
      setSelectedAccount(acc);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Header */}
      <Header
        health={health}
        healthLoading={healthLoading}
        healthError={healthError}
        datasets={datasets}
        selectedDataset={selectedDataset}
        onSelectDataset={handleDatasetChange}
        onAnalyze={() => runAnalyze(selectedDataset)}
        isAnalyzing={isAnalyzing}
        onBaseUrlChange={handleBaseUrlChange}
      />

      {/* Dismissible Error / Network Banner */}
      <DismissibleBanner
        error={errorBanner}
        onDismiss={() => setErrorBanner(null)}
      />

      {/* Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tier Summary Strip */}
        <SummaryStrip
          summary={report ? report.summary : null}
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          isLoading={isAnalyzing && !report}
        />

        {/* Platform-wide Alert Banner (if correlated shifts detected) */}
        {report && <PlatformBanner annotations={report.annotations} />}

        {/* Weekly Intelligence Briefing (AI Showcase) */}
        <WeeklyBriefingCard
          dataset={selectedDataset}
          briefing={briefing}
          isLoading={isBriefingLoading}
          onGenerate={handleGenerateBriefing}
          onSelectAccount={handleSelectAccountById}
        />

        {/* Ranked Account Risk Table */}
        <RankedTable
          results={report?.results || []}
          selectedTier={selectedTier}
          onSelectAccount={setSelectedAccount}
          isLoading={isAnalyzing && !report}
          activeAccountId={selectedAccount?.account_id}
        />

        {/* Deep Analysis Tabs (Compare, Replay, How It Works, What-If) */}
        <TabsSection
          dataset={selectedDataset}
          config={config}
          results={report?.results || []}
        />
      </main>

      {/* Account Detail Drawer (Show the Working) */}
      <AccountDetailDrawer
        account={selectedAccount}
        dataset={selectedDataset}
        config={config}
        onClose={() => setSelectedAccount(null)}
      />

      {/* Mandatory Footer */}
      <Footer />
    </div>
  );
};

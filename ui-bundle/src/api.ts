import {
  HealthResponse,
  DatasetItem,
  ConfigResponse,
  AnalyzeResponse,
  AccountDetailResponse,
  BacktestItem,
  AgentBriefingResponse,
  AnalyzePayload,
} from './types';

const STORAGE_KEY = 'retainiq_api_base';

export function getApiBaseUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim() !== '') {
    return stored.trim().replace(/\/+$/, '');
  }
  const envVal = import.meta.env.VITE_API_BASE;
  if (envVal && typeof envVal === 'string' && envVal.trim() !== '') {
    return envVal.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8000';
}

export function setApiBaseUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, clean);
  }
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', status: number = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(
      `Failed to connect to backend at ${baseUrl}. (${message})`,
      'NETWORK_ERROR',
      0
    );
  }

  if (!response.ok) {
    let errorDetail: { code?: string; message?: string } = {};
    try {
      const data = await response.json();
      if (data && data.error) {
        errorDetail = data.error;
      }
    } catch {
      // response wasn't JSON
    }
    const code = errorDetail.code || `HTTP_${response.status}`;
    const message = errorDetail.message || `Request failed with status ${response.status}`;
    throw new ApiError(message, code, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health');
  },

  getDatasets(): Promise<DatasetItem[]> {
    return request<DatasetItem[]>('/api/datasets');
  },

  getConfig(): Promise<ConfigResponse> {
    return request<ConfigResponse>('/api/config');
  },

  analyze(payload: AnalyzePayload): Promise<AnalyzeResponse> {
    return request<AnalyzeResponse>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAccount(id: string, dataset: string = 'seed'): Promise<AccountDetailResponse> {
    const params = new URLSearchParams({ dataset });
    return request<AccountDetailResponse>(`/api/accounts/${encodeURIComponent(id)}?${params.toString()}`);
  },

  getBacktest(dataset: string = 'seed'): Promise<BacktestItem[]> {
    const params = new URLSearchParams({ dataset });
    return request<BacktestItem[]>(`/api/backtest?${params.toString()}`);
  },

  getAgentBriefing(dataset: string = 'seed', mode: 'auto' | 'template' = 'auto', refresh: boolean = false): Promise<AgentBriefingResponse> {
    return request<AgentBriefingResponse>('/api/agent/briefing', {
      method: 'POST',
      body: JSON.stringify({ dataset, mode, refresh }),
    });
  },

  getAgentAccountBrief(id: string, dataset: string = 'seed', mode: 'auto' | 'template' = 'auto', refresh: boolean = false): Promise<AgentBriefingResponse> {
    return request<AgentBriefingResponse>(`/api/agent/accounts/${encodeURIComponent(id)}/brief`, {
      method: 'POST',
      body: JSON.stringify({ dataset, mode, refresh }),
    });
  },
};

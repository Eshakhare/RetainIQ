import React from 'react';
import { AlertTriangle, AlertCircle, X, Terminal, Copy, Check } from 'lucide-react';
import { getApiBaseUrl } from '../api';

interface DismissibleBannerProps {
  error: { code?: string; message: string } | null;
  onDismiss: () => void;
}

export const DismissibleBanner: React.FC<DismissibleBannerProps> = ({
  error,
  onDismiss,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!error) return null;

  const isNetwork = error.code === 'NETWORK_ERROR' || error.message.toLowerCase().includes('failed to connect');
  const apiUrl = getApiBaseUrl();
  const startCmd = 'cd backend; .\\.venv\\Scripts\\python -m uvicorn retainiq.api.app:app';

  const handleCopy = () => {
    navigator.clipboard.writeText(startCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isNetwork) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3.5 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-1 rounded-md bg-red-100 text-red-600 mt-0.5">
              <AlertCircle className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-900">
                Cannot connect to RetainIQ backend at {apiUrl}
              </h4>
              <p className="text-xs text-red-700 mt-0.5">
                The API server is currently unreachable. Make sure the FastAPI service is running locally.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-red-800 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5" /> Start the backend:
                </span>
                <code className="bg-red-100/80 border border-red-200 text-red-950 font-mono text-xs px-2 py-0.5 rounded flex items-center gap-1.5">
                  {startCmd}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-800 hover:text-red-950 bg-red-200/60 hover:bg-red-200 px-2 py-0.5 rounded transition-colors"
                  title="Copy command to clipboard"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="self-start md:self-center text-red-500 hover:text-red-800 p-1 rounded-md hover:bg-red-100"
            title="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-900 font-medium">
            {error.code && (
              <span className="font-mono text-xs uppercase px-1.5 py-0.5 bg-amber-100 border border-amber-200 rounded mr-2 text-amber-800">
                {error.code}
              </span>
            )}
            <span>{error.message}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-500 hover:text-amber-800 p-1 rounded-md hover:bg-amber-100"
          title="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

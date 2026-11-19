import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Reading mode. "simple" (default) shows plain-language summaries only; "detailed" adds provenance
 * labels, verification counters, source health and the full evidence breakdown everywhere.
 * The choice is a per-browser convenience stored in localStorage (wrapped: storage can be blocked).
 */
type Mode = 'simple' | 'detailed';
const KEY = 'biopulse:view';

const ViewContext = createContext<{ mode: Mode; detailed: boolean; setMode: (m: Mode) => void }>({ mode: 'simple', detailed: false, setMode: () => {} });

function readMode(): Mode {
  try {
    return localStorage.getItem(KEY) === 'detailed' ? 'detailed' : 'simple';
  } catch {
    return 'simple';
  }
}

export function ViewProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  };
  return <ViewContext.Provider value={{ mode, detailed: mode === 'detailed', setMode }}>{children}</ViewContext.Provider>;
}

export const useView = () => useContext(ViewContext);

export function ViewToggle() {
  const { mode, setMode } = useView();
  return (
    <div className="inline-flex rounded-lg border border-ink-600 p-0.5 text-[13px]" role="group" aria-label="Reading mode">
      {(['simple', 'detailed'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${mode === m ? 'bg-ink-600 text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

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
    <div className="relative inline-grid grid-cols-2 rounded-lg border border-ink-600 p-0.5 text-[13px]" role="group" aria-label="Reading mode">
      {/* Sliding indicator behind the active option. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-ink-600 transition-transform duration-300 ease-out"
        style={{ transform: mode === 'detailed' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      {(['simple', 'detailed'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={`relative rounded-md px-3 py-1 font-medium capitalize transition-colors duration-300 ${mode === m ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

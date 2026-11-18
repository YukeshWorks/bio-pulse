export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const inActions = () => process.env.GITHUB_ACTIONS === 'true';

/** Console logger that also emits GitHub Actions annotations for warnings and errors. */
export function createLogger(quiet = false): Logger {
  return {
    info: (m) => {
      if (!quiet) console.log(m);
    },
    warn: (m) => {
      if (inActions()) console.log(`::warning title=BioPulse::${escape(m)}`);
      else if (!quiet) console.warn(`WARN  ${m}`);
    },
    error: (m) => {
      if (inActions()) console.log(`::error title=BioPulse::${escape(m)}`);
      else if (!quiet) console.error(`ERROR ${m}`);
    },
  };
}

function escape(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function createMemoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`INFO ${m}`),
    warn: (m) => lines.push(`WARN ${m}`),
    error: (m) => lines.push(`ERROR ${m}`),
  };
}

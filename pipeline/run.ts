import { promises as fs } from 'node:fs';
import { loadConfig } from './config';
import { createHttpClient } from './lib/http';
import { createLogger } from './lib/log';
import { runPipeline } from './pipeline';

/**
 * CLI entry point: `npm run pipeline`.
 * Exit code 0 when data was published or previous data was preserved (failures are reported in
 * status.json, the log and the GitHub step summary). Exit code 1 only for unexpected crashes.
 */
async function main() {
  const env = process.env;
  const config = loadConfig(env);
  const log = createLogger();
  const ncbiInterval = env.NCBI_API_KEY ? 110 : 360;
  const http = createHttpClient({
    minIntervalMs: {
      'eutils.ncbi.nlm.nih.gov': ncbiInterval,
      'www.ebi.ac.uk': 200,
      'api.biorxiv.org': 300,
      'clinicaltrials.gov': 300,
      'ops.epo.org': 500,
    },
    defaultIntervalMs: 250,
  });
  const urlHttp = createHttpClient({ defaultIntervalMs: 150 });
  const now = env.BIOPULSE_NOW ? new Date(env.BIOPULSE_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid BIOPULSE_NOW: ${env.BIOPULSE_NOW}`);

  const result = await runPipeline({ config, http, urlHttp, log, env, now });

  const summaryFile = env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const rows = result.status.sources
      .map((s) => `| ${s.name} | ${s.status} | ${s.fetched} | ${s.accepted} | ${s.rejected} | ${(s.error ?? s.note ?? '').replace(/\|/g, '/').slice(0, 160)} |`)
      .join('\n');
    const md = [
      `## BioPulse daily run — ${result.runDate}`,
      `**Outcome:** \`${result.outcome}\` — ${result.message}`,
      '',
      result.dataset?.briefing.sentence ? `> ${result.dataset.briefing.sentence}` : '> No briefing generated.',
      '',
      '| Source | Status | Fetched | Accepted | Rejected | Notes |',
      '|---|---|---|---|---|---|',
      rows,
      '',
    ].join('\n');
    await fs.appendFile(summaryFile, md);
  }
  if (env.GITHUB_OUTPUT) {
    await fs.appendFile(env.GITHUB_OUTPUT, `outcome=${result.outcome}\nrun_date=${result.runDate}\n`);
  }
}

main().catch((err) => {
  console.error('BioPulse pipeline crashed:', err instanceof Error ? err.stack : err);
  process.exit(1);
});

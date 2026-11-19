# BioPulse – Biotechnology Daily Intelligence

BioPulse is a static website plus an automated daily pipeline that tracks biotechnology research, preprints, clinical trials, regulatory news and patents. It puts **today's biotechnology into one evidence-based sentence**, built only from verified source records and linked to the originals.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4. Hash routing, so deep links work on GitHub Pages.
- **Pipeline:** TypeScript (Node 22). Modular collectors for PubMed, Europe PMC, bioRxiv, medRxiv, ClinicalTrials.gov v2, FDA and EMA RSS, and EPO OPS. Company feeds are optional.
- **Storage:** static JSON in `public/data/`, committed by the workflow. Every day is archived.
- **Automation:** one GitHub Actions workflow runs daily at 07:00 IST. It fetches, validates, archives, commits, builds and deploys to Pages, all in the same run.
- **AI (optional):** if `ANTHROPIC_API_KEY` is set, the Claude API writes the briefing and summaries from the supplied metadata and abstracts only. Every AI field is validated, and any field that fails is replaced with deterministic text.

> BioPulse is an automated index, not medical advice. Preprints are not peer-reviewed. Patent filings and trial registrations are not evidence of efficacy.

---

## What the site shows

| Page | Content |
|---|---|
| **Home** | Today's date in IST, the last successful update and a freshness indicator, **Today's Biotechnology in One Sentence** with numbered citations, the **three most important updates** (each answers six questions), the latest updates, category navigation and source attribution |
| **Latest Discoveries** | All records, with search, filters (evidence, category, source, date range) and sorting. The dataset selector covers the latest update, 7 days, 30 days or the whole archive |
| **Research Papers** | Peer-reviewed articles and preprints. Preprints always carry a warning |
| **Patents & Inventions** | EPO patent documents. Applications and grants are labelled separately, with a disclaimer that a patent is not proof of efficacy |
| **Clinical Trials** | New ClinicalTrials.gov registrations with genetic or biological interventions |
| **Biotechnology Categories** | The 20 coverage areas, each with its own filtered list |
| **Daily Archive** | Every archived day, with its briefing, top discoveries and records |
| **About & Sources** | Methodology, evidence definitions, text-provenance labels, ranking formula, live source status from the last run, and known limitations |

Every piece of text has a **provenance label**:

| Label | Meaning |
|---|---|
| *From source* | Quoted from the source |
| *Source metadata* | Built from structured fields |
| *BioPulse context* | Generic interpretation, not a finding of the record |
| *AI-generated* | Written by the AI adapter |
| *Not in source* | BioPulse does not guess |

## Scientific integrity rules (enforced in code)

| Rule | Where |
|---|---|
| Evidence classes: `PEER-REVIEWED`, `PREPRINT`, `PATENT APPLICATION`, `CLINICAL TRIAL`, `REGULATORY UPDATE`, `COMPANY ANNOUNCEMENT` | `shared/schema.ts`, `shared/evidence.ts` |
| Preprint servers can never yield peer-reviewed records. Conflicting labels resolve to PREPRINT. PubMed items typed "Preprint" become PREPRINT | `pipeline/lib/validate.ts`, `pipeline/lib/dedupe.ts`, `pipeline/collectors/pubmed.ts` |
| Patent kind codes split applications (A) from grants (B/C). Patents always carry a "not evidence of efficacy" note | `pipeline/collectors/epo.ts`, `pipeline/lib/enrich.ts` |
| Source URLs must be HTTPS on the source's official host. Identifiers must match the URL (citation verification) | `pipeline/lib/validate.ts` |
| Top-ranked links are checked live. A 404 or 410 drops the record. Homepage highlights require a verified link | `pipeline/pipeline.ts` |
| Dates must be real calendar dates that are not in the future. Missing or partial dates are rejected, never guessed | `pipeline/lib/dates.ts` |
| Deduplication uses DOI, PMID, PMCID, NCT ID, patent number, URL and title (title matches only within the same evidence class) | `pipeline/lib/ids.ts`, `pipeline/lib/dedupe.ts` |
| Items published on any of the previous 10 days are suppressed | `pipeline/pipeline.ts` |
| No full text is stored, only metadata and a short excerpt of at most 320 characters | `pipeline/lib/text.ts` |
| The briefing is 20–30 words and cites real record IDs. With no records there is no headline, and the site says so | `pipeline/lib/briefing.ts`, schema `superRefine` |
| AI output is rejected if it contains URLs or identifiers absent from the input, cites unknown records, or has the wrong length | `pipeline/lib/ai.ts` |
| **A failed fetch never replaces valid data.** If every source fails, or a run with any failed source finds nothing, the previous `latest.json` and archive stay untouched and `status.json` records the failure. If a source fails on a same-day re-run, records it supplied earlier that day are carried over | `pipeline/pipeline.ts` |
| Demonstration data is labelled `dataset: "demo"`, titled `[DEMO]`, linked to example.org, and blocked from deployment | `scripts/generate-demo.ts`, `pipeline/validate-data.ts`, `scripts/verify-dist.mjs` |
| Stale-data detection: the UI warns once the last successful update is more than 30 hours old (stronger warning after 72 hours) | `src/lib/format.ts` |

## Folder structure

```
.github/workflows/
  daily.yml            # 07:00 IST schedule + manual run: fetch → validate → commit → build → deploy Pages
  ci.yml               # PRs/branches: typecheck, tests, build, dist check, responsive e2e
shared/                # Shared by pipeline and frontend
  schema.ts            # zod data contract (records, daily dataset, status, sources, archive index)
  categories.ts        # 20 coverage categories: keyword rules, PubMed terms, preprint subjects, context
  evidence.ts          # evidence class definitions, cautions, ranking weights
pipeline/
  run.ts               # CLI entry (npm run pipeline): logging, step summary, outputs
  pipeline.ts          # orchestrator: collect → validate → dedupe → classify → verify → rank → brief → write
  config.ts            # env-driven configuration (feeds, limits, AI, EPO query)
  sources-meta.ts      # metadata published in sources.json
  validate-data.ts     # pre-commit/pre-deploy data integrity gate (npm run validate:data)
  collectors/          # one module per source (pubmed, europepmc, preprints, clinicaltrials, rss, epo)
  lib/                 # http (retry/backoff/pacing), dates (IST), text, ids, dedupe, classify,
                       # validate, enrich (deterministic summaries), rank, briefing, ai (Claude adapter), storage
src/                   # React app
  components/          # Layout, badges, record & discovery cards, explorer (search/filter/sort), states
  pages/               # Home, list pages, archive, about
  lib/                 # data loading, filters, formatting/freshness
public/
  data/                # generated, committed by the workflow
    latest.json        # latest successful daily dataset
    status.json        # last run attempt, outcome, per-source status, run history
    sources.json       # source metadata + last status
    archive/YYYY-MM-DD.json, archive/index.json
fixtures/demo/         # DEMONSTRATION DATA for local development only (never deployed)
scripts/               # generate-demo.ts, verify-dist.mjs, e2e-responsive.mjs
tests/                 # vitest: unit, collectors, pipeline integration, AI adapter, frontend, workflow config
```

## Local development

Requires Node.js 22 or newer.

```bash
npm install
```

Run the site against the demonstration data (fictional, clearly labelled):

```bash
npm run dev:demo
```

Run the site against real data in `public/data`. It shows "No data has been published yet" until the pipeline has run.

```bash
npm run dev
```

Fetch real data locally. This needs internet access; credentials are optional and read from `.env`, see `.env.example`.

```bash
npm run pipeline
```

Check the generated data:

```bash
npm run validate:data
```

Regenerate the demonstration fixtures:

```bash
npm run demo:generate
```

## Tests

Run typecheck, unit, integration and component tests (offline, with mocked API responses):

```bash
npm run typecheck && npm test
```

Run the production build, the GitHub Pages output check and the responsive e2e checks (Chromium at 320, 390, 768 and 1280 px):

```bash
npm run build && npm run verify:dist && npm run test:e2e
```

If Chromium is not installed yet, install it first (the CI workflow does this automatically):

```bash
npx playwright install chromium
```

The suite covers:

- data ingestion for every collector
- deduplication, including transitive matches and preprint/journal separation
- invalid, missing, insecure and off-site URLs, and identifier/URL mismatches
- empty source responses and bioRxiv "no posts found"
- failed API requests: retries, 5xx, 404, network errors, invalid JSON, secret redaction
- date and timezone handling (IST boundaries, RFC 822 zones, future and partial dates)
- JSON schema validation
- the preserve-on-failure logic, same-day carry-over and suppression of already-published items
- briefing length bounds
- AI output validation and fallback
- frontend filters, labels, stale detection and the "no qualifying updates" state
- the daily workflow configuration: schedule, permissions and step order
- mobile responsiveness (no horizontal overflow on any route) and GitHub Pages build output

## Deploying on GitHub Pages

1. **Enable Pages:** go to Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
2. **Allow the workflow to push data:** go to Settings → Actions → General → *Workflow permissions* and choose **Read and write permissions**. The workflow also requests `contents: write` itself.
3. **Merge to the default branch** (`main`). Scheduled workflows run only on the default branch. Pushing code to `main` triggers a build and deploy without fetching new data.
4. **First data run:** go to Actions → *BioPulse daily update & deploy* → **Run workflow**. After that it runs every day at 01:30 UTC (07:00 IST); GitHub may start scheduled runs a few minutes late.
5. The site is published at `https://<owner>.github.io/<repo>/`. The relative asset base also works on custom domains.

The `github-pages` environment only accepts deployments from the default branch, so runs on other branches build and validate but do not deploy.

### Secrets and variables

All of these are optional. Without them, PubMed, Europe PMC, bioRxiv, medRxiv, ClinicalTrials.gov, FDA and EMA still work. **Never commit credentials.**

| Name | Type | Purpose |
|---|---|---|
| `NCBI_API_KEY` | secret | Raises the PubMed E-utilities rate limit from 3 to 10 requests per second |
| `NCBI_EMAIL` | secret | Contact address sent to NCBI with requests (E-utilities etiquette) |
| `ANTHROPIC_API_KEY` | secret | Enables AI summaries through the Claude API. A Claude.ai Pro or Max subscription does **not** include API credits; the API is billed separately at console.anthropic.com. Requests use server-side refusal fallback (`fallbacks: "default"`) |
| `EPO_OPS_KEY`, `EPO_OPS_SECRET` | secret | European Patent Office OPS credentials (free registration at developers.epo.org). Without them the patent source is shown as *skipped* |
| `BIOPULSE_COMPANY_FEEDS` | variable | JSON list of official company RSS feeds, e.g. `[{"name":"Acme newsroom","url":"https://acme.com/rss.xml"}]` |
| `BIOPULSE_AI_MODEL` | variable | Overrides the AI model (default `claude-opus-5-5`) |
| `BIOPULSE_AI_DISABLE` | variable | Set to `true` to force deterministic summaries even when a key exists |

Tuning variables are listed in `.env.example`: lookback windows, record cap, URL verification and the EPO query.

### What a daily run does

1. `npm ci`, typecheck and the full test suite.
2. `npm run pipeline`, with `continue-on-error`. Failed sources are reported as `::error` annotations and in the job summary table, and saved to `status.json`.
3. If the pipeline crashes, the committed data is restored with `git checkout`.
4. `npm run validate:data` checks the schema, rejects demo data and checks that `latest.json` matches its archive.
5. The changed `public/data/` is committed with `[skip ci]` and pushed, with rebase retries.
6. `npm run build`, then `npm run verify:dist`, then upload of the Pages artifact.
7. The `deploy` job publishes with `actions/deploy-pages`, in the same run.

A preserved-previous outcome still redeploys, so the site can show the failure notice and stale-data warning.

## Known limitations

- **Live API access was not exercised from the development sandbox.** Its network blocks these hosts. Collectors were built from each API's documented formats and tested against synthetic responses, so the first real run happens in GitHub Actions. Check that run's job summary.
- The EMA feed URL (`https://www.ema.europa.eu/en/news.xml`) and the FDA biologics feed URL come from published feed listings. If either moves, the source shows as *failed* on About & Sources; update `pipeline/config.ts`.
- The EPO OPS CQL query syntax and response parsing follow the OPS 3.2 documentation, but have not been run against the live service without credentials.
- Classification uses transparent keyword and CPC rules (v2: specific vs broad terms, confidence levels, matched terms shown on each card). It can still mis-file records or miss relevant ones.
- Only the highest-ranked links (60 per day by default) are live-checked; all other records show "metadata validated · link not live-checked".
- "Peer-reviewed" means the item is indexed as a journal article in PubMed or Europe PMC. BioPulse does not verify peer review itself.
- Summaries rely on abstracts. Full texts, methods and data are not reviewed.
- The ranking score reflects evidence type and metadata completeness, not scientific importance.
- Archives grow by roughly 0.2–0.4 MB of JSON per day; git compresses it well. Lower `BIOPULSE_MAX_RECORDS` if needed.
- GitHub disables scheduled workflows after 60 days without repository activity. The daily data commits normally prevent this.

## Changelog

- **v2 (pipeline 2.0.0):** response to the 19 Nov 2026 audit. Changes: confidence-rated classification, honest verification counters, balanced daily cap (preprints were being cut entirely), FDA http-link fix, per-source health, AI status, incremental archive loading, run manifest, and an alert on preserved data. Details, root causes and test results are in [`docs/upgrade-v2.md`](docs/upgrade-v2.md).

## License

Boost Software License 1.0 (see `LICENSE`). Source records belong to their publishers. BioPulse stores metadata and links only.

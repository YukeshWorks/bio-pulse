# BioPulse pipeline v2: audit response

This responds to the 19 Nov 2026 technical audit. It covers the P0 items (all done), most P1 items, and some of P2. Every finding below was checked against the live `public/data/*.json` from the 2026-11-19 run before any code changed.

## Root causes (confirmed)

| Audit item | Observed in live data | Root cause | Fix |
|---|---|---|---|
| **A. Category mismatch** (obesity/skeleton paper tagged Vaccines/Dx and Microbiology) | Categories `vaccines-diagnostics, microbiology`; "why it matters" used generic vaccines context | One keyword match in the abstract body scored 1 point, which was enough to include the record and to choose its primary category. Broad words such as `microbio`, `biomarker` and `diagnost` fired on passing mentions. The context text then came from that weak primary category. The stored excerpt matches none of the patterns, so the trigger words were in the unstored part of the abstract. | Classifier v2 (`pipeline/lib/classify.ts`, `shared/categories.ts`). Keywords are split into **specific** and **broad** terms. A category needs score ≥ 2: a specific title term, two specific body terms, or a CPC class; broad terms only add support. Each record now carries `classification` (primary category, confidence, matched terms per category). Low confidence means generic context only, a −0.8 rank penalty, and no homepage feature. |
| **B. "200 verified records"** | 43 links checked ok, 17 restricted, 140 never checked | The status message and briefing said "verified", but only the top 60 links are live-checked (`verifyUrlLimit`). The live check also ran *before* the daily cap, on a pre-cap ranking. | The live check now runs on the published (post-cap) records. Each dataset has a `verificationSummary` (collected → metadata-validated → published → link ok / restricted / failed / not checked), and the counts must add up (tested). The wording is now "metadata-validated" and "links live-checked", and each card shows its own link status. The briefing no longer says "verified". |
| **C1. bioRxiv/medRxiv: 0 accepted** | bioRxiv fetched 203, rejected 41; medRxiv fetched 10, rejected 1; daily-cap dropped 282 records overall | The 200-record cap was a pure score cut. Preprints weigh 1.6 against 3 for journal articles, so **every preprint that passed classification was cut**. Paging also stopped at 10 pages (300 of 592 postings). | `capBalanced()` reserves shares of the cap: preprints 25%, trials 10%, patents 10%, regulatory 5%, company 5%, with the remainder filled by score. Preprint paging raised to 20 pages. Capped records are counted per source (`capped`) instead of being reported as rejections. |
| **C2. FDA: 11 fetched, 0 accepted** | 9 rejections were `non-https-url` (dataset-wide) | Most likely the FDA feed publishes `http://www.fda.gov/...` links. That fits the dataset-wide count, but v1 did not record rejection reasons per source, so it is not certain. | `normalizeOfficialLink()` upgrades `http`→`https` **only** for the regulator's own allow-listed hosts and resolves relative links. Off-site and insecure links are still rejected. Per-source `rejectReasons` are now recorded so the next run shows the cause directly. |
| **C3. EPO / company skipped** | Credentials/feeds not configured | Expected: both are optional | Unchanged. The homepage now shows a **"Coverage incomplete today"** banner listing these sources and why. |
| **D. Archive loading** | `latest.json` 516 KB, pretty-printed | `loadRange()` fetched every day in the selected range at once | The archive is browsed **7 days at a time** with "Load older days". Search applies to the loaded days, and the UI says so. Daily files are written compact, about 25–30% smaller (the v1 files on disk were not rewritten). |
| **E. AI transparency** | `method: deterministic`; note said no key | No `ANTHROPIC_API_KEY` secret is configured | `ai.status` is one of `disabled`, `used`, `partial`, `fallback`, `failed` or `not-needed`, plus a safe `failure` category mapped from SDK error classes (never error bodies). The status is shown under the briefing and on the About page. If every AI field fails validation, the status is `fallback`, not `used`. |
| Ranking semantics | n/a | The cross-index bonus (+0.2 per extra source) rewarded duplicate copies of the same article | Cut to a single +0.1. Relabelled "Evidence & metadata rank — not a measure of scientific importance". |
| Ops visibility | n/a | A preserved-data run deployed quietly | New `alert` job in `daily.yml`. It fails *after* deploy when the outcome is `preserved-previous` or the pipeline step crashed, so GitHub notifies the owner and the site still updates. |
| Reproducibility | n/a | No run manifest | `dataset.run` records the pipeline version, commit SHA, workflow run ID and config (no secrets; tested). |

## Data compatibility

All new fields are **optional** in `shared/schema.ts`: `classification`, `verificationSummary`, `run`, `ai.status`, `ai.failure`, `sources[].rejectReasons` and `sources[].capped`. `schemaVersion` stays 1, and the existing 2026-11-19 archive validates unchanged (`npm run validate:data` passes). **Historical archives are not rewritten.** The 2026-11-19 day keeps its v1 categories and wording, and the next run uses v2.

## File-by-file changes

| File | Change |
|---|---|
| `shared/categories.ts` | Specific vs broad term split; more specific diagnostic terms |
| `shared/schema.ts` | Optional classification, verification summary, run manifest, AI status, per-source reasons and capped count |
| `pipeline/lib/classify.ts` | Rewritten: scored, explainable, confidence-rated (`keyword-rules-v2`) |
| `pipeline/lib/enrich.ts` | Confidence-aware `contextFor` that names the matched terms |
| `pipeline/lib/rank.ts` | `capBalanced`; low-confidence penalty; reduced cross-index bonus; featuring excludes low confidence |
| `pipeline/lib/ai.ts` | Status and failure categories (`aiFailureCategory`) |
| `pipeline/lib/briefing.ts` | "new biotech records" replaces "verified biotech updates" |
| `pipeline/lib/storage.ts` | Optional compact JSON writes |
| `pipeline/collectors/rss.ts` | Official-host http→https normalisation |
| `pipeline/config.ts` | Preprint paging 10 → 20 |
| `pipeline/pipeline.ts` | Per-source reject reasons; balanced cap; live check after cap; verification summary; run manifest; honest message |
| `src/lib/data.ts`, `src/components/RecordExplorer.tsx` | Incremental archive loading |
| `src/components/RecordCard.tsx` | Link-check status; "Why this category?" with matched terms and confidence |
| `src/components/Home.tsx`, `src/pages/HomePage.tsx` | Coverage banner, verification counters, AI status, ranking label |
| `src/pages/AboutPage.tsx` | Source-health detail, verification methodology, run manifest, updated ranking and classification rules |
| `.github/workflows/daily.yml` | `alert` job for preserved data or a crash |
| `.github/dependabot.yml` | Weekly npm and Actions update PRs |
| `tests/upgrade.test.ts`, `tests/config.test.ts` | 15 new regression tests (below) |

## Tests added

- **A:** The obesity failure mode is reconstructed from the live title, the stored excerpt, and incidental "gut microbiota" and "diagnostic biomarkers" mentions. It must not get Vaccines/Dx or Microbiology and must fall out of scope. Other tests cover genuine high-confidence classification with matched terms, single broad mentions not qualifying, every category's broad terms checked individually, low-confidence context withheld, and low-confidence records never featured or promoted.
- **B:** The verification counts add up, the message wording is checked, the briefing contains no "verified", and the manifest has no secrets.
- **C:** Cap quotas (preprints 50/200, all 5 trials kept); the http→https upgrade only on official hosts; an end-to-end FDA http-link item accepted; per-source reject reasons and capped counts agree with the dataset totals.
- **E:** The disabled, not-needed, failed, fallback and all-fields-invalid states, with no error text leaking.
- **Workflow:** the alert job conditions.

## Results (this run)

| Check | Result |
|---|---|
| `npx tsc -b` | passed |
| `npm test` | **101 passed** (6 files) |
| `npm run validate:data` (live 2026-11-19 data) | passed |
| `npm run build` + `npm run verify:dist` | passed (11 files) |
| `npm run test:e2e` | passed (10 routes × 320/390/768/1280 px, no overflow or console errors, missing-data state) |

## Not done, and why

- **Pinning Actions to commit SHAs:** I could not look up verified SHAs from this environment, and guessed SHAs would break the workflow. Dependabot now proposes Actions updates; pinning should be a follow-up with SHAs checked on GitHub.
- **Monthly archive partitions or a search index:** incremental day loading already keeps the first page cheap. Partitioning is worth doing once the archive is large enough to measure.
- **Study design / organism / sample-size extraction, retraction monitoring, citation export, trend charts:** these are feature work (audit phase 4) and were not part of this pass.
- **Live verification of the fixes:** this sandbox cannot reach the source APIs. The bioRxiv, FDA and classification fixes will first show up in real data on the next scheduled or manual run. Check the source-health section on the About page.

## Deploy and roll back

- **Deploy:** merge the PR into `main`, then Actions → *BioPulse daily update & deploy* → *Run workflow*.
- **Roll back:** revert the merge commit on `main`. The data files are additive and v1-compatible, so the old frontend can still read datasets written by v2; any v2-only fields are simply not displayed. No archive migration is needed in either direction.

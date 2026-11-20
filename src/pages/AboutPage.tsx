import { CATEGORIES } from '../../shared/categories';
import { EVIDENCE, EVIDENCE_ORDER } from '../../shared/evidence';
import { BasisLabel, EvidenceBadge } from '../components/Badges';
import { PageHeader } from '../components/Layout';
import { Loading } from '../components/States';
import { useLatest, useSources, useStatus } from '../lib/data';
import { formatTimestamp } from '../lib/format';

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export function AboutPage() {
  const sources = useSources();
  const status = useStatus();
  const latest = useLatest();
  return (
    <>
      <PageHeader eyebrow="Methodology" title="About & Sources">
        BioPulse is an automated, evidence-first index of what is happening in biotechnology each day. It is built only from public APIs and official feeds, and every item links to its original source.
      </PageHeader>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="How the daily update works">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Every day at 07:00 IST a GitHub Actions workflow queries each source for records from the last two days (patents: seven days).</li>
            <li>Records are normalised, validated (HTTPS link to the official source host, real calendar date not in the future, identifiers consistent with the link) and deduplicated by DOI, PMID, PMCID, NCT ID, patent number, URL and title.</li>
            <li>Items already published in the previous ten days are suppressed, so each day shows only new records.</li>
            <li>Each record is classified by transparent keyword and CPC rules. A category needs a specific term in the title, two specific terms in the text, or a CPC class; broad words such as “microbiota” or “biomarker” only support a match. Records with no qualifying category are dropped as out of scope, and each card shows the matched terms and a confidence level.</li>
            <li>The daily cap (200 records) reserves shares for preprints, trials, patents and regulatory/company news, so journal articles cannot crowd them out.</li>
            <li>The highest-ranked published links are checked live (60 per day by default); links returning 404/410 are removed. Every other record shows “metadata validated · link not live-checked”. Homepage highlights require a live-checked link and a medium/high-confidence category.</li>
            <li>The one-sentence briefing and top three discoveries are generated from these verified records only. If nothing qualifies, no headline is produced.</li>
            <li>The dataset is schema-validated, archived as <code className="font-mono text-xs">data/archive/YYYY-MM-DD.json</code>, and deployed to GitHub Pages in the same run.</li>
          </ol>
        </Section>

        <Section id="evidence" title="Evidence labels">
          <ul className="space-y-3">
            {EVIDENCE_ORDER.map((e) => (
              <li key={e}>
                <EvidenceBadge evidence={e} />
                <p className="mt-1">{EVIDENCE[e].definition}</p>
                <p className="mt-0.5 text-fg-subtle">{EVIDENCE[e].caution}</p>
              </li>
            ))}
          </ul>
          <p>Granted patents carry a “GRANTED” suffix; applications and grants are distinguished by their kind code (A = application, B/C = grant).</p>
        </Section>

        <Section title="What the text labels mean">
          <ul className="space-y-2">
            <li className="flex flex-col gap-1 sm:flex-row sm:gap-2"><BasisLabel basis="source" /> Quoted or extracted from the source’s own abstract or description (short excerpts only).</li>
            <li className="flex flex-col gap-1 sm:flex-row sm:gap-2"><BasisLabel basis="metadata" /> Assembled from structured source fields: dates, identifiers, trial status, patent kind.</li>
            <li className="flex flex-col gap-1 sm:flex-row sm:gap-2"><BasisLabel basis="template" /> General context about the field or evidence type — explicitly not a finding of the record.</li>
            <li className="flex flex-col gap-1 sm:flex-row sm:gap-2"><BasisLabel basis="ai" /> Written by the optional Claude API adapter from the record’s metadata and abstract only, then validated (length, citations, no new identifiers or links).</li>
            <li className="flex flex-col gap-1 sm:flex-row sm:gap-2"><BasisLabel basis="unavailable" /> The information is not present in the source; BioPulse does not guess.</li>
          </ul>
          {latest.data && (
            <p className="text-fg-subtle">
              Latest update: {latest.data.ai.note} When AI is used it receives only metadata and abstracts — never full texts — and it does not verify findings.
            </p>
          )}
        </Section>

        <Section id="ranking" title="How the top three are chosen">
          <p>
            The <strong className="text-fg">evidence &amp; metadata rank</strong> combines evidence class (peer-reviewed 3, regulatory 2.6, clinical trial 2.4, preprint 1.6, patent 1.4, company 0.8), an abstract being available (+0.5), category matches (+0.15 each), a small +0.1 if a second database indexes the same article, and recency. Reviews (−1.2), case reports (−0.6) and low-confidence classifications (−0.8) are down-weighted.
          </p>
          <p>The top three are then diversified — at most one per field and a penalty for repeating an evidence type. This score measures evidence strength and metadata completeness, <strong className="text-fg">not scientific importance</strong>, which an automated system cannot judge.</p>
        </Section>

        <Section id="source-status" title="Sources & last run status">
          {status.data && (
            <p>
              Last attempt {formatTimestamp(status.data.lastAttempt)} — <span className="text-fg">{status.data.outcome}</span>. {status.data.message}
            </p>
          )}
          {sources.loading && <Loading label="Loading sources" />}
          {sources.data && (
            <ul className="divide-y divide-ink-600/50">
              {sources.data.sources.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="font-medium text-fg hover:text-signal">
                      {s.name}
                    </a>
                    <span className={`font-mono text-[11px] ${s.lastStatus?.status === 'ok' ? 'text-accent' : s.lastStatus?.status === 'failed' ? 'text-ev-reg' : 'text-fg-subtle'}`}>
                      {s.lastStatus ? `${s.lastStatus.status}${s.lastStatus.status === 'ok' ? ` · ${s.lastStatus.accepted}/${s.lastStatus.fetched} used` : ''}` : 'no data yet'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs">{s.publisher} · {s.kind}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{s.notes}</p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    Access: {s.access}{' '}
                    <a className="link" href={s.apiDocs} target="_blank" rel="noopener noreferrer">
                      API docs
                    </a>
                  </p>
                  {s.lastStatus && s.lastStatus.status !== 'skipped' && (
                    <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                      fetched {s.lastStatus.fetched} · published {s.lastStatus.accepted} · rejected {s.lastStatus.rejected}
                      {s.lastStatus.rejectReasons ? ` (${Object.entries(s.lastStatus.rejectReasons).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}
                      {s.lastStatus.capped ? ` · cut by daily cap ${s.lastStatus.capped}` : ''} · {Math.round(s.lastStatus.durationMs / 100) / 10}s
                    </p>
                  )}
                  {(s.lastStatus?.error || s.lastStatus?.note) && <p className={`mt-1 text-xs ${s.lastStatus.error ? 'text-ev-reg' : 'text-fg-subtle'}`}>{s.lastStatus.error ?? s.lastStatus.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {sources.error && <p>Source status will appear after the first pipeline run.</p>}
        </Section>

        <Section id="verification" title="What “validated” and “checked” mean">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><span className="text-fg">Metadata validated</span> — the record came from an official API or feed, links to the source’s official host over HTTPS, its identifiers (PMID, DOI, NCT, patent number) agree with the link, and its date is real and not in the future.</li>
            <li><span className="text-fg">Link live-checked</span> — the link responded during the daily run. “Restricted” means the server answered but refused automated checks.</li>
            <li><span className="text-fg">Not checked</span> — validated, but outside the daily live-check budget.</li>
            <li>None of these checks verify the scientific claims. They confirm the record and its link are genuine.</li>
          </ul>
          {latest.data?.verificationSummary && (
            <p className="font-mono text-xs text-fg-subtle">
              Latest run: {latest.data.verificationSummary.collected} collected · {latest.data.verificationSummary.metadataValidated} metadata-validated · {latest.data.verificationSummary.published} published · {latest.data.verificationSummary.linkOk} links ok · {latest.data.verificationSummary.linkRestricted} restricted · {latest.data.verificationSummary.linkNotChecked} not checked
            </p>
          )}
          {latest.data?.run && (
            <p className="font-mono text-xs text-fg-subtle">
              Pipeline {latest.data.run.pipelineVersion}
              {latest.data.run.commit ? ` · commit ${latest.data.run.commit.slice(0, 7)}` : ''}
              {latest.data.run.workflowRun ? ` · workflow run ${latest.data.run.workflowRun}` : ''}
            </p>
          )}
        </Section>

        <Section id="subscribe" title="Follow BioPulse for free">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <a className="link" href={`${import.meta.env.BASE_URL}data/feed.xml`}>
                RSS feed
              </a>{' '}
              — the daily sentence and top stories. Paste the link into any news reader (e.g. Feedly, Inoreader, NetNewsWire).
            </li>
            <li>By e-mail: paste the RSS link into a free RSS-to-email service to get each day’s briefing in your inbox.</li>
            <li>
              <span className="text-fg">Saved</span> and <span className="text-fg">topics you follow</span> stay in your browser only — no account, nothing uploaded.
            </li>
          </ul>
        </Section>

        <Section title="Integrity rules">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>No invented authors, dates, DOIs, patent numbers, findings or references. Missing fields are shown as missing.</li>
            <li>A preprint is never labelled peer-reviewed; conflicting signals are resolved conservatively as preprint.</li>
            <li>A patent filing is never presented as proof of efficacy or commercial success.</li>
            <li>A source that cannot be verified (bad link, wrong host, inconsistent identifier, invalid date) is not published.</li>
            <li>A failed fetch never replaces good data: if sources fail and nothing qualifies, the previous update stays online and the failure is reported.</li>
            <li>Only metadata and short attributed excerpts are stored — no full text, no paywall bypassing, no scraping of protected sites.</li>
            <li>Demonstration data used in development is labelled as such and is blocked from deployment.</li>
          </ul>
        </Section>

        <Section title="Coverage">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <li key={c.id}>· {c.name}</li>
            ))}
          </ul>
        </Section>

        <Section title="Known limitations">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Keyword classification can still mis-file records or miss relevant ones; each card shows its matched terms and confidence so you can judge.</li>
            <li>Only part of each day’s links are live-checked.</li>
            <li>Summaries rely on abstracts; full texts, data and methods are not reviewed.</li>
            <li>“Peer-reviewed” reflects journal indexing in PubMed/Europe PMC, not an independent check of the review process.</li>
            <li>Sources update on their own schedules (e.g. patents weekly), and indexing delays mean some items appear a day or two after publication.</li>
            <li>Patent coverage requires EPO OPS credentials; company announcements require configured feeds.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}

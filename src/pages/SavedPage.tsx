import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EVIDENCE } from '../../shared/evidence';
import { toast } from '../components/Actions';
import { PageHeader } from '../components/Layout';
import { copyText, downloadText, exportAll } from '../lib/cite';
import { formatDate } from '../lib/format';
import { addTopic, clearSaved, removeSaved, removeTopic, useLibrary } from '../lib/library';
import { Reveal } from '../lib/motion';

export const TOPIC_SUGGESTIONS = ['CRISPR', 'cancer', 'vaccine', 'Alzheimer', 'antibiotic resistance', 'CAR-T', 'gene therapy', 'AI', 'microbiome', 'crop'];

/** Follow topics: add your own or pick a suggestion. Stored in this browser only. */
export function TopicManager({ compact = false }: { compact?: boolean }) {
  const { topics } = useLibrary();
  const [value, setValue] = useState('');
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            addTopic(value);
            toast(`Following “${value.trim()}”`);
            setValue('');
          }
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Topic to follow</span>
          <input className="input h-10" placeholder="Add a topic, e.g. CRISPR, cancer, malaria…" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} />
        </label>
        <button type="submit" className="h-10 rounded-lg border border-accent/60 px-4 text-sm font-semibold text-accent transition hover:bg-accent/10">
          Follow
        </button>
      </form>
      {topics.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Topics you follow">
          {topics.map((t) => (
            <li key={t} className="animate-menu inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 py-1 pl-3 pr-1 text-sm text-fg">
              {t}
              <button type="button" aria-label={`Unfollow ${t}`} onClick={() => removeTopic(t)} className="rounded-full px-1.5 text-fg-subtle hover:text-fg">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!compact || topics.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-subtle">Ideas:</span>
          {TOPIC_SUGGESTIONS.filter((s) => !topics.some((t) => t.toLowerCase() === s.toLowerCase()))
            .slice(0, compact ? 6 : 10)
            .map((s) => (
              <button key={s} type="button" onClick={() => addTopic(s)} className="rounded-full border border-ink-600 px-2.5 py-1 text-xs text-fg-muted transition hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg">
                + {s}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function SavedPage() {
  const { saved } = useLibrary();
  const [confirm, setConfirm] = useState(false);

  const exportAs = (format: 'bibtex' | 'ris' | 'text') => {
    const text = exportAll(saved, format);
    const ext = format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'txt';
    downloadText(`biopulse-reading-list.${ext}`, text, format === 'ris' ? 'application/x-research-info-systems' : 'text/plain');
    toast(`Downloaded ${saved.length} reference${saved.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      <PageHeader eyebrow="Your library · stored only in this browser" title="Saved">
        Your reading list and the topics you follow. Nothing is uploaded and no account is needed. Clearing your browser data removes it, so export your list to keep it.
      </PageHeader>

      <section className="card mb-8 p-5" aria-labelledby="topics-title">
        <h2 id="topics-title" className="text-lg font-semibold">
          Topics you follow
        </h2>
        <p className="mb-3 mt-1 text-sm text-fg-muted">The homepage shows today’s matches for these topics in a “For you” section.</p>
        <TopicManager />
      </section>

      <section aria-labelledby="list-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="list-title" className="text-lg font-semibold">
            Reading list <span className="text-fg-subtle">({saved.length})</span>
          </h2>
          {saved.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-subtle">Export for Zotero, Mendeley, EndNote:</span>
              <button type="button" className="chip hover:text-fg" onClick={() => exportAs('ris')}>
                RIS
              </button>
              <button type="button" className="chip hover:text-fg" onClick={() => exportAs('bibtex')}>
                BibTeX
              </button>
              <button type="button" className="chip hover:text-fg" onClick={() => exportAs('text')}>
                Text
              </button>
              <button type="button" className="chip hover:text-fg" onClick={async () => toast((await copyText(exportAll(saved, 'text'))) ? 'All references copied' : 'Could not copy')}>
                Copy all
              </button>
              {confirm ? (
                <button
                  type="button"
                  className="chip border-ev-reg/60 text-ev-reg"
                  onClick={() => {
                    clearSaved();
                    setConfirm(false);
                    toast('Reading list cleared');
                  }}
                >
                  Confirm clear
                </button>
              ) : (
                <button type="button" className="chip hover:text-fg" onClick={() => setConfirm(true)}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
        {saved.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="text-fg">Nothing saved yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
              Tap the ☆ <span className="text-fg">Save</span> button on any story to keep it here. Start with{' '}
              <Link to="/news" className="link">
                today’s top stories
              </Link>{' '}
              or{' '}
              <Link to="/search" className="link">
                search
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {saved.map((s, i) => (
              <Reveal as="li" key={s.id} delay={(i % 6) * 40}>
                <div className="card card-hover flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-fg-subtle">
                      {EVIDENCE[s.evidence].plain} · {s.source.name} · {formatDate(s.date)}
                    </p>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[16px] font-semibold leading-snug text-fg hover:text-signal">
                      {s.title}
                    </a>
                    {s.venue && <p className="text-sm text-fg-subtle">{s.venue}</p>}
                  </div>
                  <button type="button" onClick={() => removeSaved(s.id)} className="shrink-0 self-start text-sm text-fg-subtle hover:text-ev-reg" aria-label={`Remove ${s.title}`}>
                    Remove
                  </button>
                </div>
              </Reveal>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

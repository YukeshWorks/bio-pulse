import { Link, useParams } from 'react-router-dom';
import { CATEGORIES, CATEGORY_BY_ID } from '../../shared/categories';
import { PageHeader } from '../components/Layout';
import { PreprintWarning } from '../components/Badges';
import { RecordExplorer } from '../components/RecordExplorer';
import { EmptyState } from '../components/States';
import { useLatest, useSources } from '../lib/data';

export function LatestPage() {
  return (
    <>
      <PageHeader eyebrow="All evidence types" title="Latest Discoveries">
        Every verified record from the latest daily update. Use the dataset selector to search across the archive.
      </PageHeader>
      <RecordExplorer />
    </>
  );
}

export function PapersPage() {
  return (
    <>
      <PageHeader eyebrow="Journal articles & preprints" title="Research Papers">
        Peer-reviewed journal articles (PubMed, Europe PMC) and preprints (bioRxiv, medRxiv, Europe PMC). Preprints are always labelled and are never presented as peer-reviewed.
      </PageHeader>
      <div className="mb-5 max-w-3xl">
        <PreprintWarning />
      </div>
      <RecordExplorer lockedEvidence={['PEER-REVIEWED', 'PREPRINT']} />
    </>
  );
}

export function PatentsPage() {
  const sources = useSources();
  const epo = sources.data?.sources.find((s) => s.id === 'epo');
  return (
    <>
      <PageHeader eyebrow="EPO Open Patent Services" title="Patents & Inventions">
        Newly published patent documents in biotechnology classification groups (CPC C12N, C12P, C12Q, C07K, A61K39, A61K48, G16B). A patent application describes claimed inventions — it does not show that anything works, is safe, or will be commercialised.
      </PageHeader>
      {epo && !epo.enabled && (
        <div className="mb-5 max-w-3xl rounded-xl border border-ev-patent/30 bg-ev-patent/[0.07] px-4 py-3 text-sm text-ev-patent">
          Patent monitoring is not active: {epo.lastStatus?.note ?? 'EPO OPS credentials are not configured.'} See <Link to="/about" className="underline">About & Sources</Link> for setup.
        </div>
      )}
      <RecordExplorer lockedEvidence={['PATENT APPLICATION']} emptyHint="No patent documents in this range. Patent monitoring requires EPO OPS credentials; patents are published weekly." />
    </>
  );
}

export function TrialsPage() {
  return (
    <>
      <PageHeader eyebrow="ClinicalTrials.gov" title="Clinical Trials">
        Newly registered studies testing genetic or biological interventions (gene and cell therapies, vaccines, antibodies and other biologics). Registrations describe planned or ongoing research and do not report results.
      </PageHeader>
      <RecordExplorer lockedEvidence={['CLINICAL TRIAL']} />
    </>
  );
}

export function CategoriesPage() {
  const latest = useLatest();
  const counts = latest.data?.stats.byCategory ?? {};
  return (
    <>
      <PageHeader eyebrow="Coverage" title="Biotechnology Categories">
        BioPulse monitors {CATEGORIES.length} fields. Records are assigned to up to three categories by transparent keyword and patent-classification rules.
      </PageHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c, i) => (
          <Link key={c.id} to={`/categories/${c.id}`} className="card card-hover flex flex-col gap-2 p-4 animate-rise" style={{ animationDelay: `${i * 20}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-fg">{c.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${counts[c.id] ? 'bg-accent-soft text-accent' : 'bg-ink-700 text-fg-subtle'}`}>{counts[c.id] ?? 0}</span>
            </div>
            <p className="text-sm text-fg-muted">{c.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

export function CategoryPage() {
  const { id = '' } = useParams();
  const cat = CATEGORY_BY_ID[id];
  if (!cat) return <EmptyState title="Unknown category">Choose a field from the <Link to="/categories" className="link">category list</Link>.</EmptyState>;
  return (
    <>
      <PageHeader eyebrow={<Link to="/categories" className="hover:text-fg">← Categories</Link>} title={cat.name}>
        {cat.description} <span className="mt-2 block text-fg-subtle">Context: {cat.context}</span>
      </PageHeader>
      <RecordExplorer lockedCategory={cat.id} />
    </>
  );
}

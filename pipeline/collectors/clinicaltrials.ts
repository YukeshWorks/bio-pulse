import { addDays, parseSourceDate } from '../lib/dates';
import { normalizeNct } from '../lib/ids';
import { cleanText, cleanTitle } from '../lib/text';
import type { Collector, RawRecord } from '../types';

/**
 * ClinicalTrials.gov API v2 (https://clinicaltrials.gov/data-api/api).
 * Newly registered studies (first posted within the window) whose interventions are GENETIC or
 * BIOLOGICAL — i.e. biotechnology products such as gene/cell therapies, vaccines and antibodies.
 */
const BASE = 'https://clinicaltrials.gov/api/v2/studies';

interface Study {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string; organization?: { fullName?: string } };
    statusModule?: { overallStatus?: string; studyFirstPostDateStruct?: { date?: string }; primaryCompletionDateStruct?: { date?: string } };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[]; keywords?: string[] };
    designModule?: { phases?: string[]; studyType?: string };
    armsInterventionsModule?: { interventions?: { type?: string; name?: string }[] };
  };
}

const PHASE_LABEL: Record<string, string> = {
  EARLY_PHASE1: 'Early Phase 1', PHASE1: 'Phase 1', PHASE2: 'Phase 2', PHASE3: 'Phase 3', PHASE4: 'Phase 4', NA: 'Not applicable',
};

function humanize(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function mapStudy(study: Study): RawRecord | null {
  const p = study.protocolSection;
  const nct = normalizeNct(p?.identificationModule?.nctId);
  if (!p || !nct) return null;
  const interventions = p.armsInterventionsModule?.interventions ?? [];
  const sponsor = p.sponsorCollaboratorsModule?.leadSponsor?.name ?? p.identificationModule?.organization?.fullName;
  return {
    sourceId: 'clinicaltrials',
    sourceName: 'ClinicalTrials.gov',
    title: cleanTitle(p.identificationModule?.briefTitle ?? p.identificationModule?.officialTitle),
    authors: [],
    organization: sponsor ? cleanText(sponsor) : undefined,
    date: parseSourceDate(p.statusModule?.studyFirstPostDateStruct?.date),
    dateType: 'first-posted',
    url: `https://clinicaltrials.gov/study/${nct}`,
    venue: 'ClinicalTrials.gov registry',
    identifiers: { nct },
    abstract: p.descriptionModule?.briefSummary ? cleanText(p.descriptionModule.briefSummary) : undefined,
    keywords: [...(p.conditionsModule?.keywords ?? []), ...interventions.map((i) => i.name ?? '')].filter(Boolean),
    evidence: 'CLINICAL TRIAL',
    trial: {
      phase: (p.designModule?.phases ?? []).map((ph) => PHASE_LABEL[ph] ?? humanize(ph)),
      status: p.statusModule?.overallStatus ? humanize(p.statusModule.overallStatus) : undefined,
      conditions: p.conditionsModule?.conditions ?? [],
      interventions: interventions.map((i) => `${i.name ?? 'Unnamed'}${i.type ? ` (${humanize(i.type)})` : ''}`),
      interventionTypes: interventions.map((i) => (i.type ?? '').toUpperCase()).filter(Boolean),
      sponsor: sponsor ?? undefined,
      primaryCompletion: p.statusModule?.primaryCompletionDateStruct?.date,
      studyType: p.designModule?.studyType ? humanize(p.designModule.studyType) : undefined,
    },
  };
}

export const clinicalTrialsCollector: Collector = {
  id: 'clinicaltrials',
  name: 'ClinicalTrials.gov',
  skipReason: () => null,
  async collect(ctx) {
    const from = addDays(ctx.runDate, -ctx.config.lookbackDays);
    const records: RawRecord[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        format: 'json',
        pageSize: String(Math.min(100, ctx.config.trialsMax)),
        'query.term': 'AREA[InterventionType](GENETIC OR BIOLOGICAL)',
        'filter.advanced': `AREA[StudyFirstPostDate]RANGE[${from},${ctx.runDate}]`,
        sort: 'StudyFirstPostDate:desc',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await ctx.http.getJson<{ studies?: Study[]; nextPageToken?: string }>(`${BASE}?${params}`);
      for (const s of res.studies ?? []) {
        const r = mapStudy(s);
        if (!r) continue;
        // Defensive: keep only studies that really list a genetic or biological intervention.
        if (!r.trial?.interventionTypes?.some((t) => t === 'GENETIC' || t === 'BIOLOGICAL')) continue;
        records.push(r);
      }
      pageToken = res.nextPageToken;
    } while (pageToken && records.length < ctx.config.trialsMax);
    return { records: records.slice(0, ctx.config.trialsMax), warnings: [] };
  },
};

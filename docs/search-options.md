# Search sources: free and paid options

BioPulse's **Search** page (`/#/search`) queries these free sources live from the browser. No server and no keys are needed.

| Source | Covers | Cost | Status |
|---|---|---|---|
| Europe PMC (official, EMBL-EBI) | Papers and preprints, incl. bioRxiv/medRxiv | Free, no key | **Live search** |
| PubMed E-utilities (official, US NLM) | Biomedical journals | Free (optional free API key) | **Live search** |
| ClinicalTrials.gov API v2 (official) | Registered clinical trials | Free, no key | **Live search** |
| OpenAlex (open, non-profit) | Scholarly works across all fields | Free for normal use; check current usage limits | **Live search** |

Options considered but not built. Each needs a token, a server, or money:

| Source | Covers | Cost | Why not built |
|---|---|---|---|
| Crossref | DOI metadata | Free | Mostly duplicates OpenAlex |
| Semantic Scholar | Papers + AI summaries | Free, rate-limited | Browser access (CORS) not verified |
| Lens.org | Patents + papers | Free for non-commercial use (approved token); paid for commercial | Token must stay server-side |
| EPO OPS | Patents | Free up to a weekly quota; registration | Secret key; used only in the daily pipeline |
| Google Patents (via BigQuery) | Worldwide patents | Free monthly allowance, then pay per query | Needs a server and a Google Cloud account |
| Google Scholar | Broadest coverage | No official API; scraping breaks its terms; SerpAPI is unofficial and paid (~$75+/month) | Terms of use and cost |
| Scopus, Web of Science, Dimensions | Curated citation databases | Paid institutional subscriptions | Cost and licensing |

Live results are shown as each database describes them; BioPulse does not validate or summarise them. "Peer-reviewed" is used only where Europe PMC or PubMed mark a journal article. OpenAlex journal articles are labelled "review status not stated".

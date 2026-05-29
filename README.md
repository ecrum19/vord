# VoRD: Vocabulary of Restrictive Datasets

`VoRD` is an RDF vocabulary for SPARQL endpoint maintainers to advertise live endpoint restrictions in a machine-readable way.

It extends SPARQL Service Description with explicit restriction resources and validation support through SHACL and ShEx.

## Repository Structure

- `docs/index.html`: GitHub Pages landing page for VoRD
- `docs/assets/`: published artifact copies used by the landing page viewer
- `scripts/sync-docs-assets.sh`: refreshes `docs/assets` from canonical source files
- `vocab/vord.ttl`: authoritative vocabulary (`v0.2`)
- `shapes/vord.shacl.ttl`: SHACL constraints
- `shex/vord.shex`: ShEx companion schema
- `examples/basic-service.ttl`: minimal example
- `examples/exhaustive-service.ttl`: exhaustive example using all core terms
- `examples/wikidata-rate-restrictions.ttl`: Wikidata/WMF rate-restriction example based on public docs

## Publishing Pattern

Attach one or more restrictions to an `sd:Service` using `vord:hasRestriction`.

Quantitative restrictions generally use:
- `vord:metric`
- `vord:maxValue`
- optional `vord:minValue`, `vord:unit`, `vord:windowDuration`, `vord:burstValue`
- `vord:hasScope`, `vord:enforcement`, `vord:hardRestriction`

## Complete Term Index

### Classes

- `vord:Restriction`
- `vord:RateRestriction`
- `vord:ResultSizeRestriction`
- `vord:CostModelRestriction`
- `vord:ServerLoadRestriction`
- `vord:ConcurrentRequestsRestriction`
- `vord:ResponseTimeRestriction`
- `vord:QuotaRestriction`
- `vord:Metric`
- `vord:Scope`
- `vord:EnforcementMode`
- `vord:CostModel`

### Object Properties

- `vord:hasRestriction`
- `vord:metric`
- `vord:hasScope`
- `vord:enforcement`
- `vord:costModel`
- `vord:httpSignalHeader`
- `vord:unit`

### Datatype Properties

- `vord:maxValue`
- `vord:minValue`
- `vord:burstValue`
- `vord:windowDuration`
- `vord:retryAfterHint`
- `vord:returnsStatusCode`
- `vord:hardRestriction`

## Validation

Run tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-test.txt
pytest -q
```

## GitHub Pages

This repo includes a workflow at `.github/workflows/publish-pages.yml` that regenerates docs and deploys GitHub Pages on every push to `main`.

In repository settings, ensure Pages is configured to **GitHub Actions** as the source.

To refresh the published docs assets after editing vocabulary/spec/examples:

```bash
./scripts/sync-docs-assets.sh
```

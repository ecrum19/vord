# VoRD: Vocabulary of Restrictive Datasets

`VoRD` is an RDF vocabulary for SPARQL endpoint maintainers to advertise live endpoint restrictions in a machine-readable way.

It extends SPARQL Service Description with explicit restriction resources and validation support through SHACL and ShEx.

## Repository Structure

- `ocg.config.json`: Ontology Companion Generator configuration
- `site/`: generated GitHub Pages output; do not edit by hand
- `.github/workflows/publish-pages.yml`: validates, builds, and deploys `site/`
- `vocab/vord.ttl`: authoritative vocabulary (`v0.4`)
- `shapes/vord.shacl.ttl`: SHACL constraints
- `shex/vord.shex`: ShEx companion schema
- `examples/basic-service.ttl`: minimal example
- `examples/exhaustive-service.ttl`: exhaustive example using all core terms
- `examples/wikidata-rate-restrictions.ttl`: Wikidata/WMF rate-restriction example based on public docs
- `examples/strict-endpoints.ttl`: strict restrictions: usage budgets, client identification, bans, tarpits, degraded answers, shared limits and queues
- `examples/wikidata-query-service.ttl`: the Wikidata Query Service's query limits: a processing-time budget and an error-query limit per client identity, with penalties of unpublished size
- `examples/bgee.ttl`: Bgee's endpoint as a client observed it: queries accepted with GET only, and a gateway timeout
- `notes/limits-not-expressible.md`: limits found on live endpoints that VoRD could not express, what VoRD 0.4 added for them, and what remains open

## Publishing Pattern

Attach one or more restrictions to an `sd:Service` using `vord:hasRestriction`.

Quantitative restrictions generally use:
- `vord:metric`
- `vord:maxValue`
- optional `vord:minValue`, `vord:unit`, `vord:windowDuration`, `vord:burstValue`
- `vord:hasScope`, `vord:enforcement`, `vord:hardRestriction`
- optional `vord:penaltyThreshold` and `vord:penaltyDuration` when the endpoint blocks clients that keep violating the restriction, or `vord:penalized true` when it does not publish their values

A usage budget is a `vord:CostModelRestriction` with the metric `vord:costUnitsPerWindow`: `vord:maxValue` cost units per `vord:windowDuration`, of which at most `vord:burstValue` can be spent at once, priced by the `vord:costModel`.

A processing-time budget is a `vord:QuotaRestriction` with the metric `vord:evaluationTimePerWindow`: `vord:maxValue` seconds of evaluation time per `vord:windowDuration`. A limit on error queries is a `vord:RateRestriction` with the metric `vord:failedRequestsPerWindow`. Limits counted per User-Agent and IP address together use the scope `vord:PerClientIdentity`.

A `vord:IdentificationRestriction` requires every request to identify the client: it names the request header (`vord:identificationHeader`, e.g. `From` or `User-Agent`) and the format of the identification (`vord:identificationFormat`: `vord:EmailAddress` or `vord:ProductWithContact`). It has no metric or maximum value.

A `vord:RequestMethodRestriction` says in which ways the endpoint accepts a query: every accepted way is a `vord:allowedRequestMethod` (`vord:QueryViaGet`, `vord:QueryViaUrlEncodedPost` or `vord:QueryViaDirectPost`, the three ways of the SPARQL protocol), and requests sent in another way are refused. An endpoint that accepts GET only, for example, has one restriction with `vord:allowedRequestMethod vord:QueryViaGet`. Like an identification restriction, it has no metric or maximum value.

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
- `vord:IdentificationRestriction`
- `vord:RequestMethodRestriction`
- `vord:Metric`
- `vord:Scope`
- `vord:EnforcementMode`
- `vord:CostModel`
- `vord:IdentificationFormat`
- `vord:RequestMethod`

### Object Properties

- `vord:hasRestriction`
- `vord:metric`
- `vord:hasScope`
- `vord:enforcement`
- `vord:costModel`
- `vord:httpSignalHeader`
- `vord:identificationHeader`
- `vord:identificationFormat`
- `vord:allowedRequestMethod`
- `vord:unit`

### Datatype Properties

- `vord:maxValue`
- `vord:minValue`
- `vord:burstValue`
- `vord:windowDuration`
- `vord:retryAfterHint`
- `vord:returnsStatusCode`
- `vord:hardRestriction`
- `vord:penaltyThreshold`
- `vord:penaltyDuration`
- `vord:penalized`

### Controlled Values

- Metrics: `vord:requestsPerWindow`, `vord:requestsPerDay`, `vord:resultBindings`, `vord:evaluationTime`, `vord:estimatedCostUnits`, `vord:costUnitsPerWindow`, `vord:concurrentRequests`, `vord:evaluationTimePerWindow`, `vord:failedRequestsPerWindow`
- Scopes: `vord:PerClientIP`, `vord:PerClientIdentity`, `vord:PerAPIKey`, `vord:PerUser`, `vord:PerRequest`, `vord:GlobalScope`
- Enforcement modes: `vord:RejectRequest`, `vord:TruncateResult`, `vord:QueueRequest`, `vord:ThrottleResponse`, `vord:DegradeQuality`
- Identification formats: `vord:EmailAddress`, `vord:ProductWithContact`
- Request methods: `vord:QueryViaGet`, `vord:QueryViaUrlEncodedPost`, `vord:QueryViaDirectPost`

## Development

The companion site is generated by [Ontology Companion Generator](https://www.npmjs.com/package/ontology-companion-generator). Install the locked dependencies, validate the ontology, and build the site with:

```bash
npm ci
npm run ocg:check
npm run ocg:build
```

Use `npm run ocg:dev` to preview the generated site locally. The output is written to `site/` and is ignored by Git because it is reproducible build output.

## Validation

Run tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-test.txt
pytest -q
```

## GitHub Pages

This repo includes a workflow at `.github/workflows/publish-pages.yml` that validates the source files, runs OCG, and deploys the generated `site/` directory on every push to `main`.

In repository settings, ensure Pages is configured to **GitHub Actions** as the source.
Your published site URL will be: `https://<username>.github.io/vord/`.

If GitHub shows the repository README instead of the site, verify you are opening the GitHub Pages URL above (not the repository URL on `github.com`) and that the Pages source is set to **GitHub Actions**.

The generated site contains the Vocabulary Reference, interactive relationship graph, per-term pages, raw source artifacts, and the ReSpec-based Vocabulary Usage Specification. Edit the canonical files under `vocab/`, `shapes/`, `shex/`, `examples/`, or `spec/`, then rerun `npm run ocg:build`.

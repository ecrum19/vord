# VoRD: Vocabulary of Restrictive Datasets

`VoRD` is an RDF vocabulary for SPARQL endpoint maintainers to advertise live endpoint limits in a machine-readable way.

It extends SPARQL Service Description with explicit limit resources and validation support through SHACL and ShEx.

## Repository Structure

- `vocab/vord.ttl`: authoritative vocabulary (`v0.2`)
- `shapes/vord.shacl.ttl`: SHACL constraints
- `shex/vord.shex`: ShEx companion schema
- `examples/basic-service.ttl`: minimal example
- `examples/exhaustive-service.ttl`: exhaustive example using all core terms
- `examples/wikidata-rate-limits.ttl`: Wikidata/WMF rate-limit example based on public docs

## Publishing Pattern

Attach one or more limits to an `sd:Service` using `vord:hasLimit`.

Quantitative limits generally use:
- `vord:metric`
- `vord:maxValue`
- optional `vord:minValue`, `vord:unit`, `vord:windowDuration`, `vord:burstValue`
- `vord:hasScope`, `vord:enforcement`, `vord:hardLimit`

Federation capability uses:
- class `vord:FederationSupported`
- property `vord:federationSupported` (boolean)

## Complete Term Index

### Classes

- `vord:Limit`
- `vord:RateLimit`
- `vord:ResultSizeLimit`
- `vord:CostModelLimit`
- `vord:ServerLoadLimit`
- `vord:ConcurrentRequestsLimit`
- `vord:ResponseTimeLimit`
- `vord:QuotaLimit`
- `vord:FederationSupported`
- `vord:Metric`
- `vord:Scope`
- `vord:EnforcementMode`
- `vord:CostModel`

### Object Properties

- `vord:hasLimit`
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
- `vord:hardLimit`
- `vord:federationSupported`

## Validation

Run tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-test.txt
pytest -q
```

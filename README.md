# VoRD: Vocabulary of Restrictive Datasets

`sparql_endpoint_limits_vocabulary` is a modular RDF vocabulary for describing operational limits of SPARQL endpoints in a reusable, machine-readable way.

It is designed as an extension of SPARQL Service Description, with validation support in SHACL and ShEx.

## Goals

This vocabulary models endpoint constraints such as:

- rate limits (many HTTP requests in a short time)
- result-size limits
- query-size and `VALUES` limits
- internal cost-model limits
- server-load limits
- simultaneous-connection limits
- timeout, federation-support, and quota limits

## Repository Structure

- `vocab/vord.ttl`: core ontology/vocabulary terms
- `shapes/vord.shacl.ttl`: SHACL constraints for validating instances
- `shex/vord.shex`: companion ShEx schema
- `examples/basic-service.ttl`: one endpoint with direct limits
- `examples/tiered-profiles.ttl`: endpoint with a broader direct-limit set

## Design Principles

1. Reuse existing standards first.
- `sd:Service`, `sd:feature` from SPARQL Service Description.
- `sh:*` terms for constraints and validation.
- `shex:*` via a companion ShEx schema.
- `xsd:duration` with alignment to OWL-Time duration concepts.
- optional alignment with HTTP vocabulary (`http:HeaderName`, status signaling).

2. Keep limit metadata generic and extensible.
- Every limit uses the same core pattern: metric + threshold + scope + enforcement.
- Federated support is modeled explicitly as a boolean capability flag.
- Metric vocabulary is controlled via reusable instances (`vord:Metric` individuals).
- Domain-specific classes (e.g., `vord:RateLimit`, `vord:CostModelLimit`) make intent explicit.

3. Integrate naturally with service descriptions.
- `vord:Limit` is a subclass of `sd:Feature`.
- `vord:hasLimit` is a subproperty of `sd:feature`.

## Core Model

### Main classes

- `vord:Limit`: abstract limit feature (subclass of `sd:Feature`)
- concrete subclasses:
  - `vord:RateLimit`
  - `vord:ResultSizeLimit`
  - `vord:QuerySizeLimit`
  - `vord:CostModelLimit`
  - `vord:ServerLoadLimit`
  - `vord:ConnectionNumberLimit`
  - `vord:TimeoutLimit`
  - `vord:QuotaLimit`
  - `vord:FederatedQueryLimit` (capability-style: `vord:federationSupported`)

### Core properties

- `vord:hasLimit` (`sd:Service -> vord:Limit`)
- `vord:metric` (`vord:Limit -> vord:Metric`)
- `vord:maxValue` (numeric threshold)
- `vord:unit` (token, e.g., `bytes`, `requests`, `cost-units`)
- `vord:windowDuration` (`xsd:duration`)
- `vord:burstValue` (for burst rate policies)
- `vord:federationSupported` (`xsd:boolean`, for `vord:FederatedQueryLimit`)
- `vord:hasScope` (`vord:Scope`)
- `vord:enforcement` (`vord:EnforcementMode`)
- `vord:hardLimit` (`xsd:boolean`)
- `vord:returnsStatusCode` (`xsd:integer`)
- `vord:signalsHeader` (`http:HeaderName`)
- `vord:retryAfterHint` (`xsd:duration`)
- `vord:costModel` (`vord:CostModel`)

## How To Use

### 1. Attach limits directly to a service

Use `vord:hasLimit` from an `sd:Service` resource.

### 2. Pick a metric and threshold (for quantitative limits)

Choose a `vord:Metric` individual and provide a `vord:maxValue`.

### 3. Specify semantics explicitly

Set `vord:hasScope`, `vord:enforcement`, and `vord:hardLimit` so clients can reason about operational behavior.

### 4. Model federation as capability support

Use `vord:FederatedQueryLimit` with `vord:federationSupported` set to `true` or `false`.

## Required Categories Covered

The vocabulary includes direct support for your required categories:

- rate limit: `vord:RateLimit` + `vord:requestsPerWindow` / `vord:requestsPerDay`
- result-size limit: `vord:ResultSizeLimit` + `vord:resultRows` / `vord:resultBytes`
- query-size / values-size limit: `vord:QuerySizeLimit` + `vord:queryBytes`, `vord:valuesItems`, `vord:literalBytes`
- internal cost-model limit: `vord:CostModelLimit` + `vord:estimatedCostUnits` + `vord:costModel`
- server-load limit: `vord:ServerLoadLimit` + `vord:cpuLoadRatio` or `vord:activeQueryCount`
- simultaneous connections: `vord:ConnectionNumberLimit` + `vord:concurrentConnections` / `vord:concurrentQueries`
- timeout limit: `vord:TimeoutLimit` + `vord:executionSeconds` / `vord:queueWaitSeconds`
- quota limit: `vord:QuotaLimit` + `vord:requestsPerDay`
- federation support: `vord:FederatedQueryLimit` + `vord:federationSupported` (`true`/`false`)

## SHACL Validation

`shapes/vord.shacl.ttl` includes:

- generic shape for all `vord:Limit` instances
- service shape (`sd:Service`) requiring one or more direct limits
- class-specific metric constraints using `sh:in` for quantitative limits
- explicit boolean constraint on `vord:federationSupported` for federation support
- cardinality and datatype checks for core fields

Typical usage with a SHACL engine is:

1. load data graph + `vocab/vord.ttl` + `shapes/vord.shacl.ttl`
2. run SHACL validation
3. inspect violations (missing metric, wrong datatype, invalid metric for class, etc.)

## ShEx Validation

`shex/vord.shex` provides a compact companion schema for lightweight validation workflows.

The ShEx model validates:

- service resources with one or more direct limits
- base required fields for each limit

## Running Tests

This repository includes automated tests in `tests/test_vocabulary.py`.

The test suite checks:

- key ontology terms exist in `vocab/vord.ttl`
- example graphs conform to `shapes/vord.shacl.ttl`
- invalid data (missing required quantitative `vord:metric`) fails SHACL validation

### 1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install test dependencies

```bash
pip install -r requirements-test.txt
```

### 3. Run the tests

```bash
pytest -q
```

You should see all tests passing. If a test fails, the SHACL validation report text is included in the failure output to help diagnose the data or shape issue.

## Alignment Notes

### SPARQL Service Description

- `vord:Limit rdfs:subClassOf sd:Feature`
- `vord:hasLimit rdfs:subPropertyOf sd:feature`

This allows `sel` data to remain compatible with existing service-description processing.

### SHACL / ShEx

- SHACL is used as normative validation constraints for this repo.
- ShEx is provided as an additional schema representation.

### OWL-Time and HTTP

- Durations are represented with `xsd:duration`; `vord:windowDuration` and `vord:retryAfterHint` are annotated with `rdfs:seeAlso time:hasXSDDuration`.
- HTTP signaling can be described via `vord:returnsStatusCode` and `vord:signalsHeader` (`http:HeaderName`).

## Complete Term Index

### Classes

- `vord:Limit`
- `vord:RateLimit`
- `vord:ResultSizeLimit`
- `vord:QuerySizeLimit`
- `vord:CostModelLimit`
- `vord:ServerLoadLimit`
- `vord:ConnectionNumberLimit`
- `vord:TimeoutLimit`
- `vord:QuotaLimit`
- `vord:FederatedQueryLimit`
- `vord:Metric`
- `vord:Scope`
- `vord:EnforcementMode`
- `vord:OperationKind`
- `vord:CostModel`

### Object properties

- `vord:hasLimit`
- `vord:metric`
- `vord:hasScope`
- `vord:enforcement`
- `vord:appliesToOperation`
- `vord:costModel`
- `vord:signalsHeader`

### Datatype properties

- `vord:maxValue`
- `vord:minValue`
- `vord:burstValue`
- `vord:unit`
- `vord:windowDuration`
- `vord:retryAfterHint`
- `vord:returnsStatusCode`
- `vord:hardLimit`
- `vord:federationSupported`

## Minimal Example

```turtle
@prefix ex: <https://example.org/service/> .
@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
@prefix vord: <https://w3id.org/vord#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:endpoint a sd:Service ;
  sd:endpoint <https://example.org/sparql> ;
  vord:hasLimit ex:rateLimit .

ex:rateLimit a vord:Limit, vord:RateLimit ;
  vord:metric vord:requestsPerWindow ;
  vord:maxValue "120"^^xsd:decimal ;
  vord:windowDuration "PT1M"^^xsd:duration ;
  vord:hasScope vord:PerClientIP ;
  vord:enforcement vord:RejectRequest ;
  vord:hardLimit "true"^^xsd:boolean .
```

## Extension Guidance

When extending this vocabulary:

1. Prefer adding new `vord:Metric` individuals before creating new classes.
2. Create new subclasses of `vord:Limit` only when behavior semantics materially differ.
3. Add corresponding SHACL constraints for any new subclass/metric policy.
4. Keep Service Description compatibility by preserving `sd:Service` + `sd:feature` integration.

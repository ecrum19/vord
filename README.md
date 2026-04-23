# SPARQL Endpoint Limits Vocabulary

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
- timeout, queue, federation, quota, and update-payload limits

## Repository Structure

- `vocab/sel.ttl`: core ontology/vocabulary terms
- `shapes/sel.shacl.ttl`: SHACL constraints for validating instances
- `shex/sel.shex`: companion ShEx schema
- `examples/basic-service.ttl`: one endpoint with direct limits
- `examples/tiered-profiles.ttl`: endpoint with tiered limit profiles

## Design Principles

1. Reuse existing standards first.
- `sd:Service`, `sd:feature` from SPARQL Service Description.
- `sh:*` terms for constraints and validation.
- `shex:*` via a companion ShEx schema.
- `xsd:duration` with alignment to OWL-Time duration concepts.
- optional alignment with HTTP vocabulary (`http:HeaderName`, status signaling).

2. Keep limit metadata generic and extensible.
- Every limit uses the same core pattern: metric + threshold + scope + enforcement.
- Metric vocabulary is controlled via reusable instances (`sel:Metric` individuals).
- Domain-specific classes (e.g., `sel:RateLimit`, `sel:CostModelLimit`) make intent explicit.

3. Integrate naturally with service descriptions.
- `sel:Limit` is a subclass of `sd:Feature`.
- `sel:hasLimit` is a subproperty of `sd:feature`.

## Core Model

### Main classes

- `sel:Limit`: abstract limit feature (subclass of `sd:Feature`)
- `sel:LimitProfile`: named set of limits (for free/pro/enterprise tiers)
- concrete subclasses:
  - `sel:RateLimit`
  - `sel:ResultSizeLimit`
  - `sel:QuerySizeLimit`
  - `sel:CostModelLimit`
  - `sel:ServerLoadLimit`
  - `sel:ConnectionLimit`
  - `sel:TimeoutLimit`
  - `sel:QueueLimit`
  - `sel:QuotaLimit`
  - `sel:FederatedQueryLimit`
  - `sel:UpdateLimit`

### Core properties

- `sel:hasLimit` (`sd:Service -> sel:Limit`)
- `sel:hasLimitProfile` (`sd:Service -> sel:LimitProfile`)
- `sel:profileLimit` (`sel:LimitProfile -> sel:Limit`)
- `sel:metric` (`sel:Limit -> sel:Metric`)
- `sel:maxValue` (numeric threshold)
- `sel:unit` (token, e.g., `bytes`, `requests`, `cost-units`)
- `sel:windowDuration` (`xsd:duration`)
- `sel:burstValue` (for burst rate policies)
- `sel:hasScope` (`sel:Scope`)
- `sel:enforcement` (`sel:EnforcementMode`)
- `sel:hardLimit` (`xsd:boolean`)
- `sel:returnsStatusCode` (`xsd:integer`)
- `sel:signalsHeader` (`http:HeaderName`)
- `sel:retryAfterHint` (`xsd:duration`)
- `sel:costModel` (`sel:CostModel`)

## How To Use

### 1. Attach limits directly to a service

Use `sel:hasLimit` from an `sd:Service` resource.

### 2. Attach tiered profiles

Use `sel:hasLimitProfile` for named plans/tokens/client classes, and put limits in each profile using `sel:profileLimit`.

### 3. Pick a metric and threshold

Choose a `sel:Metric` individual and provide a `sel:maxValue`.

### 4. Specify semantics explicitly

Set `sel:hasScope`, `sel:enforcement`, and `sel:hardLimit` so clients can reason about operational behavior.

## Required Categories Covered

The vocabulary includes direct support for your required categories:

- rate limit: `sel:RateLimit` + `sel:requestsPerWindow` / `sel:requestsPerDay`
- result-size limit: `sel:ResultSizeLimit` + `sel:resultRows` / `sel:resultBytes`
- query-size / values-size limit: `sel:QuerySizeLimit` + `sel:queryBytes`, `sel:valuesItems`, `sel:literalBytes`
- internal cost-model limit: `sel:CostModelLimit` + `sel:estimatedCostUnits` + `sel:costModel`
- server-load limit: `sel:ServerLoadLimit` + `sel:cpuLoadRatio` or `sel:activeQueryCount`
- simultaneous connections: `sel:ConnectionLimit` + `sel:concurrentConnections` / `sel:concurrentQueries`
- additional practical limits:
  - `sel:TimeoutLimit`
  - `sel:QueueLimit`
  - `sel:QuotaLimit`
  - `sel:FederatedQueryLimit`
  - `sel:UpdateLimit`

## SHACL Validation

`shapes/sel.shacl.ttl` includes:

- generic shape for all `sel:Limit` instances
- service shape (`sd:Service`) requiring either direct limits or profiles
- class-specific metric constraints using `sh:in`
- cardinality and datatype checks for core fields

Typical usage with a SHACL engine is:

1. load data graph + `vocab/sel.ttl` + `shapes/sel.shacl.ttl`
2. run SHACL validation
3. inspect violations (missing metric, wrong datatype, invalid metric for class, etc.)

## ShEx Validation

`shex/sel.shex` provides a compact companion schema for lightweight validation workflows.

The ShEx model validates:

- service resources with either direct limits or profiles
- profile resources with one or more limits
- base required fields for each limit

## Alignment Notes

### SPARQL Service Description

- `sel:Limit rdfs:subClassOf sd:Feature`
- `sel:hasLimit rdfs:subPropertyOf sd:feature`

This allows `sel` data to remain compatible with existing service-description processing.

### SHACL / ShEx

- SHACL is used as normative validation constraints for this repo.
- ShEx is provided as an additional schema representation.

### OWL-Time and HTTP

- Durations are represented with `xsd:duration`; `sel:windowDuration` and `sel:retryAfterHint` are annotated with `rdfs:seeAlso time:hasXSDDuration`.
- HTTP signaling can be described via `sel:returnsStatusCode` and `sel:signalsHeader` (`http:HeaderName`).

## Minimal Example

```turtle
@prefix ex: <https://example.org/service/> .
@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
@prefix sel: <https://w3id.org/sparql-endpoint-limits#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:endpoint a sd:Service ;
  sd:endpoint <https://example.org/sparql> ;
  sel:hasLimit ex:rateLimit .

ex:rateLimit a sel:Limit, sel:RateLimit ;
  sel:metric sel:requestsPerWindow ;
  sel:maxValue "120"^^xsd:decimal ;
  sel:windowDuration "PT1M"^^xsd:duration ;
  sel:hasScope sel:PerClientIP ;
  sel:enforcement sel:RejectRequest ;
  sel:hardLimit "true"^^xsd:boolean .
```

## Extension Guidance

When extending this vocabulary:

1. Prefer adding new `sel:Metric` individuals before creating new classes.
2. Create new subclasses of `sel:Limit` only when behavior semantics materially differ.
3. Add corresponding SHACL constraints for any new subclass/metric policy.
4. Keep Service Description compatibility by preserving `sd:Service` + `sd:feature` integration.

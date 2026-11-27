# Limits that VoRD could not express

Found on 27 November 2026, while completing the endpoint policies for phase 0 of vord-bench's `realworld` suite (`PLAN-REALWORLD.md` §13, `suites/realworld/policies/`).

**Status:**
- **Added in VoRD 0.4:** the Wikidata Query Service's limits, with `vord:evaluationTimePerWindow`, `vord:failedRequestsPerWindow`, `vord:PerClientIdentity` and `vord:penalized` (`examples/wikidata-query-service.ttl`).
- **Still open:** the smaller cases at the end, and the question of which responses count as failed.

## The Wikidata Query Service

**Source:** [Wikidata Query Service user manual, "Query limits"](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits), read on 27 November 2026. The manual adds that the limits may change with resources and usage patterns.

| Limit | Value | Applies to | Enforcement | In VoRD 0.3 |
|---|---|---|---|---|
| Parallel queries | 5 | each IP address | — | yes: `ConcurrentRequestsRestriction`, `PerClientIP` |
| Query timeout | 60 s | each query | the query fails | yes: `ResponseTimeRestriction` |
| User-Agent policy | a descriptive User-Agent with contact information | each request | clients that ignore it may be blocked | yes: `IdentificationRestriction` (`user-agent`, `ProductWithContact`) |
| **Processing time** | **60 s of processing time per 60 s** | **each client: User-Agent and IP address together** | HTTP 429 with `Retry-After` | **no; 0.4:** `QuotaRestriction`, `vord:evaluationTimePerWindow`, `vord:PerClientIdentity` |
| **Error queries** | **30 per minute** | **each client: User-Agent and IP address together** | HTTP 429 with `Retry-After` | **no; 0.4:** `RateRestriction`, `vord:failedRequestsPerWindow`, `vord:PerClientIdentity` |
| **Ignoring 429** | a temporary ban (threshold and duration not published) | each client | the client is banned | **partly:** `penaltyThreshold` and `penaltyDuration` exist, but the numbers are not published; **0.4:** `vord:penalized true` |

### What was missing (added in 0.4, except where marked open)

1. **A metric for processing time accumulated within a window.**
   - `vord:evaluationTime` is the time that one request is evaluated, which suits `ResponseTimeRestriction`.
   - A `QuotaRestriction` or `RateRestriction` with `vord:metric vord:evaluationTime` and a `vord:windowDuration` would be ambiguous: is the window per request, or is the time summed over the window?
   - **Added:** `vord:evaluationTimePerWindow` (unit: seconds), the total evaluation time of a client's requests within `vord:windowDuration`, used with `vord:QuotaRestriction`. The shapes require a window with it.
2. **A metric for failed requests within a window.**
   - Nothing counts errors today: `vord:requestsPerWindow` counts every request.
   - **Added:** `vord:failedRequestsPerWindow`, used with `vord:RateRestriction`.
   - **Still open:** which responses count. WDQS speaks of "error queries" without a list, so the definition could leave this to the endpoint, or a property could name the status codes or classes that count.
3. **A scope for a client that is identified by its User-Agent and its IP address together.**
   - WDQS's limits apply per User-Agent and IP address. `vord:PerClientIP` is the closest scope, and it is stricter: it would limit every client on one IP address together.
   - **Added:** `vord:PerClientIdentity`, enforced per combination of the client's IP address and its User-Agent, or the header named by the service's `vord:IdentificationRestriction`. The specification used to suggest a custom scope for this case.
   - With such a scope, a client also learns that a different User-Agent counts as a different client. Changing identity to evade limits is what the proxy's emulation punishes as an identity switch.
4. **Penalties whose numbers are not published.** WDQS bans clients that keep sending after 429, but publishes neither the threshold nor the duration. VoRD 0.3 can only describe a penalty with numbers.
   - **Added:** the boolean `vord:penalized`, saying that violations lead to a block whose threshold or length is not published. The shapes reject `vord:penalized false` together with `vord:penaltyThreshold`. A careful client treats every rejection as final until its `Retry-After` has passed.

### What Comunica's fork does with them today

The fork (branch `feature/vord-restrictions`, commit 3c44d5a413) reads any rate or quota restriction that has a window as a count of requests, whatever its metric:
- `ActorHttpLimitRestrictions.ts`, line 171;
- `ActorRdfMetadataExtractVord.ts` uses the metric only to find the type of a restriction that has no class.

So describing these two limits with today's terms would make VoRD-aware Comunica pace WDQS to 60 or 30 requests per minute, which is not what the policy says. That is why vord-bench's `policies/wikidata.json` keeps them as observations, not restrictions.

**Supporting the new metrics would also need the fork to:**
- ignore rate and quota restrictions with metrics it does not know, instead of counting requests;
- track, per endpoint and window, the evaluation time of its own requests (measured as response time, which is all a client can see) and the number of its failed requests;
- pause when either reaches the limit.

### An example with the new terms

The full description is `examples/wikidata-query-service.ttl`; it also replaces the specification's earlier Wikidata example, which used custom terms.

```turtle
@prefix vord: <https://w3id.org/vord#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix unit: <http://qudt.org/vocab/unit/> .
@prefix http: <http://www.w3.org/2011/http-headers#> .
@prefix ex: <https://query.wikidata.org/sparql#> .

ex:processingTime a vord:Restriction, vord:QuotaRestriction ;
  vord:metric vord:evaluationTimePerWindow ;
  vord:maxValue "60"^^xsd:integer ;
  vord:unit unit:SEC ;
  vord:windowDuration "PT60S"^^xsd:duration ;
  vord:hasScope vord:PerClientIdentity ;
  vord:enforcement vord:RejectRequest ;
  vord:hardRestriction "true"^^xsd:boolean ;
  vord:returnsStatusCode "429"^^xsd:integer ;
  vord:httpSignalHeader http:retry-after .

ex:errorQueries a vord:Restriction, vord:RateRestriction ;
  vord:metric vord:failedRequestsPerWindow ;
  vord:maxValue "30"^^xsd:integer ;
  vord:unit unit:COUNT ;
  vord:windowDuration "PT1M"^^xsd:duration ;
  vord:hasScope vord:PerClientIdentity ;
  vord:enforcement vord:RejectRequest ;
  vord:hardRestriction "true"^^xsd:boolean ;
  vord:returnsStatusCode "429"^^xsd:integer ;
  vord:httpSignalHeader http:retry-after ;
  vord:penalized "true"^^xsd:boolean .
```

## Other limits from the same search (still open)

These are smaller, and for endpoints other than WDQS:
- **IDSM: a timeout that clients can raise.** The default is 1000 s, and a client can ask for up to 9000 s with a `timeout` request parameter (the operator's `web.xml` and `EndpointServlet.java`). VoRD has one `maxValue`; it cannot say "default 1000 s, at most 9000 s on request, through this parameter". vord-bench describes the default.
- **MeSH: result caps that differ per query form.** SELECT returns at most 1,000 results, CONSTRUCT at most 10,000 triples ([SPARQL and URI Requests](https://hhs.github.io/meshrdf/sparql-and-uri-requests)). `ResultSizeRestriction` with `vord:resultBindings` covers the SELECT cap only; there is no way to restrict a restriction to a query form. vord-bench describes the SELECT cap.
- **MeSH: a lockout after the rate limit.** Requests over 500 per minute are not served, and service resumes after 30 s ([Acceptable Use Policy](https://hhs.github.io/meshrdf/acceptable-use-policy)). `penaltyThreshold` 1 with `penaltyDuration` PT30S comes close, but `penaltyDuration` is also the period in which violations are counted. vord-bench describes the rate, with `retryAfterHint` PT30S.
- **QLever: a timeout published as a lower bound** ("at least 600 s"). `maxValue` cannot say "at least", so vord-bench leaves it as an observation.
- **STRING: identification through a query parameter** (`caller_identity`), not a header. This is in its REST API guidelines, which do not mention SPARQL. `IdentificationRestriction` names a header only.

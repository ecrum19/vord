from pathlib import Path

from pyshacl import validate
from rdflib import Graph, Namespace
from rdflib.namespace import OWL, RDF, RDFS


ROOT = Path(__file__).resolve().parents[1]
VOCAB_PATH = ROOT / "vocab" / "vord.ttl"
SHAPES_PATH = ROOT / "shapes" / "vord.shacl.ttl"
README_PATH = ROOT / "README.md"
EXAMPLE_PATHS = [
    ROOT / "examples" / "basic-service.ttl",
    ROOT / "examples" / "exhaustive-service.ttl",
    ROOT / "examples" / "wikidata-rate-restrictions.ttl",
    ROOT / "examples" / "strict-endpoints.ttl",
    ROOT / "examples" / "wikidata-query-service.ttl",
    ROOT / "examples" / "bgee.ttl",
]
SHEX_PATH = ROOT / "shex" / "vord.shex"

PREFIXES = """
@prefix ex: <https://example.org/test/> .
@prefix http: <http://www.w3.org/2011/http-headers#> .
@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
@prefix vord: <https://w3id.org/vord#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:service a sd:Service ;
  sd:endpoint <https://example.org/sparql> ;
  vord:hasRestriction ex:restriction .
"""

VORD_NS = Namespace("https://w3id.org/vord#")


def _load_graph(path: Path) -> Graph:
    g = Graph()
    g.parse(path, format="turtle")
    return g


def _run_shacl(data_graph: Graph):
    shapes_graph = _load_graph(SHAPES_PATH)
    ontology_graph = _load_graph(VOCAB_PATH)
    conforms, report_graph, report_text = validate(
        data_graph=data_graph,
        shacl_graph=shapes_graph,
        ont_graph=ontology_graph,
        inference="rdfs",
        abort_on_first=False,
        allow_infos=True,
        allow_warnings=True,
    )
    return conforms, report_graph, report_text


def _validate_restriction(turtle: str):
    """Validate a service with the single restriction ex:restriction, given in Turtle."""
    data = Graph()
    data.parse(data=PREFIXES + turtle, format="turtle")
    return _run_shacl(data)


def test_core_classes_and_properties_exist():
    """All declared VoRD classes/properties should be documented and described."""
    vocab = _load_graph(VOCAB_PATH)
    readme = README_PATH.read_text(encoding="utf-8")

    class_uris = sorted(
        s
        for s in vocab.subjects(RDF.type, OWL.Class)
        if str(s).startswith(str(VORD_NS))
    )
    object_property_uris = sorted(
        s
        for s in vocab.subjects(RDF.type, OWL.ObjectProperty)
        if str(s).startswith(str(VORD_NS))
    )
    datatype_property_uris = sorted(
        s
        for s in vocab.subjects(RDF.type, OWL.DatatypeProperty)
        if str(s).startswith(str(VORD_NS))
    )

    assert class_uris, "Expected at least one VoRD class"
    assert object_property_uris, "Expected at least one VoRD object property"
    assert datatype_property_uris, "Expected at least one VoRD datatype property"

    documented_terms = class_uris + object_property_uris + datatype_property_uris
    for term_uri in documented_terms:
        label = vocab.value(term_uri, RDFS.label)
        comment = vocab.value(term_uri, RDFS.comment)
        assert label is not None, f"Missing rdfs:label for {term_uri}"
        assert comment is not None, f"Missing rdfs:comment for {term_uri}"

        local_name = str(term_uri).split("#", 1)[-1]
        assert (
            f"`vord:{local_name}`" in readme
        ), f"README is missing reference to vord:{local_name}"


def test_example_graphs_conform_to_shacl():
    """All provided examples should validate against the SHACL shapes."""
    for example_path in EXAMPLE_PATHS:
        data = _load_graph(example_path)
        conforms, _, report_text = _run_shacl(data)
        assert conforms, f"{example_path.name} should conform.\n{report_text}"


def test_invalid_restriction_missing_metric_fails_validation():
    """A quantitative restriction without vord:metric must fail the SHACL constraints."""
    invalid_data = Graph()
    invalid_data.parse(
        data="""
        @prefix ex: <https://example.org/invalid/> .
        @prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
        @prefix vord: <https://w3id.org/vord#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:service a sd:Service ;
          sd:endpoint <https://example.org/sparql> ;
          vord:hasRestriction ex:badLimit .

        ex:badLimit a vord:Restriction, vord:RateRestriction ;
          vord:maxValue "10"^^xsd:integer ;
          vord:windowDuration "PT1M"^^xsd:duration ;
          vord:hasScope vord:PerClientIP ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
        """,
        format="turtle",
    )

    conforms, _, report_text = _run_shacl(invalid_data)
    assert not conforms, "Invalid graph should fail SHACL validation"
    assert "metric" in report_text.lower()


def test_identification_restriction_conforms():
    """An identification restriction needs a header and a format, but no metric or maximum value."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:IdentificationRestriction ;
          vord:identificationHeader http:from ;
          vord:identificationFormat vord:EmailAddress ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean ;
          vord:returnsStatusCode "403"^^xsd:integer .
    """)
    assert conforms, report_text


def test_identification_restriction_requires_header():
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:IdentificationRestriction ;
          vord:identificationFormat vord:EmailAddress ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert not conforms
    assert "identificationheader" in report_text.lower()


def test_identification_restriction_requires_a_format_term():
    """The format must be a vord:IdentificationFormat term, not a literal."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:IdentificationRestriction ;
          vord:identificationHeader http:from ;
          vord:identificationFormat "email" ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert not conforms
    assert "identificationformat" in report_text.lower()


def test_request_method_restriction_conforms():
    """A request-method restriction lists the accepted ways of sending a query, with no metric or maximum value."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RequestMethodRestriction ;
          vord:allowedRequestMethod vord:QueryViaGet ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean ;
          vord:returnsStatusCode "403"^^xsd:integer .
    """)
    assert conforms, report_text


def test_request_method_restriction_may_allow_several_methods():
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RequestMethodRestriction ;
          vord:allowedRequestMethod vord:QueryViaGet, vord:QueryViaUrlEncodedPost ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean ;
          vord:returnsStatusCode "405"^^xsd:integer .
    """)
    assert conforms, report_text


def test_request_method_restriction_requires_a_method():
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RequestMethodRestriction ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert not conforms
    assert "allowedrequestmethod" in report_text.lower()


def test_request_method_must_be_a_term():
    """The method must be a vord:RequestMethod term, not a literal such as "GET"."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RequestMethodRestriction ;
          vord:allowedRequestMethod "GET" ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert not conforms
    assert "allowedrequestmethod" in report_text.lower()


USAGE_BUDGET = """
    ex:units a vord:CostModel .
    ex:restriction a vord:Restriction, vord:CostModelRestriction ;
      vord:metric vord:costUnitsPerWindow ;
      vord:maxValue "600"^^xsd:integer ;
      vord:burstValue "200"^^xsd:integer ;
      vord:costModel ex:units ;
      vord:hasScope vord:PerClientIP ;
      vord:enforcement vord:RejectRequest ;
      vord:hardRestriction "true"^^xsd:boolean"""


def test_usage_budget_with_burst_conforms():
    """A usage budget may use vord:burstValue without being inferred to be a rate restriction."""
    conforms, _, report_text = _validate_restriction(
        USAGE_BUDGET + ' ;\n      vord:windowDuration "PT1M"^^xsd:duration .'
    )
    assert conforms, report_text


def test_usage_budget_requires_window():
    conforms, _, report_text = _validate_restriction(USAGE_BUDGET + " .")
    assert not conforms
    assert "windowduration" in report_text.lower()


def test_cost_ceiling_per_request_needs_no_window():
    conforms, _, report_text = _validate_restriction("""
        ex:units a vord:CostModel .
        ex:restriction a vord:Restriction, vord:CostModelRestriction ;
          vord:metric vord:estimatedCostUnits ;
          vord:maxValue "200000"^^xsd:integer ;
          vord:costModel ex:units ;
          vord:hasScope vord:PerRequest ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert conforms, report_text


RATE_WITH_PENALTY = """
    ex:restriction a vord:Restriction, vord:RateRestriction ;
      vord:metric vord:requestsPerWindow ;
      vord:maxValue "10"^^xsd:integer ;
      vord:windowDuration "PT1S"^^xsd:duration ;
      vord:hasScope vord:PerClientIP ;
      vord:enforcement vord:RejectRequest ;
      vord:hardRestriction "true"^^xsd:boolean ;
      vord:returnsStatusCode "403"^^xsd:integer"""


def test_penalty_conforms():
    conforms, _, report_text = _validate_restriction(RATE_WITH_PENALTY + """ ;
      vord:penaltyThreshold "1"^^xsd:integer ;
      vord:penaltyDuration "PT10M"^^xsd:duration .
    """)
    assert conforms, report_text


def test_penalty_threshold_requires_duration():
    conforms, _, report_text = _validate_restriction(RATE_WITH_PENALTY + """ ;
      vord:penaltyThreshold "1"^^xsd:integer .
    """)
    assert not conforms
    assert "penaltyduration" in report_text.lower()


def test_penalty_threshold_must_be_positive():
    conforms, _, report_text = _validate_restriction(RATE_WITH_PENALTY + """ ;
      vord:penaltyThreshold "0"^^xsd:integer ;
      vord:penaltyDuration "PT10M"^^xsd:duration .
    """)
    assert not conforms
    assert "penaltythreshold" in report_text.lower()


def test_penalized_without_published_numbers_conforms():
    conforms, _, report_text = _validate_restriction(RATE_WITH_PENALTY + """ ;
      vord:penalized "true"^^xsd:boolean .
    """)
    assert conforms, report_text


def test_penalty_threshold_contradicts_penalized_false():
    conforms, _, report_text = _validate_restriction(RATE_WITH_PENALTY + """ ;
      vord:penaltyThreshold "3"^^xsd:integer ;
      vord:penaltyDuration "PT10M"^^xsd:duration ;
      vord:penalized "false"^^xsd:boolean .
    """)
    assert not conforms
    assert "penalized" in report_text.lower()


PROCESSING_TIME_BUDGET = """
    ex:restriction a vord:Restriction, vord:QuotaRestriction ;
      vord:metric vord:evaluationTimePerWindow ;
      vord:maxValue "60"^^xsd:integer ;
      vord:hasScope vord:PerClientIdentity ;
      vord:enforcement vord:RejectRequest ;
      vord:hardRestriction "true"^^xsd:boolean ;
      vord:returnsStatusCode "429"^^xsd:integer"""


def test_processing_time_budget_conforms():
    """A budget of evaluation time per window, counted per User-Agent and IP address."""
    conforms, _, report_text = _validate_restriction(
        PROCESSING_TIME_BUDGET + ' ;\n      vord:windowDuration "PT60S"^^xsd:duration .'
    )
    assert conforms, report_text


def test_processing_time_budget_requires_window():
    conforms, _, report_text = _validate_restriction(PROCESSING_TIME_BUDGET + " .")
    assert not conforms
    assert "windowduration" in report_text.lower()


def test_daily_quota_needs_no_window():
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:QuotaRestriction ;
          vord:metric vord:requestsPerDay ;
          vord:maxValue "10000"^^xsd:integer ;
          vord:hasScope vord:PerClientIP ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert conforms, report_text


def test_failed_requests_limit_conforms():
    """A limit on error queries per window is a rate restriction on failed requests."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RateRestriction ;
          vord:metric vord:failedRequestsPerWindow ;
          vord:maxValue "30"^^xsd:integer ;
          vord:windowDuration "PT1M"^^xsd:duration ;
          vord:hasScope vord:PerClientIdentity ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean ;
          vord:penalized "true"^^xsd:boolean .
    """)
    assert conforms, report_text


def test_rate_restriction_rejects_time_metric():
    """Evaluation time per window is a quota, not a request rate."""
    conforms, _, report_text = _validate_restriction("""
        ex:restriction a vord:Restriction, vord:RateRestriction ;
          vord:metric vord:evaluationTimePerWindow ;
          vord:maxValue "60"^^xsd:integer ;
          vord:windowDuration "PT60S"^^xsd:duration ;
          vord:hasScope vord:PerClientIdentity ;
          vord:enforcement vord:RejectRequest ;
          vord:hardRestriction "true"^^xsd:boolean .
    """)
    assert not conforms
    assert "metric" in report_text.lower()


def test_controlled_values_are_in_their_schemes():
    """New controlled values are typed, labelled, and in their concept schemes."""
    vocab = _load_graph(VOCAB_PATH)
    skos = Namespace("http://www.w3.org/2004/02/skos/core#")
    expected = {
        "costUnitsPerWindow": ("Metric", "MetricScheme"),
        "concurrentRequests": ("Metric", "MetricScheme"),
        "evaluationTimePerWindow": ("Metric", "MetricScheme"),
        "failedRequestsPerWindow": ("Metric", "MetricScheme"),
        "PerClientIdentity": ("Scope", "ScopeScheme"),
        "EmailAddress": ("IdentificationFormat", "IdentificationFormatScheme"),
        "ProductWithContact": ("IdentificationFormat", "IdentificationFormatScheme"),
        "QueryViaGet": ("RequestMethod", "RequestMethodScheme"),
        "QueryViaUrlEncodedPost": ("RequestMethod", "RequestMethodScheme"),
        "QueryViaDirectPost": ("RequestMethod", "RequestMethodScheme"),
    }
    for name, (class_name, scheme) in expected.items():
        term = VORD_NS[name]
        assert (term, RDF.type, VORD_NS[class_name]) in vocab, f"vord:{name} should be a vord:{class_name}"
        assert (term, skos.inScheme, VORD_NS[scheme]) in vocab, f"vord:{name} should be in vord:{scheme}"
        assert vocab.value(term, skos.prefLabel) is not None, f"vord:{name} needs a skos:prefLabel"
        assert vocab.value(term, RDFS.comment) is not None, f"vord:{name} needs an rdfs:comment"


def test_shex_covers_restriction_properties():
    """The ShEx schema mentions every property that a restriction can have."""
    vocab = _load_graph(VOCAB_PATH)
    shex = SHEX_PATH.read_text(encoding="utf-8")
    for prop in list(vocab.subjects(RDF.type, OWL.ObjectProperty)) + list(vocab.subjects(RDF.type, OWL.DatatypeProperty)):
        local_name = str(prop).split("#", 1)[-1]
        assert f"vord:{local_name}" in shex, f"ShEx schema is missing vord:{local_name}"

from pathlib import Path

from pyshacl import validate
from rdflib import Graph, Namespace
from rdflib.namespace import OWL, RDF


ROOT = Path(__file__).resolve().parents[1]
VOCAB_PATH = ROOT / "vocab" / "sel.ttl"
SHAPES_PATH = ROOT / "shapes" / "sel.shacl.ttl"
EXAMPLE_PATHS = [
    ROOT / "examples" / "basic-service.ttl",
    ROOT / "examples" / "tiered-profiles.ttl",
]

SEL = Namespace("https://w3id.org/sparql-endpoint-limits#")


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


def test_core_classes_and_properties_exist():
    """Sanity-check that key terms exist in the ontology."""
    vocab = _load_graph(VOCAB_PATH)

    expected_classes = [
        SEL.Limit,
        SEL.LimitProfile,
        SEL.RateLimit,
        SEL.ResultSizeLimit,
        SEL.QuerySizeLimit,
        SEL.CostModelLimit,
        SEL.ServerLoadLimit,
        SEL.ConnectionLimit,
    ]

    expected_properties = [
        SEL.hasLimit,
        SEL.hasLimitProfile,
        SEL.profileLimit,
        SEL.metric,
        SEL.maxValue,
        SEL.windowDuration,
        SEL.hasScope,
        SEL.enforcement,
        SEL.hardLimit,
    ]

    for class_uri in expected_classes:
        assert (
            class_uri,
            RDF.type,
            OWL.Class,
        ) in vocab, f"Missing class declaration: {class_uri}"

    for property_uri in expected_properties:
        assert (
            property_uri,
            RDF.type,
            OWL.ObjectProperty,
        ) in vocab or (
            property_uri,
            RDF.type,
            OWL.DatatypeProperty,
        ) in vocab, f"Missing property declaration: {property_uri}"


def test_example_graphs_conform_to_shacl():
    """All provided examples should validate against the SHACL shapes."""
    for example_path in EXAMPLE_PATHS:
        data = _load_graph(example_path)
        conforms, _, report_text = _run_shacl(data)
        assert conforms, f"{example_path.name} should conform.\n{report_text}"


def test_invalid_limit_missing_metric_fails_validation():
    """A limit without sel:metric must fail the SHACL constraints."""
    invalid_data = Graph()
    invalid_data.parse(
        data="""
        @prefix ex: <https://example.org/invalid/> .
        @prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
        @prefix sel: <https://w3id.org/sparql-endpoint-limits#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:service a sd:Service ;
          sd:endpoint <https://example.org/sparql> ;
          sel:hasLimit ex:badLimit .

        ex:badLimit a sel:Limit, sel:RateLimit ;
          sel:maxValue "10"^^xsd:decimal ;
          sel:windowDuration "PT1M"^^xsd:duration ;
          sel:hasScope sel:PerClientIP ;
          sel:enforcement sel:RejectRequest ;
          sel:hardLimit "true"^^xsd:boolean .
        """,
        format="turtle",
    )

    conforms, _, report_text = _run_shacl(invalid_data)
    assert not conforms, "Invalid graph should fail SHACL validation"
    assert "metric" in report_text.lower()

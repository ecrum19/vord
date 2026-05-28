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
]

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


def test_invalid_limit_missing_metric_fails_validation():
    """A quantitative limit without vord:metric must fail the SHACL constraints."""
    invalid_data = Graph()
    invalid_data.parse(
        data="""
        @prefix ex: <https://example.org/invalid/> .
        @prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
        @prefix vord: <https://w3id.org/vord#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:service a sd:Service ;
          sd:endpoint <https://example.org/sparql> ;
          vord:hasLimit ex:badLimit .

        ex:badLimit a vord:Limit, vord:RateLimit ;
          vord:maxValue "10"^^xsd:decimal ;
          vord:windowDuration "PT1M"^^xsd:duration ;
          vord:hasScope vord:PerClientIP ;
          vord:enforcement vord:RejectRequest ;
          vord:hardLimit "true"^^xsd:boolean .
        """,
        format="turtle",
    )

    conforms, _, report_text = _run_shacl(invalid_data)
    assert not conforms, "Invalid graph should fail SHACL validation"
    assert "metric" in report_text.lower()

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const TERM_TYPES = {
  "http://www.w3.org/2002/07/owl#Class": "class",
  "http://www.w3.org/2002/07/owl#ObjectProperty": "objectProperty",
  "http://www.w3.org/2002/07/owl#DatatypeProperty": "datatypeProperty",
  "http://www.w3.org/2002/07/owl#AnnotationProperty": "annotationProperty",
  "http://www.w3.org/2004/02/skos/core#Concept": "concept",
  "https://w3id.org/vord#Scope": "scopeConcept",
  "https://w3id.org/vord#EnforcementMode": "enforcementConcept",
  "https://w3id.org/vord#Metric": "metricConcept"
};

const RELATION_PREDICATES = {
  "http://www.w3.org/2000/01/rdf-schema#subClassOf": "subClassOf",
  "http://www.w3.org/2000/01/rdf-schema#domain": "domain",
  "http://www.w3.org/2000/01/rdf-schema#range": "range"
};

const TYPE_ORDER = [
  "class",
  "scopeConcept",
  "enforcementConcept",
  "metricConcept",
  "objectProperty",
  "datatypeProperty",
  "annotationProperty",
  "concept",
  "external"
];

const TYPE_PRIORITY = {
  class: 100,
  objectProperty: 95,
  datatypeProperty: 90,
  annotationProperty: 85,
  scopeConcept: 70,
  enforcementConcept: 70,
  metricConcept: 70,
  concept: 60,
  external: 0
};

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function stripComment(line) {
  let out = "";
  let inUri = false;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (inUri) {
      out += ch;
      if (ch === ">") {
        inUri = false;
      }
      continue;
    }

    if (ch === "#") {
      break;
    }

    out += ch;

    if (ch === "<") {
      inUri = true;
    } else if (ch === "\"") {
      inString = true;
    }
  }

  return out;
}

function splitTopLevel(input, separator) {
  const parts = [];
  let cursor = "";
  let inUri = false;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      cursor += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (inUri) {
      cursor += ch;
      if (ch === ">") {
        inUri = false;
      }
      continue;
    }

    if (ch === separator) {
      parts.push(cursor.trim());
      cursor = "";
      continue;
    }

    cursor += ch;

    if (ch === "<") {
      inUri = true;
    } else if (ch === "\"") {
      inString = true;
    }
  }

  if (cursor.trim()) {
    parts.push(cursor.trim());
  }

  return parts;
}

function splitStatements(ttl) {
  const statements = [];
  let cursor = "";
  let inUri = false;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < ttl.length; i += 1) {
    const ch = ttl[i];

    if (inString) {
      cursor += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (inUri) {
      cursor += ch;
      if (ch === ">") {
        inUri = false;
      }
      continue;
    }

    if (ch === ".") {
      const stmt = cursor.trim();
      if (stmt) {
        statements.push(stmt);
      }
      cursor = "";
      continue;
    }

    cursor += ch;

    if (ch === "<") {
      inUri = true;
    } else if (ch === "\"") {
      inString = true;
    }
  }

  const trailing = cursor.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function parsePrefixes(ttl) {
  const prefixes = {};
  const lines = ttl.split(/\r?\n/);
  const prefixPattern = /^\s*@prefix\s+([^:\s]*):\s*<([^>]+)>\s*\.?\s*$/;

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const match = line.match(prefixPattern);
    if (match) {
      prefixes[match[1]] = match[2];
    }
  }

  return prefixes;
}

function tokenToUri(token, prefixes) {
  const value = token.trim();
  if (!value) {
    return null;
  }

  if (value === "a") {
    return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  }

  if (value.startsWith("<") && value.endsWith(">")) {
    return value.slice(1, -1);
  }

  const colonIndex = value.indexOf(":");
  if (colonIndex > -1) {
    const prefix = value.slice(0, colonIndex);
    const suffix = value.slice(colonIndex + 1);
    if (Object.prototype.hasOwnProperty.call(prefixes, prefix)) {
      return prefixes[prefix] + suffix;
    }
  }

  return null;
}

function uriToQname(uri, prefixes) {
  let bestPrefix = null;
  let bestBase = "";

  for (const [prefix, base] of Object.entries(prefixes)) {
    if (uri.startsWith(base) && base.length > bestBase.length) {
      bestPrefix = prefix;
      bestBase = base;
    }
  }

  if (bestPrefix !== null) {
    return bestPrefix + ":" + uri.slice(bestBase.length);
  }

  return uri;
}

function localName(uri) {
  if (uri.includes("#")) {
    return uri.slice(uri.lastIndexOf("#") + 1);
  }
  if (uri.includes("/")) {
    return uri.slice(uri.lastIndexOf("/") + 1);
  }
  return uri;
}

function parseLiteral(token) {
  const trimmed = token.trim();
  if (!trimmed.startsWith("\"")) {
    return null;
  }

  const match = trimmed.match(/^"((?:\\.|[^"\\])*)"(?:@[a-zA-Z-]+|\^\^[^\s]+)?$/);
  if (!match) {
    return null;
  }

  return match[1]
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function computeLayout(nodes, edges) {
  const positions = new Map();
  const jitter = seededRandom(987654321);
  const anchorByType = {
    class: -120,
    scopeConcept: -75,
    enforcementConcept: -40,
    metricConcept: -5,
    objectProperty: -25,
    datatypeProperty: 70,
    annotationProperty: 150,
    concept: 180,
    external: 230
  };

  for (const node of nodes) {
    const random = seededRandom(hashString(node.id));
    positions.set(node.id, {
      x: (anchorByType[node.termType] ?? 0) + (random() - 0.5) * 30,
      y: (random() - 0.5) * 200
    });
  }

  const area = 200000;
  const k = Math.sqrt(area / Math.max(nodes.length, 1));
  let temperature = 26;
  const iterations = 280;

  for (let iter = 0; iter < iterations; iter += 1) {
    const disp = new Map();
    for (const node of nodes) {
      disp.set(node.id, { x: 0, y: 0 });
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const nodeA = nodes[i];
      const posA = positions.get(nodeA.id);
      for (let j = i + 1; j < nodes.length; j += 1) {
        const nodeB = nodes[j];
        const posB = positions.get(nodeB.id);
        let dx = posA.x - posB.x;
        let dy = posA.y - posB.y;
        let distance = Math.hypot(dx, dy);

        if (distance < 0.1) {
          dx = (jitter() - 0.5) * 0.2;
          dy = (jitter() - 0.5) * 0.2;
          distance = Math.hypot(dx, dy);
        }

        const force = (k * k) / distance;
        const rx = (dx / distance) * force;
        const ry = (dy / distance) * force;

        const dispA = disp.get(nodeA.id);
        const dispB = disp.get(nodeB.id);
        dispA.x += rx;
        dispA.y += ry;
        dispB.x -= rx;
        dispB.y -= ry;
      }
    }

    for (const edge of edges) {
      const posS = positions.get(edge.source);
      const posT = positions.get(edge.target);
      let dx = posS.x - posT.x;
      let dy = posS.y - posT.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.1) {
        dx = 0.1;
        dy = 0.1;
        distance = Math.hypot(dx, dy);
      }

      const force = (distance * distance) / k;
      const ax = (dx / distance) * force;
      const ay = (dy / distance) * force;

      const dispS = disp.get(edge.source);
      const dispT = disp.get(edge.target);
      dispS.x -= ax;
      dispS.y -= ay;
      dispT.x += ax;
      dispT.y += ay;
    }

    for (const node of nodes) {
      const nodeDisp = disp.get(node.id);
      const anchorX = anchorByType[node.termType] ?? 0;
      const gravity = node.isExternal ? 0.02 : 0.014;
      nodeDisp.x += (anchorX - positions.get(node.id).x) * gravity;
      nodeDisp.y += (-positions.get(node.id).y) * 0.012;

      const magnitude = Math.hypot(nodeDisp.x, nodeDisp.y);
      if (magnitude < 0.0001) {
        continue;
      }

      const limited = Math.min(magnitude, temperature);
      const pos = positions.get(node.id);
      pos.x += (nodeDisp.x / magnitude) * limited;
      pos.y += (nodeDisp.y / magnitude) * limited;
    }

    temperature *= 0.962;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of positions.values()) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);

  const normalized = new Map();
  for (const [nodeId, point] of positions.entries()) {
    normalized.set(nodeId, {
      x: ((point.x - centerX) / span) * 200,
      y: ((point.y - centerY) / span) * 200
    });
  }

  return normalized;
}

function sortTerms(a, b) {
  if (a.termType !== b.termType) {
    return TYPE_ORDER.indexOf(a.termType) - TYPE_ORDER.indexOf(b.termType);
  }
  return a.qname.localeCompare(b.qname);
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const ontologyPath = path.join(repoRoot, "vocab", "vord.ttl");
  const assetsDir = path.join(repoRoot, "docs", "assets");
  const graphDataPath = path.join(assetsDir, "vocab_graph_data.json");
  const overviewPath = path.join(assetsDir, "vocab_relationships_overview.json");

  if (!fs.existsSync(ontologyPath)) {
    throw new Error("Missing ontology source: " + ontologyPath);
  }

  const rawTtl = fs.readFileSync(ontologyPath, "utf8");
  const prefixes = parsePrefixes(rawTtl);

  const cleanTtl = rawTtl
    .split(/\r?\n/)
    .map((line) => stripComment(line))
    .join("\n");

  const statements = splitStatements(cleanTtl);
  const parsedTriples = [];

  for (const statement of statements) {
    if (!statement || statement.startsWith("@prefix")) {
      continue;
    }

    const firstSpace = statement.search(/\s/);
    if (firstSpace === -1) {
      continue;
    }

    const subjectToken = statement.slice(0, firstSpace).trim();
    const subjectUri = tokenToUri(subjectToken, prefixes);
    if (!subjectUri) {
      continue;
    }

    const body = statement.slice(firstSpace).trim();
    const predicateChunks = splitTopLevel(body, ";");

    for (const chunk of predicateChunks) {
      if (!chunk) {
        continue;
      }

      const splitIndex = chunk.search(/\s/);
      if (splitIndex === -1) {
        continue;
      }

      const predicateToken = chunk.slice(0, splitIndex).trim();
      const objectChunk = chunk.slice(splitIndex + 1).trim();
      const objectTokens = splitTopLevel(objectChunk, ",");

      for (const objectToken of objectTokens) {
        if (!objectToken) {
          continue;
        }
        parsedTriples.push({
          subjectUri,
          predicateUri: tokenToUri(predicateToken, prefixes),
          objectUri: tokenToUri(objectToken, prefixes),
          objectLiteral: parseLiteral(objectToken),
          predicateToken,
          objectToken
        });
      }
    }
  }

  const terms = new Map();
  const annotationPredicates = new Set();

  for (const triple of parsedTriples) {
    if (triple.predicateUri === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" && triple.objectUri) {
      const mappedType = TERM_TYPES[triple.objectUri];
      if (mappedType) {
        if (!terms.has(triple.subjectUri)) {
          terms.set(triple.subjectUri, {
            uri: triple.subjectUri,
            qname: uriToQname(triple.subjectUri, prefixes),
            termType: mappedType,
            label: "",
            comment: ""
          });
        } else {
          const existing = terms.get(triple.subjectUri).termType;
          const existingPriority = TYPE_PRIORITY[existing] || -1;
          const nextPriority = TYPE_PRIORITY[mappedType] || -1;
          if (!existing || nextPriority >= existingPriority) {
            terms.get(triple.subjectUri).termType = mappedType;
          }
        }
        if (mappedType === "annotationProperty") {
          annotationPredicates.add(triple.subjectUri);
        }
      }
    }

    if (triple.predicateUri === "http://www.w3.org/2000/01/rdf-schema#label" && triple.objectLiteral !== null) {
      if (!terms.has(triple.subjectUri)) {
        terms.set(triple.subjectUri, {
          uri: triple.subjectUri,
          qname: uriToQname(triple.subjectUri, prefixes),
          termType: null,
          label: triple.objectLiteral,
          comment: ""
        });
      } else {
        terms.get(triple.subjectUri).label = triple.objectLiteral;
      }
    }

    if (triple.predicateUri === "http://www.w3.org/2004/02/skos/core#prefLabel" && triple.objectLiteral !== null) {
      if (!terms.has(triple.subjectUri)) {
        terms.set(triple.subjectUri, {
          uri: triple.subjectUri,
          qname: uriToQname(triple.subjectUri, prefixes),
          termType: null,
          label: triple.objectLiteral,
          comment: ""
        });
      } else if (!terms.get(triple.subjectUri).label) {
        terms.get(triple.subjectUri).label = triple.objectLiteral;
      }
    }

    if (triple.predicateUri === "http://www.w3.org/2000/01/rdf-schema#comment" && triple.objectLiteral !== null) {
      if (!terms.has(triple.subjectUri)) {
        terms.set(triple.subjectUri, {
          uri: triple.subjectUri,
          qname: uriToQname(triple.subjectUri, prefixes),
          termType: null,
          label: "",
          comment: triple.objectLiteral
        });
      } else {
        terms.get(triple.subjectUri).comment = triple.objectLiteral;
      }
    }
  }

  const declaredTerms = Array.from(terms.values()).filter((term) => term.termType);
  const declaredTermUris = new Set(declaredTerms.map((term) => term.uri));

  const edgeCandidates = [];

  for (const triple of parsedTriples) {
    if (!declaredTermUris.has(triple.subjectUri)) {
      continue;
    }

    if (!triple.objectUri) {
      continue;
    }

    const relation = RELATION_PREDICATES[triple.predicateUri] ||
      (annotationPredicates.has(triple.predicateUri) ? "annotation" : null);

    if (!relation) {
      continue;
    }

    edgeCandidates.push({
      source: triple.subjectUri,
      target: triple.objectUri,
      relation,
      predicateUri: triple.predicateUri,
      predicateQname: uriToQname(triple.predicateUri, prefixes)
    });
  }

  const conceptParentUris = {
    scopeConcept: (prefixes.vord || "") + "Scope",
    enforcementConcept: (prefixes.vord || "") + "EnforcementMode",
    metricConcept: (prefixes.vord || "") + "Metric"
  };

  for (const term of declaredTerms) {
    const parentUri = conceptParentUris[term.termType];
    if (!parentUri || !declaredTermUris.has(parentUri)) {
      continue;
    }
    edgeCandidates.push({
      source: term.uri,
      target: parentUri,
      relation: "conceptOf",
      predicateUri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      predicateQname: "rdf:type"
    });
  }

  const edges = uniqueBy(edgeCandidates, (edge) =>
    edge.source + "|" + edge.target + "|" + edge.relation + "|" + edge.predicateUri
  );

  const externalTerms = new Map();

  for (const edge of edges) {
    if (!declaredTermUris.has(edge.target)) {
      if (!externalTerms.has(edge.target)) {
        externalTerms.set(edge.target, {
          uri: edge.target,
          qname: uriToQname(edge.target, prefixes),
          label: localName(edge.target),
          termType: "external",
          comment: "Referenced external term",
          isExternal: true
        });
      }
    }
  }

  const internalNodes = declaredTerms
    .map((term) => ({
      uri: term.uri,
      qname: term.qname,
      label: term.label || localName(term.uri),
      termType: term.termType,
      comment: term.comment || "",
      isExternal: false
    }))
    .sort(sortTerms);

  const externalNodes = Array.from(externalTerms.values())
    .sort((a, b) => a.qname.localeCompare(b.qname));

  const nodeRows = [...internalNodes, ...externalNodes].map((node) => ({
    id: node.uri,
    uri: node.uri,
    qname: node.qname,
    label: node.label,
    termType: node.termType,
    comment: node.comment,
    isExternal: node.isExternal
  }));

  const layout = computeLayout(nodeRows, edges);

  const degree = new Map();
  for (const node of nodeRows) {
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }

  const relationOrder = ["subClassOf", "domain", "range", "conceptOf", "annotation"];

  const graphNodes = nodeRows
    .map((node) => {
      const pos = layout.get(node.id) || { x: 0, y: 0 };
      return {
        id: node.id,
        uri: node.uri,
        qname: node.qname,
        label: node.label,
        termType: node.termType,
        comment: node.comment,
        isExternal: node.isExternal,
        degree: degree.get(node.id) || 0,
        x: Number(pos.x.toFixed(5)),
        y: Number(pos.y.toFixed(5))
      };
    })
    .sort((a, b) => {
      if (a.isExternal !== b.isExternal) {
        return a.isExternal ? 1 : -1;
      }
      return sortTerms(a, b);
    });

  const qnameByUri = new Map(graphNodes.map((node) => [node.uri, node.qname]));

  const graphEdges = edges
    .map((edge, index) => ({
      id: "rel-" + String(index + 1).padStart(3, "0"),
      source: edge.source,
      target: edge.target,
      sourceQname: qnameByUri.get(edge.source) || edge.source,
      targetQname: qnameByUri.get(edge.target) || edge.target,
      relation: edge.relation,
      predicateUri: edge.predicateUri,
      predicateQname: edge.predicateQname,
      label: edge.relation === "annotation" ? edge.predicateQname : edge.relation
    }))
    .sort((a, b) => {
      if (a.relation !== b.relation) {
        return relationOrder.indexOf(a.relation) - relationOrder.indexOf(b.relation);
      }
      if (a.sourceQname !== b.sourceQname) {
        return a.sourceQname.localeCompare(b.sourceQname);
      }
      if (a.targetQname !== b.targetQname) {
        return a.targetQname.localeCompare(b.targetQname);
      }
      return a.predicateQname.localeCompare(b.predicateQname);
    });

  const countsByType = {
    class: graphNodes.filter((node) => node.termType === "class").length,
    scopeConcept: graphNodes.filter((node) => node.termType === "scopeConcept").length,
    enforcementConcept: graphNodes.filter((node) => node.termType === "enforcementConcept").length,
    metricConcept: graphNodes.filter((node) => node.termType === "metricConcept").length,
    objectProperty: graphNodes.filter((node) => node.termType === "objectProperty").length,
    datatypeProperty: graphNodes.filter((node) => node.termType === "datatypeProperty").length,
    annotationProperty: graphNodes.filter((node) => node.termType === "annotationProperty").length,
    concept: graphNodes.filter((node) => node.termType === "concept").length,
    external: graphNodes.filter((node) => node.termType === "external").length
  };

  const relationCounts = {
    subClassOf: graphEdges.filter((edge) => edge.relation === "subClassOf").length,
    domain: graphEdges.filter((edge) => edge.relation === "domain").length,
    range: graphEdges.filter((edge) => edge.relation === "range").length,
    conceptOf: graphEdges.filter((edge) => edge.relation === "conceptOf").length,
    annotation: graphEdges.filter((edge) => edge.relation === "annotation").length
  };

  const graphData = {
    generatedAt: new Date().toISOString(),
    source: "vocab/vord.ttl",
    namespace: prefixes.vord,
    summary: {
      nodes: graphNodes.length,
      edges: graphEdges.length,
      countsByType,
      relationCounts
    },
    nodes: graphNodes,
    edges: graphEdges
  };

  const termsByType = {
    class: [],
    scopeConcept: [],
    enforcementConcept: [],
    metricConcept: [],
    objectProperty: [],
    datatypeProperty: [],
    annotationProperty: [],
    concept: []
  };

  for (const node of graphNodes.filter((item) => !item.isExternal)) {
    termsByType[node.termType].push({
      qname: node.qname,
      uri: node.uri,
      label: node.label,
      comment: node.comment
    });
  }

  for (const key of Object.keys(termsByType)) {
    termsByType[key].sort((a, b) => a.qname.localeCompare(b.qname));
  }

  const relationshipsByType = {
    subClassOf: [],
    domain: [],
    range: [],
    conceptOf: [],
    annotation: []
  };

  for (const edge of graphEdges) {
    relationshipsByType[edge.relation].push({
      source: edge.sourceQname,
      target: edge.targetQname,
      predicate: edge.predicateQname
    });
  }

  for (const key of Object.keys(relationshipsByType)) {
    relationshipsByType[key].sort((a, b) => {
      if (a.source !== b.source) {
        return a.source.localeCompare(b.source);
      }
      if (a.target !== b.target) {
        return a.target.localeCompare(b.target);
      }
      return a.predicate.localeCompare(b.predicate);
    });
  }

  const adjacency = {};
  const visibleNodeQnames = new Set(graphNodes.map((node) => node.qname));

  for (const qname of visibleNodeQnames) {
    adjacency[qname] = {
      outgoing: [],
      incoming: []
    };
  }

  for (const edge of graphEdges) {
    adjacency[edge.sourceQname].outgoing.push({
      relation: edge.relation,
      predicate: edge.predicateQname,
      target: edge.targetQname
    });
    adjacency[edge.targetQname].incoming.push({
      relation: edge.relation,
      predicate: edge.predicateQname,
      source: edge.sourceQname
    });
  }

  for (const term of Object.keys(adjacency)) {
    adjacency[term].outgoing.sort((a, b) => {
      if (a.relation !== b.relation) {
        return relationOrder.indexOf(a.relation) - relationOrder.indexOf(b.relation);
      }
      return a.target.localeCompare(b.target);
    });
    adjacency[term].incoming.sort((a, b) => {
      if (a.relation !== b.relation) {
        return relationOrder.indexOf(a.relation) - relationOrder.indexOf(b.relation);
      }
      return a.source.localeCompare(b.source);
    });
  }

  const overview = {
    generatedAt: graphData.generatedAt,
    source: graphData.source,
    namespace: graphData.namespace,
    summary: graphData.summary,
    termsByType,
    externalTerms: graphNodes
      .filter((node) => node.isExternal)
      .map((node) => ({ qname: node.qname, uri: node.uri }))
      .sort((a, b) => a.qname.localeCompare(b.qname)),
    relationshipsByType,
    adjacency
  };

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(graphDataPath, JSON.stringify(graphData, null, 2) + "\n", "utf8");
  fs.writeFileSync(overviewPath, JSON.stringify(overview, null, 2) + "\n", "utf8");

  console.log("Wrote", path.relative(repoRoot, graphDataPath));
  console.log("Wrote", path.relative(repoRoot, overviewPath));
  console.log("Counts:", JSON.stringify(graphData.summary));
}

main();

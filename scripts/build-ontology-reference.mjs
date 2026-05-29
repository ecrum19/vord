#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toLocalName(qname) {
  const idx = qname.indexOf(":");
  return idx > -1 ? qname.slice(idx + 1) : qname;
}

function buildTermLink(qname) {
  const local = toLocalName(qname);
  return `<a href="terms/${encodeURIComponent(local)}.html">${escapeHtml(qname)}</a>`;
}

function parseConceptInstances(vocabText) {
  const lines = vocabText.split(/\r?\n/);
  const concepts = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const startMatch = line.match(/^\s*vord:([A-Za-z0-9_]+)\s+a\s+(.+)\s*;\s*$/);
    if (!startMatch) {
      continue;
    }

    const collected = [line];
    let cursor = index + 1;
    while (cursor < lines.length) {
      collected.push(lines[cursor]);
      if (/\.\s*$/.test(lines[cursor])) {
        break;
      }
      cursor += 1;
    }
    index = cursor;

    const block = collected.join("\n");
    if (!/\bskos:Concept\b/.test(block)) {
      continue;
    }

    const local = startMatch[1];
    const qname = `vord:${local}`;
    const typesRaw = startMatch[2]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const conceptType = ["vord:Scope", "vord:EnforcementMode", "vord:Metric"].find((candidate) =>
      typesRaw.includes(candidate)
    );
    if (!conceptType) {
      continue;
    }

    const prefLabelMatch = block.match(/skos:prefLabel\s+"([^"]+)"@en\s*[.;]/);
    const rdfsLabelMatch = block.match(/rdfs:label\s+"([^"]+)"@en\s*[.;]/);
    const commentMatch = block.match(/rdfs:comment\s+"([^"]+)"@en\s*[.;]/);

    concepts.push({
      id: local,
      qname,
      conceptType,
      label: prefLabelMatch?.[1] || rdfsLabelMatch?.[1] || "-",
      comment: commentMatch?.[1] || "-",
    });
  }

  return concepts;
}

function renderList(values) {
  if (!values.length) {
    return "-";
  }
  return values.map((qname) => `<code>${escapeHtml(qname)}</code>`).join(", ");
}

function makeRows(nodes, detailsById, section) {
  return nodes
    .map((node) => {
      const local = toLocalName(node.qname);
      const id = `term-${local}`;
      const details = detailsById.get(node.id) || { domains: [], ranges: [], parents: [] };
      const relationCell =
        section === "class"
          ? renderList(details.parents)
          : `${renderList(details.domains)}<br>${renderList(details.ranges)}`;
      const relationLabel =
        section === "class"
          ? "Superclasses"
          : "Domain / Range";

      return `<tr id="${escapeHtml(id)}" class="term-row">
        <td>${buildTermLink(node.qname)}</td>
        <td>${escapeHtml(node.label || "-")}</td>
        <td><strong>${relationLabel}:</strong><br>${relationCell}</td>
        <td>${escapeHtml(node.comment || "-")}</td>
      </tr>`;
    })
    .join("\n");
}

function makeConceptRows(concepts, conceptType) {
  const conceptRows = concepts
    .filter((entry) => entry.conceptType === conceptType)
    .sort((left, right) => left.qname.localeCompare(right.qname))
    .map((entry) => {
      const local = toLocalName(entry.qname);
      const id = `term-${local}`;
      return `<tr id="${escapeHtml(id)}" class="term-row">
        <td>${buildTermLink(entry.qname)}</td>
        <td>${escapeHtml(entry.label)}</td>
        <td><code>${escapeHtml(entry.conceptType)}</code></td>
        <td>${escapeHtml(entry.comment)}</td>
      </tr>`;
    })
    .join("\n");

  return conceptRows || '<tr><td colspan="4">No concepts declared for this category.</td></tr>';
}

function buildHtml({ graphData, concepts }) {
  const declaredNodes = graphData.nodes.filter((n) => !n.isExternal);
  const classes = declaredNodes.filter((n) => n.termType === "class");
  const objectProps = declaredNodes.filter((n) => n.termType === "objectProperty");
  const datatypeProps = declaredNodes.filter((n) => n.termType === "datatypeProperty");
  const annotationProps = declaredNodes.filter((n) => n.termType === "annotationProperty");
  const scopeConceptRows = makeConceptRows(concepts, "vord:Scope");
  const enforcementConceptRows = makeConceptRows(concepts, "vord:EnforcementMode");
  const metricConceptRows = makeConceptRows(concepts, "vord:Metric");
  const conceptById = new Map(concepts.map((entry) => [entry.id, entry]));
  const conceptLabel = (id, fallback = id) => escapeHtml(conceptById.get(id)?.label || fallback);

  const detailsById = new Map();
  for (const node of declaredNodes) {
    detailsById.set(node.id, { domains: [], ranges: [], parents: [] });
  }

  for (const edge of graphData.edges) {
    const row = detailsById.get(edge.source);
    if (!row) {
      continue;
    }
    if (edge.relation === "domain") {
      row.domains.push(edge.targetQname);
    } else if (edge.relation === "range") {
      row.ranges.push(edge.targetQname);
    } else if (edge.relation === "subClassOf") {
      row.parents.push(edge.targetQname);
    }
  }

  for (const row of detailsById.values()) {
    row.domains = [...new Set(row.domains)].sort((a, b) => a.localeCompare(b));
    row.ranges = [...new Set(row.ranges)].sort((a, b) => a.localeCompare(b));
    row.parents = [...new Set(row.parents)].sort((a, b) => a.localeCompare(b));
  }

  const classRows = makeRows(classes, detailsById, "class");
  const objectRows = makeRows(objectProps, detailsById, "object");
  const dataRows = makeRows(datatypeProps, detailsById, "datatype");
  const annotationRows = makeRows(annotationProps, detailsById, "annotation");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VoRD Vocabulary Reference</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Reference documentation for VoRD classes and properties." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #eef2f6;
      --panel: #ffffff;
      --ink: #17212b;
      --muted: #526273;
      --accent: #0f6772;
      --border: #d1dbe5;
      --shadow: 0 12px 26px rgba(17, 37, 55, 0.09);
      --radius-lg: 16px;
      --radius-md: 10px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, rgba(15, 103, 114, 0.11), transparent 46%),
        radial-gradient(circle at bottom left, rgba(219, 188, 138, 0.16), transparent 42%),
        var(--bg);
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .layout {
      width: min(1520px, calc(100vw - 24px));
      margin: 0 auto;
      padding: 18px 0 34px;
      display: grid;
      grid-template-columns: 276px minmax(0, 1fr);
      gap: 14px;
    }
    .nav {
      position: sticky;
      top: 12px;
      align-self: start;
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 14px;
      box-shadow: var(--shadow);
    }
    .nav h2 {
      margin: 0 0 8px;
      font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
      font-size: 1rem;
    }
    .nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .nav a {
      display: block;
      padding: 8px 10px;
      border-radius: 8px;
      color: #294456;
      font-weight: 600;
      font-size: 0.92rem;
    }
    .nav a:hover { background: #f2f8fb; text-decoration: none; }
    .content { display: grid; gap: 14px; }
    .hero, .section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px 22px;
      box-shadow: var(--shadow);
    }
    .hero h1 {
      margin: 0;
      font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
      font-size: clamp(2rem, 2.6vw, 2.9rem);
    }
    .hero p, .section p {
      margin: 10px 0 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .stats {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }
    .stat {
      border: 1px solid #c9d9e2;
      border-radius: 10px;
      padding: 10px;
      background: linear-gradient(180deg, #fafdff 0%, #f2f8fb 100%);
      text-align: center;
      font-weight: 700;
      color: #1e4e68;
      font-size: 0.9rem;
    }
    .stat strong {
      display: block;
      font-size: 1.1rem;
      line-height: 1.2;
      margin-top: 2px;
      color: #103f59;
    }
    .stat--namespace {
      grid-column: 1 / -1;
      text-align: left;
      display: grid;
      gap: 6px;
    }
    .stat--namespace code {
      display: block;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .actions {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--accent);
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
    }
    .btn--primary {
      border-color: transparent;
      background: linear-gradient(135deg, #187683 0%, var(--accent) 100%);
      color: #fff;
    }
    .section h2 {
      margin: 0 0 10px;
      font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
      font-size: 1.32rem;
    }
    .hierarchy-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .diagram-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
      padding: 12px;
    }
    .diagram-card h3 {
      margin: 0 0 8px;
      font-size: 0.98rem;
      color: #1a4a62;
    }
    .diagram-svg {
      width: 100%;
      height: auto;
      border: 1px solid #d8e2ea;
      border-radius: 8px;
      background: #ffffff;
      display: block;
    }
    .diagram-note {
      margin-top: 8px;
      font-size: 0.82rem;
      color: #5a6978;
      line-height: 1.45;
    }
    .diagram-links {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .table-wrap {
      margin-top: 12px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 920px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      padding: 10px 12px;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    th {
      background: #edf5f8;
      color: #234;
      font-weight: 700;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:nth-child(even) td { background: #fbfdff; }
    .term-row { scroll-margin-top: 12px; }
    .term-row:target td {
      background: #fff8d9;
      box-shadow: inset 3px 0 0 #dfb84f;
    }
    code {
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      background: rgba(15, 103, 114, 0.08);
      border-radius: 6px;
      padding: 2px 6px;
      color: #154f56;
      font-size: 0.88rem;
    }
    pre {
      margin: 12px 0 0;
      background: #0f1b26;
      color: #e4f0ff;
      padding: 14px;
      border-radius: 10px;
      overflow: auto;
      font-size: 0.86rem;
      line-height: 1.55;
    }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .nav { position: static; max-height: none; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="nav">
      <h2>Contents</h2>
      <ul>
        <li><a href="#overview">Overview</a></li>
        <li><a href="#hierarchy">Hierarchy</a></li>
        <li><a href="#classes">Classes</a></li>
        <li><a href="#scope-concepts">Scope Concepts</a></li>
        <li><a href="#enforcement-concepts">Enforcement Concepts</a></li>
        <li><a href="#metric-concepts">Metric Concepts</a></li>
        <li><a href="#object-properties">Object Properties</a></li>
        <li><a href="#datatype-properties">Datatype Properties</a></li>
        <li><a href="#annotation-properties">Annotation Properties</a></li>
      </ul>
    </aside>

    <main class="content">
      <header class="hero" id="overview">
        <h1>VoRD Vocabulary Reference</h1>
        <p>Reference documentation for classes, properties, and controlled concept instances declared in <code>vord.ttl</code>, with relationship data generated from serialized graph assets.</p>
        <div class="stats">
          <div class="stat">Classes<strong id="stat-classes">0</strong></div>
          <div class="stat">Concepts<strong id="stat-concepts">0</strong></div>
          <div class="stat">Object Properties<strong id="stat-object-properties">0</strong></div>
          <div class="stat">Datatype Properties<strong id="stat-datatype-properties">0</strong></div>
          <div class="stat">Annotation Properties<strong id="stat-annotation-properties">0</strong></div>
          <div class="stat stat--namespace">Namespace<code id="stat-namespace">${escapeHtml(graphData.namespace || "https://w3id.org/vord#")}</code></div>
        </div>
        <div class="actions">
          <a class="btn btn--primary" href="index.html">Back to Home</a>
          <a class="btn" href="ontology-graph.html">Open Relationship Graph</a>
          <a class="btn" href="terms/index.html">Open Term Pages</a>
          <a class="btn" href="assets/vord.ttl" target="_blank" rel="noreferrer">Open Ontology TTL</a>
          <a class="btn" href="assets/vord.shacl.ttl" target="_blank" rel="noreferrer">Open SHACL TTL</a>
        </div>
      </header>

      <section class="section" id="hierarchy">
        <h2>Hierarchy Overview</h2>
        <p>Graphical summary of the most important class, property, and concept hierarchies in VoRD.</p>
        <div class="hierarchy-grid">
          <article class="diagram-card">
            <h3>Class Hierarchy</h3>
            <svg class="diagram-svg" viewBox="0 0 560 260" role="img" aria-label="VoRD class hierarchy">
              <defs>
                <marker id="arrow-c" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#2d5f79"></polygon>
                </marker>
              </defs>
              <rect x="220" y="18" width="120" height="30" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="280" y="38" text-anchor="middle" font-size="12" fill="#163f58">vord:Restriction</text>

              <line x1="280" y1="48" x2="280" y2="72" stroke="#2d5f79" stroke-width="1.5"></line>
              <line x1="70" y1="72" x2="490" y2="72" stroke="#2d5f79" stroke-width="1.5"></line>
              <line x1="70" y1="72" x2="70" y2="92" stroke="#2d5f79" stroke-width="1.5" marker-end="url(#arrow-c)"></line>
              <line x1="175" y1="72" x2="175" y2="92" stroke="#2d5f79" stroke-width="1.5" marker-end="url(#arrow-c)"></line>
              <line x1="280" y1="72" x2="280" y2="92" stroke="#2d5f79" stroke-width="1.5" marker-end="url(#arrow-c)"></line>
              <line x1="385" y1="72" x2="385" y2="92" stroke="#2d5f79" stroke-width="1.5" marker-end="url(#arrow-c)"></line>
              <line x1="490" y1="72" x2="490" y2="92" stroke="#2d5f79" stroke-width="1.5" marker-end="url(#arrow-c)"></line>

              <rect x="20" y="94" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="70" y="114" text-anchor="middle" font-size="11" fill="#1f4a63">Rate</text>
              <rect x="125" y="94" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="175" y="114" text-anchor="middle" font-size="11" fill="#1f4a63">ResultSize</text>
              <rect x="230" y="94" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="280" y="114" text-anchor="middle" font-size="11" fill="#1f4a63">ResponseTime</text>
              <rect x="335" y="94" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="385" y="114" text-anchor="middle" font-size="11" fill="#1f4a63">ConcurrentReq</text>
              <rect x="440" y="94" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="490" y="114" text-anchor="middle" font-size="11" fill="#1f4a63">Quota</text>

              <rect x="20" y="148" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="70" y="168" text-anchor="middle" font-size="11" fill="#1f4a63">ServerLoad</text>
              <rect x="125" y="148" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="175" y="168" text-anchor="middle" font-size="11" fill="#1f4a63">CostModel</text>
              <text x="280" y="200" text-anchor="middle" font-size="11" fill="#5c6a78">plus supporting class terms (see class table)</text>
            </svg>
            <p class="diagram-note">Focuses on core operational restriction subclasses for endpoint advertisement.</p>
          </article>

          <article class="diagram-card">
            <h3>Property Structure</h3>
            <svg class="diagram-svg" viewBox="0 0 560 260" role="img" aria-label="VoRD property structure">
              <defs>
                <marker id="arrow-p" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#2d5f79"></polygon>
                </marker>
              </defs>
              <rect x="30" y="24" width="120" height="30" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="90" y="44" text-anchor="middle" font-size="12" fill="#163f58">sd:Service</text>
              <rect x="210" y="24" width="140" height="30" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="280" y="44" text-anchor="middle" font-size="12" fill="#163f58">vord:Restriction</text>

              <line x1="150" y1="39" x2="210" y2="39" stroke="#2d5f79" stroke-width="1.6" marker-end="url(#arrow-p)"></line>
              <text x="180" y="31" text-anchor="middle" font-size="10" fill="#35586f">hasRestriction</text>

              <line x1="280" y1="54" x2="280" y2="82" stroke="#2d5f79" stroke-width="1.4"></line>
              <line x1="80" y1="82" x2="480" y2="82" stroke="#2d5f79" stroke-width="1.4"></line>
              <line x1="100" y1="82" x2="100" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>
              <line x1="180" y1="82" x2="180" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>
              <line x1="260" y1="82" x2="260" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>
              <line x1="340" y1="82" x2="340" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>
              <line x1="420" y1="82" x2="420" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>
              <line x1="500" y1="82" x2="500" y2="102" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-p)"></line>

              <rect x="50" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="100" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">metric</text>
              <rect x="130" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="180" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">maxValue</text>
              <rect x="210" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="260" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">hasScope</text>
              <rect x="290" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="340" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">enforcement</text>
              <rect x="370" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="420" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">unit</text>
              <rect x="450" y="104" width="100" height="30" rx="8" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="500" y="124" text-anchor="middle" font-size="10.5" fill="#1f4a63">windowDuration</text>

              <text x="280" y="165" text-anchor="middle" font-size="11" fill="#5c6a78">additional: minValue, burstValue, retryAfterHint, returnsStatusCode, httpSignalHeader, hardRestriction, costModel</text>
            </svg>
            <p class="diagram-note">Shows the core property pattern that maintainers publish on each <code>vord:Restriction</code>.</p>
          </article>

          <article class="diagram-card">
            <h3>Concept Hierarchy</h3>
            <svg class="diagram-svg" viewBox="0 0 560 300" role="img" aria-label="VoRD concept hierarchy">
              <defs>
                <marker id="arrow-k" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#2d5f79"></polygon>
                </marker>
              </defs>
              <rect x="20" y="18" width="160" height="28" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="100" y="36" text-anchor="middle" font-size="11" fill="#163f58">vord:Scope</text>
              <rect x="200" y="18" width="160" height="28" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="280" y="36" text-anchor="middle" font-size="11" fill="#163f58">vord:EnforcementMode</text>
              <rect x="380" y="18" width="160" height="28" rx="8" fill="#e8f3f7" stroke="#91b4c7"></rect>
              <text x="460" y="36" text-anchor="middle" font-size="11" fill="#163f58">vord:Metric</text>

              <line x1="100" y1="46" x2="100" y2="66" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-k)"></line>
              <line x1="280" y1="46" x2="280" y2="66" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-k)"></line>
              <line x1="460" y1="46" x2="460" y2="66" stroke="#2d5f79" stroke-width="1.2" marker-end="url(#arrow-k)"></line>

              <rect x="20" y="68" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="100" y="84" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("PerClientIP", "PerClientIP")}</text>
              <rect x="20" y="96" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="100" y="112" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("PerAPIKey", "PerAPIKey")}</text>
              <rect x="20" y="124" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="100" y="140" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("GlobalScope", "GlobalScope")}</text>

              <rect x="200" y="68" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="280" y="84" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("RejectRequest", "RejectRequest")}</text>
              <rect x="200" y="96" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="280" y="112" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("TruncateResult", "TruncateResult")}</text>
              <rect x="200" y="124" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="280" y="140" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("ThrottleResponse", "ThrottleResponse")}</text>

              <rect x="380" y="68" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="460" y="84" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("requestsPerWindow", "requestsPerWindow")}</text>
              <rect x="380" y="96" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="460" y="112" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("resultBindings", "resultBindings")}</text>
              <rect x="380" y="124" width="160" height="24" rx="6" fill="#f4f9fc" stroke="#aac4d2"></rect>
              <text x="460" y="140" text-anchor="middle" font-size="10.5" fill="#1f4a63">${conceptLabel("evaluationTime", "evaluationTime")}</text>
            </svg>
            <p class="diagram-note">Representative concept instances used for scoping, enforcement behavior, and measurement dimensions.</p>
          </article>
        </div>
        <div class="diagram-links">
          <a class="btn" href="#classes">Browse Class Details</a>
          <a class="btn" href="#object-properties">Browse Property Details</a>
          <a class="btn" href="#scope-concepts">Browse Concept Details</a>
        </div>
      </section>

      <section class="section" id="classes">
        <h2>Classes</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Label</th><th>Superclasses</th><th>Description</th></tr></thead>
            <tbody>
              ${classRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="scope-concepts">
        <h2>Scope Concepts</h2>
        <p>Instances of <code>vord:Scope</code> and <code>skos:Concept</code> used to indicate where a restriction is evaluated.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Preferred Label</th><th>Classification</th><th>Description</th></tr></thead>
            <tbody>
              ${scopeConceptRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="enforcement-concepts">
        <h2>Enforcement Mode Concepts</h2>
        <p>Instances of <code>vord:EnforcementMode</code> and <code>skos:Concept</code> describing operational behavior at restriction boundaries.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Preferred Label</th><th>Classification</th><th>Description</th></tr></thead>
            <tbody>
              ${enforcementConceptRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="metric-concepts">
        <h2>Metric Concepts</h2>
        <p>Instances of <code>vord:Metric</code> and <code>skos:Concept</code> that identify measurable dimensions restricted by a policy.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Preferred Label</th><th>Classification</th><th>Description</th></tr></thead>
            <tbody>
              ${metricConceptRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="object-properties">
        <h2>Object Properties</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Label</th><th>Domain / Range</th><th>Description</th></tr></thead>
            <tbody>
              ${objectRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="datatype-properties">
        <h2>Datatype Properties</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Label</th><th>Domain / Range</th><th>Description</th></tr></thead>
            <tbody>
              ${dataRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" id="annotation-properties">
        <h2>Annotation Properties</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Term</th><th>Label</th><th>Domain / Range</th><th>Description</th></tr></thead>
            <tbody>
              ${annotationRows || '<tr><td colspan="4">No annotation properties declared in this vocabulary.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const countRows = (sectionId) => {
        const section = document.getElementById(sectionId);
        if (!section) return 0;
        return section.querySelectorAll("tbody tr.term-row").length;
      };

      const setCount = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value);
      };

      setCount("stat-classes", countRows("classes"));
      setCount("stat-concepts",
        countRows("scope-concepts") +
        countRows("enforcement-concepts") +
        countRows("metric-concepts")
      );
      setCount("stat-object-properties", countRows("object-properties"));
      setCount("stat-datatype-properties", countRows("datatype-properties"));
      setCount("stat-annotation-properties", countRows("annotation-properties"));
    })();
  </script>
</body>
</html>`;
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const docsDir = path.join(repoRoot, "docs");
  const assetsDir = path.join(docsDir, "assets");
  const graphPath = path.join(assetsDir, "vocab_graph_data.json");
  const vocabPath = path.join(repoRoot, "vocab", "vord.ttl");
  const outputPath = path.join(docsDir, "ontology-reference.html");

  if (!fs.existsSync(graphPath)) {
    throw new Error(`Graph data not found at ${graphPath}. Run build-ontology-graph-data first.`);
  }

  const graphData = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const vocabText = fs.readFileSync(vocabPath, "utf8");
  const concepts = parseConceptInstances(vocabText);

  fs.writeFileSync(outputPath, buildHtml({ graphData, concepts }), "utf8");
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}

main();

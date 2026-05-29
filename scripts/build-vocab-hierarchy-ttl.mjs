#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUBCLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const OWL_OBJECT_PROPERTY = "http://www.w3.org/2002/07/owl#ObjectProperty";

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
      const statement = cursor.trim();
      if (statement) {
        statements.push(statement);
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
  const ordered = [];
  const map = {};
  const lines = ttl.split(/\r?\n/);
  const pattern = /^\s*@prefix\s+([^:\s]*):\s*<([^>]+)>\s*\.?\s*$/;

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const match = line.match(pattern);
    if (!match) {
      continue;
    }
    const prefix = match[1];
    const base = match[2];
    if (!Object.prototype.hasOwnProperty.call(map, prefix)) {
      ordered.push({ prefix, base });
    }
    map[prefix] = base;
  }

  return { ordered, map };
}

function tokenToUri(token, prefixes) {
  const value = token.trim();
  if (!value) {
    return null;
  }

  if (value === "a") {
    return RDF_TYPE;
  }

  if (value.startsWith("<") && value.endsWith(">")) {
    return value.slice(1, -1);
  }

  const colonIndex = value.indexOf(":");
  if (colonIndex < 0) {
    return null;
  }

  const prefix = value.slice(0, colonIndex);
  const suffix = value.slice(colonIndex + 1);
  if (!Object.prototype.hasOwnProperty.call(prefixes, prefix)) {
    return null;
  }
  return prefixes[prefix] + suffix;
}

function findPrefixForUri(uri, orderedPrefixes) {
  let best = null;
  for (const entry of orderedPrefixes) {
    if (!uri.startsWith(entry.base)) {
      continue;
    }
    if (!best || entry.base.length > best.base.length) {
      best = entry;
    }
  }
  return best;
}

function uriToQnameOrIri(uri, orderedPrefixes) {
  const matched = findPrefixForUri(uri, orderedPrefixes);
  if (!matched) {
    return `<${uri}>`;
  }
  return `${matched.prefix}:${uri.slice(matched.base.length)}`;
}

function sortedSetValues(valueSet, orderedPrefixes) {
  return Array.from(valueSet)
    .map((uri) => uriToQnameOrIri(uri, orderedPrefixes))
    .sort((a, b) => a.localeCompare(b));
}

function sortByQName(uris, orderedPrefixes) {
  return Array.from(uris).sort((a, b) =>
    uriToQnameOrIri(a, orderedPrefixes).localeCompare(uriToQnameOrIri(b, orderedPrefixes))
  );
}

function buildClassGroups(classUris, subClassMap, orderedPrefixes) {
  const childrenMap = new Map();
  const parentCount = new Map();

  for (const classUri of classUris) {
    childrenMap.set(classUri, new Set());
    parentCount.set(classUri, 0);
  }

  for (const classUri of classUris) {
    const superClasses = subClassMap.get(classUri);
    if (!superClasses) {
      continue;
    }

    for (const superClassUri of superClasses) {
      if (!classUris.has(superClassUri)) {
        continue;
      }
      childrenMap.get(superClassUri).add(classUri);
      parentCount.set(classUri, parentCount.get(classUri) + 1);
    }
  }

  const descendantScoreMemo = new Map();
  function descendantScore(classUri, trail = new Set()) {
    if (descendantScoreMemo.has(classUri)) {
      return descendantScoreMemo.get(classUri);
    }
    if (trail.has(classUri)) {
      return 0;
    }
    trail.add(classUri);
    let total = 0;
    const children = childrenMap.get(classUri) ?? new Set();
    for (const childUri of children) {
      total += 1 + descendantScore(childUri, trail);
    }
    trail.delete(classUri);
    descendantScoreMemo.set(classUri, total);
    return total;
  }

  function byTraversalPriority(a, b) {
    const scoreDiff = descendantScore(b) - descendantScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return uriToQnameOrIri(a, orderedPrefixes).localeCompare(uriToQnameOrIri(b, orderedPrefixes));
  }

  const roots = Array.from(classUris)
    .filter((classUri) => parentCount.get(classUri) === 0)
    .sort(byTraversalPriority);

  const visited = new Set();
  const groups = [];

  function visit(classUri, bucket) {
    if (visited.has(classUri)) {
      return;
    }
    visited.add(classUri);
    bucket.push(classUri);

    const children = Array.from(childrenMap.get(classUri) ?? []).sort(byTraversalPriority);
    for (const childUri of children) {
      visit(childUri, bucket);
    }
  }

  for (const rootUri of roots) {
    const groupMembers = [];
    visit(rootUri, groupMembers);
    if (groupMembers.length) {
      groups.push({ rootUri, members: groupMembers });
    }
  }

  const unvisited = sortByQName(
    Array.from(classUris).filter((classUri) => !visited.has(classUri)),
    orderedPrefixes
  );
  for (const classUri of unvisited) {
    const groupMembers = [];
    visit(classUri, groupMembers);
    if (groupMembers.length) {
      groups.push({ rootUri: classUri, members: groupMembers });
    }
  }

  return groups;
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const ontologyPath = path.join(repoRoot, "vocab", "vord.ttl");
  const outputPath = path.join(repoRoot, "docs", "assets", "vocab_hierarchy.ttl");

  if (!fs.existsSync(ontologyPath)) {
    throw new Error(`Missing ontology source: ${ontologyPath}`);
  }

  const rawTtl = fs.readFileSync(ontologyPath, "utf8");
  const { ordered: orderedPrefixes, map: prefixes } = parsePrefixes(rawTtl);

  const cleanTtl = rawTtl
    .split(/\r?\n/)
    .map((line) => stripComment(line))
    .join("\n");

  const statements = splitStatements(cleanTtl);
  const triples = [];

  for (const statement of statements) {
    if (!statement || statement.startsWith("@prefix")) {
      continue;
    }

    const splitIndex = statement.search(/\s/);
    if (splitIndex < 0) {
      continue;
    }

    const subjectToken = statement.slice(0, splitIndex).trim();
    const subjectUri = tokenToUri(subjectToken, prefixes);
    if (!subjectUri) {
      continue;
    }

    const body = statement.slice(splitIndex).trim();
    const predicateChunks = splitTopLevel(body, ";");

    for (const chunk of predicateChunks) {
      if (!chunk) {
        continue;
      }

      const predSplit = chunk.search(/\s/);
      if (predSplit < 0) {
        continue;
      }

      const predicateToken = chunk.slice(0, predSplit).trim();
      const predicateUri = tokenToUri(predicateToken, prefixes);
      if (!predicateUri) {
        continue;
      }

      const objectChunk = chunk.slice(predSplit + 1).trim();
      const objectTokens = splitTopLevel(objectChunk, ",");
      for (const objectToken of objectTokens) {
        const objectUri = tokenToUri(objectToken, prefixes);
        if (!objectUri) {
          continue;
        }
        triples.push({
          subjectUri,
          predicateUri,
          objectUri
        });
      }
    }
  }

  const classUris = new Set();
  const objectPropertyUris = new Set();
  const subClassMap = new Map();
  const domainMap = new Map();
  const rangeMap = new Map();

  function ensureSet(map, key) {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    return map.get(key);
  }

  for (const triple of triples) {
    if (triple.predicateUri === RDF_TYPE && triple.objectUri === OWL_CLASS) {
      classUris.add(triple.subjectUri);
    }
    if (triple.predicateUri === RDF_TYPE && triple.objectUri === OWL_OBJECT_PROPERTY) {
      objectPropertyUris.add(triple.subjectUri);
    }
    if (triple.predicateUri === RDFS_SUBCLASS_OF) {
      ensureSet(subClassMap, triple.subjectUri).add(triple.objectUri);
    }
    if (triple.predicateUri === RDFS_DOMAIN) {
      ensureSet(domainMap, triple.subjectUri).add(triple.objectUri);
    }
    if (triple.predicateUri === RDFS_RANGE) {
      ensureSet(rangeMap, triple.subjectUri).add(triple.objectUri);
    }
  }

  const structuralProperties = Array.from(objectPropertyUris)
    .filter((uri) => domainMap.has(uri) && rangeMap.has(uri))
    .sort((a, b) => {
      const aDomain = sortedSetValues(domainMap.get(a), orderedPrefixes).join(", ");
      const bDomain = sortedSetValues(domainMap.get(b), orderedPrefixes).join(", ");
      if (aDomain !== bDomain) {
        return aDomain.localeCompare(bDomain);
      }
      return uriToQnameOrIri(a, orderedPrefixes).localeCompare(uriToQnameOrIri(b, orderedPrefixes));
    });

  const usedUris = new Set(classUris);
  for (const [subject, supers] of subClassMap.entries()) {
    if (classUris.has(subject)) {
      usedUris.add(subject);
      for (const uri of supers) {
        usedUris.add(uri);
      }
    }
  }
  for (const propertyUri of structuralProperties) {
    usedUris.add(propertyUri);
    for (const uri of domainMap.get(propertyUri)) {
      usedUris.add(uri);
    }
    for (const uri of rangeMap.get(propertyUri)) {
      usedUris.add(uri);
    }
  }

  const usedPrefixes = new Set(["vord", "rdf", "rdfs", "owl"]);
  for (const uri of usedUris) {
    const match = findPrefixForUri(uri, orderedPrefixes);
    if (match) {
      usedPrefixes.add(match.prefix);
    }
  }

  const prefixLines = orderedPrefixes
    .filter((entry) => usedPrefixes.has(entry.prefix))
    .map((entry) => `@prefix ${entry.prefix}: ${`<${entry.base}>`} .`);

  const lines = [];
  lines.push("# Auto-generated from vocab/vord.ttl.");
  lines.push(...prefixLines);
  lines.push("");
  lines.push("## Class hierarchy");
  lines.push("");

  const classGroups = buildClassGroups(classUris, subClassMap, orderedPrefixes);

  for (const group of classGroups) {
    const rootQName = uriToQnameOrIri(group.rootUri, orderedPrefixes);
    const groupLabel = group.members.length > 1 ? `${rootQName} tree` : rootQName;
    lines.push(`# Group: ${groupLabel}`);

    for (const classUri of group.members) {
      const classQName = uriToQnameOrIri(classUri, orderedPrefixes);
      const superClasses = subClassMap.has(classUri)
        ? sortedSetValues(subClassMap.get(classUri), orderedPrefixes)
        : [];

      if (!superClasses.length) {
        lines.push(`${classQName} a owl:Class .`);
        continue;
      }

      lines.push(`${classQName} a owl:Class ;`);
      lines.push(`  rdfs:subClassOf ${superClasses.join(", ")} .`);
    }
    lines.push("");
  }
  if (lines.at(-1) === "") {
    lines.pop();
  }
  lines.push("");
  lines.push("## Structural object-property links (domain/range)");
  lines.push("");

  const propertyGroups = new Map();
  for (const propertyUri of structuralProperties) {
    const domainKey = sortedSetValues(domainMap.get(propertyUri), orderedPrefixes).join(", ");
    if (!propertyGroups.has(domainKey)) {
      propertyGroups.set(domainKey, []);
    }
    propertyGroups.get(domainKey).push(propertyUri);
  }

  const sortedPropertyGroups = Array.from(propertyGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [domainKey, propertyUris] of sortedPropertyGroups) {
    lines.push(`# Domain group: ${domainKey}`);
    const orderedProperties = sortByQName(propertyUris, orderedPrefixes);

    for (const propertyUri of orderedProperties) {
      const propertyQName = uriToQnameOrIri(propertyUri, orderedPrefixes);
      const domains = sortedSetValues(domainMap.get(propertyUri), orderedPrefixes);
      const ranges = sortedSetValues(rangeMap.get(propertyUri), orderedPrefixes);

      lines.push(`${propertyQName} a owl:ObjectProperty ;`);
      lines.push(`  rdfs:domain ${domains.join(", ")} ;`);
      lines.push(`  rdfs:range ${ranges.join(", ")} .`);
    }
    lines.push("");
  }
  if (lines.at(-1) === "") {
    lines.pop();
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote generated hierarchy TTL: ${path.relative(repoRoot, outputPath)}`);
}

main();

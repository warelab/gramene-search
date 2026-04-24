// Maps gene-doc field name -> ontology key used for resolution.
export const ANCESTOR_FIELD_MAP = {
  GO__ancestors: 'GO',
  PO__ancestors: 'PO',
  TO__ancestors: 'TO',
  QTL_TO__ancestors: 'TO',
  domains__ancestors: 'domains',
  pathways__ancestors: 'pathways',
  taxonomy__ancestors: 'taxonomy'
};

// Display label used in the "hierarchy" column.
export const ANCESTOR_HIERARCHY_LABEL = {
  GO__ancestors: 'Gene Ontology',
  PO__ancestors: 'Plant Ontology',
  TO__ancestors: 'Trait Ontology',
  QTL_TO__ancestors: 'Trait Ontology',
  domains__ancestors: 'InterPro',
  pathways__ancestors: 'Plant Reactome',
  taxonomy__ancestors: 'Taxonomy'
};

export const ANCESTOR_EXTRA_COLUMNS = [
  'hierarchy',
  'term_id',
  'term_name',
  'term_type'
];

export function isAncestorField(name) {
  return Object.prototype.hasOwnProperty.call(ANCESTOR_FIELD_MAP, name);
}

export function partitionAncestorFields(fieldNames) {
  const ancestor = [];
  const plain = [];
  for (const n of fieldNames) {
    if (isAncestorField(n)) ancestor.push(n);
    else plain.push(n);
  }
  return { ancestor, plain };
}

// Gather the ids referenced across docs for each ontology/field.
export function collectAncestorIds(docs, fieldNames) {
  const byOnt = {};
  for (const name of fieldNames) {
    const ont = ANCESTOR_FIELD_MAP[name];
    if (!ont) continue;
    if (!byOnt[ont]) byOnt[ont] = new Set();
    for (const d of (docs || [])) {
      const v = d && d[name];
      if (!Array.isArray(v)) continue;
      for (const id of v) if (id != null) byOnt[ont].add(+id);
    }
  }
  const out = {};
  for (const k of Object.keys(byOnt)) out[k] = Array.from(byOnt[k]);
  return out;
}

function getOntologyRecord(ontKey, id, ctx) {
  if (!ctx) return null;
  const idNum = +id;
  if (ontKey === 'taxonomy') {
    const t = ctx.taxonomy;
    return (t && t[idNum]) || null;
  }
  if (ontKey === 'pathways') {
    const p = ctx.pathways;
    return (p && p[idNum]) || null;
  }
  const bucket = ctx.ontologies && ctx.ontologies[ontKey];
  return (bucket && bucket[idNum]) || null;
}

// Returns list of ancestor ids *excluding* self.
function ancestorsOfRecord(ontKey, record, docTaxonId, ctx) {
  if (!record) return null;
  if (ontKey === 'taxonomy') {
    const visited = new Set();
    const stack = Array.isArray(record.is_a) ? record.is_a.slice() : [];
    const taxonomy = (ctx && ctx.taxonomy) || {};
    while (stack.length) {
      const pid = +stack.pop();
      if (visited.has(pid)) continue;
      visited.add(pid);
      const parent = taxonomy[pid];
      if (parent && Array.isArray(parent.is_a)) {
        for (const g of parent.is_a) if (!visited.has(+g)) stack.push(g);
      }
    }
    return Array.from(visited);
  }
  if (ontKey === 'pathways') {
    const taxonKey = docTaxonId != null ? `ancestors_${docTaxonId}` : null;
    let arr = taxonKey && record[taxonKey];
    if (!Array.isArray(arr)) {
      const collected = new Set();
      for (const k of Object.keys(record)) {
        if (k.startsWith('ancestors_') && Array.isArray(record[k])) {
          for (const a of record[k]) collected.add(+a);
        }
      }
      arr = Array.from(collected);
    }
    return arr.filter(x => +x !== +record._id);
  }
  // GO / PO / TO / domains — `ancestors` already includes self
  if (Array.isArray(record.ancestors)) {
    return record.ancestors.filter(x => +x !== +record._id);
  }
  return [];
}

export function mostSpecific(ontKey, ids, docTaxonId, ctx) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const ancestorSet = new Set();
  let anyResolved = false;
  for (const id of ids) {
    const rec = getOntologyRecord(ontKey, id, ctx);
    if (!rec || rec.missing) continue;
    anyResolved = true;
    const anc = ancestorsOfRecord(ontKey, rec, docTaxonId, ctx);
    if (!anc) continue;
    for (const a of anc) ancestorSet.add(+a);
  }
  if (!anyResolved) return ids.slice();
  return ids.filter(id => !ancestorSet.has(+id));
}

function displayIdAndName(ontKey, id, ctx) {
  const rec = getOntologyRecord(ontKey, id, ctx);
  if (!rec || rec.missing) return { id: String(id), name: '' };
  const displayId = rec.id != null ? String(rec.id) : String(rec._id != null ? rec._id : id);
  let name = rec.name || '';
  if (ontKey === 'taxonomy' && !name) name = rec.display_name || '';
  return { id: displayId, name: String(name) };
}

export function formatAncestorsCellTSV(ontKey, ids, docTaxonId, ctx) {
  const specific = mostSpecific(ontKey, ids, docTaxonId, ctx);
  return specific.map(id => {
    const { id: disp, name } = displayIdAndName(ontKey, id, ctx);
    return name ? `${disp} ${name}` : disp;
  }).join(';');
}

export function formatAncestorsJSON(ontKey, ids, docTaxonId, ctx) {
  const specific = mostSpecific(ontKey, ids, docTaxonId, ctx);
  return specific.map(id => displayIdAndName(ontKey, id, ctx));
}

function termTypeForRecord(ontKey, rec) {
  if (!rec) return '';
  if (ontKey === 'GO') return rec.namespace || rec.type || '';
  if (ontKey === 'taxonomy') return rec.rank || '';
  return rec.type || rec.namespace || '';
}

// Expand a doc's selected ancestor fields into rows of
// { hierarchy, term_id, term_name, term_type }, one per most-specific term.
export function resolveAncestorsForDoc(doc, ancestorFields, ctx) {
  const rows = [];
  for (const fieldName of ancestorFields) {
    const ontKey = ANCESTOR_FIELD_MAP[fieldName];
    if (!ontKey) continue;
    const ids = Array.isArray(doc[fieldName]) ? doc[fieldName] : [];
    if (!ids.length) continue;
    const specific = mostSpecific(ontKey, ids, doc.taxon_id, ctx);
    const hierarchy = ANCESTOR_HIERARCHY_LABEL[fieldName] || fieldName;
    for (const id of specific) {
      const rec = getOntologyRecord(ontKey, id, ctx);
      const { id: disp, name } = displayIdAndName(ontKey, id, ctx);
      rows.push({
        hierarchy,
        term_id: disp,
        term_name: name,
        term_type: termTypeForRecord(ontKey, rec)
      });
    }
  }
  return rows;
}

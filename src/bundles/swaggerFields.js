import { createAsyncResourceBundle, createSelector } from 'redux-bundler';
import overlay from '../fieldCatalog.overlay.json';
import { study_info as VEP_STUDY_INFO } from '../vepStudyInfo';

const SAMPLE_QUERY = 'capabilities:expression';
const SAMPLE_ROWS = 500;
const DIFFEXPR_FL = 'id,*_pval_attr_f,*_logfc_attr_f,*_l2fc_attr_f';
const DIFFEXPR_ROWS_PER_TAXON = 50;

function applyTemplate(tpl, match) {
  if (!tpl) return null;
  return tpl.replace(/\$(\d+)/g, (_, n) => match[+n] || '');
}

function vepDetailLabel(matchGroups) {
  const [, , system, sid] = matchGroups || [];
  const info = (VEP_STUDY_INFO[system] || {})[sid];
  if (info) return info.label;
  return `${system}/${sid}`;
}

function vepDetailTsvHeader(matchGroups) {
  const [conseq, zyg, system, sid] = matchGroups || [];
  const info = (VEP_STUDY_INFO[system] || {})[sid];
  const type = (info && info.type) || '?';
  const study = (info && info.label) || `${system}/${sid}`;
  return `${type}·${conseq}·${zyg}·${study}`;
}

function vepMergedLabel(matchGroups) {
  const [kind] = matchGroups || [];
  if (kind === 'NAT') return 'Merged natural population accessions';
  if (kind === 'EMS') return 'Merged EMS mutant accessions';
  return `Merged ${kind} accessions`;
}

function vepMergedTsvHeader(matchGroups) {
  const [kind] = matchGroups || [];
  return `merged·${kind}`;
}

function classifyKey(name, patterns) {
  for (const p of patterns) {
    const re = new RegExp(p.match);
    const m = name.match(re);
    if (m) {
      return {
        patternId: p.id,
        group: p.group,
        label: applyTemplate(p.labelTemplate, m) || name,
        multiValued: !!p.multiValued,
        expression: !!p.expression,
        isHidden: !!p.is_hidden,
        matchGroups: m.slice(1)
      };
    }
  }
  return null;
}

function inferType(value) {
  if (value === null || value === undefined) return 'unknown';
  if (Array.isArray(value)) {
    return 'array<' + (value.length ? inferType(value[0]) : 'unknown') + '>';
  }
  return typeof value;
}

function extractSwaggerFields(swagger) {
  const defs = (swagger && swagger.definitions) || {};
  const out = {};
  const collect = (schemaName, prefix = '') => {
    const def = defs[schemaName];
    if (!def || !def.properties) return;
    for (const [prop, spec] of Object.entries(def.properties)) {
      const fullName = prefix ? `${prefix}.${prop}` : prop;
      let type = spec.type || 'object';
      if (spec.$ref) type = 'ref:' + spec.$ref.split('/').pop();
      if (spec.type === 'array') {
        const inner = spec.items || {};
        type = 'array<' + (inner.type || (inner.$ref ? inner.$ref.split('/').pop() : 'unknown')) + '>';
      }
      out[fullName] = {
        name: fullName,
        type,
        description: spec.description || '',
        source: 'swagger'
      };
    }
  };
  collect('Result');
  collect('GeneDocument');
  return out;
}

function buildCatalog(swagger, sampleDocs) {
  const hidden = new Set(overlay.hidden || []);
  const overlayFields = overlay.fields || {};
  const patterns = overlay.patterns || [];
  const groupsMeta = overlay.groups || {};

  const swaggerFields = extractSwaggerFields(swagger);

  // Union keys across sample docs + swagger keys
  const keys = new Set(Object.keys(swaggerFields));
  const sampleValues = {};
  for (const doc of (sampleDocs || [])) {
    for (const [k, v] of Object.entries(doc)) {
      keys.add(k);
      if (!(k in sampleValues)) sampleValues[k] = v;
    }
  }

  const fields = {};
  for (const name of keys) {
    if (hidden.has(name)) continue;

    const overlayEntry = overlayFields[name];
    const classified = overlayEntry ? null : classifyKey(name, patterns);
    if (classified && classified.isHidden) continue;
    const sampleVal = sampleValues[name];
    const sampleType = sampleVal !== undefined ? inferType(sampleVal) : null;
    const swaggerEntry = swaggerFields[name];

    const group = (overlayEntry && overlayEntry.group)
      || (classified && classified.group)
      || (swaggerEntry ? 'core' : 'other');

    let label = (overlayEntry && overlayEntry.label)
      || (classified && classified.label)
      || name;
    let tsvHeader = null;
    if (classified && classified.patternId === 'vep_detail') {
      label = vepDetailLabel(classified.matchGroups);
      tsvHeader = vepDetailTsvHeader(classified.matchGroups);
    } else if (classified && classified.patternId === 'vep_merged') {
      label = vepMergedLabel(classified.matchGroups);
      tsvHeader = vepMergedTsvHeader(classified.matchGroups);
    }

    const multiValued = (overlayEntry && overlayEntry.multiValued)
      || (classified && classified.multiValued)
      || (sampleType && sampleType.startsWith('array<'))
      || false;

    fields[name] = {
      name,
      label,
      tsvHeader,
      group,
      order: overlayEntry && overlayEntry.order != null ? overlayEntry.order : null,
      description: (overlayEntry && overlayEntry.description) || (swaggerEntry && swaggerEntry.description) || '',
      type: sampleType || (swaggerEntry && swaggerEntry.type) || 'unknown',
      multiValued,
      patternId: classified ? classified.patternId : null,
      matchGroups: classified ? classified.matchGroups : null,
      expression: !!(classified && classified.expression),
      source: overlayEntry ? 'overlay' : (swaggerEntry ? 'swagger' : 'sample')
    };
  }

  // Build groups (explicit overlay.order first, then natural sort by label)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const compareFields = (a, b) => {
    const ao = a.order, bo = b.order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return collator.compare(a.label, b.label);
  };
  const groupIds = new Set(Object.values(fields).map(f => f.group));
  const groups = Array.from(groupIds).map(id => ({
    id,
    label: (groupsMeta[id] && groupsMeta[id].label) || id,
    order: (groupsMeta[id] && groupsMeta[id].order) != null ? groupsMeta[id].order : 50,
    fields: Object.values(fields)
      .filter(f => f.group === id)
      .sort(compareFields)
      .map(f => f.name)
  })).sort((a, b) => a.order - b.order);

  return {
    fetchedAt: Date.now(),
    swaggerInfo: swagger && swagger.info ? swagger.info : null,
    groups,
    fields
  };
}

const grameneFieldCatalog = createAsyncResourceBundle({
  name: 'grameneFieldCatalog',
  actionBaseType: 'GRAMENE_FIELD_CATALOG',
  persist: true,
  staleAfter: 5 * 60 * 1000,
  getPromise: ({ store }) => {
    const api = store.selectGrameneAPI();
    const swaggerUrl = typeof store.selectGrameneSwaggerURL === 'function'
      ? store.selectGrameneSwaggerURL()
      : `${api}/swagger`;
    const sampleUrl = `${api}/search?q=${encodeURIComponent(SAMPLE_QUERY)}&rows=${SAMPLE_ROWS}&fl=*`;
    const experimentsUrl = `${api}/experiments?rows=-1`;
    const mapsUrl = `${api}/maps?rows=-1`;
    return Promise.all([
      fetch(swaggerUrl).then(r => r.json()).catch(() => null),
      fetch(sampleUrl).then(r => r.json()).catch(() => null),
      fetch(experimentsUrl).then(r => r.json()).catch(() => []),
      fetch(mapsUrl).then(r => r.json()).catch(() => [])
    ]).then(([swagger, sample, experiments, maps]) => {
      const docs = (sample && sample.response && sample.response.docs) || [];
      // Determine which species (anchor taxa) have differential experiments,
      // then for each run a narrow discovery query scoped to that species'
      // strain taxa so we actually surface their diffexpr field names.
      const diffTaxa = [...new Set(
        (experiments || [])
          .filter(e => e && e.type === 'Differential' && e.taxon_id)
          .map(e => e.taxon_id)
      )];
      const strainsByAnchor = {};
      for (const m of (maps || [])) {
        const anchor = m && m.anchor_taxon_id;
        if (!anchor) continue;
        (strainsByAnchor[anchor] = strainsByAnchor[anchor] || []).push(m.taxon_id);
      }
      const discoveryFetches = diffTaxa.map(t => {
        const strains = strainsByAnchor[t] || [t];
        const fq = `taxon_id:(${strains.join(' OR ')})`;
        const url = `${api}/search?q=${encodeURIComponent(SAMPLE_QUERY)}`
          + `&rows=${DIFFEXPR_ROWS_PER_TAXON}`
          + `&fl=${encodeURIComponent(DIFFEXPR_FL)}`
          + `&fq=${encodeURIComponent(fq)}`;
        return fetch(url).then(r => r.json()).catch(() => null);
      });
      return Promise.all(discoveryFetches).then(results => {
        const diffDocs = results.flatMap(r => (r && r.response && r.response.docs) || []);
        return buildCatalog(swagger, [...docs, ...diffDocs]);
      });
    });
  }
});

grameneFieldCatalog.reactGrameneFieldCatalog = createSelector(
  'selectGrameneFieldCatalogShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchGrameneFieldCatalog' };
    }
  }
);

function assayFactorLabel(assay) {
  if (!assay) return '';
  const factors = Array.isArray(assay.factor) ? assay.factor : [];
  const labels = factors.map(f => f && f.label).filter(Boolean);
  if (labels.length) return labels.join('; ');
  const chars = Array.isArray(assay.characteristic) ? assay.characteristic : [];
  const organ = chars.find(c => c && c.type === 'organism part');
  return (organ && organ.label) || '';
}

function parseTaxonFacet(grameneSearch, grameneMaps) {
  const arr = grameneSearch
    && grameneSearch.facet_counts
    && grameneSearch.facet_counts.facet_fields
    && grameneSearch.facet_counts.facet_fields.taxon_id;
  if (!Array.isArray(arr) || !arr.length) return null;
  // Search taxon_ids are strain-specific (e.g. 3702001); experiments use
  // species-level NCBI taxon_ids (e.g. 3702). Map via grameneMaps.anchor_taxon_id.
  // If maps aren't loaded yet, skip filtering rather than drop everything.
  if (!grameneMaps || !Object.keys(grameneMaps).length) return null;
  const speciesTaxa = new Set();
  for (let i = 0; i < arr.length; i += 2) {
    const tid = arr[i];
    if (arr[i + 1] <= 0) continue;
    const map = grameneMaps[tid];
    const anchor = map && map.anchor_taxon_id;
    speciesTaxa.add(Number(anchor || tid));
  }
  return speciesTaxa.size ? speciesTaxa : null;
}

function buildExperimentTaxonIndex(expressionStudies) {
  const index = {};
  if (!expressionStudies) return index;
  for (const [taxon, arr] of Object.entries(expressionStudies)) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) if (e && e._id) index[e._id] = Number(taxon);
  }
  return index;
}

function buildExperimentTitleIndex(expressionStudies) {
  const index = {};
  if (!expressionStudies) return index;
  for (const arr of Object.values(expressionStudies)) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (e && e._id) index[e._id] = e.description || e.title || '';
    }
  }
  return index;
}

function buildSpeciesNameIndex(grameneMaps) {
  const idx = {};
  if (!grameneMaps) return idx;
  for (const m of Object.values(grameneMaps)) {
    if (m && m.anchor_taxon_id && !idx[m.anchor_taxon_id]) {
      idx[m.anchor_taxon_id] = m.display_name || String(m.anchor_taxon_id);
    }
  }
  return idx;
}

function fieldExperimentId(name) {
  let m = name.match(/^(\w+?)_g\d+__expr$/);
  if (m) return m[1].replace(/_/g, '-');
  m = name.match(/^(\w+?)_g\d+_g\d+_(pval|logfc|l2fc)_attr_[a-z]$/);
  if (m) return m[1].replace(/_/g, '-');
  return null;
}

const STAT_RANK = { l2fc: 0, logfc: 1, pval: 2 };

function collapseDiffExprInSubgroups(subgroups, fieldsOut, collator) {
  for (const taxGroup of subgroups) {
    for (const expGroup of (taxGroup.subgroups || [])) {
      const contrastMap = new Map();
      const others = [];
      for (const name of (expGroup.fields || [])) {
        const f = fieldsOut[name];
        if (!f || f.patternId !== 'diffexpr') { others.push(name); continue; }
        const mg = f.matchGroups || [];
        const key = `${mg[1]}|${mg[2]}`;
        let arr = contrastMap.get(key);
        if (!arr) { arr = []; contrastMap.set(key, arr); }
        arr.push(name);
      }
      const newFields = [...others];
      for (const names of contrastMap.values()) {
        if (names.length === 1) { newFields.push(names[0]); continue; }
        names.sort((a, b) => {
          const ra = STAT_RANK[(fieldsOut[a].matchGroups || [])[3]] ?? 99;
          const rb = STAT_RANK[(fieldsOut[b].matchGroups || [])[3]] ?? 99;
          if (ra !== rb) return ra - rb;
          return collator.compare(a, b);
        });
        const rep = names[0];
        const repEntry = fieldsOut[rep];
        const label = (repEntry.label || rep).replace(/\s+\((?:pval|logfc|l2fc)\)/, '');
        fieldsOut[rep] = { ...repEntry, label, linkedFields: names.slice() };
        newFields.push(rep);
      }
      expGroup.fields = newFields;
    }
  }
}

function buildExpressionSubgroups(fieldNames, fieldsOut, experimentTaxa, experimentTitles, speciesNames, collator) {
  const byTaxon = new Map();
  const orphans = [];
  const studiesLoaded = Object.keys(experimentTaxa).length > 0;
  for (const name of fieldNames) {
    const expId = fieldExperimentId(name);
    if (!expId) { orphans.push(name); continue; }
    const taxon = experimentTaxa[expId];
    if (!taxon) {
      if (studiesLoaded) continue;
      orphans.push(name);
      continue;
    }
    let taxonEntry = byTaxon.get(taxon);
    if (!taxonEntry) {
      taxonEntry = new Map();
      byTaxon.set(taxon, taxonEntry);
    }
    let expEntry = taxonEntry.get(expId);
    if (!expEntry) {
      expEntry = [];
      taxonEntry.set(expId, expEntry);
    }
    expEntry.push(name);
  }

  const taxonGroups = [];
  for (const [taxon, expMap] of byTaxon) {
    const experiments = [];
    for (const [expId, names] of expMap) {
      names.sort((a, b) => collator.compare(fieldsOut[a].label, fieldsOut[b].label));
      const title = experimentTitles && experimentTitles[expId];
      experiments.push({
        id: 'exp-' + expId,
        label: title ? `${expId} — ${title}` : expId,
        fields: names
      });
    }
    experiments.sort((a, b) => collator.compare(a.label, b.label));
    taxonGroups.push({
      id: 'tax-' + taxon,
      label: speciesNames[taxon] || `taxon ${taxon}`,
      taxon,
      subgroups: experiments
    });
  }
  taxonGroups.sort((a, b) => collator.compare(a.label, b.label));

  return { subgroups: taxonGroups, orphans };
}

function buildVepSubgroups(fieldNames, fieldsOut, collator) {
  const buckets = {
    NAT: { merged: [], byConseq: new Map() },
    EMS: { merged: [], byConseq: new Map() }
  };
  const orphans = [];

  for (const name of fieldNames) {
    const f = fieldsOut[name];
    if (!f) { orphans.push(name); continue; }
    if (f.patternId === 'vep_merged') {
      const kind = (f.matchGroups && f.matchGroups[0]) || '';
      if (buckets[kind]) buckets[kind].merged.push(name);
      else orphans.push(name);
    } else if (f.patternId === 'vep_detail') {
      const mg = f.matchGroups || [];
      const [conseq, zyg, system, sid] = mg;
      const info = (VEP_STUDY_INFO[system] || {})[sid];
      const kind = info && info.type;
      if (!buckets[kind]) { orphans.push(name); continue; }
      let zmap = buckets[kind].byConseq.get(conseq);
      if (!zmap) {
        zmap = new Map();
        buckets[kind].byConseq.set(conseq, zmap);
      }
      let arr = zmap.get(zyg);
      if (!arr) {
        arr = [];
        zmap.set(zyg, arr);
      }
      arr.push(name);
    } else {
      orphans.push(name);
    }
  }

  const kindLabels = { NAT: 'Natural populations', EMS: 'Mutant populations' };
  const subgroups = [];
  for (const kind of ['NAT', 'EMS']) {
    const bucket = buckets[kind];
    if (!bucket.merged.length && bucket.byConseq.size === 0) continue;

    const conseqGroups = [];
    for (const [conseq, zmap] of bucket.byConseq) {
      const zygGroups = [];
      for (const [zyg, names] of zmap) {
        names.sort((a, b) => collator.compare(fieldsOut[a].label, fieldsOut[b].label));
        zygGroups.push({
          id: `lof-${kind}-${conseq}-${zyg}`,
          label: zyg === 'het' ? 'heterozygous' : 'homozygous',
          fields: names
        });
      }
      zygGroups.sort((a, b) => collator.compare(a.label, b.label));
      conseqGroups.push({
        id: `lof-${kind}-${conseq}`,
        label: conseq.replace(/_/g, ' '),
        subgroups: zygGroups
      });
    }
    conseqGroups.sort((a, b) => collator.compare(a.label, b.label));

    bucket.merged.sort((a, b) => collator.compare(fieldsOut[a].label, fieldsOut[b].label));

    subgroups.push({
      id: `lof-${kind}`,
      label: kindLabels[kind],
      fields: bucket.merged,
      subgroups: conseqGroups
    });
  }

  return { subgroups, orphans };
}

function enrichLabels(catalog, expressionStudies, expressionSamples, grameneSearch, grameneMaps) {
  if (!catalog || !catalog.fields) return catalog;
  if (!expressionSamples) return catalog;

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const taxaInResults = parseTaxonFacet(grameneSearch, grameneMaps);
  const experimentTaxa = buildExperimentTaxonIndex(expressionStudies);
  const experimentTitles = buildExperimentTitleIndex(expressionStudies);
  const dropped = new Set();
  const fieldsOut = {};

  for (const [name, f] of Object.entries(catalog.fields)) {
    if (f.patternId !== 'expr' && f.patternId !== 'diffexpr') {
      fieldsOut[name] = f;
      continue;
    }
    const mg = f.matchGroups || [];
    const experimentSolr = mg[0];
    if (!experimentSolr) { fieldsOut[name] = f; continue; }
    const experimentId = experimentSolr.replace(/_/g, '-');

    if (taxaInResults) {
      const expTaxon = experimentTaxa[experimentId];
      if (expTaxon && !taxaInResults.has(expTaxon)) {
        dropped.add(name);
        continue;
      }
    }

    const assays = expressionSamples[experimentId] || [];
    let newLabel = f.label;
    if (f.patternId === 'expr') {
      const g = 'g' + mg[1];
      const assay = assays.find(a => a && a.group === g);
      const desc = assayFactorLabel(assay);
      newLabel = desc ? `${experimentId} ${g}: ${desc}` : `${experimentId} ${g}`;
    } else {
      const gA = 'g' + mg[1];
      const gB = 'g' + mg[2];
      const metric = mg[3];
      const aA = assays.find(a => a && a.group === gA);
      const aB = assays.find(a => a && a.group === gB);
      const dA = assayFactorLabel(aA);
      const dB = assayFactorLabel(aB);
      const pair = dA && dB ? `: ${dA} vs ${dB}` : '';
      newLabel = `${experimentId} ${gA} vs ${gB} (${metric})${pair}`;
    }

    fieldsOut[name] = newLabel !== f.label ? { ...f, label: newLabel } : f;
  }

  // Synthesize any expr fields missing from catalog.fields using the complete
  // assays collection. The doc-sample only surfaces expr keys that happened to
  // appear in the sampled genes; assays is authoritative per-experiment.
  const synthesized = [];
  for (const [experimentId, assays] of Object.entries(expressionSamples)) {
    if (taxaInResults) {
      const expTaxon = experimentTaxa[experimentId];
      if (expTaxon && !taxaInResults.has(expTaxon)) continue;
    }
    const solrPrefix = experimentId.replace(/-/g, '_');
    for (const assay of assays) {
      if (!assay || !assay.group) continue;
      const name = `${solrPrefix}_${assay.group}__expr`;
      if (fieldsOut[name]) continue;
      const desc = assayFactorLabel(assay);
      fieldsOut[name] = {
        name,
        label: desc ? `${experimentId} ${assay.group}: ${desc}` : `${experimentId} ${assay.group}`,
        group: 'expression',
        description: '',
        type: 'array<float>',
        multiValued: true,
        patternId: 'expr',
        matchGroups: [solrPrefix, assay.group.replace(/^g/, '')],
        expression: true,
        source: 'assays'
      };
      synthesized.push(name);
    }
  }

  const speciesNames = buildSpeciesNameIndex(grameneMaps);

  const groups = catalog.groups.map(g => {
    let list = dropped.size ? g.fields.filter(n => !dropped.has(n)) : g.fields;
    if (g.id === 'expression' && synthesized.length) {
      const existing = new Set(list);
      list = [...list, ...synthesized.filter(n => !existing.has(n))];
    }
    if (g.id === 'lof') {
      const { subgroups, orphans } = buildVepSubgroups(list, fieldsOut, collator);
      orphans.sort((a, b) => collator.compare(fieldsOut[a].label, fieldsOut[b].label));
      return { ...g, fields: orphans, subgroups };
    }
    if (g.id !== 'expression' && g.id !== 'differential') {
      return list === g.fields ? g : { ...g, fields: list };
    }
    const { subgroups, orphans } = buildExpressionSubgroups(
      list, fieldsOut, experimentTaxa, experimentTitles, speciesNames, collator
    );
    if (g.id === 'differential') {
      collapseDiffExprInSubgroups(subgroups, fieldsOut, collator);
    }
    orphans.sort((a, b) => collator.compare(fieldsOut[a].label, fieldsOut[b].label));
    return { ...g, fields: orphans, subgroups };
  });

  return { ...catalog, fields: fieldsOut, groups };
}

grameneFieldCatalog.selectFieldCatalog = createSelector(
  'selectGrameneFieldCatalog',
  'selectExpressionStudies',
  'selectExpressionSamples',
  'selectGrameneSearch',
  'selectGrameneMaps',
  enrichLabels
);

grameneFieldCatalog.selectFieldCatalogGroups = createSelector(
  'selectFieldCatalog',
  (catalog) => (catalog && catalog.groups) || []
);

grameneFieldCatalog.selectFieldCatalogByName = createSelector(
  'selectFieldCatalog',
  (catalog) => (catalog && catalog.fields) || {}
);

export default grameneFieldCatalog;

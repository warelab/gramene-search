import React, { useMemo, useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';

// Sequences that aren't a placed chromosome. Excluded from the dropdown because
// an interval on them is not something a user can reason about positionally.
// Organelles (C, M, Mt, Pt, mitochondrion_genome) are deliberately kept — they
// are real, coordinate-addressable sequences.
const UNPLACED = /^(unanchored|u)$/i;

/** Genome options: the site's reference first, then other anchors, then the rest. */
export function buildGenomeOptions(grameneMaps, targetTaxonId) {
  const genomes = Object.values(grameneMaps || {}).filter(m => m && m._id && m.regions);
  const byLabel = (a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''));
  const reference = genomes.filter(m => String(m.taxon_id) === String(targetTaxonId));
  const refIds = new Set(reference.map(m => m.taxon_id));
  const anchors = genomes.filter(m => m.is_anchor && !refIds.has(m.taxon_id)).sort(byLabel);
  const anchorIds = new Set(anchors.map(m => m.taxon_id));
  const rest = genomes
    .filter(m => !refIds.has(m.taxon_id) && !anchorIds.has(m.taxon_id))
    .sort(byLabel);
  return { reference, anchors, rest };
}

/** Placed chromosomes for one genome, in the order the assembly reports them. */
export function chromosomesOf(genome) {
  const regions = (genome && genome.regions) || {};
  const names = regions.names || [];
  const lengths = regions.lengths || [];
  return names
    .map((name, i) => ({ name, length: lengths[i] }))
    .filter(r => !UNPLACED.test(String(r.name)));
}

/**
 * The interval fields themselves, without any surrounding chrome, so the same
 * form serves both "add a new interval" and "edit an existing one".
 *
 * `initial` pre-populates it — {map, region, start, end} as parsed off a filter.
 */
export const IntervalFields = ({ grameneMaps, targetTaxonId, initial, submitLabel, onSubmit, onCancel }) => {
  const [taxonId, setTaxonId] = useState('');
  const [region, setRegion] = useState(initial ? String(initial.region) : '');
  const [start, setStart] = useState(initial ? String(initial.start) : '');
  const [end, setEnd] = useState(initial ? String(initial.end) : '');

  const { reference, anchors, rest } = useMemo(
    () => buildGenomeOptions(grameneMaps, targetTaxonId),
    [grameneMaps, targetTaxonId]
  );

  // An edit starts on the filter's own genome; a new interval starts on the
  // site's reference. `initial.map` is an assembly accession, so find its genome.
  const initialTaxon = useMemo(() => {
    if (!initial) return '';
    const hit = Object.values(grameneMaps || {}).find(m => m && m._id === initial.map);
    return hit ? String(hit.taxon_id) : '';
  }, [initial, grameneMaps]);

  const effectiveTaxon = taxonId
    || initialTaxon
    || (reference[0] && String(reference[0].taxon_id))
    || '';
  const genome = effectiveTaxon ? (grameneMaps || {})[effectiveTaxon] : null;
  const chromosomes = useMemo(() => chromosomesOf(genome), [genome]);
  const effectiveRegion = region || (chromosomes[0] && chromosomes[0].name) || '';
  const chrLength = (chromosomes.find(c => String(c.name) === String(effectiveRegion)) || {}).length;

  const s = start === '' ? null : Number(start);
  const e = end === '' ? null : Number(end);

  // Validated against the assembly's own region lengths, so the message can name
  // the actual limit rather than just refusing.
  const error = (() => {
    if (!genome || s === null || e === null) return null;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return 'Positions must be numbers.';
    if (s < 1 || e < 1) return 'Positions start at 1.';
    if (s > e) return 'Start must not be greater than end.';
    if (chrLength && e > chrLength) {
      return `${effectiveRegion} is ${chrLength.toLocaleString()} bp; end is beyond it.`;
    }
    return null;
  })();

  const ready = !!genome && !!effectiveRegion && s !== null && e !== null && !error;

  const submit = () => {
    if (!ready) return;
    onSubmit({
      map: genome._id,
      mapLabel: genome.display_name || genome._id,
      region: effectiveRegion,
      start: s,
      end: e
    });
    if (!initial) { setStart(''); setEnd(''); }
  };

  const genomeOption = (m) => (
    <option key={m.taxon_id} value={m.taxon_id}>{m.display_name || m.system_name}</option>
  );

  return (
    <div className="gramene-interval-form">
      <Form.Select size="sm" className="mb-1" value={effectiveTaxon}
                   onChange={(ev) => { setTaxonId(ev.target.value); setRegion(''); }}>
        {reference.map(genomeOption)}
        {anchors.length > 0 && <optgroup label="Reference genomes">{anchors.map(genomeOption)}</optgroup>}
        {rest.length > 0 && <optgroup label="Other genomes">{rest.map(genomeOption)}</optgroup>}
      </Form.Select>

      <Form.Select size="sm" className="mb-1" value={effectiveRegion}
                   onChange={(ev) => setRegion(ev.target.value)}>
        {chromosomes.map(c => (
          <option key={c.name} value={c.name}>
            {c.name}{c.length ? ` (${Math.round(c.length / 1e6)} Mb)` : ''}
          </option>
        ))}
      </Form.Select>

      <div className="gramene-interval-range">
        <Form.Control size="sm" type="number" min="1" placeholder="start"
                      value={start} onChange={(ev) => setStart(ev.target.value)} />
        <span className="gramene-interval-dash">–</span>
        <Form.Control size="sm" type="number" min="1" placeholder="end"
                      value={end} onChange={(ev) => setEnd(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') submit(); }} />
      </div>

      {error && <div className="gramene-interval-error">{error}</div>}

      <div className="gramene-interval-actions">
        <Button size="sm" variant="primary" className="gramene-interval-submit"
                disabled={!ready} onClick={submit}>
          {submitLabel || 'Add interval'}
        </Button>
        {onCancel && (
          <Button size="sm" variant="link" className="gramene-interval-cancel" onClick={onCancel}>
            cancel
          </Button>
        )}
      </div>
    </div>
  );
};

/** The collapsible "Add genomic interval" entry at the foot of the Filters panel. */
const GenomicIntervalForm = ({ grameneMaps, targetTaxonId, onAdd }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="gramene-interval">
      <div className="gramene-interval-toggle" onClick={() => setOpen(!open)}>
        {open ? <BsChevronDown /> : <BsChevronRight />} Add genomic interval
      </div>
      {open && (
        <IntervalFields grameneMaps={grameneMaps} targetTaxonId={targetTaxonId} onSubmit={onAdd} />
      )}
    </div>
  );
};

export default GenomicIntervalForm;

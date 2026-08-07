import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { IntervalFields } from './GenomicIntervalForm';
import {
  parseIntervalValue, formatIntervalValue, intervalName,
  parseRangeValue, formatRangeValue, editorKindFor
} from '../bundles/filters';

/**
 * Edit one filter leaf in place, with a form shaped to what that leaf actually is:
 * a genomic interval gets the genome/chromosome/start/end fields, a `[lo TO hi]`
 * range gets two number boxes, anything else gets its raw value.
 *
 * Groups are not editable — their only parameter is the operator, which the menu
 * already exposes as "convert to".
 *
 * The plain-value case is honest but limited: many leaves carry an opaque id (a
 * pathway number, an ontology term, a saved-search hash) whose replacement a user
 * has no way to know. It is offered because a typo in a gene name or a term is
 * worth fixing without deleting and starting over.
 */
const FilterEditor = ({ node, grameneMaps, targetTaxonId, onSave, onCancel }) => {
  const kind = editorKindFor(node);
  const range = kind === 'range' ? parseRangeValue(node.fq_value) : null;
  const [lo, setLo] = useState(range ? range.lo : '');
  const [hi, setHi] = useState(range ? range.hi : '');
  const [value, setValue] = useState(kind === 'value' ? String(node.fq_value ?? '') : '');

  if (!kind) return null;

  if (kind === 'interval') {
    const initial = parseIntervalValue(node.fq_value);
    return (
      <div className="gramene-filter-editor">
        <IntervalFields
          grameneMaps={grameneMaps}
          targetTaxonId={targetTaxonId}
          initial={initial}
          submitLabel="Save"
          onCancel={onCancel}
          onSubmit={(iv) => onSave(formatIntervalValue(iv), intervalName(iv))}
        />
      </div>
    );
  }

  if (kind === 'range') {
    const ok = lo !== '' && hi !== '';
    const save = () => { if (ok) onSave(formatRangeValue(lo, hi), `${lo}-${hi}`); };
    return (
      <div className="gramene-filter-editor">
        <div className="gramene-interval-range">
          <Form.Control size="sm" value={lo} onChange={(e) => setLo(e.target.value)} placeholder="from" />
          <span className="gramene-interval-dash">–</span>
          <Form.Control size="sm" value={hi} onChange={(e) => setHi(e.target.value)} placeholder="to"
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </div>
        <div className="gramene-interval-actions">
          <Button size="sm" variant="primary" className="gramene-interval-submit"
                  disabled={!ok} onClick={save}>Save</Button>
          <Button size="sm" variant="link" className="gramene-interval-cancel" onClick={onCancel}>cancel</Button>
        </div>
      </div>
    );
  }

  const ok = String(value).trim() !== '';
  // Keep the node's own label in step with its value, unless the label was
  // something other than the value to begin with (a suggestion's display name),
  // in which case leave it alone rather than overwriting it with a raw id.
  const save = () => {
    if (!ok) return;
    const v = String(value).trim();
    const nameFollowedValue = String(node.name ?? '') === String(node.fq_value ?? '');
    onSave(v, nameFollowedValue ? v : undefined);
  };
  return (
    <div className="gramene-filter-editor">
      <Form.Control size="sm" value={value} onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <div className="gramene-interval-actions">
        <Button size="sm" variant="primary" className="gramene-interval-submit"
                disabled={!ok} onClick={save}>Save</Button>
        <Button size="sm" variant="link" className="gramene-interval-cancel" onClick={onCancel}>cancel</Button>
      </div>
    </div>
  );
};

export default FilterEditor;

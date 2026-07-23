import React, { useState } from 'react';
import { connect } from 'redux-bundler-react';
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';
import { FACET_GROUPS } from '../../bundles/facetCounts';
import './styles.css';

// How many values to show per group before a "show N more" toggle. GRASSIUS has
// ~90 TF families, so an uncapped list would swamp the sidebar.
const INITIAL_VISIBLE = 12;

// Display label for a raw facet value: a per-group override (group.labels) if
// present, else underscores -> spaces. The raw value is still what gets filtered.
const labelFor = (group, value) => (group.labels && group.labels[value]) || String(value).replace(/_/g, ' ');

// One collapsible group = one facet field. Values arrive pre-sorted by count
// (Solr default facet.sort). Clicking a count adds the filter.
const FacetGroup = ({ group, values, onAdd }) => {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? values : values.slice(0, INITIAL_VISIBLE);
  return (
    <div className="facet-group">
      <div className="facet-group-header" onClick={() => setOpen(!open)}>
        <span className="facet-group-caret">{open ? <BsChevronDown /> : <BsChevronRight />}</span>
        <span className="facet-group-title">{group.heading}</span>
        <span className="facet-group-nvals">{values.length}</span>
      </div>
      {open && (
        <div className="facet-group-body">
          {values.length === 0 && <div className="facet-empty">none in this result set</div>}
          {shown.map(({ value, count }) => {
            const label = labelFor(group, value);
            return (
              <div className="facet-row" key={value}>
                <span className="facet-val" title={label}>{label}</span>
                <button
                  type="button"
                  className="facet-count"
                  title={`Add filter: ${group.heading} = ${label}`}
                  onClick={() => onAdd(group.field, group.heading, value, label)}
                >
                  {count.toLocaleString()}
                </button>
              </div>
            );
          })}
          {values.length > INITIAL_VISIBLE && (
            <button type="button" className="facet-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'show less' : `show ${values.length - INITIAL_VISIBLE} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const FacetsCmp = (props) => {
  const { facetCounts, configuration, doToggleFacetCounts, doAcceptGrameneSuggestion } = props;
  const open = facetCounts.open;
  const status = facetCounts.status;
  const groups = facetCounts.groups || {};

  const containerClass =
    configuration && configuration.id === 'sorghum' ? 'sorghumbase-facet-container' : 'gramene-facet-container';

  const hasData = FACET_GROUPS.some((g) => (groups[g.field] || []).length > 0);

  const onAdd = (field, heading, value, label) => {
    doAcceptGrameneSuggestion({
      fq_field: field,
      fq_value: value, // raw value, so the Solr query matches
      category: heading,
      name: label, // display label, so the filter chip reads the same as Refine
    });
  };

  return (
    <div className={containerClass}>
      <div className="sidebar-section">
        <div className="sidebar-section-header" onClick={() => doToggleFacetCounts(!open)}>
          <b>Refine</b>
          <span className="sidebar-section-actions">
            <span className="sidebar-section-toggle">{open ? <BsChevronDown /> : <BsChevronRight />}</span>
          </span>
        </div>
        {open && (
          <div className="sidebar-section-body">
            {!hasData && status === 'error' && <div className="facet-status">counts unavailable</div>}
            {!hasData && status !== 'error' && status !== 'ready' && <div className="facet-status">counting…</div>}
            {!hasData && status === 'ready' && (
              <div className="facet-status">no categories for this result set</div>
            )}
            {hasData &&
              FACET_GROUPS.map((g) => (
                <FacetGroup key={g.field} group={g} values={groups[g.field] || []} onAdd={onAdd} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Facets = connect(
  'selectFacetCounts',
  'selectConfiguration',
  'doToggleFacetCounts',
  'doAcceptGrameneSuggestion',
  FacetsCmp
);

export default Facets;

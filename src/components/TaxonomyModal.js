import React from "react";
import { connect } from 'redux-bundler-react'
import { Modal, Button } from "react-bootstrap";
import { BsChevronDown, BsChevronRight } from "react-icons/bs";

// name → subtle background colour. Checked against node.name at render time.
const CLADE_COLORS = {
  "Chlorophyta":        "#e8f5e9",
  "Bryophyta":          "#f1f8e9",
  "Liliopsida":         "#fff8e1", // monocots
  "eudicotyledons":     "#fce4ec",
  "Poaceae":            "#fff3e0",
  "Fabaceae":           "#ede7f6",
  "Brassicaceae":       "#e1f5fe",
  "Solanaceae":         "#ffebee",
};

function findRoots(tax) {
  return Object.values(tax).filter(n =>
    !n.is_a || n.is_a.length === 0 || !n.is_a.some(p => tax[p])
  );
}

// Post-order: attach .leafIds (taxon_ids of maps in subtree) and .isLeaf
function annotate(node, tax, maps) {
  const leafIds = [];
  if (maps[node._id]) { node.isLeaf = true; leafIds.push(node._id); }
  (node.children || []).forEach(cid => {
    const child = tax[cid];
    if (!child) return;
    annotate(child, tax, maps);
    child.leafIds.forEach(id => leafIds.push(id));
  });
  node.leafIds = leafIds;
}

// Walk down the spine through single-child internals until a branch point,
// leaf, or node that is itself a genome.
function compressChain(node, tax, maps) {
  const chain = [node];
  let cur = node;
  while (true) {
    const kids = (cur.children || [])
      .map(cid => tax[cid])
      .filter(c => c && c.leafIds && c.leafIds.length > 0);
    if (kids.length !== 1) break;
    if (maps[cur._id]) break;
    cur = kids[0];
    chain.push(cur);
  }
  return { chain, terminal: cur };
}

// Render a breadcrumb chain. If the chain has more than 3 nodes, collapse the
// middle into a hoverable ellipsis that reveals the hidden names on hover.
const CHAIN_DISPLAY_MAX = 3;
function renderChain(chain) {
  const nameOf = n => n.short_name || n.name;
  if (chain.length <= CHAIN_DISPLAY_MAX) {
    return chain.map((n, i) => (
      <React.Fragment key={n._id}>
        {i > 0 && <span className="tax-sep"> › </span>}
        {nameOf(n)}
      </React.Fragment>
    ));
  }
  const first = chain[0];
  const last = chain[chain.length - 1];
  const middle = chain.slice(1, -1);
  const fullTitle = chain.map(nameOf).join(' › ');
  return (
    <>
      {nameOf(first)}
      <span className="tax-sep"> › </span>
      <span className="tax-ellipsis" title={fullTitle}>
        <span className="tax-ellipsis-short">…</span>
        <span className="tax-ellipsis-full">
          {middle.map(n => (
            <React.Fragment key={n._id}>
              {nameOf(n)}
              <span className="tax-sep"> › </span>
            </React.Fragment>
          ))}
        </span>
      </span>
      <span className="tax-sep"> › </span>
      {nameOf(last)}
    </>
  );
}

// Drop a parent when its single child has the same name (e.g. species node
// above a subspecies-less record that repeats the species name). The terminal
// (last element) is always preserved; only redundant ancestors are removed.
function dedupAdjacent(chain) {
  const out = [];
  for (const n of chain) {
    if (out.length && out[out.length - 1].name === n.name) {
      out[out.length - 1] = n; // keep the child, drop the parent
    } else {
      out.push(n);
    }
  }
  return out;
}

// Use the node's direct `rank` field when it carries a real value.
function getRank(node) {
  const r = node && node.rank;
  return r && r !== 'no rank' ? r : null;
}

// Search nodes whose name or a synonym contains the query. Prefix matches rank higher.
function searchTaxonomy(query, tax) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  Object.values(tax).forEach(n => {
    const name = n.name || '';
    const nameLc = name.toLowerCase();
    if (nameLc.includes(q)) {
      out.push({ node: n, matched: name, via: 'name', prefix: nameLc.startsWith(q) });
      return;
    }
    const syns = n.synonym || [];
    for (const s of syns) {
      const sLc = s.toLowerCase();
      if (sLc.includes(q)) {
        out.push({ node: n, matched: s, via: 'synonym', prefix: sLc.startsWith(q) });
        return;
      }
    }
  });
  out.sort((a, b) =>
    (a.prefix === b.prefix ? 0 : a.prefix ? -1 : 1)
    || a.node.name.localeCompare(b.node.name)
  );
  return out.slice(0, 20);
}

// Compute the { selected, expanded } pair for a fresh modal opening:
// selection is seeded from active genomes (or everything non-hidden),
// and every ancestor of a selected genome is pre-expanded so the user sees
// all of their current selections without manually drilling in.
function computeOpenState(props) {
  const { grameneMaps, grameneTaxonomy, grameneGenomes } = props;
  const activeKeys = Object.keys(grameneGenomes.active || {});
  const seedAll = activeKeys.length === 0;
  const selected = new Set();
  Object.values(grameneMaps || {}).forEach(m => {
    if (m.hidden) return;
    if (seedAll || grameneGenomes.active[m.taxon_id]) selected.add(m.taxon_id);
  });
  const expanded = new Set();
  if (grameneTaxonomy) {
    selected.forEach(tid => {
      let cur = grameneTaxonomy[tid];
      const seen = new Set();
      while (cur && !seen.has(cur._id)) {
        seen.add(cur._id);
        expanded.add(cur._id);
        const pid = cur.is_a && cur.is_a[0];
        cur = pid ? grameneTaxonomy[pid] : null;
      }
    });
  }
  return { selected, expanded };
}

class TaxonomyModal extends React.Component {
  constructor(props) {
    super(props);
    const { grameneMaps, grameneTaxonomy } = props;

    let roots = [];
    if (grameneTaxonomy) {
      roots = findRoots(grameneTaxonomy);
      roots.forEach(r => annotate(r, grameneTaxonomy, grameneMaps));
    }

    const { selected, expanded } = computeOpenState(props);
    this.state = {
      selected,
      expanded,
      roots,
      query: '',
      highlightId: null,
      activeIdx: 0,
    };
    this.rowRefs = {};
    this._matches = [];
    this._activeHitEl = null;
  }

  handleQueryChange(e) {
    this.setState({ query: e.target.value, activeIdx: 0 });
  }

  handleSearchKeyDown(e) {
    const n = this._matches.length;
    if (e.key === 'ArrowDown') {
      if (n === 0) return;
      e.preventDefault();
      this.setState({ activeIdx: Math.min(this.state.activeIdx + 1, n - 1) });
    } else if (e.key === 'ArrowUp') {
      if (n === 0) return;
      e.preventDefault();
      this.setState({ activeIdx: Math.max(this.state.activeIdx - 1, 0) });
    } else if (e.key === 'Enter') {
      if (n === 0) return;
      e.preventDefault();
      const hit = this._matches[this.state.activeIdx] || this._matches[0];
      if (hit) this.pickMatch(hit.node);
    } else if (e.key === 'Escape') {
      if (this.state.query) {
        e.preventDefault();
        this.setState({ query: '', activeIdx: 0 });
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    // On each hidden→shown transition, reseed selection from current active
    // genomes and expand every ancestor so selected taxa are visible.
    const wasShown = prevProps.grameneGenomes && prevProps.grameneGenomes.show;
    const isShown = this.props.grameneGenomes && this.props.grameneGenomes.show;
    if (!wasShown && isShown) {
      const { selected, expanded } = computeOpenState(this.props);
      this.setState({ selected, expanded, query: '', activeIdx: 0, highlightId: null });
    }
    // Keep the highlighted hit scrolled into view inside the dropdown.
    if (prevState.activeIdx !== this.state.activeIdx && this._activeHitEl) {
      this._activeHitEl.scrollIntoView({ block: 'nearest' });
    }
  }

  pickMatch(node) {
    // Expand every ancestor so the node is visible, then scroll + flash.
    const { grameneTaxonomy } = this.props;
    const expanded = new Set(this.state.expanded);
    let cur = node;
    const seen = new Set();
    while (cur && !seen.has(cur._id)) {
      seen.add(cur._id);
      expanded.add(cur._id);
      const pid = cur.is_a && cur.is_a[0];
      cur = pid ? grameneTaxonomy[pid] : null;
    }
    this.setState({ expanded, query: '', highlightId: node._id }, () => {
      const el = this.rowRefs[node._id];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      clearTimeout(this._hlTimer);
      this._hlTimer = setTimeout(() => this.setState({ highlightId: null }), 1800);
    });
  }

  toggleExpand(id) {
    const expanded = new Set(this.state.expanded);
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    this.setState({ expanded });
  }

  toggleLeaf(taxonId) {
    const selected = new Set(this.state.selected);
    selected.has(taxonId) ? selected.delete(taxonId) : selected.add(taxonId);
    this.setState({ selected });
  }

  toggleSubtree(terminal) {
    const selected = new Set(this.state.selected);
    const allOn = terminal.leafIds.every(id => selected.has(id));
    terminal.leafIds.forEach(id => allOn ? selected.delete(id) : selected.add(id));
    this.setState({ selected });
  }

  selectAll() {
    const s = new Set();
    Object.values(this.props.grameneMaps).forEach(m => {
      if (!m.hidden) s.add(m.taxon_id);
    });
    this.setState({ selected: s });
  }

  selectNone() {
    this.setState({ selected: new Set() });
  }

  handleClose() {
    const active = {};
    this.state.selected.forEach(id => { active[id] = true; });
    if (Object.keys(active).length === 0) {
      Object.values(this.props.grameneMaps).forEach(m => {
        if (!m.hidden) active[m.taxon_id] = true;
      });
    }
    this.props.doUpdateGrameneGenomes(active);
  }

  renderNode(node, depth, inheritedColor) {
    const { grameneTaxonomy, grameneMaps } = this.props;
    const { selected, expanded } = this.state;

    const { chain: rawChain, terminal } = compressChain(node, grameneTaxonomy, grameneMaps);
    const chain = dedupAdjacent(rawChain);
    const leafIds = terminal.leafIds;
    if (leafIds.length === 0) return null;

    const selCount = leafIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0);
    const total = leafIds.length;
    const allOn = selCount === total;
    const someOn = selCount > 0 && !allOn;

    const visibleKids = (terminal.children || [])
      .map(cid => grameneTaxonomy[cid])
      .filter(c => c && c.leafIds.length > 0);
    const hasKids = visibleKids.length > 0;
    const terminalIsGenome = !!grameneMaps[terminal._id];

    const isOpen = expanded.has(terminal._id);

    // Deepest clade colour in the chain wins; falls back to inherited.
    const color = chain.reduce(
      (acc, n) => CLADE_COLORS[n.name] || acc,
      inheritedColor
    );

    const isHighlighted = rawChain.some(n => n._id === this.state.highlightId);

    return (
      <div
        key={terminal._id}
        className={"tax-node" + (isHighlighted ? " tax-node-highlight" : "")}
        style={{ background: color }}
        ref={el => {
          // Register every traversed node (including dedupped-away parents) so
          // search results targeting any ancestor still scroll to this row.
          rawChain.forEach(n => { this.rowRefs[n._id] = el; });
        }}
      >
        <div className="tax-row" style={{ paddingLeft: depth * 7 }}>
          {hasKids ? (
            <span
              className="tax-chevron"
              onClick={() => this.toggleExpand(terminal._id)}
            >
              {isOpen ? <BsChevronDown/> : <BsChevronRight/>}
            </span>
          ) : (
            <span className="tax-chevron-spacer"/>
          )}

          <input
            type="checkbox"
            checked={allOn}
            ref={el => { if (el) el.indeterminate = someOn; }}
            onChange={() => {
              if (hasKids) this.toggleSubtree(terminal);
              else if (terminalIsGenome) this.toggleLeaf(terminal._id);
            }}
          />
          {' '}
          <span className={hasKids ? "tax-label tax-label-internal" : "tax-label"}>
            {renderChain(chain)}
          </span>

          {(hasKids || terminalIsGenome) && (
            <span className="tax-count"> ({selCount} / {total})</span>
          )}

          {hasKids && terminalIsGenome && (
            <label className="tax-self-leaf">
              <input
                type="checkbox"
                checked={selected.has(terminal._id)}
                onChange={() => this.toggleLeaf(terminal._id)}
              />
              <em>this genome</em>
            </label>
          )}
        </div>

        {hasKids && isOpen && (
          <div className="tax-children">
            {visibleKids.map(c => this.renderNode(c, depth + 1, color))}
          </div>
        )}
      </div>
    );
  }

  render() {
    const { roots } = this.state;
    const { grameneTaxonomy, grameneMaps } = this.props;

    // Hide the root spine: start rendering at the first real branch point.
    const topLevel = [];
    roots.forEach(r => {
      const { terminal } = compressChain(r, grameneTaxonomy || {}, grameneMaps || {});
      (terminal.children || []).forEach(cid => {
        const child = grameneTaxonomy && grameneTaxonomy[cid];
        if (child && child.leafIds && child.leafIds.length > 0) {
          topLevel.push(child);
        }
      });
    });

    return (
      <Modal
        show={this.props.grameneGenomes.show}
        onHide={this.handleClose.bind(this)}
        size='lg'
      >
        <Modal.Header closeButton>
          <Modal.Title>Select Genomes of Interest</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="outline-secondary" onClick={this.selectAll.bind(this)}>All</Button>{' '}
          <Button variant="outline-secondary" onClick={this.selectNone.bind(this)}>None</Button>

          {(() => {
            this._matches = this.state.query
              ? searchTaxonomy(this.state.query, grameneTaxonomy || {})
              : [];
            const matches = this._matches;
            const activeIdx = Math.min(this.state.activeIdx, Math.max(0, matches.length - 1));
            return (
              <div className="tax-search">
                <input
                  type="text"
                  className="tax-search-input"
                  placeholder="Find taxon by name or synonym…"
                  value={this.state.query}
                  onChange={this.handleQueryChange.bind(this)}
                  onKeyDown={this.handleSearchKeyDown.bind(this)}
                />
                {this.state.query && (
                  <div className="tax-search-results">
                    {matches.length === 0 ? (
                      <div className="tax-search-empty">No matches</div>
                    ) : matches.map(({ node, matched, via }, i) => {
                      const rank = getRank(node);
                      const count = (node.leafIds && node.leafIds.length) || 0;
                      const isLeaf = !!(grameneMaps && grameneMaps[node._id]);
                      const isActive = i === activeIdx;
                      return (
                        <div
                          key={node._id}
                          ref={el => { if (isActive) this._activeHitEl = el; }}
                          className={"tax-search-hit" + (isActive ? " tax-search-hit-active" : "")}
                          onMouseDown={e => e.preventDefault()}
                          onMouseEnter={() => this.setState({ activeIdx: i })}
                          onClick={() => this.pickMatch(node)}
                        >
                          <span className="tax-search-name">{node.name}</span>
                          {via === 'synonym' && (
                            <span className="tax-search-syn"> {matched} <em>syn.</em></span>
                          )}
                          {rank && <span className="tax-search-rank"> {rank}</span>}
                          {!isLeaf && (
                            <span className="tax-search-count"> · {count} genome{count === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="tax-tree">
            {topLevel.map(n => this.renderNode(n, 0, null))}
          </div>
          <Button onClick={this.handleClose.bind(this)}>Submit</Button>
        </Modal.Body>
      </Modal>
    );
  }
}

export default connect(
  'selectGrameneGenomes',
  'selectGrameneMaps',
  'selectGrameneTaxonomy',
  'doUpdateGrameneGenomes',
  TaxonomyModal
)

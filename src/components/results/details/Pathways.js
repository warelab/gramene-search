import React from 'react'
import {connect} from "redux-bundler-react";
import FlatToNested from 'flat-to-nested';
import {Explore, Links} from "./generic";
// Subpath import avoids gramene-trees-client/index.js, whose require chain
// fires a /swagger fetch at module load (see comment in bundles/api.js).
import taxonomy from "gramene-trees-client/src/taxonomy";
import TreeMenu from "react-simple-tree-menu";
import '../../../../node_modules/react-simple-tree-menu/dist/main.css';

import {Spinner} from "react-bootstrap";
import _ from 'lodash'
import "./tree-view.css"

const reactomeURL = "https://plantreactome.gramene.org";

// The Reactome Diagram library is GWT-compiled and uses a single shared
// GWT iframe + window globals — multiple Reactome.Diagram instances on
// the same page step on each other. We work around this by rendering
// each pathway diagram inside its own <iframe>, so each gets its own
// document + window + Reactome global. The iframe communicates with
// the parent through postMessage.
function buildIframeSrcDoc() {
  const proxy = JSON.stringify(reactomeURL);
  return `<!DOCTYPE html>
<html><head>
  <style>html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;}</style>
  <script async src="${reactomeURL}/DiagramJs/diagram/diagram.nocache.js"><\/script>
</head><body>
  <div id="holder" style="width:100%;height:100%;"></div>
  <script>
  (function(){
    var diagram = null;
    var loadedPathway = null;
    var pendingPathwayId = null;
    var pendingReactionId = null;
    var pendingFlag = null;
    var resizeTimer = null;

    function dimensions() {
      return [
        Math.max(100, document.body.clientWidth),
        Math.max(100, document.body.clientHeight)
      ];
    }

    function whenReady(cb) {
      if (window.Reactome && window.Reactome.Diagram) cb();
      else setTimeout(function(){ whenReady(cb); }, 100);
    }

    function applyLoad() {
      if (!pendingPathwayId) return;
      whenReady(function(){
        if (diagram) {
          try { diagram.detach(); } catch(e) {}
        }
        var dims = dimensions();
        diagram = window.Reactome.Diagram.create({
          proxyPrefix: ${proxy},
          placeHolder: 'holder',
          width: dims[0],
          height: dims[1]
        });
        var pw = pendingPathwayId;
        diagram.loadDiagram(pw);
        diagram.onDiagramLoaded(function(){
          loadedPathway = pw;
          if (pendingFlag) diagram.flagItems(pendingFlag);
          if (pendingReactionId) diagram.selectItem(pendingReactionId);
        });
      });
    }

    window.addEventListener('message', function(e){
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'load') {
        pendingPathwayId = data.pathwayId || null;
        pendingReactionId = data.reactionId || null;
        if (data.flag) pendingFlag = data.flag;
        applyLoad();
      } else if (data.type === 'select') {
        pendingReactionId = data.id || null;
        if (diagram && loadedPathway) {
          if (data.id) diagram.selectItem(data.id);
          else diagram.resetSelection();
        }
      }
    });

    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){
        if (loadedPathway) applyLoad();
      }, 300);
    });
  })();
  <\/script>
</body></html>`;
}

class Pathways extends React.Component {
  constructor(props) {
    super(props);
    this.taxonomy = taxonomy.tree(Object.values(props.grameneTaxonomy))
    this.gene = props.geneDocs[props.searchResult.id];
    this.iframeRef = React.createRef();
    // srcDoc is constant — the per-instance pathway/reaction state is
    // pushed in via postMessage so changing pathway doesn't reload the
    // GWT script.
    this._iframeSrcDoc = buildIframeSrcDoc();
    this._iframeReady = false;
    this.state = {
      treeVisible: true,
      height: 500,
      currentPathwayId: null,
      currentReactionId: null,
    };
  }

  postLoad() {
    const win = this.iframeRef.current && this.iframeRef.current.contentWindow;
    if (!win || !this.state.currentPathwayId) return;
    win.postMessage({
      type: 'load',
      pathwayId: this.state.currentPathwayId,
      reactionId: this.state.currentReactionId,
      flag: this.gene._id,
    }, '*');
  }

  postSelect() {
    const win = this.iframeRef.current && this.iframeRef.current.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'select', id: this.state.currentReactionId || null }, '*');
  }

  handleIframeLoad = () => {
    this._iframeReady = true;
    if (this.state.currentPathwayId) this.postLoad();
  }

  startResize(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = this.state.height;

    const onMouseMove = (moveEvent) => {
      const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
      this.setState({ height: newHeight });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  toggleTree() {
    this.setState({ treeVisible: !this.state.treeVisible });
  }

  stableId(dbId) {
    let prefix = this.taxonomy.indices.id[this.gene.taxon_id].model.reactomePrefix || 'OSA';
    return `R-${prefix}-${dbId}`;
  }

  loadDiagram(pathwayId, reactionId) {
    this.setState({
      currentPathwayId: pathwayId,
      currentReactionId: reactionId || null,
    });
  }

  componentDidMount() {
    // If pathway docs are already cached, build the hierarchy now so the
    // initial render selects a default node (componentDidUpdate would
    // otherwise never run if no redux change follows the mount).
    if (!this.state.hierarchy && this.pathwayIds) {
      const haveDocs = this.pathwayIds.filter(id => this.props.gramenePathways.hasOwnProperty(id));
      if (haveDocs.length === this.pathwayIds.length) {
        const docs = this.pathwayIds.map(id => this.props.gramenePathways[id]);
        this.getHierarchy(this.makeTaxonSpecific(docs, this.gene.taxon_id));
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.hierarchy && !this.state.selectedNode) {
      let node = this.state.hierarchy[0];
      let path = [0];
      while (node.nodes) {
        path.push(0);
        node = node.nodes[0];
      }
      this.loadNodes(path);
    }
    if (!this.state.hierarchy && this.pathwayIds) {
      const haveDocs = this.pathwayIds.filter(id => this.props.gramenePathways.hasOwnProperty(id));
      if (haveDocs.length === this.pathwayIds.length) {
        const docs = this.pathwayIds.map(id => this.props.gramenePathways[id]);
        this.getHierarchy(this.makeTaxonSpecific(docs, this.gene.taxon_id));
      }
    }
    if (this._iframeReady) {
      if (prevState.currentPathwayId !== this.state.currentPathwayId && this.state.currentPathwayId) {
        this.postLoad();
      } else if (prevState.currentReactionId !== this.state.currentReactionId &&
                 prevState.currentPathwayId === this.state.currentPathwayId) {
        this.postSelect();
      }
    }
  }

  componentWillMount() {
    const pathways = this.gene.annotations.pathways;
    if (!pathways) {
      throw new Error("No pathway annotation present for " + this.gene._id);
    }
    this.pathwayIds = _.clone(pathways.ancestors);
    pathways.entries.forEach(reaction => {
      const [, , id] = reaction.id.split('-');
      this.pathwayIds.push(+id);
    });
    this.props.doRequestGramenePathways(this.pathwayIds);
  }

  makeTaxonSpecific(docs, taxon_id) {
    let lineageField = 'lineage_' + taxon_id;
    if (!docs[0].hasOwnProperty(lineageField)) {
      let tid = Math.floor(taxon_id / 1000);
      lineageField = 'lineage_' + tid;
    }
    return docs.map(doc => {
      let tsDoc = _.pick(doc, ['_id', 'name', 'type']);
      tsDoc.lineage = doc[lineageField];
      return tsDoc;
    });
  }

  getHierarchy(docs) {
    const pathways = _.keyBy(docs, '_id');
    const nodes = [];
    this.pathwayIds.forEach(pwyId => {
      if (pathways[pwyId]) {
        const pwy = pathways[pwyId];
        pwy.lineage.forEach(line => {
          const parentOffset = line.length - 2;
          nodes.push({
            id: pwyId,
            key: pwyId,
            label: pwy.name,
            type: pwy.type,
            checkbox: false,
            selected: false,
            parent: parentOffset >= 0 ? line[parentOffset] : undefined,
          });
        });
      }
    });
    const nested = new FlatToNested({ children: 'nodes' }).convert(nodes);
    this.setState({ hierarchy: [nested], selectedNode: undefined });
  }

  possiblyLoadNodes(node) {
    if (!node.selected) {
      let selectedNode = this.state.selectedNode;
      if (selectedNode) selectedNode.selected = false;
      node.selected = true;
      selectedNode = node;
      if (node.type === "Pathway") {
        this.loadDiagram(this.stableId(node.id));
      } else {
        const reaction = this.stableId(node.id);
        const pathway = this.stableId(node.parent.split("/").pop());
        this.loadDiagram(pathway, reaction);
      }
      this.setState({ selectedNode });
    }
  }

  loadNodes(nodes) {
    let hierarchy = this.state.hierarchy;
    let selectedNode = this.state.selectedNode;
    let offset = nodes.shift();
    let nodeRef = hierarchy[offset];
    let lineage = [nodeRef];
    while (nodeRef.nodes) {
      nodeRef = nodeRef.nodes[0];
      lineage.unshift(nodeRef);
    }
    if (lineage[0].id !== 2894885) {
      let pathway = this.stableId(lineage[0].id);
      let reaction = undefined;
      if (lineage[0].type === "Reaction") {
        reaction = pathway;
        pathway = this.stableId(lineage[1].id);
      }
      if (lineage[0].selected) {
        selectedNode = undefined;
        lineage[0].selected = false;
        this.loadDiagram(pathway);
      } else {
        if (selectedNode) selectedNode.selected = false;
        selectedNode = lineage[0];
        lineage[0].selected = true;
        if (reaction) this.loadDiagram(pathway, reaction);
        else this.loadDiagram(pathway);
      }
      this.setState({ hierarchy, selectedNode });
    }
  }

  renderHierarchy() {
    if (this.state.hierarchy) {
      const path = [];
      const allPaths = [];
      let nodes = this.state.hierarchy;
      while (nodes) {
        path.push(nodes[0].key);
        allPaths.push(path.join('/'));
        nodes = nodes[0].nodes ? nodes[0].nodes : undefined;
      }
      return <TreeMenu
        data={this.state.hierarchy}
        hasSearch={false}
        onClickItem={(item) => this.possiblyLoadNodes(item)}
        initialActiveKey={path.join('/')}
        initialOpenNodes={allPaths}
      />;
    }
    return <Spinner/>;
  }

  updateQuery() {
    this.props.doAcceptGrameneSuggestion({
      category: 'Plant Reactome',
      fq_field: 'pathways__ancestors',
      fq_value: this.state.selectedNode.id,
      name: this.state.selectedNode.label,
    });
  }

  render() {
    let reactomeLink, searchFilter;
    if (this.state.selectedNode) {
      const xrefLUT = _.keyBy(this.gene.xrefs, 'db');
      const links = [
        { name: 'Plant Reactome ' + this.state.selectedNode.type, url: `${reactomeURL}/content/detail/${this.stableId(this.state.selectedNode.id)}` }
      ];
      if (xrefLUT.hasOwnProperty('notGramene_Plant_Reactome')) {
        links.push({ name: 'Plant Reactome Gene', url: `${reactomeURL}/content/detail/${xrefLUT.notGramene_Plant_Reactome.ids[0]}` });
      }
      reactomeLink = <Links key="links" links={links}/>;
      const filters = [
        {
          name: `All genes in this ${this.state.selectedNode.type}`,
          handleClick: () => this.updateQuery(),
        },
      ];
      searchFilter = <Explore key="explore" explorations={filters}/>;
    }
    return (
      <div className="pathways-container">
        <div className="pathways-layout" style={{ height: this.state.height }}>
          <button
            className="pathways-tree-toggle"
            onClick={() => this.toggleTree()}
            title={this.state.treeVisible ? 'Hide pathway hierarchy' : 'Show pathway hierarchy'}
          >
            {this.state.treeVisible ? '◀' : '▶'}
          </button>
          {this.state.treeVisible && (
            <div className="pathways-tree-panel">
              {this.renderHierarchy()}
            </div>
          )}
          <div className="pathways-diagram-panel">
            <iframe
              ref={this.iframeRef}
              onLoad={this.handleIframeLoad}
              srcDoc={this._iframeSrcDoc}
              title="Pathway diagram"
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            />
          </div>
        </div>
        <div
          className="pathways-resize-handle"
          onMouseDown={(e) => this.startResize(e)}
          title="Drag to resize"
        />
        {searchFilter}
        {reactomeLink}
      </div>
    );
  }
}

export default connect(
  'selectGrameneTaxonomy',
  'selectGramenePathways',
  'doRequestGramenePathways',
  'doAcceptGrameneSuggestion',
  Pathways
);

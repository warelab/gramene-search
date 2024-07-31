import React from 'react'
import {connect} from "redux-bundler-react";
import FlatToNested from 'flat-to-nested';
import {Explore, Links} from "./generic";
import treesClient from "gramene-trees-client";
// import {TreeMenu} from "react-tree-menu";
import TreeMenu from "react-simple-tree-menu";
import '../../../../node_modules/react-simple-tree-menu/dist/main.css';

import {Spinner} from "react-bootstrap";
import _ from 'lodash'
import "./tree-view.css"

var reactomeURL = "https://plantreactome.gramene.org";

class Pathways extends React.Component {
  constructor(props) {
    super(props);
    this.taxonomy = treesClient.taxonomy.tree(Object.values(props.grameneTaxonomy))
    this.gene = props.geneDocs[props.searchResult.id];
    this.holderId = 'displayHolder' + this.gene._id;
    this.state = {};
  }

  initDiagram() {
    this.diagram = Reactome.Diagram.create({
      proxyPrefix: reactomeURL, //'//plantreactome.gramene.org', //'//plantreactomedev.oicr.on.ca', ////cord3084-pc7.science.oregonstate.edu', // reactomedev.oicr.on.ca
      placeHolder: this.holderId,
      width: this.divWrapper.clientWidth - 350 - 1,
      height: 500
    });
  }

  stableId(dbId) {
    let prefix = this.taxonomy.indices.id[this.gene.taxon_id].model.reactomePrefix || 'OSA';
    return `R-${prefix}-${dbId}`;
  }

  loadDiagram(pathwayId, reactionId) {
    if (!this.diagram) this.initDiagram();
    this.diagram.loadDiagram(pathwayId);

    this.diagram.onDiagramLoaded(function (loaded) {
      this.loadedDiagram = loaded;
      if (reactionId) {
        this.diagram.selectItem(reactionId);
      }
      // var xref = _.find(this.props.gene.xrefs,{db : 'Gramene_Plant_Reactome'}).ids[0];
      this.diagram.flagItems(this.gene._id);
    }.bind(this));
  }

  componentDidMount() {
    if (Reactome && Reactome.Diagram) {
      // this.initDiagram();
    }
    else {
      window.addEventListener('launchDiagram', function (e) {
        // this.initDiagram()
      }.bind(this));
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.hierarchy && ! this.state.selectedNode) {
      let node = this.state.hierarchy[0];
      let path = [0];
      let parent = node;
      while (node.nodes) {
        path.push(0);
        parent = node;
        node = node.nodes[0];
      }
      console.log(parent,node,path);
      this.loadNodes(path);
    }
    if (!this.state.hierarchy && this.pathwayIds) {
      const haveDocs = this.pathwayIds.filter(id => this.props.gramenePathways.hasOwnProperty(id));
      if (haveDocs.length === this.pathwayIds.length) {
        const docs = this.pathwayIds.map(id => this.props.gramenePathways[id]);
        this.getHierarchy(this.makeTaxonSpecific(docs,this.gene.taxon_id));
      }
    }
  }

  componentWillMount() {
    var pathways, reactionId, ancestorIds;
    pathways = this.gene.annotations.pathways;
    if(!pathways) {
      throw new Error("No pathway annotation present for " + this.gene._id);
    }

    this.pathwayIds = _.clone(pathways.ancestors);
    pathways.entries.forEach(function(reaction) {
      let [r,speciesCode,id] = reaction.id.split('-');

      this.pathwayIds.push(+id);
    }.bind(this));

    this.props.doRequestGramenePathways(this.pathwayIds);

    // DocActions.needDocs('pathways', this.pathwayIds, (docs) => { return this.makeTaxonSpecific(docs,this.props.gene.taxon_id)}, this.getHierarchy);
  }

  makeTaxonSpecific(docs,taxon_id) {
    let lineageField = 'lineage_'+taxon_id;
    if (! docs[0].hasOwnProperty(lineageField)) {
      let tid = Math.floor(taxon_id / 1000);
      lineageField = 'lineage_'+tid;
    }
    let tsDocs = docs.map(function(doc) {
      let tsDoc = _.pick(doc,['_id','name','type']);
      tsDoc.lineage = doc[lineageField];
      return tsDoc;
    });
    console.log(tsDocs);
    return tsDocs;
  }

  componentWillUnmount() {
    // DocActions.noLongerNeedDocs('pathways', this.pathwayIds);
    if (this.diagram) this.diagram.detach();
  }

  getHierarchy(docs) {
    let pathways = _.keyBy(docs,'_id');
    let nodes = [];
    this.pathwayIds.forEach(function (pwyId) {
      if (pathways[pwyId]) {
        let pwy = pathways[pwyId];
        pwy.lineage.forEach(function(line) {
          let parentOffset = line.length - 2;
          nodes.push({
            id: pwyId,
            key: pwyId,
            label: pwy.name,
            type: pwy.type,
            checkbox: false,
            selected: false,
            parent: parentOffset >=0 ? line[parentOffset] : undefined
          });
        });
      }
    });

    let nested = new FlatToNested({
      children: 'nodes'
    }).convert(nodes);

    this.setState({hierarchy: [nested], selectedNode: undefined});
  }
  possiblyLoadNodes(node) {
    if (!node.selected) {
      let selectedNode = this.state.selectedNode;
      selectedNode.selected = false;
      node.selected = true;
      selectedNode = node;
      if (node.type === "Pathway") {
        let pathway = this.stableId(node.id);
        this.loadDiagram(pathway);
      }
      else {
        let reaction = this.stableId(node.id);
        let pathway = this.stableId(node.parent.split("/").pop());
        if (this.loadedDiagram === pathway) {
          this.diagram.selectItem(reaction);
        }
        else {
          if (this.diagram) this.diagram.resetSelection();
          this.loadDiagram(pathway,reaction);
        }
      }
      this.setState({selectedNode})
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
        if (this.loadedDiagram === pathway) {
          this.diagram.resetSelection();
        }
        else {
          if (this.diagram) this.diagram.resetSelection();
          this.loadDiagram(pathway);
        }
      }
      else {
        if (selectedNode) {
          selectedNode.selected = false;
        }
        selectedNode = lineage[0];
        lineage[0].selected = true;
        if (this.loadedDiagram === pathway) {
          if (reaction) {
            this.diagram.selectItem(reaction);
          }
          else {
            this.diagram.resetSelection();
          }
        }
        else {
          if (this.diagram) this.diagram.resetSelection();
          if (reaction) {
            this.loadDiagram(pathway, reaction);
          }
          else {
            this.loadDiagram(pathway);
          }
        }
      }
      this.setState({hierarchy: hierarchy, selectedNode: selectedNode});
    }
  }

  renderHierarchy() {
    if (this.state.hierarchy) {
      let path = [];
      let allPaths = [];
      let nodes = this.state.hierarchy;
      while (nodes) {
        path.push(nodes[0].key);
        allPaths.push(path.join('/'));
        if (nodes[0].hasOwnProperty('nodes')) {
          nodes = nodes[0].nodes;
        }
        else {
          nodes = undefined;
        }
      }
      // console.log(path);
      return <TreeMenu
        data={this.state.hierarchy}
        hasSearch={false}
        onClickItem={(item) => this.possiblyLoadNodes(item)}
        onClickItemx={(item) => console.log('onClickItem', item)}
        initialActiveKey={path.join('/')}
        initialOpenNodes={allPaths}
      />;
      // return (
      //   <TreeMenu
      //     data={this.state.hierarchy}
      //     expandIconClass="fa fa-chevron-right"
      //     collapseIconClass="fa fa-chevron-down"
      //     stateful={true}
      //     collapsible={true}
      //     onTreeNodeClick={this.loadNodes.bind(this)}
      //   />
      // );
    }
    return <Spinner/>
  }

  updateQuery() {
    console.log("User asked to filter by "+ this.state.selectedNode.type);

    this.props.doAcceptGrameneSuggestion({
      category: 'Plant Reactome',
      fq_field: 'pathways__ancestors',
      fq_value: this.state.selectedNode.id,
      name: this.state.selectedNode.label
    })
  }

  render() {
    let reactomeLink,searchFilter;

    if (this.state.selectedNode) {
      let xrefLUT = _.keyBy(this.gene.xrefs,'db');
      let links = [
        {name: 'Plant Reactome '+this.state.selectedNode.type, url: `${reactomeURL}/content/detail/${this.stableId(this.state.selectedNode.id)}`}
      ];
      if (xrefLUT.hasOwnProperty('notGramene_Plant_Reactome')) {
        links.push({name: 'Plant Reactome Gene', url: `${reactomeURL}/content/detail/${xrefLUT.notGramene_Plant_Reactome.ids[0]}`});
      }
      reactomeLink = <Links key="links" links={links}/>;
      let filters = [
        {
          name: `All genes in this ${this.state.selectedNode.type}`,
          handleClick: ()=>this.updateQuery()
        }
      ];
      searchFilter = <Explore key="explore" explorations={filters}/>;
    }
    return (
      <div ref={(div) => {this.divWrapper = div;}}>
        <div style={{width:350, height: 500, overflow:'scroll', float:'left'}}>{this.renderHierarchy()}</div>
        <div id={this.holderId}/>
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

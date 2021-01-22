import React from 'react'
import getProp from 'lodash/get';
import isEqual from 'lodash/isEqual';
import {Button} from "react-bootstrap";
import Browser from "./location/browser";
import {connect} from "redux-bundler-react";
import {Detail, Title, Description, Content, Explore, Links} from "./generic";
import '../../../../node_modules/gramene-genetree-vis/src/styles/msa.less';
import '../../../../node_modules/gramene-genetree-vis/src/styles/tree.less';

class Location extends React.Component {
  constructor(props) {
    super(props);
    this.gene = this.props.geneDocs[this.props.searchResult.id];
    this.initRegion();
    this.state = {
      visibleRange: this.initVisibleRange()
    };
  }

  initVisibleRange() {
    var location, span, padding, result;
    location = this.gene.location;
    if(!location) {
      throw new Error(`Could not find the location of the gene in props.`);
    }

    span = location.end - location.start + 1;
    padding = Math.floor(.1 * span);

    result = {
      chr: location.region,
      start: location.start - padding,
      end: location.end + padding
    };

    result.displayName = `${result.chr}:${result.start}-${result.end}`;

    return result;
  }

  initRegion() {
    var region, isChromosome, regionType, regionName;
    region = this.gene.location.region;
    if (region) {
      isChromosome = /^\d+$/.test(region);
      if (isChromosome) {
        regionType = 'chromosome';
        regionName = 'Chromosome ' + region;
      }
      else {
        regionType = 'scaffold';
        regionName = region;
      }
      this.region = {
        isChromsome: isChromosome,
        name: regionName,
        type: regionType
      };
    }
  }


  handleViewChange(chr, start, end) {
    var visibleRange = {
      chr: chr,
      start: start,
      end: end,
      displayName: `${chr}:${start}-${end}`
    };

    if(!isEqual(visibleRange, this.state.visibleRange)) {
      this.setState({
        visibleRange: visibleRange
      });
    }
  }

  updateQuery(restrictToVisibleRange) {
    var location, geneName, visibleRange, filter, filterDisplayName, fq;
    location = this.gene.location;
    geneName = this.gene.name;
    // category: 'Gene Tree',
    //   fq_field: 'gene_tree',
    //   fq_value: this.tree._id,
    //   name: `Homologs of ${this.gene.name}`

    let terms = [
      {
        category: "Map",
        name: location.map,
        fq_field: 'map',
        fq_value: location.map
      },
      {
        category: "Region",
        name: location.region,
        fq_field: 'region',
        fq_value: location.region
      }
    ];
    fq = `map:${location.map} AND region:${location.region}`;

    if (restrictToVisibleRange) {
      visibleRange = this.state.visibleRange;

      terms.push({
        category: "Interval",
        name: `${visibleRange.start}-${visibleRange.end}`,
        fq_field: 'start',
        fq_value: `[${visibleRange.start} TO ${visibleRange.end}]`
      });
      fq += ` AND (start:[${visibleRange.start} TO ${visibleRange.end}]`
        + ` OR end:[${visibleRange.start} TO ${visibleRange.end}])`;

      filterDisplayName = visibleRange.displayName;
    } else {
      filterDisplayName = "Shares " + this.region.type + " with " + geneName;
    }

    console.log("User asked to filter by location");
    filter = {
      category: 'Location',
      id: fq,
      fq: fq,
      display_name: filterDisplayName
    };

    // QueryActions.removeAllFilters();
    // QueryActions.setFilter(filter);
    this.props.doAddGrameneRangeQuery(terms);
    if (this.props.closeModal) this.props.closeModal();
  }

  explorations() {
    var visible, result;
    visible = this.state.visibleRange;
    result = [
      {
        name: `All on ${this.region.name}`,
        handleClick: ()=>this.updateQuery(false)
      }
    ];
    if (visible) {
      result.push({
        name: `All within ${getProp(visible, 'displayName')}`,
        handleClick: ()=>this.updateQuery(true)
      });
    }
    return result;
  }

  links() {
    var gene = this.gene;
    let links = [
      {name: 'Gramene Ensembl', url: `${this.props.ensemblURL}/${gene.system_name}/Gene/Summary?g=${gene._id}`},
      {name: 'PhytoMine', url: `https://phytozome.jgi.doe.gov/phytomine/keywordSearchResults.do?searchTerm=${gene._id}&searchSubmit=Search`},
    ];
    if (gene.taxon_id === 3702)
      links.push({name: 'Araport', url: `https://www.araport.org/search/thalemine/${gene._id}`});
    if (gene.taxon_id === 4577)
      links.push({name: 'MaizeGDB', url: `http://www.maizegdb.org/gene_center/gene/${gene._id}`});
    return links;
  }

  render() {
    return (
      <Detail>
        <Title key="title">Genome location: {this.renderGenePosition()}</Title>
        <Description key="description">Currently viewing: {this.renderLocation()}&nbsp;{this.renderResetButton()}</Description>
        <Content key="content">
          {this.renderBrowser()}
        </Content>
        <Explore key="explore" explorations={this.explorations()}/>
        <Links key="links" links={this.links()}/>
      </Detail>
    );
  }


  renderBrowser() {
    return (
      <Browser gene={this.gene} {...this.props} {...this.state} onViewChange={ this.handleViewChange.bind(this) }/>
    );
  }

  renderGenePosition() {
    var location = this.gene.location;
    return (
      <span className="location">
        <span className="region">{this.region.name}</span>:<span className="start">{location.start}</span>-<span
        className="end">{location.end}</span>
      </span>
    );
  }

  renderLocation() {
    var location = this.state.visibleRange;
    return (
      <span className="location">
        <span className="region">{location.chr}</span>:<span className="start">{location.start}</span>-<span
        className="end">{location.end}</span>
      </span>
    );
  }

  resetVisibleRange() {
    const {chr, start, end} = this.initVisibleRange();
    this.handleViewChange(chr, start, end);
  }

  renderResetButton() {
    // let active=isEqual(this.props.visibleRange, this.state.visibleRange);
    return (
      <Button
        size="sm"
        onClick={() => this.resetVisibleRange()}>
        Reset
      </Button>
    )
  }
}

export default connect('doAddGrameneRangeQuery',Location);


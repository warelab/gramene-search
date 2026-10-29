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
    function jgiify(id) {
      return id.replace('SORBI_3','Sobic.').replace(/\.v[0-9]\.[0-9]$/,'');
    }
    // gene.taxon_id is SYNTHETIC -- NCBI taxid * 1000 + n, so A. thaliana is 3702001 and rice
    // japonica 39947001, never 3702 or 39947. Comparing it to a bare NCBI taxid can never be true,
    // which is why the TAIR, ThaleMine and RAP-DB links below had never once appeared on a gene
    // page. annotations.taxonomy.ancestors holds REAL NCBI ids, which is why the Phytozome link
    // above it has always worked; guarded because a gene with no taxonomy annotation would
    // otherwise throw and take the whole Location tab down with it.
    function descendsFrom(g, ncbiTaxId) {
      const anc = g.annotations && g.annotations.taxonomy && g.annotations.taxonomy.ancestors;
      return Array.isArray(anc) && anc.includes(ncbiTaxId);
    }
    var gene = this.gene;
    let links = [
      {name: 'Ensembl Browser', url: `${this.props.config.ensemblURL}/${gene.system_name}/Gene/Summary?g=${gene._id}`}
    ];
    if (descendsFrom(gene, 4557))
      links.push({name: 'Phytozome', url: `https://phytozome-next.jgi.doe.gov/report/gene/Sbicolor_v5_1/${jgiify(gene._id)}`})
    // 3702 selects arabidopsis_thaliana alone: halleri (63677) and lyrata (81972) are also hosted
    // and neither has 3702 in its lineage.
    if (descendsFrom(gene, 3702))
      links.push(
        {name: 'tair', url: `https://www.arabidopsis.org/results?mainType=general&category=genes&searchText=${gene._id}`},
        {name: 'ThaleMine', url: `https://bar.utoronto.ca/thalemine/keywordSearchResults.do?searchTerm=${gene._id}&searchSubmit=search`}
      );
    // RAP-DB is gated on the ID SHAPE, not the lineage, and deliberately so. Its /locus/ route
    // takes a RAP locus id, and only the IRGSP-1.0 reference carries those (Os01g0100100). Of the
    // 17 O. sativa genomes hosted, azucena and ARC 10497 also descend from 39947 -- they are
    // Japonica-group cultivars -- but their ids are OsAzu_01g0000010 and OsARC_01g0000010, so a
    // lineage gate would hand RAP-DB identifiers it cannot resolve.
    const isRapLocus = /^Os\d{2}g\d{7}$/;
    if (isRapLocus.test(gene._id))
      links.push({name: 'RAP-DB', url: `https://rapdb.dna.naro.go.jp/locus/?name=${gene._id}`});
    const isMaize = new RegExp(/^Zm[0-9]+/);
    if (isMaize.test(gene._id))
      links.push({name: 'MaizeGDB', url: `https://www.maizegdb.org/gene_center/gene/${gene._id}`});
    return links;
  }

  render() {
    return (
      <Detail>
        {/*<Title key="title">Genome location: {this.renderGenePosition()}</Title>*/}
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
        variant="outline-dark"
        onClick={() => this.resetVisibleRange()}>
        Reset
      </Button>
    )
  }
}

export default connect('doAddGrameneRangeQuery',Location);


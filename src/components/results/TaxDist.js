import React from 'react'
import { connect } from 'redux-bundler-react'
import Vis from "gramene-search-vis"
import Selection from './selection.js'
import '../../../node_modules/gramene-search-vis/styles/main.less';

class TaxDist extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      collapseEmpties: true,
      comparaOnly: true,
      showCompara: props.configuration.hasOwnProperty('partialCompara')
    };
  }
  handleSelection(selections) {
    this.setState({selections})
  }
  handleHighlight(highlight) {
    this.setState({highlight})
  }
  handleFilter() {
    this.setState({selections:null})
  }
  toggleEmpties() {
    this.setState({collapseEmpties: !this.state.collapseEmpties})
  }
  toggleCompara() {
    this.setState({comparaOnly: !this.state.comparaOnly})
  }
  render() {
    let selectedTaxa = {};
    if (this.props.grameneSearch && this.state.collapseEmpties) {
      this.props.grameneSearch.facet_counts.facet_fields.taxon_id.filter((tid,idx) => idx % 2 === 0).forEach(tid => {
        selectedTaxa[tid] = true;
      })
    }
    else {
      if (Object.keys(this.props.grameneGenomes.active).length === 0 && this.props.grameneMaps) {
        Object.keys(this.props.grameneMaps).forEach(tid => selectedTaxa[tid] = true);
      }
      else {
        selectedTaxa = this.props.grameneGenomes.active
      }
    }
    if (this.state.showCompara && this.state.comparaOnly && this.props.grameneMaps) {
      Object.keys(selectedTaxa).forEach(tid => {
        if (!this.props.grameneMaps[tid].in_compara) {
          delete selectedTaxa[tid];
        }
      })
    }
    return (
      <div className="results-vis big-vis">
        {this.props.grameneTaxDist && <span>
          <button type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={this.toggleEmpties.bind(this)}>
          {this.state.collapseEmpties ? 'Expand' : 'Collapse'} empty branches
          </button>
          {this.state.showCompara && <button type="button"
                  className="btn btn-outline-success btn-sm"
                  onClick={this.toggleCompara.bind(this)}>
            Show {this.state.comparaOnly ? 'all genomes' : 'only genomes in gene trees'}
          </button>
          }
        </span>}
        {this.props.grameneTaxDist && <Vis taxonomy={this.props.grameneTaxDist}
                                           selectedTaxa={selectedTaxa}
                                           onSelection={this.handleSelection.bind(this)}
                                           onHighlight={this.handleHighlight.bind(this)}
        />}
        {this.renderSelection()}
      </div>
    );
  }
  renderSelection() {
    if (this.state.selections && this.props.grameneTaxDist) {
      return <Selection taxonomy={this.props.grameneTaxDist}
                        selectedTaxa={{}}
                        selections={this.state.selections}
                        onFilter={this.handleFilter.bind(this)}/>
    }
  }
}

export default connect(
  'selectConfiguration',
  'selectGrameneTaxDist',
  'selectGrameneGenomes',
  'selectGrameneSearch',
  'selectGrameneMaps',
  TaxDist
);

import React from 'react'
import { connect } from 'redux-bundler-react'
import { Vis } from "gramene-search-vis"
import Selection from './selection.js'
import '../../../node_modules/gramene-search-vis/styles/main.less';

class TaxDist extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
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
  render() {
    return (
      <div className="results-vis big-vis">
        {this.props.grameneTaxDist && <Vis taxonomy={this.props.grameneTaxDist}
                                           selectedTaxa={this.props.grameneGenomes.active}
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
  'selectGrameneTaxDist',
  'selectGrameneGenomes',
  TaxDist
);

import React from 'react'
import { connect } from 'redux-bundler-react'

class GeneAttribs extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
    };
  }
  render() {
    return (
      <div className="gramene-attribs">
        {this.props.grameneGeneAttribs && <pre>hi</pre>}
      </div>
    );
  }
}

export default connect(
  'selectGrameneGeneAttribs',
  GeneAttribs
);

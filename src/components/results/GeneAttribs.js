import { connect } from 'redux-bundler-react'

import React, { useEffect, useMemo, useState } from "react";
import StatsByGroup from "./StatsByGroup";


class GeneAttribs extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
    };
  }
  render() {
    if (this.props.grameneGeneAttribs && this.props.grameneSearch) {
      const groups = this.props.grameneGeneAttribs;
      const stats = this.props.grameneSearch.stats;
      return <StatsByGroup groups={groups} stats={stats} />;
    }
    return null;
  }
}

export default connect(
  'selectGrameneSearch',
  'selectGrameneGeneAttribs',
  GeneAttribs
);

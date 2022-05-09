import React from 'react'
import {connect} from "redux-bundler-react";

const PREFIX = (global.location ? global.location.origin + global.location.pathname + '/' : '');

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  const url = `/static/atlasWidget.html?${gene.taxon_id === 112509 ? gene.synonyms[0] : gene._id}`;
  const height = '500px';
  return (
    <iframe src={url} frameBorder="0" width="100%" height={height}>
      <p>browser doesn't support iframes</p>
    </iframe>
  );
};

export default connect(Detail);


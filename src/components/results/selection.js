import React from 'react';
import numeral from 'numeral';
import _ from "lodash";

import {Table, Button, Badge} from 'react-bootstrap';
import {connect} from "redux-bundler-react";

function selectionStats(selections, taxonomy) {
  const selectionData = getSelectionData(selections, taxonomy);
  const totalGeneResults = taxonomy.model.results.count;
  const fq = fqFromSelections(selections);

  return {
    selectedGenes: selectionData.resultsCount,
    totalGeneResults,
    fq,
    numSelectedBins: selectionData.binsCount,
    proportionGenesSelected: selectionData.resultsCount / totalGeneResults
  }
}

function getSelectionData(selection, taxonomy) {
  return _.reduce(selection, (countAcc, sel) => {
    const bins = taxonomy.getBins(sel.binFrom.idx, sel.binTo.idx);
    countAcc.binsCount += bins.length;
    countAcc.resultsCount += _.reduce(bins, (acc, bin) => acc + bin.results.count, 0);
    return countAcc;
  }, {resultsCount: 0, binsCount: 0});
}

const selectionToSolrRange = (sel)=>`[${sel.binFrom.idx} TO ${sel.binTo.idx}]`;

function fqFromSelections(selections) {
  const rangeStrings = selections.map(selectionToSolrRange);
  return `fixed_1000__bin:(${rangeStrings.join(' ')})`;
}

const Selections = ({selections, taxonomy, doAcceptGrameneSuggestion, onFilter}) => {
  const stats = selectionStats(selections, taxonomy);

  const setFilter = () => {
    doAcceptGrameneSuggestion({
      category: 'Selections',
      fq_field: 'fixed_1000__bin',
      fq_value: `(${selections.map(selectionToSolrRange).join(' ')})`,
      name: `${selections.length} region${selections.length === 1 ? '':'s'}`
    });
    onFilter();
  };

  const formatProportion = (prop) => '(' + (_.isFinite(prop) ? numeral(prop).format('0.0%') : undefined) + ')';

  return (
    <div>
      <Table>
        <tbody>
        <tr>
          <th>Number of selected genes</th>
          <td>{stats.selectedGenes} {formatProportion(stats.proportionGenesSelected)}</td>
          <td><Button size='sm' onClick={setFilter}>selections&nbsp;|<Badge>{stats.selectedGenes}</Badge></Button>
          </td>
        </tr>
        </tbody>
      </Table>
    </div>
  )
};

export default connect(
  'doAcceptGrameneSuggestion',
  Selections
);

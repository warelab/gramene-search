import React, { useState, useEffect } from 'react';
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Container, Row, Col, ToggleButton, ButtonGroup } from 'react-bootstrap';
import * as console from "console";


const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  if (props.grameneConsequences && props.grameneConsequences[gene._id]) {
    const vep_obj = props.grameneConsequences[gene._id];
    let table = [];
    Object.entries(vep_obj).forEach(([key,accessions]) => {
      const parts = key.split("__");
      if (parts[0] === "VEP") {
        if (parts[1] !== "merged") {
          accessions.forEach(accession => {
            table.push({
              "study/pop": parts[3],
              "consequence": parts[1],
              "homo/het": parts[2],
              "acc_id": accession,
              "search": "button to search for genes with PTV in this accession"
            })
          });
        }
      }
    });
    return <pre>{JSON.stringify(table,null,2)}</pre>
  } else {
    props.doRequestVEP(gene._id);
    return <pre>loading</pre>;
  }
};

export default connect(
  'selectConfiguration',
  'selectGrameneConsequences',
  'doRequestVEP',
  Detail
);


import React from 'react'
import {connect} from "redux-bundler-react";
import {Alert, Container, Row, Card, CardGroup} from 'react-bootstrap'
import './genes.css'

const examples = [
  {
    subsite: {
      maize:1,
      sorghum:1,
      main:1,
    },
    text: "What are the orthologs of Arabidopsis thaliana's PAD4 gene in Andropogoneae?",
    filters: {
      status: 'init',
      rows: 20,
      operation: 'AND',
      negate: false,
      leftIdx: 0,
      rightIdx: 5,
      children: [
        {
          fq_field: 'homology__all_orthologs',
          fq_value: 'AT3G52430',
          name: 'Orthologs of PAD4',
          category: 'Gene Tree',
          leftIdx:1,
          rightIdx:2,
          negate: false,
          marked: false
        },
        {
          fq_field: 'taxonomy__ancestors',
          fq_value: 147429,
          name: 'Andropogoneae',
          category: 'Taxonomy',
          leftIdx:3,
          rightIdx:4,
          negate: false,
          marked: false
        }
      ]
    }
  },
  {
    subsite: {
      grapevine:1
    },
    text: "What are the orthologs of Arabidopsis thaliana's PAD4 gene in rosids?",
    filters: {
      status: 'init',
      rows: 20,
      operation: 'AND',
      negate: false,
      leftIdx: 0,
      rightIdx: 5,
      children: [
        {
          fq_field: 'homology__all_orthologs',
          fq_value: 'AT3G52430',
          name: 'Orthologs of PAD4',
          category: 'Gene Tree',
          leftIdx:1,
          rightIdx:2,
          negate: false,
          marked: false
        },
        {
          fq_field: 'taxonomy__ancestors',
          fq_value: 71275,
          name: 'rosids',
          category: 'Taxonomy',
          leftIdx:3,
          rightIdx:4,
          negate: false,
          marked: false
        }
      ]
    }
  }
];
const HelpDemo = ({configuration,doReplaceGrameneFilters}) => (
  <Container fluid style={{padding: '40px'}}>
    <Row>
      <h3>Search Features</h3>
    </Row>
    <Row>
      <CardGroup style={{width:'80%'}}>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Suggestions</Card.Title>
            <Card.Text>Matching terms are provided as you type:</Card.Text>
            <div className='gene-search-pic-sugg'/>
          </Card.Body>
        </Card>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Visualization</Card.Title>
            <Card.Text>See the distribution of results across all genomes:</Card.Text>
            <div className='gene-search-pic-results'/>
          </Card.Body>
        </Card>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Gene tree view</Card.Title>
            <Card.Text>Explore evolutionary history of a gene family:</Card.Text>
            <div className='gene-search-pic-genetree'/>
          </Card.Body>
        </Card>
      </CardGroup>
    </Row>
    <Row>
      <h4>For Example</h4>
    </Row>
    <Row>
      <small>
        You can ask sophisticated questions about the genes:<br/>
        <ul>
          {examples.filter(e => !!e.subsite[configuration.id]).map((e,idx) => (
            <li key={idx}><a onClick={() => doReplaceGrameneFilters(e.filters)}>{e.text}</a></li>
          ))}
        </ul>
      </small>
    </Row>
  </Container>
);

export default connect(
  'selectConfiguration',
  'doReplaceGrameneFilters',
  HelpDemo
);


import React from 'react'
import {connect} from "redux-bundler-react";
import {Alert, Container, Row, Card, CardDeck} from 'react-bootstrap'
import './genes.css'

const examples = [
  {
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
  }
];
const HelpDemo = ({doReplaceGrameneFilters}) => (
  <Container fluid style={{padding: '40px'}}>
    <Alert variant='primary'>
      Click the search icon in the menu bar or type / to search
    </Alert>
    <Row>
      <h3>Features</h3>
    </Row>
    <Row>
      <CardDeck style={{width:'80%'}}>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Suggestions</Card.Title>
            <Card.Text>Matching terms are provided as you type:</Card.Text>
            <div className='gene-search-pic'>
              <img src="/static/images/suggestions.png"/>
            </div>
          </Card.Body>
        </Card>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Visualization</Card.Title>
            <Card.Text>See the distribution of results across all genomes:</Card.Text>
            <div className='gene-search-pic'>
              <img src="/static/images/results.png"/>
            </div>
          </Card.Body>
        </Card>
        <Card style={{'backgroundColor':'#f3f6f5', 'borderColor':'#DDE5E3'}}>
          <Card.Body>
            <Card.Title>Gene tree view</Card.Title>
            <Card.Text>Explore evolutionary history of a gene family:</Card.Text>
            <div className='gene-search-pic'>
              <img src="/static/images/genetree.png"/>
            </div>
          </Card.Body>
        </Card>
      </CardDeck>
    </Row>
    <Row>
      <h3>For Example</h3>
    </Row>
    <Row>
      <small>
        You can ask sophisticated questions about the genes:<br/>
        <ul>
          {examples.map((e,idx) => (
            <li key={idx}><a onClick={() => doReplaceGrameneFilters(e.filters)}>{e.text}</a></li>
          ))}
        </ul>
      </small>
    </Row>
  </Container>
);

export default connect(
  'doReplaceGrameneFilters',
  HelpDemo
);


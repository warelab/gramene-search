import React from 'react'
import { Provider, connect } from 'redux-bundler-react'
import { render } from 'react-dom'
import { composeBundles, createCacheBundle } from "redux-bundler";
import { getConfiguredCache } from 'money-clip';
import { DebounceInput } from 'react-debounce-input'
import { Alert, Navbar, Nav, NavDropdown, Tab, Row, Col } from 'react-bootstrap'
import { Status, Filters, Results, Views } from './components/geneSearchUI';
import GrameneSuggestions from './components/suggestions';
import bundles from './bundles';
import UIbundle from './bundles/UIbundle';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link
} from "react-router-dom";
import Feedback from './components/Feedback';
import MDView from 'gramene-mdview';

const cache = getConfiguredCache({
  maxAge: 100 * 60 * 60,
  version: 1
});
// const subsite = 'main';
const subsite = process.env.SUBSITE;
// const subsite = 'grapevine';
// const subsite = 'sorghum';
// const subsite = 'rice';

const subsitelut = {
  main: 0,
  maize: 1,
  sorghum: 2,
  grapevine: 3,
  rice: 4
}
const panSites = [
  {
    id: 'main',
    name: 'Gramene Main',
    url: '//www.gramene.org',
    ensemblStie: 'http://ensembl.gramene.org',
    ensemblRest: 'https://data.gramene.org/ensembl',
    grameneData: 'https://data.gramene.org/v63',
    targetTaxonId: 3702,
    alertText: 'Main site'
  },
  {
    id: 'maize',
    name: 'Maize',
    url: '//maize-pangenome.gramene.org',
    ensemblURL: 'http://maize-pangenome-ensembl.gramene.org',
    ensemblSite: 'http://maize-pangenome-ensembl.gramene.org/genome_browser/index.html',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl',
    grameneData: 'http://data.gramene.org/maizepan1',
    targetTaxonId: 4577,
    renderAlert: () => (
        <Alert variant='primary'>
          bio<span style={{color:"#FF0000"}}>R</span>&chi;iv preprint&nbsp;
          <a href='https://www.biorxiv.org/content/10.1101/2021.01.14.426684v1' target='_blank'>
            <i>De novo</i> assembly, annotation, and comparative analysis of 26 diverse maize genomes
          </a>
        </Alert>
    )
  },
  {
    id: 'sorghum',
    name: 'Sorghumbase',
    url: '//www.sorghumbase.org',
    ensemblURL: 'https://ensembl.sorghumbase.org',
    ensemblSite: 'https://ensembl.sorghumbase.org',
    ensemblRest: 'https://data.sorghumbase.org/ensembl2',
    grameneData: 'https://data.sorghumbase.org/sorghum2',
    targetTaxonId: 4588,
    alertText: 'Click the search icon in the menu bar or type / to search'
  },
  {
    id: 'grapevine',
    name: 'Grapevine',
    url: '//vitis.gramene.org',
    ensemblURL: 'http://vitis-ensembl.gramene.org',
    ensemblSite: 'http://vitis-ensembl.gramene.org/genome_browser/index.html',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl',
    grameneData: 'https://data.gramene.org/vitis1',
    curation: {
      url: 'http://curate.gramene.org/grapevine?gene=',
      taxa: {
        29760: 1
      }
    },
    targetTaxonId: 29760,
    alertText: 'Grapevine site'
  },
  {
    id: 'rice',
    name: 'Rice',
    url: '//oge.gramene.org',
    ensemblStie: 'http://ensembl-oge.gramene.org',
    ensemblRest: 'https://data.gramene.org/ensembl',
    grameneData: 'https://data.gramene.org/v63',
    targetTaxonId: 3702,
    alertText: 'Rice site'
  },
];
const initialState = panSites[subsitelut[subsite]];

const config = {
  name: 'config',
  getReducer: () => {
    return (state = initialState, {type, payload}) => {
      return state;
    }
  },
  selectGrameneAPI: state => state.config.grameneData,
  selectTargetTaxonId: state => state.config.targetTaxonId,
  selectCuration: state => state.config.curation,
  selectConfiguration: state => state.config
};

const getStore = composeBundles(
  ...bundles,
  UIbundle,
  config,
  createCacheBundle(cache.set)
);

const GeneSearchUI = (store) => (
  <Provider store={store}>
    <div className="row no-margin no-padding">
      <div className="col-md-2 no-padding">
        <Status/>
        <Filters/>
        <Views/>
      </div>
      <div className="col-md-10 no-padding">
        <Results/>
      </div>
    </div>
  </Provider>
);
const SearchViews = props => (
    <div className="row no-margin no-padding">
      <div className="col-md-2 no-padding">
        <div className="gramene-sidebar">
          <Status/>
          <Filters/>
          {/*<Views/>*/}
        </div>
      </div>
      <div className="col-md-10 no-padding">
        <Results/>
      </div>
    </div>
);

const handleKey = (e, props) => {
  if (e.key === "Escape") {
    props.doClearSuggestions();
  }
  if (e.key === "Tab") {
    if (props.grameneSuggestionsReady) {
      e.preventDefault();
      document.getElementById('0-0').focus();
    }
  }
};

const SearchBarCmp = props =>
  <DebounceInput
    minLength={0}
    debounceTimeout={300}
    onChange={e => props.doChangeSuggestionsQuery(e.target.value)}
    onKeyDown={e => handleKey(e, props)}
    // onKeyUp={e => handleKey(e.key,props)}
    className="form-control"
    value={props.suggestionsQuery || ''}
    placeholder="Search for genes, species, pathways, ontology terms, domains..."
    id="search-input"
    autoComplete="off"
    spellCheck="false"
  />;

const SearchBar = connect(
  'selectSuggestionsQuery',
  'doChangeSuggestionsQuery',
  'doClearSuggestions',
  'selectGrameneSuggestionsReady',
  SearchBarCmp
);

const SuggestionsCmp = props => {
  if (props.suggestionsQuery) {
    const spinner = <img src="/static/images/dna_spinner.svg"/>;

    let genesStatus = props.grameneSuggestionsStatus === 'loading' ? spinner : props.grameneSuggestionsStatus;
    return (
      <div className="search-suggestions">
        <Tab.Container id="controlled-search-tabs" activeKey={'gramene'}>
          <Row>
            <Col>
              <Nav variant="tabs">
                <Nav.Item>
                  <Nav.Link eventKey="gramene">
                    <div className="suggestions-tab">Genes {genesStatus}</div>
                  </Nav.Link>
                </Nav.Item>
              </Nav>
            </Col>
          </Row>
          <Row>
            <Col>
              <Tab.Content>
                <Tab.Pane eventKey="gramene">
                  <GrameneSuggestions/>
                </Tab.Pane>
              </Tab.Content>
            </Col>
          </Row>
        </Tab.Container>
      </div>
    );
  }
  return null;
};

const Suggestions = connect(
  'selectSuggestionsQuery',
  'selectGrameneSuggestionsStatus',
  SuggestionsCmp
);

const SearchUI_ = (store) => (
  <Provider store={store}>
    <div>
      <SearchBar/>
      <Suggestions/>
    </div>
  </Provider>
);

const SearchMenu = props => (
  <div id="searchbar-parent" style={{width:'500px'}}>
    <div id="searchbar">
      {/*<Form inline>*/}
        <SearchBar/>
      {/*</Form>*/}
    </div>
  </div>
)

const News = props => (
  <MDView
    org='warelab'
    repo='release-notes'
    path={subsite}
    heading='News'
  />
)

const Genomes = props => (
    <MDView
        org='warelab'
        repo='release-notes'
        path={subsite+'-genomes'}
        heading='Genomes'
    />
)

const Guides = props => (
    <MDView
      org='warelab'
      repo='release-notes'
      path={subsite+'-guides'}
      heading='Guides'
    />
)

const demo = (store) => (
  <Provider store={store}>
    <Router>
      <div>
        <Navbar bg="light" expand="lg" sticky='top'>
          <Navbar.Brand href="/">
            <img
              src={`/static/images/${subsite}_logo.svg`}
              height="80"
              className="d-inline-block align-top"
              alt="Gramene Search"
            />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="mr-auto">
              <Switch>
                <Route exact path="/" component={SearchMenu} />
                <Route>
                  <Link className="nav-link" to="/">Search</Link>
                </Route>
              </Switch>
              <Nav.Link href={initialState.ensemblSite}>
                <img style={{height:'25px', verticalAlign:'bottom'}}
                     src={`/static/images/e_bang.png`}/>Genome browser</Nav.Link>
              <Link className="nav-link" to="/news">
              News
              </Link>
              {/*<Link className="nav-link" to="/genomes">*/}
              {/*  Genomes*/}
              {/*</Link>*/}
              <Link className="nav-link" to="/guides">
                Guides
              </Link>
              <Link className="nav-link" to={location => ({
                pathname: '/feedback',
                state: { search: document.location.href }
              })}>Feedback</Link>
              <NavDropdown id={"gramene-sites"} title={"Gramene Sites"}>
                {panSites.filter(site => site.id !== subsite).map((site,idx) =>
                    <NavDropdown.Item key={idx} href={site.url}>{site.name}</NavDropdown.Item>
                )}
              </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Navbar>
        <Route exact path="/" component={Suggestions} />
        <Switch>
          <Route path="/feedback" component={Feedback} />
          <Route path="/news" component={News} />
          {/*<Route path="/genomes" component={Genomes} />*/}
          <Route path="/guides" component={Guides} />
          <Route path="/" component={SearchViews} />
        </Switch>
      </div>
    </Router>
  </Provider>
)

cache.getAll().then(initialData => {
  if (initialData) {
    if (initialData.hasOwnProperty('searchUI')) initialData.searchUI.suggestions_query="";
    console.log('starting with locally cached data:', initialData)
  }
  const store = getStore(initialData);
  let element = document.getElementById('demo');
  element && render(demo(store), element);

  // let element = document.getElementById('searchbar');
  // element && render(SearchUI(store), element);
  //
  // element = document.getElementById('gene-search-ui');
  // element && render(GeneSearchUI(store), element);
});

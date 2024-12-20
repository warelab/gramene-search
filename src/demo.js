import React from 'react'
import { Provider, connect } from 'redux-bundler-react'
import { render } from 'react-dom'
import { composeBundles, createCacheBundle } from "redux-bundler";
import { getConfiguredCache } from 'money-clip';
import { DebounceInput } from 'react-debounce-input'
import ReactGA from 'react-ga4'
import { Alert, Navbar, Nav, NavDropdown, Tab, Row, Col } from 'react-bootstrap'
import { Status, Filters, Results, Views, Auth } from './components/geneSearchUI';
import GrameneSuggestions from './components/suggestions';
import HelpModal from './components/HelpModal';
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
    url: 'https://www.gramene.org',
    ensemblURL: 'https://ensembl.gramene.org',
    ensemblSite: 'https://ensembl.gramene.org',
    ensemblRest: 'https://data.gramene.org/ensembl68',
    grameneData: 'https://data.gramene.org/v68',
    ga: 'G-ZTEQBFCRXZ',
    targetTaxonId: 3702,
    alertText: 'Main site',
    details: {
      sequences: true,
      VEP: false,
      location: true,
      expression: true,
      homology: true,
      pathways: true,
      pubs: true,
      xrefs: true
    },
    panSite : {
      sorghum_bicolor : {
        url: "https://sorghumbase.org/genes?idList=",
        name: "SorghumBase",
        svg: "./static/images/sorghum_logo.svg"
      },
      vitis_vinifera : {
        url: "https://vitis.gramene.org?idList=",
        name: "Gramene Grapevine",
        svg: "./static/images/grapevine_logo.svg"
      },
      oryza_sativa : {
        url: "https://oryza.gramene.org?idList=",
        name: "Gramene Oryza",
        svg: "./static/images/oryza_logo.svg"
      },
      zea_mays : {
        url: "https://maize-pangenome.gramene.org?idList=",
        name: "Gramene Maize",
        svg: "./static/images/maize_logo.svg"
      }
    }
  },
  {
    id: 'maize',
    name: 'Maize',
    url: 'https://maize-pangenome.gramene.org',
    ensemblURL: 'https://maize-pangenome-ensembl.gramene.org',
    ensemblSite: 'https://maize-pangenome-ensembl.gramene.org',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl-87',
    grameneData: 'https://data.gramene.org/maize_v4',
    targetTaxonId: 4577,
    ga: "G-Y7ZYG1R8QT",
    showViews: true,
    not_downtime: 'The search interface will be undergoing maintenance on Tuesday, July 20 from 3:00 - 4:00 PM EDT',
    details: {
      sequences: true,
      VEP: false,
      location: true,
      expression: true,
      homology: true,
      pathways: true,
      pubs: true,
      xrefs: true
    },
    renderAlert: () => (
        <Alert variant='primary'>
          Hufford et. al., 2021. &nbsp;
          <a href='https://www.science.org/doi/abs/10.1126/science.abg5289' target='_blank'>
            <i>De novo</i> assembly, annotation, and comparative analysis of 26 diverse maize genomes.
          </a>&nbsp;Science, Vol 373, Issue 6555, pp. 655-662.
        </Alert>
    ),
    panSite : {
      sorghum_bicolor : {
        url: "https://sorghumbase.org/genes?idList=",
        name: "SorghumBase",
        svg: "./static/images/sorghum_logo.svg"
      },
      vitis_vinifera : {
        url: "https://vitis.gramene.org?idList=",
        name: "Gramene Grapevine",
        svg: "./static/images/grapevine_logo.svg"
      },
      oryza_sativa : {
        url: "https://oryza.gramene.org?idList=",
        name: "Gramene Oryza",
        svg: "./static/images/oryza_logo.svg"
      }
    }
  },
  {
    id: 'sorghum',
    name: 'Sorghumbase',
    url: 'https://www.sorghumbase.org',
    ensemblURL: 'https://ensembl-dev.sorghumbase.org',
    ensemblSite: 'https://ensembl-dev.sorghumbase.org',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl-108',
    grameneData: 'https://data.sorghumbase.org/sorghum_v9',
    ga: 'G-L5KXDCCZ16',
    targetTaxonId: 4558003,
    alertText: 'Click the search icon in the menu bar or type / to search',
    showViews: false,
    details: {
      sequences: true,
      VEP: true,
      location: true,
      expression: true,
      homology: true,
      pathways: true,
      pubs: true,
      xrefs: true
    },
    panSite : {
      vitis_vinifera : {
        url: "https://vitis.gramene.org?idList=",
        name: "Gramene Grapevine",
        svg: "./static/images/grapevine_logo.svg"
      },
      oryza_sativa : {
        url: "https://oryza.gramene.org?idList=",
        name: "Gramene Oryza",
        svg: "./static/images/oryza_logo.svg"
      },
      zea_maysb73 : {
        url: "https://maize-pangenome.gramene.org?idList=",
        name: "Gramene Maize",
        svg: "./static/images/maize_logo.svg"
      }
    }
  },
  {
    id: 'grapevine',
    name: 'Grapevine',
    ga: 'G-ZTEQBFCRXZ',
    url: 'https://vitis.gramene.org',
    ensemblURL: 'https://vitis-ensembl.gramene.org',
    ensemblSite: 'https://vitis-ensembl.gramene.org/genome_browser/index.html',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl',
    grameneData: 'https://data.gramene.org/grapevine_v4',
    curation: {
      url: 'http://curate.gramene.org/grapevine?gene=',
      taxa: {
        29760020: 1
      }
    },
    hideGenomes: {
      3702:'arabidopsis',
      4558:'sorghum'
    },
    targetTaxonId: 29760020,
    alertText: 'Grapevine site',
    details: {
      sequences: true,
      VEP: false,
      location: true,
      expression: true,
      homology: true,
      pathways: true,
      pubs: true,
      xrefs: true
    },
    panSite : {
      sorghum_bicolor : {
        url: "https://sorghumbase.org/genes?idList=",
        name: "SorghumBase",
        svg: "./static/images/sorghum_logo.svg"
      },
      oryza_sativa : {
        url: "https://oryza.gramene.org?idList=",
        name: "Gramene Oryza",
        svg: "./static/images/oryza_logo.svg"
      },
      zea_maysb73 : {
        url: "https://maize-pangenome.gramene.org?idList=",
        name: "Gramene Maize",
        svg: "./static/images/maize_logo.svg"
      }
    }
  },
  {
    id: 'rice',
    name: 'Rice',
    ga: "G-ZTEQBFCRXZ",
    url: 'https://oryza.gramene.org',
    ensemblSite: 'https://oryza-ensembl.gramene.org',
    ensemblURL: 'https://oryza-ensembl.gramene.org',
    ensemblRest: 'https://data.gramene.org/pansite-ensembl-108',
    grameneData: 'https://data.gramene.org/oryza_v8',
    targetTaxonId: 3702,
    alertText: 'Rice site',
    showViews: true,
    details: {
      sequences: true,
      VEP: true,
      location: true,
      expression: true,
      homology: true,
      pathways: true,
      pubs: true,
      xrefs: true
    },
    panSite : {
      sorghum_bicolor : {
        url: "https://sorghumbase.org/genes?idList=",
        name: "SorghumBase",
        svg: "./static/images/sorghum_logo.svg"
      },
      vitis_vinifera : {
        url: "https://vitis.gramene.org?idList=",
        name: "Gramene Grapevine",
        svg: "./static/images/grapevine_logo.svg"
      },
      zea_maysb73 : {
        url: "https://maize-pangenome.gramene.org?idList=",
        name: "Gramene Maize",
        svg: "./static/images/maize_logo.svg"
      }
    }
  }
];
const initialState = Object.assign({helpIsOn:false}, panSites[subsitelut[subsite]]);

const config = {
  name: 'config',
  getReducer: () => {
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_HELP_TOGGLED':
          newState = Object.assign({},state);
          newState.helpIsOn = !newState.helpIsOn;
          return newState;
        default:
          return state;
      }
    }
  },
  doToggleGrameneHelp: () => ({dispatch})  => {
    dispatch({type: 'GRAMENE_HELP_TOGGLED', payload: null})
  },
  selectGrameneAPI: state => state.config.grameneData,
  selectEnsemblAPI: state => state.config.ensemblRest,
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
const SearchViewsCmp = props => (
    <div className="no-margin no-padding">
      <div style={{width:250}}>
        <div className={props.configuration.id === 'sorghum' ? 'sorghumbase-sidebar' : 'gramene-sidebar'}>
          <Status/>
          <Filters/>
          {props.configuration.showViews && <Views/>}
          {/*<Auth/>*/}
        </div>
      </div>
      <div style={{width:"calc(100% - 250px", left:250, position:'relative'}}>
        <Results/>
      </div>
    </div>
);
const SearchViews = connect(
  'selectConfiguration',
  SearchViewsCmp
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
  <div>
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
    />
    <small><a onClick={props.doToggleGrameneHelp}>Need help searching?</a></small>
    <HelpModal/>
  </div>

const SearchBar = connect(
  'selectSuggestionsQuery',
  'doChangeSuggestionsQuery',
  'doClearSuggestions',
  'doToggleGrameneHelp',
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
              alt="Gene Search"
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
  const config = store.selectConfiguration();
  ReactGA.initialize(config.ga);
  if (initialData.hasOwnProperty('grameneMaps')) {
    // check for hidden genomes
    let notHidden = {};
    let haveHidden = false;
    Object.values(initialData.grameneMaps.data).forEach(m => {
      if (m.hidden) {
        haveHidden=true;
      }
      else {
        notHidden[m.taxon_id]=true;
      }
    })
    if (haveHidden) {
      store.doInitializeGrameneGenomes(notHidden)
    }
  }
  let element = document.getElementById('demo');
  element && render(demo(store), element);

  // let element = document.getElementById('searchbar');
  // element && render(SearchUI(store), element);
  //
  // element = document.getElementById('gene-search-ui');
  // element && render(GeneSearchUI(store), element);
});

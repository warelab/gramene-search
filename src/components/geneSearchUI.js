import React, { useRef, useEffect } from 'react'
import { connect } from 'redux-bundler-react'
import { Navbar, Nav, NavDropdown, Container, OverlayTrigger, Popover} from 'react-bootstrap'
import Switch from 'react-switch'
import { IoAlertCircle } from 'react-icons/io5'
import { BsGearFill,BsTrash } from 'react-icons/bs'
import GeneList from './results/GeneList'
import TaxDist from './results/TaxDist'
import HelpDemo from './results/HelpDemo'
import GeneAttribs from './results/GeneAttribs'
import TaxonomyModal from './TaxonomyModal'
import Expression from './results/Expression'
import UserGeneLists from './results/UserGeneLists'
import Auth from './Auth'
import ReactGA from 'react-ga4'
import './styles.css';

const inventory = {
  help: HelpDemo,
  list: GeneList,
  taxonomy: TaxDist,
  attribs: GeneAttribs,
  expression: Expression,
  userLists: UserGeneLists
};

const StatusCmp = props => {
  let content = props.grameneFiltersStatus;
  // if (props.grameneFiltersStatus === 'init') {
  //   props.doClearGrameneFilters();
  // }
  if (props.grameneFiltersStatus === 'ready') {
    let tally = <span>Ready</span>;
    if (props.grameneSearch) {
      let genes = props.grameneSearch.response.numFound;
      let genomes = props.grameneSearch.facet_counts.facet_fields.taxon_id.length / 2;
      tally = <span><b>{genes}</b> genes in <b>{genomes}</b> genomes</span>;
    }
    const popover = (
      <Popover>
        <Popover.Header as="h3">Genomes Filter</Popover.Header>
        <Popover.Body>Searching {props.activeGenomeCount} genomes</Popover.Body>
      </Popover>
    );

    content = <span>
      {tally}
      <OverlayTrigger placement="auto" overlay={popover}>
        <span style={{float:'right', cursor:'pointer'}} onClick={props.doShowGrameneGenomes}><BsGearFill/></span>
      </OverlayTrigger>
      <TaxonomyModal/>
    </span>;
  }
  return <div style={{padding:'5px', color:'cornsilk', fontSize:'small'}}>{content}</div>
};

const Status = connect(
  'selectGrameneSearch',
  'selectGrameneFiltersStatus',
  'selectActiveGenomeCount',
  'doShowGrameneGenomes',
  'doClearGrameneFilters',
  StatusCmp
);

const handleClick = (e, moveCopyMode, showMarked, node, actions) => {
  if (!e) e = window.event;
  e.cancelBubble = true;
  if (e.stopPropagation) e.stopPropagation();

  if (showMarked && moveCopyMode) {
    if (node.marked) {
      actions.selectTarget(node);
    }
    else {
      actions.unmarkTargets()
    }
  }
  console.log(node, showMarked);
};
function logAction(action) {
  ReactGA.event({
    category: 'Search',
    action: action
  })
}
const Filter = ({node,moveCopyMode,showMarked,actions}) => {
  let classes = 'gramene-filter gramene-filter';
  if (node.operation) {
    classes = `${classes}-${node.operation}`
  }
  if (node.negate) {
    classes = `${classes} gramene-filter-NOT`
  }
  if (showMarked && node.marked) {
    classes = `${classes} gramene-filter-marked`
  }
  let content = '';
  let menu = '';
  let children = [];

  if (node.showMenu) {
    let key=1;
    let menuItems = [];
    if (node.hasOwnProperty('operation')) {
      menuItems.push(<li key={key++} onClick={()=>{logAction(`Change to ${node.operation}`); actions.changeOperation(node)}}>convert to <i>{node.operation === 'AND' ? 'OR' : 'AND'}</i></li>);
    }
    if (node.leftIdx > 0) {
      menuItems.push(<li key={key++} onClick={()=>{logAction(`Delete filter`); actions.deleteNode(node)}}>delete</li>);
      menuItems.push(<li key={key++} onClick={()=>{logAction(`Move filter`); actions.markTargets(node,'move')}}>move{node.isSource && ' select destination'}</li>);
      menuItems.push(<li key={key++} onClick={()=>{logAction(`Copy filter`); actions.markTargets(node,'copy')}}>copy{node.isSource && ' select destination'}</li>)
    }
    menuItems.push(<li key={key++} onClick={()=>{logAction(`Negate filter`); actions.negate(node)}}>negate</li>);
    menu = <div className='gramene-filter-menu'><ul>{menuItems}</ul></div>;
  }
  let warning;
  if (node.warning) {
    const popover = (
      <Popover>
        <Popover.Header as="h3">Warning</Popover.Header>
        <Popover.Body>{node.warning}</Popover.Body>
      </Popover>
    );
    warning = (
      <OverlayTrigger placement="auto" overlay={popover}><span style={{float:'right', color:'red', cursor:'pointer'}}><IoAlertCircle/></span></OverlayTrigger>
    )
  }
  if (node.operation) {
    children = node.children.map((child,idx) => <Filter key={idx} moveCopyMode={moveCopyMode} node={child} showMarked={showMarked} actions={actions}/>);
    content = (
      <div>
        <span className='gramene-filter-operation'
              onClick={()=>actions.toggleMenu(node)}>{node.operation}</span>
        {warning}
      </div>
    );
  }
  else {
    content = <span className='gramene-filter-text'
                    onClick={()=>actions.toggleMenu(node)}>{node.category} |&nbsp;{node.name}</span>;
  }
  return (
    <div key={node.leftIdx} className={classes} onClick={(e)=>handleClick(e,moveCopyMode, showMarked,node,actions)}>
      {content}{menu}{children}
    </div>
  )
};

const FiltersCmp = props => {
  const actions = {
    negate: props.doNegateGrameneFilter,
    deleteNode: props.doDeleteGrameneFilter,
    changeOperation: props.doChangeGrameneFilterOperation,
    selectTarget: props.doMoveOrCopyGrameneFilter,
    markTargets: props.doMarkGrameneFilterTargets,
    unmarkTargets: props.doUnmarkGrameneFilterTargets,
    toggleMenu: props.doToggleGrameneFilterMenu
  };
  if (props.grameneFilters.rightIdx > 1) {
    return <div className={props.configuration.id === 'sorghum' ? 'sorghumbase-filter-container': 'gramene-filter-container'}>
      <b>Filters</b>
      <span style={{float:'right', cursor:'pointer'}} onClick={props.doClearGrameneFilters}><BsTrash/></span>
      <Filter node={props.grameneFilters}
                   moveCopyMode={props.grameneFilters.moveCopyMode}
                   showMarked={props.grameneFilters.showMarked}
                   actions={actions}/>
    </div>
  }
  else {
    return <div className={props.configuration.id === 'sorghum' ? 'sorghumbase-filter-container': 'gramene-filter-container'}>
      <b>Filters</b>
      <div className='gramene-filter gramene-filter-AND'>No filters defined</div>
    </div>
  }
};

const Filters = connect(
  'selectGrameneFilters',
  'selectConfiguration',
  'doNegateGrameneFilter',
  'doDeleteGrameneFilter',
  'doChangeGrameneFilterOperation',
  'doMoveOrCopyGrameneFilter',
  'doMarkGrameneFilterTargets',
  'doUnmarkGrameneFilterTargets',
  'doToggleGrameneFilterMenu',
  'doClearGrameneFilters',
  FiltersCmp
);

const ResultsCmp = props => {
  let activeViews = props.grameneViews.options;
  return props.grameneFilters.rightIdx > 0 ? (
    <div>
      {activeViews.map((v,idx) => {
        let p = Object.assign({}, props);
        const divRef = useRef(null);
        useEffect(() => {
          if (v.shouldScroll) {
            const navBarHeight=0;
            const scrollPosition = divRef.current.offsetTop - navBarHeight;
            window.scrollTo({
              top: scrollPosition,
              behavior: 'smooth'
            })
            props.doCancelShouldScroll();
          }
        }, [v.shouldScroll]);
        return (
          <div key={idx} ref={divRef}>
            {v.show === 'on' && <div style={{borderTopWidth:'medium'}} className='gramene-view-header'>{v.name}</div>}
            {v.show === 'on' && React.createElement(inventory[v.id], p)}
          </div>
        )
      })}
    </div>
  ) : null;
};

const Results = connect(
  'selectGrameneFilters',
  'selectGrameneViews',
  'doCancelShouldScroll',
  ResultsCmp
);

const ViewsCmp = props => (
  <div className={'gramene-view-container'}>
    <b>Views</b>
    {props.grameneViews.options.filter(view => view.show !== 'disabled').map((view,idx) => (
      <div style={{textWrap:'nowrap'}} key={idx}>
        <Switch onChange={()=>props.doToggleGrameneView(view.id)} checked={view.show === 'on'}
                height={18}
                width={30}
                handleDiameter={16}
                checkedIcon={false}
                uncheckedIcon={false}
        />
        <span className={`gramene-view-span-${view.show}`} onClick={(e) => {
          props.dontToggleGrameneView(view.id)
        }}>{view.name}</span>
      </div>
    ))}
  </div>
);

const Views = connect(
  'selectGrameneViews',
  'doToggleGrameneView',
  'dontToggleGrameneView',
  ViewsCmp
);

export {Status, Filters, Results, Views, Auth};

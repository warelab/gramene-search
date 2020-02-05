import React from 'react'
import { connect } from 'redux-bundler-react'
import GeneList from './results/GeneList'
import TaxDist from './results/TaxDist'
import HelpDemo from './results/HelpDemo'

import './styles.css';
const inventory = {
  list: GeneList,
  taxonomy: TaxDist
};

const StatusCmp = props => {
  let content = props.grameneFiltersStatus;
  if (props.grameneFiltersStatus === 'ready' && props.grameneSearch) {
    let genes = props.grameneSearch.response.numFound;
    let genomes = props.grameneSearch.facet_counts.facet_fields.taxon_id.length / 2;
    content = <span>Found:&nbsp;<b>{genes}</b> genes in <b>{genomes}</b> genomes</span>;
  }
  return <div style={{padding:'5px', backgroundColor:'dimgray', color:'cornsilk', fontSize:'small'}}>{content}</div>
};

const Status = connect(
  'selectGrameneSearch',
  'selectGrameneFiltersStatus',
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
    let menuItems = [
      <li onClick={()=>actions.changeOperation(node)}>convert to <i>{node.operation === 'AND' ? 'OR' : 'AND'}</i></li>,
      <li onClick={()=>actions.negate(node)}>negate</li>
    ];
    if (node.leftIdx > 0) {
      menuItems.push(<li onClick={()=>actions.deleteNode(node)}>delete</li>);
      menuItems.push(<li onClick={()=>actions.markTargets(node,'move')}>move{node.isSource && ' select destination'}</li>);
      menuItems.push(<li onClick={()=>actions.markTargets(node,'copy')}>copy{node.isSource && ' select destination'}</li>)
    }
    menu = <div className='gramene-filter-menu'><ul>{menuItems}</ul></div>;
  }

  if (node.operation) {
    children = node.children.map(child => <Filter moveCopyMode={moveCopyMode} node={child} showMarked={showMarked} actions={actions}/>);
    content = <span className='gramene-filter-operation'
                    onClick={()=>actions.toggleMenu(node)}>{node.operation}</span>
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
    return <div className='gramene-filter-container'>
      <b>Filters</b>
      <Filter node={props.grameneFilters}
                   moveCopyMode={props.grameneFilters.moveCopyMode}
                   showMarked={props.grameneFilters.showMarked}
                   actions={actions}/>
    </div>
  }
  else {
    return <div className='gramene-filter-container'>
      <b>Filters</b>
      <div className='gramene-filter gramene-filter-AND'>No filters defined</div>
    </div>
  }
};

const Filters = connect(
  'selectGrameneFilters',
  'doNegateGrameneFilter',
  'doDeleteGrameneFilter',
  'doChangeGrameneFilterOperation',
  'doMoveOrCopyGrameneFilter',
  'doMarkGrameneFilterTargets',
  'doUnmarkGrameneFilterTargets',
  'doToggleGrameneFilterMenu',
  FiltersCmp
);

const ResultsCmp = props => {
  let activeViews = props.grameneViews.options.filter(v => {return v.show === 'on'});
  if (props.grameneFilters.rightIdx === 1 || activeViews.length === 0) {
    return <HelpDemo/>
  }
  return (
    <div>
      {activeViews.map(v => React.createElement(inventory[v.id], props))}
    </div>
  );
};

const Results = connect(
  'selectGrameneFilters',
  'selectGrameneViews',
  ResultsCmp
);

const ViewsCmp = props => (
  <div className={'gramene-view-container'}>
    <b>Views</b>
    <ul className={'gramene-view'}>
      {props.grameneViews.options.map((view,idx) => (
        <li className={`gramene-view-${view.show}`}
            onClick={(e) => {
              if (view.show !== 'disabled') {
                props.doToggleGrameneView(idx)
              }
            }}
        >{view.name}</li>
      ))}
    </ul>
    <div>
      &nbsp;Key:
      <ul className={'gramene-view'}>
        <li className='gramene-view-on'>On</li>
        <li className='gramene-view-off'>Off</li>
        <li className='gramene-view-disabled'>Disabled</li>
      </ul>
    </div>
    &nbsp;
  </div>
);

const Views = connect(
  'selectGrameneViews',
  'doToggleGrameneView',
  ViewsCmp
);

export {Status, Filters, Results, Views};
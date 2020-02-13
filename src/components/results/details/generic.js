import React from 'react';
import keyBy from 'lodash/keyBy';
// import {bs, Grid, Row, Col, Glyphicon} from 'react-bootstrap';
import _ from "lodash";
import ReactGA from "react-ga";

export const Detail = props => {
  let subComponents = keyBy(props.children, 'key');
  return (
    <div className="detail">
      <div className="intro">
        {subComponents.title}
        {subComponents.description}
      </div>
      <div className="content-wrapper">
        {subComponents.content}
      </div>
      <div className="actions">
        <div className="action-wrapper" xs={12} sm={5}>
          {subComponents.explore}
        </div>
        <div className="action-wrapper" xs={12} sm={7}>
          {subComponents.links}
        </div>
      </div>
    </div>
  )
};

export const Title = props => <h4>{props.children}</h4>;
export const Description = props => <p className="description">{props.children}</p>;
export const Content = props => <p className="content">{props.children}</p>;

const QueryTerm = props => {
  let category, name, badge;
  name = props.name;
  if (this.props.category) {
    category = this.props.category + ' | ';
  }
  if (_.isNumber(this.props.count)) {
    badge = <span>{this.props.count}</span>
  }
  return (
    <div className="query-term-outer">
      <div className="query-term">
        {category}
        <a>{name}</a>
        {badge}
      </div>
    </div>
  )
};

function renderExplorations(explorations) {
  return explorations.map(
    (exploration, idx) =>
      <li key={idx}>
        <QueryTerm {...exploration} />
      </li>
  );
}
export const Explore = props => (
  <div className="explore">
    <h5>Search Gramene</h5>
    <ul>
      {renderExplorations(props.explorations)}
    </ul>
  </div>
);

function renderLinks(links) {
  let external = <small title="This link opens a page from an external site"> <Glyphicon glyph="new-window" /></small>;
  return links.map((link, idx) =>
    <li key={idx}>
      <ReactGA.OutboundLink
        eventLabel={link.name}
        to={link.url}
        className="external-link"
      >
        {link.name}{external}
      </ReactGA.OutboundLink>
    </li>
  )
}

export const Links = props => (
  <div className="links">
    <h5>Links to other resources</h5>
    <ul>
      {renderLinks(props.links)}
    </ul>
  </div>
);

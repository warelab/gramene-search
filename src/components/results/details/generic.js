import React from 'react';
import keyBy from 'lodash/keyBy';
import _ from "lodash";
import ReactGA from "react-ga";
import { BiLinkExternal } from "react-icons/bi";
import { Button, Badge } from "react-bootstrap";

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
export const Content = props => <div className="content">{props.children}</div>;

const QueryTerm = props => {
  let category, name, badge;
  name = props.name;
  if (props.category) {
    category = props.category + ' | ';
  }
  if (_.isNumber(props.count)) {
    badge = <Badge style={{marginLeft: "0.5rem"}} variant='dark'>{props.count}</Badge>
  }
  return (
    <Button variant='outline-dark' onClick={props.handleClick}>
      {category}{name}{badge}
    </Button>
  )
};

function renderExplorations(explorations) {
  return explorations.map(
    (exploration, idx) =>
      <QueryTerm key={idx} {...exploration} />
  );
}
export const Explore = props => (
  <div className="explore">
    <h5>Search Filters</h5>
    <div>
      {renderExplorations(props.explorations)}
    </div>
  </div>
);

function renderLinks(links) {
  let external = <small title="This link opens a page from an external site"> <BiLinkExternal/></small>;
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

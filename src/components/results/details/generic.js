import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import keyBy from 'lodash/keyBy';
import _ from "lodash";
import ReactGA from "react-ga4";
import { BiLinkExternal } from "react-icons/bi";
import { Button, Badge, Modal } from "react-bootstrap";

// Controlled fullscreen wrapper. Parent owns `fullscreen` state and the
// `onExitFullscreen` callback.
//
// To keep embedded widgets (Reactome diagram, BioDalliance, TBrowse)
// alive across the toggle, the children render through createPortal
// into a single STABLE detached div. We then physically move that div
// between an inline anchor and the modal body via appendChild — React
// never sees the portal target change, so it never unmounts the
// children. The widgets' DOM, canvases, and event handlers move with
// the div.
export const FullscreenContainer = ({ fullscreen, onExitFullscreen, title, className, children }) => {
  const [stableNode] = useState(() =>
    typeof document !== 'undefined' ? document.createElement('div') : null
  );
  const inlineRef = useRef(null);
  const modalRef = useRef(null);

  useLayoutEffect(() => {
    if (!stableNode) return;
    if (className) stableNode.className = className;
    const parent = fullscreen ? modalRef.current : inlineRef.current;
    if (parent && stableNode.parentNode !== parent) {
      parent.appendChild(stableNode);
    }
  });

  useEffect(() => {
    // Container width changes when toggling fullscreen. Embedded widgets
    // that listen for window resize (Pathways, etc.) re-measure on this
    // event.
    window.dispatchEvent(new Event('resize'));
  }, [fullscreen]);

  return (
    <>
      <div ref={inlineRef} />
      {fullscreen && (
        <Modal show fullscreen onHide={onExitFullscreen}>
          <Modal.Header closeButton>
            <Modal.Title>{title}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div ref={modalRef} />
          </Modal.Body>
        </Modal>
      )}
      {stableNode && createPortal(children, stableNode)}
    </>
  );
};

export const Detail = props => {
  const subComponents = keyBy(props.children, 'key');
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
  );
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
    badge = <Badge style={{marginLeft: "0.5rem"}} bg='secondary'>{props.count}</Badge>
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
      <a href={link.url} target="_blank" className="external-link" onClick={()=>{
        ReactGA.event({
          category: "outbound link", action: "follow", label: link.name
        })
      }}>{link.name}{external}</a>
      {/*<ReactGA.OutboundLink*/}
      {/*  eventLabel={link.name}*/}
      {/*  to={link.url}*/}
      {/*  target="_blank"*/}
      {/*  className="external-link"*/}
      {/*>*/}
      {/*  {link.name}{external}*/}
      {/*</ReactGA.OutboundLink>*/}
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

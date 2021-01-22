import React from "react";
import { connect } from 'redux-bundler-react'
import { Modal } from "react-bootstrap";

const TaxonomyModal = props => {
  return (
    <Modal
      show={props.grameneGenomes.show}
      onHide={props.doToggleGrameneGenomes}
      size='lg'
    >
      <Modal.Header closeButton>
        <Modal.Title>Select Genomes of Interest</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>checklist of species</p>
      </Modal.Body>
    </Modal>
  )
};

export default connect(
  'selectGrameneGenomes',
  'doToggleGrameneGenomes',
  TaxonomyModal
)

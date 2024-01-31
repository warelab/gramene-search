import React from "react";
import { connect } from 'redux-bundler-react'
import { Modal, Button } from "react-bootstrap";

class TaxonomyModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      genomes : Object.values(props.grameneMaps).sort((a,b) => a.left_index - b.left_index)
    };
    if (Object.keys(props.grameneGenomes.active).length === 0) {
      this.state.genomes.forEach(g => {
        g.selected = !g.hidden;
      })
    }
    else {
      this.state.genomes.forEach(g => {
        g.selected = !g.hidden && props.grameneGenomes.active[g.taxon_id];
      })
    }
  }
  getSelectedGenomes() {
    let selected = {};
    let notHidden = {};
    let somethingWasSelected = false;
    this.state.genomes.forEach(g => {
      if (!g.hidden) {
        notHidden[g.taxon_id] = true;
        if (g.selected) {
          selected[g.taxon_id] = true;
          somethingWasSelected = true;
        }
      }
    });
    return somethingWasSelected ? selected : notHidden;
  }
  handleChange(e) {
    const idx = +e.target.value;
    let newState = Object.assign({},this.state);
    newState.genomes[idx].selected = !newState.genomes[idx].selected;
    this.setState(newState);
  }
  handleClose() {
    this.props.doUpdateGrameneGenomes(this.getSelectedGenomes())
  }
  selectAll() {
    const genomes = this.state.genomes.map(g => {g.selected = true; return g});
    this.setState({genomes});
  }
  selectNone() {
    const genomes = this.state.genomes.map(g => {g.selected = false; return g});
    this.setState({genomes});
  }
  renderGenomes() {
    return (
      <div>
        {this.state.genomes.map((m,idx) => {
          if(m.hidden) return <></>
          return (
            <div key={idx}>
              <input checked={m.selected}
                     onChange={this.handleChange.bind(this)}
                     type="checkbox"
                     value={idx}
              />
              {' '}{m.display_name}
            </div>
          )
        })}
        <Button onClick={this.handleClose.bind(this)}>Submit</Button>
      </div>
    )
  }
  render() {
    return (
      <Modal
        show={this.props.grameneGenomes.show}
        onHide={this.handleClose.bind(this)}
        size='lg'
      >
        <Modal.Header closeButton>
          <Modal.Title>Select Genomes of Interest</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="outline-secondary" onClick={this.selectAll.bind(this)}>All</Button>{' '}
          <Button variant="outline-secondary" onClick={this.selectNone.bind(this)}>None</Button>
          {this.renderGenomes()}
        </Modal.Body>
      </Modal>
    )
  }
};

export default connect(
  'selectGrameneGenomes',
  'selectGrameneMaps',
  'doUpdateGrameneGenomes',
  TaxonomyModal
)

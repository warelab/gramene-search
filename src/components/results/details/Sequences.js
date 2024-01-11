import React, { useState, useEffect } from 'react';
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Container, Row, Col, ToggleButton, ButtonGroup } from 'react-bootstrap';
import { AiOutlineCopy } from 'react-icons/ai';
import './sequences.css';
import keyBy from "lodash/keyBy";

const CodeBlock = props => {
  const plainFasta = `>${props.id}\n${props.seq}`

  const [showNotification, setShowNotification] = useState(false);

  const copyCode = () => {
    // Use the Clipboard API to write text to the clipboard
    navigator.clipboard.writeText(plainFasta)
      .then(() => {
        setShowNotification(true);
      })
      .catch((err) => {
        console.error('Unable to copy to clipboard', err);
      });
  };

  useEffect(() => {
    if (showNotification) {
      const notificationTimeout = setTimeout(() => {
        setShowNotification(false);
      }, 2000); // Hide the notification after 2 seconds

      return () => clearTimeout(notificationTimeout);
    }
  }, [showNotification]);

  return (
    <div className="fasta-container">
      <code className="fasta"><span className="header">&gt;{props.id}</span><br/>{
        props.blocks.map((block,idx) =>
          <span key={idx} className={block.kind}>{block.seq}</span>
        )
      }</code>
      <p className="fasta-key">
        <b>Key:</b>&nbsp;5'UTR&nbsp;
        <span className="square-utr5">&nbsp;&nbsp;</span>
        &nbsp;CDS&nbsp;
        <span className="square-cds">&nbsp;&nbsp;</span>
        &nbsp;3'UTR&nbsp;
        <span className="square-utr3">&nbsp;&nbsp;</span>
      </p>
      <button className="copy-button" onClick={copyCode}><AiOutlineCopy /></button>
      {showNotification && <div className="notification">Sequence copied</div>}
    </div>
  );
};

const decoratePeptide = (seq, transcript) => {
  let junctions = [];
  transcript.exon_junctions.forEach((ej, idx) => {
    if (ej > transcript.cds.start && ej <= transcript.cds.end) {
      junctions.push(Math.floor((ej - transcript.cds.start) / 3));
    }
  });
  if (junctions.length === 0) {
    return [{kind:'cds', seq:seq}];
  }
  let offset = 0;
  let blocks = [];
  junctions.forEach((j, idx) => {
    let kind = idx % 2 === 0 ? "cds" : "cds-other";
    blocks.push({kind: kind, seq: seq.substring(offset, j)});
    offset = j;
  });
  blocks.push({kind: junctions.length % 2 === 0 ? "cds" : "cds-other", seq: seq.substring(junctions.pop())});
  return blocks;
}
const decorateSeq = (geneSeq, gene, up, down, tid, mode) => {
  // return a list of blocks with kind and seq properties
  let blocks = [];
  const transcript = gene.gene_structure.transcripts.find(tr => tr.id === tid);
  const offset = gene.location.strand === 1
    ? gene.location.start - geneSeq.start
    : geneSeq.end - gene.location.end
  if (up > 0) {
    const TSS = gene.gene_structure.exons.find(exon => exon.id === transcript.exons[0]).start;
    blocks.push({
      kind:'upstream',
      seq: geneSeq.seq.substring(offset - up + TSS - 1, offset + TSS - 1).toLowerCase()
    })
  }
  // add exons and introns based on tid
  let pos_in_transcript = 0;
  let pos_in_gene = 0;
  let blockType = 'utr5';
  let extra = '';
  transcript.exons.forEach((eid, e_idx) => {
    const exon = gene.gene_structure.exons.find(exon => exon.id === eid);
    if (e_idx > 0 && mode === "dna") {
      blocks.push({
        kind: 'intron',
        seq: geneSeq.seq.substring(offset + pos_in_gene, offset + exon.start - 1).toLowerCase()
      });
      pos_in_gene = exon.start-1;
    }
    if (mode === "rna") {
      extra = e_idx % 2 === 1 ? '-other' : '';
    }
    let exon_length = exon.end - exon.start + 1;
    if (transcript.cds && pos_in_transcript < transcript.cds.start && pos_in_transcript + exon_length >= transcript.cds.start) {
      // CDS starts in this exon
      const utr5_len = transcript.cds.start - pos_in_transcript - 1;
      if (utr5_len > 0) {
        blocks.push({
          kind: blockType + extra,
          seq: geneSeq.seq.substring(offset + pos_in_gene, offset + pos_in_gene + utr5_len)
        });
        exon_length -= utr5_len;
        pos_in_gene += utr5_len;
        pos_in_transcript = transcript.cds.start - 1;
      }
      blockType = 'cds';
    }
    if (blockType === 'cds' && pos_in_transcript + exon_length >= transcript.cds.end) {
      // CDS ends in this exon
      const cds_len = transcript.cds.end - pos_in_transcript;
      if (cds_len > 0) {
        blocks.push({
          kind: blockType + extra,
          seq: geneSeq.seq.substring(offset + pos_in_gene, offset + pos_in_gene + cds_len)
        });
        exon_length -= cds_len;
        pos_in_gene += cds_len;
        pos_in_transcript = transcript.cds.end;
      }
      blockType = 'utr3';
    }
    if (exon_length > 0) {
      blocks.push({
        kind: blockType + extra,
        seq: geneSeq.seq.substring(offset + pos_in_gene, offset + pos_in_gene + exon_length)
      })
    }
    pos_in_gene = exon.end;
    pos_in_transcript += exon_length;
  })
  // check if there's more to the gene locus after end of transcript?
  // downstream is currently relative to end of transcript but upstream is relative to first TSS
  if (down > 0) {
    blocks.push({
      kind:'downstream',
      seq: geneSeq.seq.substring(offset + pos_in_gene, offset + pos_in_gene + down).toLowerCase()
    })
  }
  return blocks;
};
const buildId = (gene, geneSeq, up, down) => {
  let gs = gene.location.strand === 1 ? gene.location.start - up : gene.location.start - down;
  let ge = gene.location.strand === 1 ? gene.location.end + down : gene.location.end + up;
  let extras = [];
  if (gene.location.strand === -1) {
    extras.push('reverse')
  }
  if (up > 0) {
    extras.push(`upstream=${up}`)
  }
  if (down > 0) {
    extras.push(`downstream=${down}`)
  }
  return `${geneSeq.genome}|${gene._id}|${gene.location.region}:${gs}..${ge} ${extras.join('|')}`
};
const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  const [tab, setTab] = useState('dna');
  const [upstream, setUpstream] = useState(0);
  const [downstream, setDownstream] = useState(0);
  const [tid, setTid] = useState(gene.gene_structure.canonical_transcript);
  let geneSeq;
  let rnaSeq;
  let pepSeq;
  if (props.geneSequences && props.geneSequences[gene._id]) {
    geneSeq = props.geneSequences[gene._id];
  }
  else {
    props.doRequestGeneSequence(gene)
    return <pre>loading</pre>;
  }
  if (props.rnaSequences && props.rnaSequences[tid]) {
    rnaSeq = props.rnaSequences[tid]
  }
  else {
    props.doRequestRnaSequence(tid, gene)
    return <pre>loading</pre>;
  }
  const maxUp = gene.location.strand === 1 ? gene.location.start - geneSeq.start : geneSeq.end - gene.location.end;
  const maxDown = gene.location.strand === -1 ? gene.location.start - geneSeq.start : geneSeq.end - gene.location.end;
  const transcript = gene.gene_structure.transcripts.find(tr => tr.id === tid);
  let tl_id;
  if (transcript.translation) {
    tl_id = transcript.translation.id;
    if (props.pepSequences && props.pepSequences[tl_id]) {
      pepSeq = props.pepSequences[tl_id];
    }
    else {
      props.doRequestPepSequence(tl_id, gene);
      return <pre>loading</pre>;
    }
  }
  return <Tabs activeKey={tab}
    onSelect={(k) => setTab(k)}
    >
    <Tab tabClassName="dna" eventKey="dna" title="Genomic sequence">
      <Container style={{ width: '100ch', marginLeft: 0}}>
        <Row>
          <Col><b><i>Show flanking sequence</i></b></Col>
        </Row>
        <Row>
          <Col style={{ maxWidth: '5ch', textAlign: 'right'}}>{upstream}</Col>
          <Col style={{maxWidth: '20ch'}}>
            <Form.Range
              className="reverse-slide"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
              min={0}
              max={maxUp}
              step={10}
            /><div style={{textAlign:'right'}}>Upstream</div>
          </Col>
          <Col style={{maxWidth: '30ch'}}>
            <div className="styled-span">
              <div className="vertical-line"/>
              <div className="horizontal-line"/>
              <span>Transcript (unspliced)</span>
              <div className="horizontal-line"/>
              <div className="vertical-line"/>
            </div>
          </Col>
          <Col style={{maxWidth: '20ch'}}>
            <Form.Range
              value={downstream}
              onChange={(e) => setDownstream(e.target.value)}
              min={0}
              max={maxDown}
              step={10}
            /><div style={{textAlign:'left'}}>Downstream</div>
          </Col>
          <Col style={{ maxWidth: '5ch', textAlign: 'left'}}>{downstream}</Col>
        </Row>
        {gene.gene_structure.transcripts.length > 1 &&
        <Row>
          <Col><b><i>Highlight transcript</i></b><br/>
            <ButtonGroup>{gene.gene_structure.transcripts.sort((a,b) => a.id.localeCompare(b.id)).map((tr, idx) => {
              let v = tr.id === gene.gene_structure.canonical_transcript ? 'primary' : 'secondary';
              if (tr.id !== tid) {
                v = `outline-${v}`
              }
              return <ToggleButton
                variant={v}
                key={idx}
                id={`radio-${idx}`}
                type="radio"
                name={tr.id}
                value={tr.id}
                checked={tr.id === tid}
                onChange={e => setTid(e.currentTarget.value)}
                >{tr.id}</ToggleButton>
            })}</ButtonGroup>
          </Col>
        </Row>
      }
      </Container>
      {geneSeq && <CodeBlock id={buildId(gene,geneSeq,+upstream,+downstream)} seq={geneSeq.seq.substring(maxUp - +upstream, maxUp + gene.location.end - gene.location.start + 1 + +downstream)} blocks={decorateSeq(geneSeq,gene,+upstream,+downstream,tid,"dna")}/>}
    </Tab>
    <Tab tabClassName="rna" eventKey="rna" title="Transcript sequence">
      <Container style={{ width: '100ch', marginLeft: 0}}>
        {gene.gene_structure.transcripts.length > 1 &&
        <Row>
          <Col><b><i>Select transcript</i></b><br/>
            <ButtonGroup>{gene.gene_structure.transcripts.sort((a,b) => a.id.localeCompare(b.id)).map((tr, idx) => {
              let v = tr.id === gene.gene_structure.canonical_transcript ? 'primary' : 'secondary';
              if (tr.id !== tid) {
                v = `outline-${v}`
              }
              return <ToggleButton
                variant={v}
                key={idx}
                id={`radio-${idx}`}
                type="radio"
                name={tr.id}
                value={tr.id}
                checked={tr.id === tid}
                onChange={e => setTid(e.currentTarget.value)}
                >{tr.id}</ToggleButton>
            })}</ButtonGroup>
          </Col>
        </Row>
      }
      </Container>
      {geneSeq && <CodeBlock id={tid} seq={rnaSeq.seq} blocks={decorateSeq(geneSeq,gene,0,0,tid,"rna")}/>}
    </Tab>
    {gene.biotype === "protein_coding" &&
      <Tab tabClassName="pep" eventKey="pep" title="Peptide sequence">
        <Container style={{ width: '100ch', marginLeft: 0}}>
          {gene.gene_structure.transcripts.length > 1 &&
        <Row>
          <Col><b><i>Select transcript</i></b><br/>
            <ButtonGroup>{gene.gene_structure.transcripts.sort((a,b) => a.id.localeCompare(b.id)).map((tr, idx) => {
              let v = tr.id === gene.gene_structure.canonical_transcript ? 'primary' : 'secondary';
              if (tr.id !== tid) {
                v = `outline-${v}`
              }
              return <ToggleButton
                variant={v}
                key={idx}
                id={`radio-${idx}`}
                type="radio"
                name={tr.id}
                value={tr.id}
                checked={tr.id === tid}
                onChange={e => setTid(e.currentTarget.value)}
                >{tr.id}</ToggleButton>
            })}</ButtonGroup>
          </Col>
        </Row>
      }
        </Container>
        {geneSeq && <CodeBlock id={tl_id} seq={pepSeq.seq} blocks={decoratePeptide(pepSeq.seq,transcript)}/>}
      </Tab>}
  </Tabs>
};

export default connect(
  'selectConfiguration',
  'selectGeneSequences',
  'selectRnaSequences',
  'selectPepSequences',
  'doRequestGeneSequence',
  'doRequestRnaSequence',
  'doRequestPepSequence',
  Detail
);


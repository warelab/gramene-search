import React from 'react';
import { connect } from 'redux-bundler-react';
import { Modal, Button, ProgressBar } from 'react-bootstrap';

const ExportFooterCmp = props => {
  const {
    exporterSelectedFields,
    exporterFormat,
    exporterDownload: dl,
    doStartExporterDownload,
    doCancelExporterDownload,
    doResetExporterDownload
  } = props;

  const inFlight = dl.status === 'preparing' || dl.status === 'downloading';
  const pct = dl.total > 0
    ? Math.min(100, Math.round((dl.progress / dl.total) * 100))
    : 0;

  const canStart = !inFlight && exporterSelectedFields.length > 0;

  return (
    <>
      <div className="exporter-footer">
        <div className="exporter-footer-summary">
          <small>
            {exporterSelectedFields.length} field{exporterSelectedFields.length === 1 ? '' : 's'} selected
            · format: <b>{exporterFormat.toUpperCase()}</b>
          </small>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!canStart}
          onClick={doStartExporterDownload}
        >
          Download {exporterFormat.toUpperCase()}
        </Button>
      </div>

      <Modal show={dl.status !== 'idle'} onHide={doResetExporterDownload} centered backdrop="static">
        <Modal.Header closeButton={!inFlight}>
          <Modal.Title>
            {dl.status === 'preparing' && 'Preparing export…'}
            {dl.status === 'downloading' && 'Exporting…'}
            {dl.status === 'done' && 'Export complete'}
            {dl.status === 'cancelled' && 'Export cancelled'}
            {dl.status === 'error' && 'Export failed'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {inFlight && (
            <>
              <ProgressBar
                now={pct}
                label={dl.total > 0 ? `${dl.progress.toLocaleString()} / ${dl.total.toLocaleString()}` : 'Counting…'}
                striped
                animated
              />
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                Fetching genes in pages of 1000. This may take a while for large result sets.
              </div>
            </>
          )}
          {dl.status === 'done' && (
            <div>
              Wrote <b>{dl.progress.toLocaleString()}</b> genes to disk.
            </div>
          )}
          {dl.status === 'cancelled' && (
            <div>
              Stopped at <b>{dl.progress.toLocaleString()}</b> / {dl.total.toLocaleString()} genes. No file was saved.
            </div>
          )}
          {dl.status === 'error' && (
            <div className="text-danger">{dl.error}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {inFlight ? (
            <Button variant="outline-secondary" size="sm" onClick={doCancelExporterDownload}>
              Cancel
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={doResetExporterDownload}>
              Close
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default connect(
  'selectExporterSelectedFields',
  'selectExporterFormat',
  'selectExporterDownload',
  'doStartExporterDownload',
  'doCancelExporterDownload',
  'doResetExporterDownload',
  ExportFooterCmp
);

import React from 'react';
import { connect } from 'redux-bundler-react';
import FieldTree from './FieldTree';
import SelectedFields from './SelectedFields';
import Preview from './Preview';
import ExportFooter from './ExportFooter';
import './styles.css';

const ExporterViewCmp = props => {
  const {
    fieldCatalog: catalog,
    grameneFieldCatalogIsLoading: isLoading,
    grameneFieldCatalogRaw: raw
  } = props;

  if (!catalog || !catalog.groups) {
    const msg = isLoading ? 'Loading…' : (raw && raw.error) ? `error: ${String(raw.error)}` : 'init';
    return (
      <div className="exporter-view">
        <em style={{padding: '1rem'}}>Loading field catalog… ({msg})</em>
      </div>
    );
  }

  return (
    <div className="exporter-view">
      <div className="exporter-pane">
        <div className="exporter-pane-header">
          <b>Available fields</b>
          <small style={{color: '#888', marginLeft: '0.5rem'}}>
            {Object.keys(catalog.fields).length} total
          </small>
        </div>
        <div className="exporter-pane-body">
          <FieldTree/>
        </div>
      </div>

      <div className="exporter-pane exporter-right-pane">
        <div className="exporter-pane-header">
          <b>Export configuration</b>
        </div>
        <div className="exporter-right-split">
          <div className="exporter-selected-section">
            <SelectedFields/>
          </div>
          <div className="exporter-preview-section">
            <Preview/>
          </div>
          <ExportFooter/>
        </div>
      </div>
    </div>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectGrameneFieldCatalogIsLoading',
  'selectGrameneFieldCatalogRaw',
  ExporterViewCmp
);

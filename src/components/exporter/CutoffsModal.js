import React, { useState, useEffect } from 'react';

const parseNumberOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = +v;
  return Number.isFinite(n) ? n : null;
};

const CutoffsModal = ({ cutoffs, onApply, onClose }) => {
  const [exprMinTPM, setExprMinTPM] = useState(
    cutoffs && cutoffs.exprMinTPM != null ? String(cutoffs.exprMinTPM) : ''
  );
  const [diffMaxPval, setDiffMaxPval] = useState(
    cutoffs && cutoffs.diffMaxPval != null ? String(cutoffs.diffMaxPval) : ''
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apply = () => {
    onApply({
      exprMinTPM: parseNumberOrNull(exprMinTPM),
      diffMaxPval: parseNumberOrNull(diffMaxPval)
    });
    onClose();
  };

  return (
    <div className="exporter-modal-backdrop" onClick={onClose}>
      <div className="exporter-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="exporter-modal-header">
          <b>Expression cutoffs</b>
          <button type="button" className="exporter-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="exporter-modal-body">
          <div className="exporter-modal-field">
            <label>
              Minimum TPM (gene expression)
              <input
                type="number"
                step="0.1"
                min="0"
                value={exprMinTPM}
                onChange={e => setExprMinTPM(e.target.value)}
                placeholder="no minimum"
              />
            </label>
            <small>Exclude expression rows with TPM below this value. Blank disables the cutoff.</small>
          </div>
          <div className="exporter-modal-field">
            <label>
              Maximum p-value (differential expression)
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                value={diffMaxPval}
                onChange={e => setDiffMaxPval(e.target.value)}
                placeholder="no maximum"
              />
            </label>
            <small>Exclude diff-expression contrasts with p-value above this. Blank disables the cutoff.</small>
          </div>
        </div>
        <div className="exporter-modal-footer">
          <button type="button" className="btn btn-sm btn-link" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default CutoffsModal;

// "Save this view" UI — sits inside the Auth sidebar panel.
//
// Sign-in-gated by Auth.js (we only mount this when `user` is truthy). Opens
// a modal with label + description + visibility toggle; on save, swaps to a
// post-save state that shows the shareable URL with a copy button.
//
// Talks to the savedViews bundle. The snapshot itself is built inside
// doSaveView via selectViewSnapshot — this component doesn't know or care
// what the snapshot looks like.

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Form, InputGroup, Alert, Spinner } from 'react-bootstrap';
import { connect } from 'redux-bundler-react';
import { BsClipboard, BsCheck2 } from 'react-icons/bs';

const SaveViewButtonCmp = ({ user, savedViews, doSaveView, doResetSavedViewState }) => {
  const [showModal, setShowModal] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    setLabel('');
    setDescription('');
    setIsPublic(false);
    setShareUrl(null);
    setCopied(false);
    doResetSavedViewState();
  }, [doResetSavedViewState]);

  const handleOpen = () => { reset(); setShowModal(true); };
  const handleClose = () => { setShowModal(false); reset(); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    try {
      const { shareUrl } = await doSaveView({
        user,
        label: label.trim(),
        description: description.trim(),
        isPublic
      });
      setShareUrl(shareUrl);
    } catch (_) {
      // savedViews.saveError is already set; modal renders it
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* fallback: user can select-all */ }
  };

  const saving = savedViews && savedViews.saving;
  const saveError = savedViews && savedViews.saveError;

  return (
    <>
      <Button
        size="sm"
        variant="outline-primary"
        style={{ marginTop: 8 }}
        onClick={handleOpen}
        title="Save the current filters, views, and detail tabs as a shareable link"
      >
        Save this view
      </Button>

      <Modal show={showModal} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>{shareUrl ? 'View saved' : 'Save this view'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!shareUrl && (
            <Form onSubmit={handleSave}>
              <Form.Group className="mb-3">
                <Form.Label>Name</Form.Label>
                <Form.Control
                  autoFocus
                  type="text"
                  placeholder="e.g. TAIR loci with TF binding sites"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={saving}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Description (optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="save-view-public"
                  label="Make this view public (visible to anyone with the link)"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  disabled={saving}
                />
              </Form.Group>
              {saveError && <Alert variant="danger">{saveError}</Alert>}
              <div className="d-flex justify-content-end gap-2">
                <Button variant="secondary" onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving || !label.trim()}>
                  {saving ? <><Spinner as="span" size="sm" animation="border" /> Saving…</> : 'Save'}
                </Button>
              </div>
            </Form>
          )}

          {shareUrl && (
            <>
              <p>Share this link to let others open the same search and detail state:</p>
              <InputGroup>
                <Form.Control
                  type="text"
                  value={shareUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <Button variant={copied ? 'success' : 'outline-secondary'} onClick={handleCopy}>
                  {copied ? <><BsCheck2 /> Copied</> : <><BsClipboard /> Copy</>}
                </Button>
              </InputGroup>
              <div className="mt-3 d-flex justify-content-end">
                <Button variant="primary" onClick={handleClose}>Done</Button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
};

export default connect(
  'selectSavedViews',
  'doSaveView',
  'doResetSavedViewState',
  SaveViewButtonCmp
);

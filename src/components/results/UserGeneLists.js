import {connect} from "redux-bundler-react";
import React, { useEffect, useMemo, useState } from 'react';
import {Table, Form, Button, ButtonGroup, Alert, Spinner, Container, Row, Col, Modal} from 'react-bootstrap';
import { getFirebaseApp } from "../utils";
import {getAuth, onAuthStateChanged} from "firebase/auth";

const MAX_GENE_IDS = 1000; // Define the maximum number of gene IDs allowed

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
};

const applySortFilter = (lists, search, sort) => {
  const s = search.trim().toLowerCase();
  let result = s
    ? lists.filter(l => (l.label || '').toLowerCase().includes(s))
    : lists.slice();
  const { key, dir } = sort;
  const mult = dir === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'createdAt' || key === 'deletedAt') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else if (key === 'n_genes') {
      av = av || 0;
      bv = bv || 0;
    } else {
      av = (av || '').toString().toLowerCase();
      bv = (bv || '').toString().toLowerCase();
    }
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
  return result;
};

const SortHeader = ({ label, sortKey, sort, onToggle }) => {
  const active = sort.key === sortKey;
  const indicator = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}
      onClick={() => onToggle(sortKey)}
    >
      {label}{indicator}
    </th>
  );
};

const stickyHeaderStyle = { position: 'sticky', top: 0, background: '#fff', zIndex: 1 };

const GeneListDisplayComponent = props => {
  const [publicGeneLists, setPublicGeneLists] = useState([]);
  const [privateGeneLists, setPrivateGeneLists] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState({});
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'trash'
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { list, permanent }
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });
  const auth = props.auth;
  const isTrash = viewMode === 'trash';
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, [auth]);

  const toggleSort = (key) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );

  const currentUid = user && user.uid;
  const mergedLists = useMemo(() => {
    const byId = new Map();
    [...publicGeneLists, ...privateGeneLists].forEach(l => byId.set(l._id, l));
    return Array.from(byId.values());
  }, [publicGeneLists, privateGeneLists]);

  const displayedLists = useMemo(
    () => applySortFilter(mergedLists, search, sort),
    [mergedLists, search, sort]
  );

  // includeDeleted: 'active' (default) or 'trash'. Trash is auth-only and holds
  // the caller's own soft-deleted lists (restorable for 30 days).
  const fetchPrivateGeneLists = async (includeDeleted = 'active') => {
    if (!auth) {
      setPrivateGeneLists([]);
      setError(null);
      setNotice(null);
      return;
    }
    if (!user || typeof user.getIdToken !== 'function') {
      setPrivateGeneLists([]);
      setError(null);
      setNotice(includeDeleted === 'trash'
        ? 'Log in to view your deleted gene lists.'
        : 'Log in to create and manage your personal gene lists.');
      return;
    }
    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `${props.api}/gene_lists?site=${props.site}&isPublic=false&includeDeleted=${includeDeleted}`,
        {
          method: 'GET',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        }
      );
      const result = await response.json();

      if (response.ok) {
        setError(null);
        // Keep any restore/delete notice; only clear the "log in" prompt.
        setNotice(n => (n && /Log in/.test(n)) ? null : n);
        setPrivateGeneLists(result);
      } else {
        setError('Error fetching gene lists.');
      }
    } catch (err) {
      setError('Failed to fetch private gene lists. Please try again later.');
    }
  };

  // Public lists are always active (soft-deleted lists are never public-visible;
  // the trash view is caller-scoped).
  const fetchPublicGeneLists = async () => {
    try {
      const response = await fetch(`${props.api}/gene_lists?site=${props.site}&isPublic=true`);
      const result = await response.json();

      if (response.ok) {
        setPublicGeneLists(result);
      } else {
        setError('Error fetching gene lists.');
      }
    } catch (err) {
      setError('Failed to fetch gene lists. Please try again later.');
    }
  };

  const refresh = () => {
    if (isTrash) {
      setPublicGeneLists([]);
      fetchPrivateGeneLists('trash');
    } else {
      fetchPublicGeneLists();
      fetchPrivateGeneLists('active');
    }
  };

  // Fetch when the user, view mode, or an external save (refreshKey) changes.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, viewMode, props.refreshKey]);

  // A logged-out user has no trash; fall back to the active (public) view.
  useEffect(() => {
    if (!currentUid && isTrash) setViewMode('active');
  }, [currentUid, isTrash]);

  const switchView = (mode) => {
    setViewMode(mode);
    setEditingId(null);
    setSearch('');
    setNotice(null);
    setSort({ key: mode === 'trash' ? 'deletedAt' : 'createdAt', dir: 'desc' });
  };

  const viewGeneList = (list) => {
    props.addFilter({
      category: 'Gene List',
      fq_field: 'saved_search',
      fq_value: list.hash,
      name: list.label
    })
  };

  const startEdit = (list) => {
    setEditingId(list._id);
    setEditLabel(list.label || '');
    setEditIsPublic(!!list.isPublic);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel('');
    setEditIsPublic(false);
  };

  const saveEdit = async (listId) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${props.api}/gene_lists?listId=${encodeURIComponent(listId)}`, {
        method: 'PATCH',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ label: editLabel, isPublic: editIsPublic })
      });
      if (response.ok) {
        cancelEdit();
        setError(null);
        refresh();
      } else if (response.status === 401) {
        setError('You must be signed in to edit a gene list.');
      } else if (response.status === 404) {
        setError('Gene list not found or you do not own it.');
      } else if (response.status === 400) {
        setError('Nothing to update — please enter a label.');
      } else {
        setError('Failed to update gene list.');
      }
    } catch (err) {
      setError('Failed to update gene list.');
    }
  };

  const restoreList = async (list) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${props.api}/gene_lists/restore?listId=${encodeURIComponent(list._id)}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        setError(null);
        setNotice(`Restored “${list.label}”.`);
        refresh();
      } else if (response.status === 404) {
        setError('This list has been purged and can no longer be restored.');
      } else if (response.status === 401) {
        setError('You must be signed in to restore a gene list.');
      } else {
        setError('Failed to restore gene list.');
      }
    } catch (err) {
      setError('Failed to restore gene list.');
    }
  };

  const requestDelete = (list, permanent) => setDeleteTarget({ list, permanent: !!permanent });
  const cancelDelete = () => setDeleteTarget(null);

  // Default DELETE is a soft delete (moves to trash, restorable 30 days).
  // `force=true` permanently removes it (offered from the trash view).
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { list, permanent } = deleteTarget;
    setDeleteTarget(null);
    try {
      const token = await user.getIdToken();
      const url = `${props.api}/gene_lists?listId=${encodeURIComponent(list._id)}${permanent ? '&force=true' : ''}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        setError(null);
        setNotice(permanent
          ? `Permanently deleted “${list.label}”.`
          : `Moved “${list.label}” to trash — restore within 30 days from the Trash tab.`);
        refresh();
      } else if (response.status === 401) {
        setError('You must be signed in to delete a gene list.');
      } else if (response.status === 404) {
        setError('Gene list not found or you do not own it.');
      } else {
        setError('Failed to delete gene list.');
      }
    } catch (err) {
      setError('Failed to delete gene list.');
    }
  };

  const dateKey = isTrash ? 'deletedAt' : 'createdAt';
  const dateLabel = isTrash ? 'Deleted' : 'Created';

  return (
    <div className="gene-list-display-component">
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert variant="info" onClose={() => setNotice(null)} dismissible>
          {notice}
        </Alert>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2 mt-4">
        <ButtonGroup size="sm">
          <Button variant={!isTrash ? 'primary' : 'outline-secondary'} onClick={() => switchView('active')}>
            Active
          </Button>
          {currentUid && (
            <Button variant={isTrash ? 'primary' : 'outline-secondary'} onClick={() => switchView('trash')}>
              Trash
            </Button>
          )}
        </ButtonGroup>
        <Form.Control
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
          size="sm"
        />
      </div>

      {mergedLists.length > 0 ? (
        <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 4 }}>
          <Table striped hover className="mb-0">
            <thead>
            <tr>
              <SortHeader label="List Name" sortKey="label" sort={sort} onToggle={toggleSort} />
              <SortHeader label="Owner" sortKey="owner" sort={sort} onToggle={toggleSort} />
              <SortHeader label="Genes" sortKey="n_genes" sort={sort} onToggle={toggleSort} />
              <SortHeader label={dateLabel} sortKey={dateKey} sort={sort} onToggle={toggleSort} />
              <th style={stickyHeaderStyle}>Actions</th>
            </tr>
            </thead>
            <tbody>
            {displayedLists.map((list, index) => {
              const isMine = currentUid && list.uid === currentUid;
              const ownerLabel = isMine ? 'You' : (list.owner || 'Unknown');
              const dateVal = formatDate(isTrash ? list.deletedAt : list.createdAt);
              return (!isTrash && editingId === list._id) ? (
                <tr key={index}>
                  <td>
                    <Form.Control
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="List name"
                    />
                    <Form.Check
                      type="switch"
                      id={`edit-public-${list._id}`}
                      label="Public"
                      checked={editIsPublic}
                      onChange={() => setEditIsPublic(!editIsPublic)}
                      className="mt-2"
                    />
                  </td>
                  <td>{ownerLabel}</td>
                  <td>{list.n_genes || 0}</td>
                  <td>{dateVal}</td>
                  <td>
                    <Button variant="primary" size="sm" onClick={() => saveEdit(list._id)}>
                      Save
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={cancelEdit} className="ml-2">
                      Cancel
                    </Button>
                  </td>
                </tr>
              ) : (
                <tr key={index}>
                  <td>{list.label}{list.isPublic ? ' (public)' : ''}</td>
                  <td>{ownerLabel}</td>
                  <td>{list.n_genes || 0}</td>
                  <td>{dateVal}</td>
                  <td>
                    {isTrash ? (
                      isMine && (
                        <>
                          <Button variant="outline-success" size="sm" onClick={() => restoreList(list)}>
                            Restore
                          </Button>
                          <Button variant="outline-danger" size="sm" onClick={() => requestDelete(list, true)} className="ml-2">
                            Delete forever
                          </Button>
                        </>
                      )
                    ) : (
                      <>
                        <Button variant="outline-secondary" size="sm" onClick={() => viewGeneList(list)}>
                          View
                        </Button>
                        {isMine && (
                          <Button variant="outline-secondary" size="sm" onClick={() => startEdit(list)} className="ml-2">
                            Edit
                          </Button>
                        )}
                        {isMine && (
                          <Button variant="outline-danger" size="sm" onClick={() => requestDelete(list, false)} className="ml-2">
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </Table>
        </div>
      ) : (
        <Alert variant="warning" className="mt-2">
          {isTrash ? 'Trash is empty.' : 'No saved gene lists found.'}
        </Alert>
      )}

      <Modal show={!!deleteTarget} onHide={cancelDelete} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {deleteTarget && deleteTarget.permanent ? 'Permanently delete gene list?' : 'Move gene list to trash?'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteTarget && deleteTarget.permanent ? (
            <>Permanently delete <strong>{deleteTarget.list.label}</strong>? This cannot be undone.</>
          ) : (
            <>Move <strong>{deleteTarget ? deleteTarget.list.label : 'this list'}</strong> to trash?
              {' '}You can restore it within 30 days from the Trash tab.</>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={cancelDelete} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            {deleteTarget && deleteTarget.permanent ? 'Delete forever' : 'Move to trash'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const GeneListComponent = props => {
  const [geneList, setGeneList] = useState('');
  const [listHash, setListHash] = useState(null);
  const [validationError, setValidationError] = useState([]);
  const [listName, setListName] = useState('');
  const [listIsPublic, setListIsPublic] = useState(false);
  const [validatedList, setValidatedList] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false); // New loading state
  const [user, setUser] = useState({});
  const auth = props.auth;
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, [auth]);

  // Function to handle gene list input
  const handleGeneListChange = (event) => {
    setGeneList(event.target.value);
  };

  // Function to handle drag and drop of gene list
  const handleDrop = (event) => {
    event.preventDefault();
    const geneData = event.dataTransfer.getData('text');
    setGeneList(geneData);
  };

  // Function to handle drag over (needed for drop)
  const handleDragOver = (event) => {
    event.preventDefault();
  };

  // Function to submit gene list for validation
  const handleSubmit = async () => {
    const geneArray = geneList.split('\n').filter(Boolean); // Convert the gene list into an array and filter out empty values

    if (geneArray.length > MAX_GENE_IDS) {
      setErrorMessage(`You have exceeded the maximum limit of ${MAX_GENE_IDS} gene IDs.`);
      return;
    }

    setErrorMessage(''); // Reset error message if validation passes
    setLoading(true); // Set loading state to true to show progress

    try {
      const response = await fetch(`${props.api}/gene_lists/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geneArray),
      });

      const result = await response.json();

      if (result.hash) {
        setListHash(result.hash);
        setValidatedList(result.ids);
        setValidationError(result.missing);
      } else {
        // Handle errors from validation
        alert('Error during validation.');
      }
    } catch (error) {
      alert('There was an error with the validation service.',error);
    } finally {
      setLoading(false); // Set loading to false when the request is complete
    }
  };

  // Function to save the validated gene list
  const handleSaveList = async () => {
    const queryParams = {
      label: listName,
      hash: listHash,
      site: props.site,
      n_genes: validatedList.length,
      isPublic: listIsPublic
    };
    const queryString = new URLSearchParams(queryParams).toString();

    const token = await user.getIdToken();
    try {
      const response = await fetch(`${props.api}/gene_lists?${queryString}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to save list');
      }
      const result = await response.json();
      console.log(result);
      setGeneList('');
      setListHash(null);
      setValidatedList([]);
      setValidationError([]);
      setListName('');
      setListIsPublic(false);
      if (props.onListSaved) props.onListSaved();

    } catch (error) {
      console.error("There was an problem with fetch", error)
    }
  };

  return (
    <div className="gene-list-component">
      <Form>
        {/* Input for Gene List */}
        <Form.Group controlId="geneList">
          <Form.Label>Paste or drop your gene list here:</Form.Label>
          <Form.Control
            as="textarea"
            rows={10}
            value={geneList}
            onChange={handleGeneListChange}
            placeholder={`Paste or drop your gene list here (Maximum: ${MAX_GENE_IDS} IDs)`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          />
        </Form.Group>

        {/* Display error if gene list exceeds limit */}
        {errorMessage && (
          <Alert variant="danger">
            {errorMessage}
          </Alert>
        )}

        {/* Button to submit for validation */}
        <Button variant="primary" onClick={handleSubmit}>
          Validate Gene List
        </Button>
      </Form>

      {/* Display validation in progress */}
      {loading && (
        <div className="validation-summary mt-4">
          <h3>Validation in Progress...</h3>
          <Spinner animation="border" role="status">
            <span className="sr-only">Validating...</span>
          </Spinner>
        </div>
      )}


      {/* Display validation summary */}
      {!loading && listHash && (
        <div className="validation-summary mt-3 p-3 border rounded bg-light">
          <div>
            <span className="text-success">
              <strong>{validatedList.length}</strong> valid
            </span>
            {validationError.length > 0 && (
              <div className="text-danger mt-1">
                <strong>{validationError.length}</strong> not found
              </div>
            )}
          </div>
          {validationError.length > 0 && (
            <details className="mt-2">
              <summary style={{cursor: 'pointer'}}>Show unrecognized IDs</summary>
              <pre className="small mt-2 mb-0" style={{maxHeight: 150, overflow: 'auto'}}>
                {validationError.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Input for saving validated gene list */}
      {!loading && validatedList.length > 0 && (
        <div className="save-list mt-4">
          <Form.Group controlId="listName">
            <Form.Label>Save Validated Gene List</Form.Label>
            <Form.Control
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Enter list name"
            />
            <Form.Check
              type='switch'
              id='listIsPublic'
              label='Public'
              checked={listIsPublic}
              onChange={(e) => setListIsPublic(!listIsPublic)}
            />
          </Form.Group>
          {user ?
            <Button variant="primary" onClick={handleSaveList}>
              Save Gene List
            </Button>
            : <Button variant="secondary" disabled>Login Required</Button> }
        </div>
      )}
    </div>
  );
};

const UserGeneListsComponent = props => {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleListSaved = () => setRefreshKey(k => k + 1);
  const firebaseConfig = props.configuration && props.configuration.firebaseConfig;
  const auth = useMemo(() => {
    const app = getFirebaseApp(firebaseConfig);
    return app ? getAuth(app) : null;
  }, [firebaseConfig]);
  if (!auth) {
    return (
      <Alert variant="info">
        User gene lists are not available on this site.
      </Alert>
    );
  }
  return (
    <Container fluid>
      <Row>
        <Col><GeneListComponent api={props.configuration.grameneData} site={props.configuration.id} auth={auth} onListSaved={handleListSaved}/></Col>
        <Col><GeneListDisplayComponent api={props.configuration.grameneData} site={props.configuration.id} auth={auth} addFilter={props.doAcceptGrameneSuggestion} refreshKey={refreshKey}/></Col>
      </Row>
    </Container>
  )
}

export default connect(
  'selectConfiguration',
  'doAcceptGrameneSuggestion',
  UserGeneListsComponent
);

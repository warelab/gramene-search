import {connect} from "redux-bundler-react";
import React, { useEffect, useState } from 'react';
import {Table, Form, Button, Alert, Spinner, Container, Row, Col} from 'react-bootstrap';
import { firebaseApp } from "../utils";
import {getAuth, onAuthStateChanged} from "firebase/auth";

const auth = getAuth(firebaseApp);

const MAX_GENE_IDS = 1000; // Define the maximum number of gene IDs allowed

const GeneListDisplayComponent = () => {
  const [savedGeneLists, setSavedGeneLists] = useState([]);
  const [error, setError] = useState(null);
  const [user, setUser] = useState({});
  onAuthStateChanged(auth, (user) => setUser(user));

  // Fetch saved gene lists from a backend or local storage
  const fetchSavedGeneLists = async () => {
    try {
      // Replace this with actual fetch from your backend or storage
      const response = await fetch('https://your-backend-url.com/gene-lists');
      const result = await response.json();

      if (response.ok) {
        setSavedGeneLists(result.savedLists); // Assuming savedLists is an array of saved gene lists
      } else {
        setError('Error fetching gene lists.');
      }
    } catch (err) {
      setError('Failed to fetch gene lists. Please try again later.');
    }
  };

  // Fetch data when the component is mounted
  useEffect(() => {
    fetchSavedGeneLists();
  }, []);

  return (
    <div className="gene-list-display-component">
      <h4>Saved Gene Lists</h4>

      {error && (
        <Alert variant="danger">
          {error}
        </Alert>
      )}

      {savedGeneLists.length > 0 ? (
        <Table striped bordered hover className="mt-4">
          <thead>
          <tr>
            <th>List Name</th>
            <th>Number of Genes</th>
            <th>Actions</th>
          </tr>
          </thead>
          <tbody>
          {savedGeneLists.map((list, index) => (
            <tr key={index}>
              <td>{list.name}</td>
              <td>{list.genes.length}</td>
              <td>
                <Button variant="info" onClick={() => viewGeneList(list)}>
                  View
                </Button>
                <Button variant="danger" onClick={() => deleteGeneList(list.id)} className="ml-2">
                  Delete
                </Button>
              </td>
            </tr>
          ))}
          </tbody>
        </Table>
      ) : (
        <Alert variant="warning" className="mt-4">
          No saved gene lists found.
        </Alert>
      )}
    </div>
  );
};

// Example functions for viewing and deleting lists
const viewGeneList = (list) => {
  alert(`Viewing gene list: ${list.name}\nGenes: ${list.genes.join(', ')}`);
};

const deleteGeneList = async (listId) => {
  if (window.confirm('Are you sure you want to delete this gene list?')) {
    // Replace with the actual delete request
    try {
      await fetch(`https://your-backend-url.com/gene-lists/${listId}`, {
        method: 'DELETE',
      });
      alert('Gene list deleted!');
      // Optionally refetch the updated list
    } catch (err) {
      alert('Failed to delete gene list.');
    }
  }
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
  onAuthStateChanged(auth, (user) => setUser(user));

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
      const response = await fetch(`${props.api}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: geneArray }),
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
      isPublic: listIsPublic
    };
    const queryString = new URLSearchParams(queryParams).toString();

    const token = await user.getIdToken();
    try {
      const response = await fetch(`${props.api}/save_list?${queryString}`, {
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

    } catch (error) {
      console.error("There was an problem with fetch", error)
    }
  };

  return (
    <div className="gene-list-component">
      <h4>Gene List Validator</h4>

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
        <div className="validation-summary mt-4">
          <h3>Validation Summary</h3>
          <Alert variant="info">
            <p>hash: <code>{listHash}</code></p>
            <p>Items Validated: {validatedList.length}</p>
            <p>Items Not Validated: {validationError.length}</p>
          </Alert>
          <ul>
            {validationError.map((errorItem, index) => (
              <li key={index}>{errorItem}</li>
            ))}
          </ul>
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
              onChange={(e) => setListIsPublic(!listIsPublic)}
            />
          </Form.Group>
          {user ?
            <Button variant="success" onClick={handleSaveList}>
              Save Gene List
            </Button>
            : <Button variant="dark" disabled>Login Required</Button> }
        </div>
      )}
    </div>
  );
};

const UserGeneListsComponent = props => {
  return (
    <Container fluid>
      <Row>
        <Col><GeneListComponent api={props.configuration.grameneData} site={props.configuration.id}/></Col>
        <Col><GeneListDisplayComponent api={props.configuration.grameneData} site={props.configuration.id}/></Col>
      </Row>
    </Container>
  )
}

export default connect(
  'selectConfiguration',
  UserGeneListsComponent
);

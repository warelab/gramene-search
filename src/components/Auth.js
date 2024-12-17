import React, { useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { connect } from "redux-bundler-react";
import { firebaseApp } from "./utils";
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const auth = getAuth(firebaseApp);

const provider = new GoogleAuthProvider();

const Auth = props => {
  const [user, setUser] = useState({});
  onAuthStateChanged(auth, (user) => setUser(user));

  function handleLogin() {
    signInWithPopup(auth, provider)
      .then((result) => {
        setUser(result.user)
      }).catch((err) => {
      console.log(err)
    });
  }
  function handleLogout() {
    signOut(auth)
      .then(() => {
        setUser(null);
      }).catch((err) => {
      console.log(err)
    });
  }
  return (
    <div className={props.configuration.id === 'sorghum' ? 'sorghumbase-auth-container': 'gramene-auth-container'}>
      <b>Account</b>
      <div>
        {user
          ? <Button size="sm" variant="success" onClick={handleLogout}>{user.displayName}</Button>
          : <Button size="sm" variant="success" onClick={handleLogin}>Login</Button>
        }
      </div>
    </div>
  )
}

export default connect(
  'selectConfiguration',
  Auth
)

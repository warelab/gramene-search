import React, { useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { connect } from "redux-bundler-react";
import { firebaseApp } from "./utils";
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';

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
  const [open, setOpen] = useState(true);
  return (
    <div className={props.configuration.id === 'sorghum' ? 'sorghumbase-auth-container': 'gramene-auth-container'}>
      <div className="sidebar-section">
        <div className="sidebar-section-header" onClick={() => setOpen(!open)}>
          <b>Account</b>
          <span className="sidebar-section-actions">
            <span className="sidebar-section-toggle">
              {open ? <BsChevronDown/> : <BsChevronRight/>}
            </span>
          </span>
        </div>
        {open && <div className="sidebar-section-body">
          <div>
            {user
              ? <Button size="sm" variant="success" onClick={handleLogout}>{user.displayName}</Button>
              : <Button size="sm" variant="success" onClick={handleLogin}>Login</Button>
            }
          </div>
        </div>}
      </div>
    </div>
  )
}

export default connect(
  'selectConfiguration',
  Auth
)

import React, { useMemo, useState, useEffect } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { connect } from "redux-bundler-react";
import { getFirebaseApp } from "./utils";
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';
import SaveViewButton from './SaveView';

const provider = new GoogleAuthProvider();

const Auth = props => {
  const firebaseConfig = props.configuration && props.configuration.firebaseConfig;
  const auth = useMemo(() => {
    const app = getFirebaseApp(firebaseConfig);
    return app ? getAuth(app) : null;
  }, [firebaseConfig]);
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(true);

  // Subscribe once, unsubscribe on unmount. On each auth-state emission,
  // also poke the shared-view boot path so a `?view=<hash>` for a private
  // view gets retried with the now-available Bearer token. bootViewFromUrl
  // no-ops when the param isn't present, so this is cheap.
  useEffect(() => {
    if (!auth) return undefined;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      props.doBootSharedView({user: u});
    });
    return unsub;
  }, [auth]);

  if (!auth) return null;

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
          {user && user.uid && (
            <div>
              <SaveViewButton user={user}/>
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}

export default connect(
  'selectConfiguration',
  'doBootSharedView',
  Auth
)

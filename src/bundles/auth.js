const authorizedUser = {
  name: 'authorizedUser',
  getReducer: () => {
    const initialState = {
    };
    return (state = initialState, {type, payload}) => {
      switch (type) {
        case 'GRAMENE_USER_UPDATED':
          return payload;
        default:
          return state;
      }
    }
  },
  doSetAuthorizedUser: user => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_USER_UPDATED', payload: user})
  },
  selectAuthorizedUser: state => state.authorizedUser,
};

export default authorizedUser;

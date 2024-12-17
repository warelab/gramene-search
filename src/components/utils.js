import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyCyTJmxfWgfuhI6-8uqocSiE9KOWUlkgkk",
  authDomain: "gramene-auth.firebaseapp.com",
  projectId: "gramene-auth",
  storageBucket: "gramene-auth.appspot.com",
  messagingSenderId: "590873346270",
  appId: "1:590873346270:web:f76a31a93619e69439824f"
};

export const firebaseApp = initializeApp(firebaseConfig);

export const suggestionToFilters = (suggestion) => {
  return {
    status: 'init',
    rows: 20,
    operation: 'AND',
    negate: false,
    leftIdx: 0,
    rightIdx: 3,
    children: [
      {
        fq_field: suggestion.fq_field,
        fq_value: suggestion.fq_value,
        name: suggestion.name,
        category: suggestion.category,
        leftIdx: 1,
        rightIdx: 2,
        negate: false,
        marked: false
      }
    ]
  }
}

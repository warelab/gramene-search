import { initializeApp, getApps, getApp } from "firebase/app";

export const getFirebaseApp = (config) => {
  if (!config) return null;
  const name = config.projectId || '[DEFAULT]';
  if (getApps().some(a => a.name === name)) return getApp(name);
  return initializeApp(config, name);
};

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

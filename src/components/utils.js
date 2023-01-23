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

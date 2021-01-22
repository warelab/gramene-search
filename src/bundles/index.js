import apiBundles from './api'
import filterBundle from './filters'
import viewsBundle from './views'
import docsBundle from './docs'
import genomesBundle from './genomes'

export default [...apiBundles, docsBundle, filterBundle, viewsBundle, genomesBundle];
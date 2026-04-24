import apiBundles from './api'
import filterBundle from './filters'
import viewsBundle from './views'
import docsBundle from './docs'
import genomesBundle from './genomes'
import fieldCatalogBundle from './swaggerFields'
import exporterBundle from './exporter'
import ontologiesBundle from './ontologies'

export default [...apiBundles, docsBundle, filterBundle, viewsBundle, genomesBundle, fieldCatalogBundle, exporterBundle, ontologiesBundle];

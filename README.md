# gramene-search
This is based on the <a href="https://github.com/henrikjoreteg/redux-bundler">redux-bundler</a> example application
## install
<code>npm i</code>

This hack is necessary to get Parcel to transpile imported node modules correctly.

Edit <code>node_modules/@parcel/core/lib/summarizeRequest.js</code>

Change <code>return !filePath.includes(NODE_MODULES);</code>
to <code>return true;</code>
## build
<code>npm run build</code>
compiles js for use in the sorghum-webapp assuming you have cloned that in the same parent directory

<code>npm run start-maize</code> launches the maize pangenome subsite
## Primers tab
The Primers gene-detail tab embeds <code>PrimerDesigner</code> from
<a href="https://github.com/warelab/gramene-primers">gramene-primers</a>: PCR/qPCR primer design,
a genome specificity check and a pan-genome coverage check, served by the gramene-swagger
<code>/primers</code> endpoints. It appears after Sequences only on sites that set
<code>details.primers</code>:

- <code>primers: true</code> uses the site's <code>grameneData</code> API.
- <code>primers: {apiBase: 'https://data.sorghumbase.org/sorghum_v11', pangenome: false}</code>
  points the tab at another swagger base URL (it must serve <code>/primers</code>);
  <code>pangenome: false</code> hides the pan-genome check.

Leave the key unset (or <code>false</code>) where the API has no <code>/primers</code> endpoints.
The designer state is kept in <code>uiViewState.byGene[geneId].primers</code> and saved with
shared views; a restored view re-runs the design, and an expired check job shows "Re-run check".
A pasted sequence stays in that store, so it survives switching detail tabs, but it is left out
of saved views; design responses and check results are not saved either.
Gene links in check results open in a new tab, so the design and a running check stay put.
Styles are injected at runtime, so no CSS import is needed.

<code>gramene-primers</code> is a dependency (<code>^0.2.0</code>). To try unreleased gramene-primers changes,
install a packed tarball over it (not <code>npm link</code> or <code>file:</code>, which load a second React);
the next <code>npm install</code> puts the registry version back.
```bash
cd ../gramene-primers && npm run pack:local       # gramene-primers-0.2.0.tgz
cd ../gramene-search && npm install --no-save ../gramene-primers/gramene-primers-0.2.0.tgz && rm -rf .parcel-cache
```
Run the sorghum demo against a swagger that serves <code>/primers</code>:
```bash
PRIMERS_API=https://data.sorghumbase.org/sorghum_v11a SUBSITE=sorghum npx parcel src/sorghum.html --port 1234
```
In the sorghum demo (<code>src/demo.js</code>) the tab is shown only when <code>PRIMERS_API</code> is set;
it becomes <code>details.primers.apiBase</code>.

## Expression tab
The Expression gene-detail tab's "All Studies" and "Paralogs" sub-tabs draw Expression Atlas heatmaps
(with the anatomogram) in the page using <code>ExpressionAtlasHeatmap</code> from
<a href="https://github.com/warelab/atlas-heatmap">gramene-atlas-heatmap</a>, warelab's React 18 fork of
EBI's atlas-heatmap; the anatomogram comes from
<a href="https://github.com/warelab/anatomogram">gramene-anatomogram</a>. They replace the old
iframe to <code>dev.gramene.org/static/atlasWidget.html</code>.

- <code>atlasUrl</code> in the site configuration names the gramene-swagger <code>/gxa/</code> instance to query,
  e.g. <code>'https://data.sorghumbase.org/sorghum_v11/gxa/'</code>. Unset, the tab queries
  <code>https://data.sorghumbase.org/auth_testing/gxa/</code>, the old widget's default.
- All Studies sends the gene's <code>atlas_id</code> (or its id); Paralogs sends the within-species paralogs
  for the experiment picked in the selector.
- Links open in a new tab. <code>resolveUrl</code> in <code>Expression.js</code> points row, experiment,
  "more information", Expression Atlas and download links at EBI, because gramene-swagger returns
  relative gene links and an empty <code>geneQuery</code>.
- The chosen sub-tab and experiment are kept in <code>uiViewState.byGene[geneId].expression</code> and saved
  with shared views.
- Styles are injected at runtime; Bootstrap 5 CSS and react-bootstrap 2 come from the host.

<code>gramene-atlas-heatmap</code> is a dependency (<code>^6.0.0</code>) and brings in
<code>gramene-anatomogram</code>. To try unreleased fork changes, install packed tarballs of both packages over
the registry versions (not <code>npm link</code> or <code>file:</code>, which load a second React); the next
<code>npm install</code> puts the registry versions back.
```bash
cd ../anatomogram && npm run pack:local      # gramene-anatomogram-3.0.0.tgz
cd ../atlas-heatmap && npm run pack:local    # gramene-atlas-heatmap-6.0.0.tgz
cd ../gramene-search && npm install --no-save ../anatomogram/gramene-anatomogram-3.0.0.tgz \
  ../atlas-heatmap/gramene-atlas-heatmap-6.0.0.tgz && rm -rf .parcel-cache*
```
Run the sorghum demo against another atlas instance:
```bash
ATLAS_URL=https://data.sorghumbase.org/sorghum_v11/gxa/ SUBSITE=sorghum npx parcel src/sorghum.html --port 1235
```

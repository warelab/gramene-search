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

<code>gramene-primers</code> is a dependency (<code>^0.1.1</code>). To try unreleased gramene-primers changes,
install a packed tarball over it (not <code>npm link</code> or <code>file:</code>, which load a second React);
the next <code>npm install</code> puts the registry version back.
```bash
cd ../gramene-primers && npm run pack:local       # gramene-primers-0.1.1.tgz
cd ../gramene-search && npm install --no-save ../gramene-primers/gramene-primers-0.1.1.tgz && rm -rf .parcel-cache
```
Run the sorghum demo against a swagger that serves <code>/primers</code>:
```bash
PRIMERS_API=https://data.sorghumbase.org/sorghum_v11a SUBSITE=sorghum npx parcel src/sorghum.html --port 1234
```
In the sorghum demo (<code>src/demo.js</code>) the tab is shown only when <code>PRIMERS_API</code> is set;
it becomes <code>details.primers.apiBase</code>.
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
The Expression gene-detail tab has these sub-tabs, all drawn in the page with
<a href="https://github.com/warelab/atlas-heatmap">gramene-atlas-heatmap</a>, warelab's React 18 fork of
EBI's atlas-heatmap (the anatomogram comes from
<a href="https://github.com/warelab/anatomogram">gramene-anatomogram</a>). They replace the old
iframe to <code>dev.gramene.org/static/atlasWidget.html</code>.

- **Paralogs**: an <code>ExpressionAtlasHeatmap</code> of the gene's within-species paralogs in the experiment
  picked in the selector, which lists every study of the species (EBI and JGI; only the gene's studies when
  the host's search results carry <code>expressed_in_gxa_attr_ss</code>).
- **EBI Studies** (formerly "All Studies"; its saved-view key is still <code>'gene'</code>): an
  <code>ExpressionAtlasHeatmap</code> of the gene across the Expression Atlas studies. The JGI studies are left
  out: its <code>filterRows</code> drops every row of a study whose <code>source</code> is <code>'JGI'</code> in the
  site's <code>/experiments</code> list, i.e. rows whose id is the study's accession, or whose id or name is the
  study's name or starts with <code>'&lt;study name&gt; - '</code> (a study split by a second factor). The heatmap
  waits for that list (a first visit only, since the list is persisted), so the JGI rows never flash up, and for
  the studies the gene is expressed in (see below); if the list cannot be fetched it is drawn unfiltered.
- **JGI Studies** (shown when the gene is expressed in a JGI study, e.g. the Mullet lab's
  <code>JGI-SB-1</code>..<code>4</code> in sorghum_v11): a selector of the JGI studies the gene is expressed in
  and an <code>ExpressionFactorGrid</code> of the gene in the chosen study. A gene that is expressed in JGI
  studies but in no EBI baseline study opens on this sub-tab (its EBI Studies heatmap would be all below
  cutoff), unless a sub-tab was chosen or saved. The grid puts the study's factors on its rows and columns
  (organism part on the columns when it varies). With two varying factors a button swaps them; with more,
  <em>Rows</em> and <em>Columns</em> selectors pick them and the factors left over are folded into the rows; a
  study with one varying factor is drawn as a single row. A cell that holds several samples (groups with the
  same factor values that differ by sample id) is split into one band per sample, and hovering or focusing a
  band shows its factor values, sample id, replicates and TPM.
- **eFP Browser** (where BAR has the species): the eFP image for the chosen study.

**Download.** Paralogs and EBI Studies have a *Download* button among the heatmap's controls, and JGI Studies one in
the grid's toolbar. It opens a dialog that asks for a **file name** (prefilled, focused and selected) and a
**format**: *Tab-delimited text (.tsv)*, selected each time the dialog opens, or *JSON (.json)*. *Download* (or
Enter) saves the data the widget shows under that name, with the format's extension added unless the name already
has it; *Cancel* saves nothing. The name is sanitised (path separators, <code>: * ? " &lt; &gt; |</code> and control
characters are removed) and *Download* is disabled while it is blank.

| Sub-tab | Suggested file name | Saved |
| --- | --- | --- |
| Paralogs | <code>&lt;gene&gt;-paralogs-&lt;experiment&gt;</code> | the heatmap's rows (the paralogs) and columns as shown: after its filters and ordering, and only the columns in view while zoomed in |
| EBI Studies | <code>&lt;gene&gt;-ebi-studies</code> | the same, one row per study (the JGI rows are left out, as on the page) |
| JGI Studies | <code>&lt;gene&gt;-&lt;JGI accession&gt;</code> | every sample of the study for the gene, one per line, whatever the grid's axes: gene, study, the study's factors, sample id, replicates and TPM |

<code>&lt;gene&gt;</code> is the id the tab queries (the gene's <code>atlas_id</code>, or its id). The TSV of a heatmap
starts with <code>#</code> comment lines (page URL, time, query or experiment, unit), then a header line of column
labels and a line per row; the grid's TSV is a plain table. The JSON has the same data with ids, units and
<code>null</code> for no data (see gramene-atlas-heatmap's README, *Downloads*). For an EBI experiment the dialog of a
Paralogs heatmap also links to the *Full experiment data on Expression Atlas* (EBI's download, formerly the
"All data" menu item); JGI studies have no such download, so it is left out for them.

Details:
- <code>atlasUrl</code> in the site configuration names the gramene-swagger <code>/gxa/</code> instance to query,
  e.g. <code>'https://data.sorghumbase.org/sorghum_v11/gxa/'</code>. Unset, the tab queries
  <code>https://data.sorghumbase.org/auth_testing/gxa/</code>, the old widget's default. The study lists come
  from <code>&lt;grameneData&gt;/experiments</code>. The studies a gene is expressed in are its
  <code>expressed_in_gxa_attr_ss</code>, which the search results do not carry, so the tab looks them up per
  gene (<code>&lt;grameneData&gt;/search?q=id:"&lt;id&gt;"&amp;fl=id,expressed_in_gxa_attr_ss</code>, the
  <code>grameneGeneStudies</code> bundle). If that lookup fails, JGI Studies offers every JGI study of the
  species.
- EBI Studies and JGI Studies send the gene's <code>atlas_id</code> (or its id).
- Links open in a new tab. <code>resolveUrl</code> in <code>Expression.js</code> points row, experiment,
  "more information", Expression Atlas and download links at EBI, because gramene-swagger returns
  relative gene links and an empty <code>geneQuery</code>; JGI studies keep their Phytozome links. For
  <code>'download'</code> it returns <code>null</code> when the experiment is a JGI study (a <code>source: 'JGI'</code>
  study of the species, or a download URL at <code>jgi.doe.gov</code>, whose payload names Phytozome's genome page as
  its download), which drops the dialog's full data link.
- The chosen sub-tab, Paralogs experiment, JGI study and the grid's axes per JGI study
  (<code>jgiExperiment</code>, <code>jgiAxes</code>) are kept in <code>uiViewState.byGene[geneId].expression</code> and
  saved with shared views.
- Styles are injected at runtime; Bootstrap 5 CSS and react-bootstrap 2 come from the host.

<code>gramene-atlas-heatmap</code> is a dependency (<code>^6.3.0</code>: 6.2.0 added <code>filterRows</code> and
<code>ExpressionFactorGrid</code>, 6.3.0 the Download dialog and <code>downloadFileName</code>) and brings in
<code>gramene-anatomogram</code>. To try unreleased fork changes,
install packed tarballs of both packages over the registry versions (not <code>npm link</code> or
<code>file:</code>, which load a second React); the next <code>npm install</code> puts the registry versions back.
```bash
cd ../anatomogram && npm run pack:local      # gramene-anatomogram-3.0.0.tgz
cd ../atlas-heatmap && npm run pack:local    # gramene-atlas-heatmap-6.3.0.tgz
cd ../gramene-search && npm install --no-save ../anatomogram/gramene-anatomogram-3.0.0.tgz \
  ../atlas-heatmap/gramene-atlas-heatmap-6.3.0.tgz && rm -rf .parcel-cache*
```
Run the sorghum demo against another atlas instance (<code>ATLAS_URL</code>) and data release
(<code>GRAMENE_DATA</code>, default <code>https://data.sorghumbase.org/sorghum_v10b</code>); sorghum_v11 has the
JGI studies:
```bash
GRAMENE_DATA=https://data.sorghumbase.org/sorghum_v11 ATLAS_URL=https://data.sorghumbase.org/sorghum_v11/gxa/ \
  SUBSITE=sorghum npx parcel src/sorghum.html --port 1235
```

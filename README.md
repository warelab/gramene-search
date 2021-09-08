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
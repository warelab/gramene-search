import React from 'react'
import ReactGA from 'react-ga'
// import {connect} from "redux-bundler-react";
import _ from 'lodash'
import dbxrefs from 'gramene-dbxrefs';
import {Detail, Title, Description, Content} from "./generic";

const HOW_MANY_TO_SHOW_BY_DEFAULT = 10;

class Xref extends React.Component {
  constructor(props) {
    super(props);
    this.state = {showAll: false};
  }

  toggleShowAll() {
    this.setState({showAll: !this.state.showAll});
  }

  possiblyTruncateList(vals) {
    var ellipsis, ellipsisChar, ellipsisTitle;

    if (vals.length > HOW_MANY_TO_SHOW_BY_DEFAULT) {
      if (this.state.showAll) {
        ellipsisChar = '^ show first ' + HOW_MANY_TO_SHOW_BY_DEFAULT;
        ellipsisTitle = 'Show less';
      }
      else {
        ellipsisChar = '… show all (' + (vals.length - HOW_MANY_TO_SHOW_BY_DEFAULT) + ' more)';
        ellipsisTitle = 'Show more';
        vals = vals.slice(0, HOW_MANY_TO_SHOW_BY_DEFAULT);
      }

      ellipsis = (
        <li key="showMore" className="showAll">
          <a title={ellipsisTitle} onClick={this.toggleShowAll.bind(this)}>{ellipsisChar}</a>
        </li>
      );

      vals.push(ellipsis);
    }

    return vals;
  }

  render() {
    var db = this.props.xref.label;
    var urlfcn = this.props.xref.url;

    var members = this.props.members.sort();

    var vals = members.map(function (item, idx) {
        var url = urlfcn(item),
          liClass = idx < HOW_MANY_TO_SHOW_BY_DEFAULT ? "default" : "extra";
        let external = <small title="This link opens a page from an external site"> <i className="fa fa-external-link"/></small>;
        return (
          <li key={idx} className={liClass}>
            <ReactGA.OutboundLink
              eventLabel={db}
              to={url}
              target="_blank"
            >
              {item}{external}
            </ReactGA.OutboundLink>
          </li>
        )
      })

    vals = this.possiblyTruncateList(vals);

    return (
      <tr>
        <td className="xref-name-col">{db}</td>
        <td className="xref-value-col">
          <ol className="xref-id-list">{vals}</ol>
        </td>
        <td className="xref-name-col">{this.props.source}</td>
        <td className="xref-value-col">{this.props.text}</td>
      </tr>
    );
  }
}

function formatXrefsForGene(gene) {
  if(!gene || !_.isArray(gene.xrefs)) {
    throw new Error("No xrefs for " + _.get(gene._id));
  }
  return gene.xrefs
    .filter(xr => dbxrefs.isKnown(xr.db))
    .sort((a,b) => {
      if (a.source) {
        if (b.source) {
          if (a.source < b.source) {
            return -1;
          }
          if (a.source > b.source) {
            return 1;
          }
        }
        else {
          return -1;
        }
      }
      else if (b.source) {
        return 1;
      }
      if (a.db < b.db) {
        return -1;
      }
      if (a.db > b.db) {
        return 1;
      }
      return 0;
    })
    .map((xr,idx) => {
      var xref = dbxrefs.fetch(xr.db);
      return (
        <Xref key={idx} xref={xref} members={xr.ids} source={xr.source} text={xr.text} />
      )
    })
}

const Xrefs = ({searchResult, geneDocs}) => (
  <Detail>
    <Title key="title">Cross-references</Title>
    <Description key="description">References to this gene in other databases:</Description>
    <Content key="content">
      <table className="xrefs table">
        <thead>
        <tr>
          <th className="xref-10-col">Database</th>
          <th className="xref-10-col">IDs and links</th>
          <th className="xref-10-col">Source</th>
          <th className="xref-70-col">Text</th>
        </tr>
        </thead>
        <tbody>
        {formatXrefsForGene(geneDocs[searchResult.id])}
        </tbody>
      </table>
    </Content>
  </Detail>
);

export default Xrefs;


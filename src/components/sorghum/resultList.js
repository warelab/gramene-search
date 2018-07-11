import {connect} from 'redux-bundler-preact'
import {h} from 'preact'
import {stripImages} from '../utils'

const Posts = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Posts" className="container mb40 pt90">
        <div className="fancy-title mb40">
          <h4>Posts</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="col-md-4 mb30">
              <div className="card card-body">
                <h4 className="card-title">
                  {doc.title.rendered}
                </h4>
                <p className="card-text" dangerouslySetInnerHTML={{__html: stripImages(doc.excerpt.rendered)}}/>
                <a href={`/post/${doc.slug}`} className="btn btn-primary">read more</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const Events = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Events" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Events</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="col-md-4 mb30">
              <div className="card card-body">
                <h4 className="card-title">
                  {doc.title.rendered}
                </h4>
                <p class="card-text">{doc.start_date}</p>
                <p class="card-text" dangerouslySetInnerHTML={{__html: stripImages(doc.content.rendered)}}/>
                <a href={`/events#${doc.title.rendered}`} class="btn btn-primary">view event</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const Jobs = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Jobs" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Jobs</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="col-md-4 mb30">
              <div className="card card-body">
                <h4 className="card-title">
                  {doc.title.rendered}
                </h4>
                <p class="card-text">{doc.company}</p>
                <p class="card-text" dangerouslySetInnerHTML={{__html: stripImages(doc.content.rendered)}}/>
                <a href={doc.job_url} class="btn btn-primary">view job posting</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const People = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="People" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>People</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="col-md-4 mb30">
              <div className="card card-body">
                <h4 className="card-title">
                  <img src={doc.avatar_urls[96]} className="img-fluid rounded-circle centered"/>
                </h4>
                <p className="card-text text-center">{doc.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const Links = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Links" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Resource Links</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="col-md-4 mb30">
              <div className="card card-body">
                <h4 className="card-title">
                  {doc.title.rendered}
                </h4>
                <p class="card-text" dangerouslySetInnerHTML={{__html: stripImages(doc.content.rendered)}}/>
                <a href={doc.resource_url} class="btn btn-primary">Visit resource</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const Papers = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Papers" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Research Papers</h4>
        </div>
        <div className="row">
          {results.docs.map(doc => (
            <div className="card card-inverse bg-dark mb30">
              <div className="card-body">
                <h3 className="card-title">
                  {doc.title.rendered}
                </h3>
                <p className="card-text" dangerouslySetInnerHTML={{__html: doc.paper_authors}}/>
                <a href={doc.source_url} className="btn btn-primary">read more</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
};

const ResultsList = ({
                       sorghumPosts, sorghumEvents, sorghumJobs, sorghumPeople, sorghumLinks, sorghumPapers,
                       searchUI, searchUpdated
                     }) => (
  <div id="sorghum" className="row">
    {searchUI.sorghumbase && searchUI.Posts && Posts(sorghumPosts)}
    {searchUI.sorghumbase && searchUI.Events && Events(sorghumEvents)}
    {searchUI.sorghumbase && searchUI.Jobs && Jobs(sorghumJobs)}
    {searchUI.sorghumbase && searchUI.People && People(sorghumPeople)}
    {searchUI.sorghumbase && searchUI.Links && Links(sorghumLinks)}
    {searchUI.sorghumbase && searchUI.Papers && Papers(sorghumPapers)}
  </div>
);


export default connect(
  'selectSorghumPosts',
  'selectSorghumEvents',
  'selectSorghumJobs',
  'selectSorghumPeople',
  'selectSorghumLinks',
  'selectSorghumPapers',
  'selectSearchUI',
  'selectSearchUpdated',
  ResultsList
)

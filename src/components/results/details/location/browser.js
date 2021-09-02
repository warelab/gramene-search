import React from "react";
import DallianceBrowser from "./dallianceBrowser.js";

export default class Browser extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div className="location-browser">
        <DallianceBrowser {...this.props} expanded={!!this.props.closeModal} />
      </div>
    )
  }

}

// Browser.propTypes = {
//   gene: React.PropTypes.object.isRequired,
//   expanded: React.PropTypes.bool,
//   visibleRange: React.PropTypes.object.isRequired,
//   onViewChange: React.PropTypes.func.isRequired
// };
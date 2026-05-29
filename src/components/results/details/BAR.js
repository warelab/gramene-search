// eFP Browser embed — was its own package (gramene-efp-browser@1.0.11),
// absorbed here on 2026-05-29 to drop the unmaintained nwb/webpack-4 build
// pipeline and remove a dependency that needed --openssl-legacy-provider.
// All upstream URLs and species-specific id formatters preserved as-is.

import React, { Component, useState, useEffect } from 'react';

const urls = {
  image:   (genome, study, gene) => `https://bar.utoronto.ca/api/efp_image/efp_${genome}/${study}/Absolute/${gene}`,
  app:     (genome, study, gene) => `https://bar.utoronto.ca/efp_${genome}/cgi-bin/efpWeb.cgi?dataSource=${study}&mode=Absolute&primaryGene=${gene}`,
  studies: genome                => `https://bar.utoronto.ca/api/efp_image/get_efp_data_source/${genome}`,
  logo:    'https://bar.utoronto.ca/bbc_logo_small.gif',
  spinner: 'https://www.sorghumbase.org/static/images/dna_spinner.svg'
};

const zmv4_re = /Zm00001d/;
const browsers = {
  sorghum_bicolor: {
    formatGene: gene => gene._id.replace('SORBI_3', 'Sobic.'),
    genome: 'sorghum'
  },
  vitis_vinifera: {
    formatGene: gene => gene._id,
    genome: 'grape'
  },
  arabidopsis_thaliana: {
    formatGene: gene => gene._id,
    fixStudies: studies => {
      studies = studies.filter(s => s.value !== 'Klepikova_Atlas');
      studies.unshift({ value: 'Klepikova_Atlas', label: 'Klepikova Atlas' });
      return studies;
    },
    genome: 'arabidopsis'
  },
  zea_mays: {
    formatGene: gene => {
      let id = gene._id;
      if (gene.synonyms) {
        gene.synonyms.forEach(syn => {
          if (zmv4_re.test(syn)) { id = syn; }
        });
      }
      return id;
    },
    fixStudies: studies => {
      studies = studies.filter(s => s.value !== 'Hoopes_et_al_Atlas' && s.value !== 'Hoopes_et_al_Stress');
      studies.unshift({ value: 'Hoopes_et_al_Stress', label: 'Hoopes et. al., Stress' });
      studies.unshift({ value: 'Hoopes_et_al_Atlas',  label: 'Hoopes et. al., Atlas'  });
      return studies;
    },
    genome: 'maize'
  },
  glycine_max: {
    formatGene: gene => gene._id.replace('GLYMA_', 'Glyma.'),
    fixStudies: studies => studies.filter(s => s.value !== 'soybean_senescence'),
    genome: 'soybean'
  },
  oryza_sativa: {
    genome: 'rice',
    formatGene: gene => gene.MSU_id, // TODO: lookup IRGSP → LOC_ when MSU_id absent
    fixStudies: studies => {
      studies = studies.filter(s => s.value !== 'rice_rma' && s.value !== 'rice_mas');
      studies.unshift({ value: 'rice_rma', label: 'rice rma' });
      studies.unshift({ value: 'rice_mas', label: 'rice mas' });
      return studies;
    }
  }
};
// Subsites that refer to maize b73 as `zea_maysb73`.
browsers.zea_maysb73 = browsers.zea_mays;

const ImageLoader = ({ url }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);

    const image = new Image();
    image.src = url;
    image.onload  = () => setLoading(false);
    image.onerror = () => { setLoading(false); setError(true); };
  }, [url]);

  return (
    <div style={{ padding: 20 }}>
      {loading && <img src={urls.spinner} alt="Loading…" />}
      {!loading && !error && <img style={{ maxWidth: '100%' }} src={url} alt="eFP browser output" />}
      {error && <p>Error: Failed to load image</p>}
    </div>
  );
};

export default class BAR extends Component {
  constructor(props) {
    super(props);
    this.state = { currentStudy: null };
  }
  getStudies(browser) {
    fetch(urls.studies(browser.genome))
      .then(res => res.json())
      .then(res => {
        if (res.wasSuccessful) {
          let studies = res.data.sort().map(v => ({ value: v, label: v.replace(/_/g, ' ') }));
          if (browser.fixStudies) studies = browser.fixStudies(studies);
          this.setState({ studies });
        }
      })
      .catch(console.error);
  }
  render() {
    const gene = this.props.gene;
    const browser = browsers[gene.system_name];
    if (!browser) {
      return <div><h2>Can't find eFP browser for {gene.system_name}</h2></div>;
    }
    if (!this.state.studies) {
      this.getStudies(browser);
      return <img src={urls.spinner} alt="Loading…" />;
    }
    const efp_gene = browser.formatGene(gene);
    const study = this.state.currentStudy || this.state.studies[0].value;
    return (
      <div style={{ paddingTop: 10 }}>
        <label style={{ paddingLeft: 20, paddingRight: 10 }}>Select a study:</label>
        <select value={study} onChange={e => this.setState({ currentStudy: e.target.value })}>
          {this.state.studies.map((s, idx) => <option key={idx} value={s.value}>{s.label}</option>)}
        </select>
        <br />
        <ImageLoader url={urls.image(browser.genome, study, efp_gene)} />
        <a style={{ paddingLeft: 100 }} href={urls.app(browser.genome, study, efp_gene)} target="_blank" rel="noreferrer">
          Powered by <img src={urls.logo} style={{ maxWidth: 40 }} alt="BBC" /> Webservices
        </a>
      </div>
    );
  }
}

export function haveBAR(gene) {
  return browsers.hasOwnProperty(gene.system_name);
}

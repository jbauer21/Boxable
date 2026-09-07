interface Props { onStart: () => void }

export function Landing({ onStart }: Props) {
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">A little order. A lot more room.</p>
        <h1 id="hero-title">Everything in your house has a <span>home.</span></h1>
        <p className="hero-description">Even the stuff in <em>that</em> drawer. Turn your everyday things into a made-to-fit system of 3D-printable organizers.</p>
        <div className="hero-actions"><button className="btn" onClick={onStart}>Start my drawer <span aria-hidden="true">↗</span></button><a className="text-link" href="#how-it-works">See how it works</a></div>
        <p className="hero-note">Your drawer. Your things. A place for each.</p>
      </div>
      <figure className="hero-image"><img src="/brand/drawer.webp" width="1400" height="933" alt="A wooden drawer arranged with colorful modular organizers for pens, cables, batteries, and stationery" /><figcaption><span className="pill">Goodbye, junk drawer.</span><span>Illustrative arrangement</span></figcaption></figure>
    </section>
    <div className="feature-strip"><span>Made to fit your space</span><span>42 mm modular grid</span><span>Ready for your 3D printer</span></div>
    <section className="how-section" id="how-it-works">
      <div className="section-heading"><p className="eyebrow">From a little chaos to a little calm</p><h2>A happier drawer.<br />In four simple steps.</h2></div>
      <div className="how-grid">{[
        ["01", "Meet your drawer", "Print two markers and take a photo, or enter your drawer’s measurements."],
        ["02", "Find your fit", "See the modular grid that fits inside your drawer, down to the millimeter."],
        ["03", "Make room for your things", "Search the object catalog, add quantities, and group the things you keep together."],
        ["04", "Bring it all together", "Review your packed layout in 3D and download a 3MF for your slicer."],
      ].map(([n,title,copy]) => <article className="how-card" key={n}><span className="how-number">{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>
    <section className="boxie-section"><img src="/brand/boxie.webp" alt="Boxie, the friendly lime-green organizer mascot, waving hello" width="650" height="650" loading="lazy"/><div><p className="eyebrow">Big plans for the little things</p><h2>Less rummaging.<br />More living.</h2><p>The spare batteries. The tangled cables. The pens you can never find. Give them a spot that makes sense to you.</p><button className="btn" onClick={onStart}>Find their home <span aria-hidden="true">↗</span></button></div></section>
  </>;
}

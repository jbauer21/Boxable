import { useEffect, useMemo, useState } from "react";
import { Landing } from "./pages/Landing";
import { PrintMarkers } from "./pages/PrintMarkers";
import { Step1Measure } from "./steps/Step1Measure";
import { Place } from "./place/Place";
import { fitGrid } from "./lib/gridLayout";
import { EMPTY_DRAWER, type DrawerState, type ItemGroup } from "./lib/state";

type Page = "home" | "wizard" | "markers";
function readPage(): Page { return location.hash === "#/planner" ? "wizard" : location.hash === "#/markers" ? "markers" : "home"; }
export default function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [step, setStep] = useState<1|2>(1);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  useEffect(() => { const sync = () => { setPage(readPage()); if (location.hash === "#how-it-works") requestAnimationFrame(() => document.getElementById("how-it-works")?.scrollIntoView()); }; window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const navigate = (next: Page) => { location.hash = next === "home" ? "/" : next === "wizard" ? "/planner" : "/markers"; setPage(next); window.scrollTo(0, 0); };
  const grid = useMemo(() => fitGrid(drawer.widthMm, drawer.heightMm), [drawer.widthMm, drawer.heightMm]);
  const goStep = (next: 1|2) => { setStep(next); window.scrollTo(0, 0); };
  return <>
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header className="topbar place-header-compact no-print">
      <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate("home"); }} aria-label="Boxable home">boxable<span aria-hidden="true">✳</span></a>
      <nav className="header-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><button className="ghost-link" type="button" onClick={() => navigate("markers")}>Print markers</button></nav>
      <button className="btn header-cta" type="button" onClick={() => navigate("wizard")}>{page === "wizard" ? "Your drawer" : "Start my drawer"} <span aria-hidden="true">↗</span></button>
    </header>
    <main id="main" tabIndex={-1}>
      {page === "home" && <Landing onStart={() => navigate("wizard")} />}
      {page === "markers" && <PrintMarkers onBack={() => navigate("wizard")} />}
      <div className="place-app-shell" hidden={page !== "wizard"}>
        <div className="place-workspace-title"><div><h1>Your drawer, your way.</h1><p>Everything in your house has a home. Add, arrange, make it yours.</p></div>
          <nav className="place-workspace-nav" aria-label="Drawer planning steps"><button type="button" aria-current={step===1?'step':undefined} onClick={()=>goStep(1)}>01 · Measure</button><span aria-hidden="true">/</span><button type="button" disabled={!grid.cols||!grid.rows} aria-current={step===2?'step':undefined} onClick={()=>goStep(2)}>02 · Place</button></nav>
        </div>
        {step===1&&<div className="place-measure-wrap">
          <Step1Measure drawer={drawer} onChange={setDrawer} onContinue={()=>goStep(2)}/>
        </div>}
        <div hidden={step!==2}><Place drawer={drawer} groups={groups} onChange={setGroups} onMeasure={()=>goStep(1)}/></div>
        <p className="place-app-footer">Made to fit your things. Built around a 42 mm grid.</p>
      </div>

    </main>
    <footer className="site-footer no-print"><a href="#/" className="brand">boxable<span aria-hidden="true">✳</span></a><p>Everything in your house has a home.</p><span>Made for your everyday.</span></footer>
  </>;
}

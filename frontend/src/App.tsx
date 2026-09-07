import { useEffect, useMemo, useState } from "react";
import { Landing } from "./pages/Landing";
import { PrintMarkers } from "./pages/PrintMarkers";
import { Step1Measure } from "./steps/Step1Measure";
import { Step2Grid } from "./steps/Step2Grid";
import { Step3Items } from "./steps/Step3Items";
import { Step4Plan } from "./steps/Step4Plan";
import { fitGrid } from "./lib/gridLayout";
import { EMPTY_DRAWER, type DrawerState, type ItemGroup, type WizardStep } from "./lib/state";

const STEP_LABELS = ["Measure", "Your grid", "Your things", "Print plan"];
const TIPS = ["Place both printed markers flat on the drawer floor. Measure the usable depth separately.", "A shared 42 mm grid keeps your organizers modular, so each piece has a place.", "Group things the way you use them. Check estimated catalog dimensions against your own objects.", "Check the fit warnings before downloading. Your 3MF opens in your preferred slicer."];
type Page = "home" | "wizard" | "markers";
function readPage(): Page { return location.hash === "#/planner" ? "wizard" : location.hash === "#/markers" ? "markers" : "home"; }
export default function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [step, setStep] = useState<WizardStep>(1);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  useEffect(() => { const sync = () => { setPage(readPage()); if (location.hash === "#how-it-works") requestAnimationFrame(() => document.getElementById("how-it-works")?.scrollIntoView()); }; window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const navigate = (next: Page) => { location.hash = next === "home" ? "/" : next === "wizard" ? "/planner" : "/markers"; setPage(next); window.scrollTo(0, 0); };
  const grid = useMemo(() => fitGrid(drawer.widthMm, drawer.heightMm), [drawer.widthMm, drawer.heightMm]);
  const goStep = (next: WizardStep) => { setStep(next); window.scrollTo(0, 0); };
  return <>
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header className="topbar no-print">
      <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate("home"); }} aria-label="Boxable home">boxable<span aria-hidden="true">✳</span></a>
      <nav className="header-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><button className="ghost-link" type="button" onClick={() => navigate("markers")}>Print markers</button></nav>
      <button className="btn header-cta" type="button" onClick={() => navigate("wizard")}>{page === "wizard" ? "Your drawer" : "Start my drawer"} <span aria-hidden="true">↗</span></button>
    </header>
    <main id="main" tabIndex={-1}>
      {page === "home" && <Landing onStart={() => navigate("wizard")} />}
      {page === "markers" && <PrintMarkers onBack={() => navigate("wizard")} />}
      {page === "wizard" && <div className="app-shell">
        <div className="workspace-heading"><div><p className="eyebrow">The drawer studio</p><h1>A home for your everyday.</h1></div><span className="pill">Step 0{step} / 04</span></div>
        <nav className="steps" aria-label="Drawer planning steps">{STEP_LABELS.map((label,index) => { const n = (index + 1) as WizardStep; return <button key={label} className={`step-tab${step === n ? " active" : ""}`} type="button" aria-current={step === n ? "step" : undefined} onClick={() => goStep(n)}><span className="n">0{n}</span><span className="t">{label}</span></button>; })}</nav>
        <div className="studio-layout"><div className="studio-content">
          {step === 1 && <Step1Measure drawer={drawer} onChange={setDrawer} onContinue={() => goStep(2)} />}
          {step === 2 && <Step2Grid drawer={drawer} grid={grid} onBack={() => goStep(1)} onContinue={() => goStep(3)} />}
          {step === 3 && <Step3Items groups={groups} onChange={setGroups} onBack={() => goStep(2)} onContinue={() => goStep(4)} />}
          {step === 4 && <Step4Plan drawer={drawer} grid={grid} groups={groups} onBack={() => goStep(3)} />}
        </div><aside className="studio-aside"><p className="eyebrow">Your drawer, so far</p><dl><div><dt>Width × length</dt><dd>{drawer.widthMm && drawer.heightMm ? `${drawer.widthMm.toFixed(0)} × ${drawer.heightMm.toFixed(0)} mm` : "Let’s measure"}</dd></div><div><dt>Usable depth</dt><dd>{drawer.depthMm} mm</dd></div><div><dt>Grid</dt><dd>{grid.cols} × {grid.rows} cells</dd></div><div><dt>Item groups</dt><dd>{groups.length}</dd></div></dl><div className="boxie-tip"><img src="/brand/boxie.webp" width="650" height="650" alt="Boxie"/><p>{TIPS[step - 1]}</p></div></aside></div>
      </div>}
    </main>
    <footer className="site-footer no-print"><a href="#/" className="brand">boxable<span aria-hidden="true">✳</span></a><p>Everything in your house has a home.</p><span>Made for your everyday.</span></footer>
  </>;
}

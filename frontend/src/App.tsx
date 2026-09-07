import { useMemo, useState } from "react";
import { PrintMarkers } from "./pages/PrintMarkers";
import { Step1Measure } from "./steps/Step1Measure";
import { Step2Grid } from "./steps/Step2Grid";
import { Step3Items } from "./steps/Step3Items";
import { Step4Plan } from "./steps/Step4Plan";
import { fitGrid } from "./lib/gridLayout";
import { EMPTY_DRAWER, type DrawerState, type ItemGroup, type WizardStep } from "./lib/state";

const STEP_LABELS = ["Measure", "Grid", "Items", "Print plan"];

export default function App() {
  const [page, setPage] = useState<"wizard" | "markers">("wizard");
  const [step, setStep] = useState<WizardStep>(1);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [groups, setGroups] = useState<ItemGroup[]>([]);

  const grid = useMemo(
    () => fitGrid(drawer.widthMm, drawer.heightMm),
    [drawer.widthMm, drawer.heightMm],
  );

  if (page === "markers") {
    return <PrintMarkers onBack={() => setPage("wizard")} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            setStep(1);
          }}
        >
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">BOXABLE</div>
            <div className="brand-tag">Gridfinity drawer planner</div>
          </div>
        </a>
        <button className="ghost-link" type="button" onClick={() => setPage("markers")}>
          Print markers
        </button>
      </header>

      <nav className="steps" aria-label="Steps">
        {STEP_LABELS.map((label, index) => {
          const n = (index + 1) as WizardStep;
          return (
            <button
              key={label}
              className={`step-tab${step === n ? " active" : ""}`}
              type="button"
              onClick={() => setStep(n)}
            >
              <span className="n">0{n}</span>
              <span className="t">{label}</span>
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <Step1Measure drawer={drawer} onChange={setDrawer} onContinue={() => setStep(2)} />
      )}
      {step === 2 && (
        <Step2Grid drawer={drawer} grid={grid} onBack={() => setStep(1)} onContinue={() => setStep(3)} />
      )}
      {step === 3 && (
        <Step3Items groups={groups} onChange={setGroups} onBack={() => setStep(2)} onContinue={() => setStep(4)} />
      )}
      {step === 4 && <Step4Plan drawer={drawer} grid={grid} groups={groups} onBack={() => setStep(3)} />}
    </div>
  );
}

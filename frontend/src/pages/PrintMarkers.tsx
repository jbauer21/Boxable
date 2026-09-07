interface Props {
  onBack: () => void;
}

export function PrintMarkers({ onBack }: Props) {
  return (
    <div className="print-page">
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn secondary" type="button" onClick={onBack}>
          Back to Boxable
        </button>
        <button className="btn" type="button" onClick={() => window.print()}>
          Print at 100%
        </button>
      </div>
      <div className="print-intro no-print"><p className="eyebrow">Before the first photo</p><h1>A little help getting the fit right.</h1></div>
      <p className="print-note no-print">
        Print at 100% scale — no “fit to page”. Each square must measure exactly 10 × 10 cm. Place
        TopLeft in the drawer’s top-left corner and BottomRight in the bottom-right, both flat on
        the floor.
      </p>
      <p className="print-caption">TopLeft — 100 mm</p>
      <img className="print-marker" src="/markers/TopLeft.svg" alt="TopLeft fiducial, 100 millimeters square" />
      <p className="print-caption">BottomRight — 100 mm</p>
      <img className="print-marker" src="/markers/BottomRight.svg" alt="BottomRight fiducial, 100 millimeters square" />
    </div>
  );
}

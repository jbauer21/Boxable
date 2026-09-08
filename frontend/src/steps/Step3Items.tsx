import { useMemo, useRef, useState } from "react";
import {
  categoryDisplayName,
  getCatalogObject,
  quantityLabel,
  searchCatalog,
  type CatalogObject,
} from "../lib/catalog";
import { countLabel, displayName } from "../lib/itemCatalog";
import { cloneGroup, newCatalogGroup, newCustomGroup, type ItemGroup } from "../lib/state";

interface Props {
  groups: ItemGroup[];
  onChange: (groups: ItemGroup[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function Step3Items({ groups, onChange, onBack, onContinue }: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCatalog(query), [query]);

  const addCatalog = (obj: CatalogObject) => {
    onChange([...groups, newCatalogGroup(obj.id, obj.name)]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  };

  const addCustomFromQuery = () => {
    onChange([...groups, newCustomGroup(query.trim() || "Custom object")]);
    setQuery("");
    setHighlight(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (query.trim() === "") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) addCatalog(results[Math.min(highlight, results.length - 1)]);
      else addCustomFromQuery();
    } else if (e.key === "Escape") {
      setQuery("");
      setHighlight(0);
    }
  };

  const update = (id: string, patch: Partial<ItemGroup>) => {
    onChange(groups.map((g) => (g.id === id ? ({ ...g, ...patch } as ItemGroup) : g)));
  };

  const remove = (id: string) => onChange(groups.filter((g) => g.id !== id));

  const duplicate = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    onChange([...groups, cloneGroup(group)]);
  };

  const catalogCountLabel = (objectId: string): string => {
    const obj = getCatalogObject(objectId);
    return obj ? quantityLabel(obj.storage.quantity_mode) : "items";
  };

  return (
    <section className="panel">
      <h1>What needs a home?</h1>
      <p className="lede">
        Type what is in the drawer — batteries, screws, cables, measuring cups — and pick a match
        from the catalog. Each match knows how it is best stored. Anything the catalog does not
        know can be added as a custom box with approximate length × width × height in millimeters.
      </p>

      <div className="search-box">
        <div className="field">
          <label htmlFor="object-search">Search objects</label>
          <input
            id="object-search"
            ref={inputRef}
            value={query}
            placeholder="e.g. AA battery, wood screws, USB-C cable…"
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        {query.trim() !== "" && (
          <div className="search-results" role="listbox">
            {results.map((obj, i) => (
              <button
                key={obj.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? "active" : undefined}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => addCatalog(obj)}
              >
                <strong>{obj.name}</strong>
                <span className="result-category">{categoryDisplayName(obj.category)}</span>
              </button>
            ))}
            <button type="button" className="no-match" onClick={addCustomFromQuery}>
              {results.length === 0 ? "No match — " : ""}add “{query.trim()}” as a custom object
            </button>
          </div>
        )}
      </div>

      <button className="btn secondary" type="button" onClick={() => onChange([...groups, newCustomGroup()])}>
        Add custom object (L × W × H)
      </button>

      <div className="group-list">
        {groups.length === 0 && <p>No groups yet. Add at least one to generate bins.</p>}
        {groups.map((group) => (
          <div className="group-card" key={group.id}>
            <div>
              {group.mode === "standard" ? (
                <>
                  <strong>{displayName(group.type)}</strong>
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label>Count ({countLabel(group.type)})</label>
                      <input
                        type="number"
                        min={1}
                        value={group.count}
                        onChange={(e) => update(group.id, { count: Math.max(1, Number(e.target.value)) })}
                      />
                    </div>
                    {group.type === "customCell" && (
                      <>
                        <div className="field">
                          <label>Diameter mm</label>
                          <input
                            type="number"
                            min={1}
                            value={group.customCell.diameterMm}
                            onChange={(e) =>
                              update(group.id, {
                                customCell: { ...group.customCell, diameterMm: Number(e.target.value) },
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Length mm</label>
                          <input
                            type="number"
                            min={1}
                            value={group.customCell.lengthMm}
                            onChange={(e) =>
                              update(group.id, {
                                customCell: { ...group.customCell, lengthMm: Number(e.target.value) },
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : group.mode === "catalog" ? (
                <>
                  <strong>{group.name}</strong>
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label>Count ({catalogCountLabel(group.objectId)})</label>
                      <input
                        type="number"
                        min={1}
                        value={group.count}
                        onChange={(e) => update(group.id, { count: Math.max(1, Number(e.target.value)) })}
                      />
                    </div>
                  </div>
                  {getCatalogObject(group.objectId)?.generation.support_level === "fallback" && (
                    <p className="fallback-note">
                      Uses a simple container for now — {getCatalogObject(group.objectId)!.generation.fallback_reason ?? "specialized geometry is not available yet."}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <strong>Custom object</strong>
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label>Name</label>
                      <input
                        value={group.name}
                        onChange={(e) => update(group.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Count</label>
                      <input
                        type="number"
                        min={1}
                        value={group.count}
                        onChange={(e) => update(group.id, { count: Math.max(1, Number(e.target.value)) })}
                      />
                    </div>
                    <div className="field">
                      <label>L mm</label>
                      <input
                        type="number"
                        min={1}
                        value={group.lengthMm}
                        onChange={(e) => update(group.id, { lengthMm: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>W mm</label>
                      <input
                        type="number"
                        min={1}
                        value={group.widthMm}
                        onChange={(e) => update(group.id, { widthMm: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>H mm</label>
                      <input
                        type="number"
                        min={1}
                        value={group.heightMm}
                        onChange={(e) => update(group.id, { heightMm: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="group-card-actions">
              <button className="btn secondary" type="button" onClick={() => duplicate(group.id)}>
                Duplicate
              </button>
              <button className="btn secondary" type="button" onClick={() => remove(group.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <button className="btn secondary" type="button" onClick={onBack}>
          Back
        </button>
        <button className="btn" type="button" disabled={groups.length === 0} onClick={onContinue}>
          Pack bins
        </button>
      </div>
    </section>
  );
}

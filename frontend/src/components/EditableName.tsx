import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  fallback: string;
  onChange: (name: string) => void;
}

export function EditableName({ value, fallback, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommit = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      setEditing(false);
      return;
    }
    const next = draft.trim() || fallback;
    if (next !== value) onChange(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editable-name-input"
        value={draft}
        aria-label="Container name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            skipCommit.current = true;
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button type="button" className="editable-name" onClick={start}>
      {value || fallback}
    </button>
  );
}

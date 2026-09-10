import type { ItemGroup } from '../lib/state';
import { storageDimensions } from '../lib/storageOrientation';

export function StorageOrientation({ group, onChange }: { group: ItemGroup; onChange: (group: ItemGroup) => void }) {
  if (!storageDimensions(group)) return <p className="place-small">This object uses its fitted storage arrangement.</p>;
  return <fieldset className="place-orientation"><legend>Store objects</legend>
    {(['flat', 'vertical'] as const).map(value => <label key={value} className={(group.storageOrientation ?? 'flat') === value ? 'chosen' : ''}>
      <input type="radio" name={`orientation-${group.id}`} value={value} checked={(group.storageOrientation ?? 'flat') === value}
        onChange={() => onChange({ ...group, storageOrientation: value })}/>
      <span>{value === 'flat' ? '↔ Horizontal' : '↥ Vertical'}</span>
    </label>)}
  </fieldset>;
}

import type { ItemGroup } from '../lib/state';
import { storageDimensions } from '../lib/storageOrientation';

export function StorageOrientation({ group, onChange }: { group: ItemGroup; onChange: (group: ItemGroup) => void }) {
  const hasOrientation = !!storageDimensions(group);
  const options = hasOrientation ? ['flat', 'vertical', 'open'] as const : ['fitted', 'open'] as const;
  const selected = group.storageOrientation ?? (hasOrientation ? 'flat' : 'fitted');
  const labels = { flat: '↔ Horizontal', vertical: '↥ Vertical', open: 'Open', fitted: 'Fitted' };
  return <fieldset className="place-orientation"><legend>Store objects</legend>
    {options.map(value => <label key={value} className={selected === value ? 'chosen' : ''}>
      <input type="radio" name={`orientation-${group.id}`} value={value} checked={selected === value}
        onChange={() => onChange({ ...group, storageOrientation: value === 'fitted' ? undefined : value })}/>
      <span>{labels[value]}</span>
    </label>)}
    {selected === 'open' && <p className="place-small">One shared open space, sized for your quantity.</p>}
  </fieldset>;
}

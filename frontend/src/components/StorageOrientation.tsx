import type { ItemGroup } from '../lib/state';
import { storageDimensions } from '../lib/storageOrientation';

export function StorageOrientation({ group, onChange }: { group: ItemGroup; onChange: (group: ItemGroup) => void }) {
  if (!storageDimensions(group)) return null;
  return <div className="storage-orientation">
    <label><input type="checkbox" checked={group.storageOrientation === 'flat'}
      aria-describedby={`storage-help-${group.id}`}
      onChange={e => onChange({ ...group, storageOrientation: e.target.checked ? 'flat' : 'vertical' })}/>
      <span>Store flat in an open bin</span></label>
    <p id={`storage-help-${group.id}`}>{group.storageOrientation === 'flat'
      ? 'Items lie side by side in one shared, open container.'
      : group.storageOrientation === 'vertical' ? 'Items stand upright in individual pockets. The full item height must fit your drawer.'
      : 'Using the recommended storage. Check for flat storage; uncheck to stand items upright.'}</p>
  </div>;
}

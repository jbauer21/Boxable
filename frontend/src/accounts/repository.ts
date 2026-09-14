import { client, validatePhoto } from './client';
import { parseDocument, type DrawerDocument } from './document';
export interface DrawerRow {id:string; name:string; document:DrawerDocument; photo_path:string|null; revision:number; updated_at:string;}
export class ConflictError extends Error { constructor(){super('This drawer changed in another tab, or was deleted. Reload the saved version or save your work as a new drawer.');} }
const bucket=()=>client().storage.from('drawer-photos');
export async function listDrawers():Promise<DrawerRow[]> {
 const {data,error}=await client().from('drawers').select('id,name,document,photo_path,revision,updated_at').order('updated_at',{ascending:false});if(error)throw error;return data??[];
}
export async function getDrawer(id:string):Promise<DrawerRow> {
 const {data,error}=await client().from('drawers').select('*').eq('id',id).single();if(error)throw error;return {...data,document:parseDocument(data.document)};
}
export async function photoFile(path:string):Promise<File> {const {data,error}=await bucket().download(path);if(error)throw error;return new File([data],path.split('/').pop()!,{type:data.type});}
// Failed object cleanups are retried for the same account, never another user's paths.
export async function cleanup(userId:string,paths:string[]=[]){
 const key=`boxable-cleanup:${userId}`;
 let pending:string[]=[];try{pending=JSON.parse(localStorage.getItem(key)??'[]');}catch{/* ignore invalid cache */}
 pending=[...new Set([...pending,...paths])].filter(p=>typeof p==='string'&&p.startsWith(`${userId}/`));
 if(!pending.length)return;
 localStorage.setItem(key,JSON.stringify(pending));
 const {error}=await bucket().remove(pending);if(!error)localStorage.removeItem(key);
}
export async function saveDrawer(userId:string,id:string,revision:number,document:DrawerDocument,photo:File|null,oldPath:string|null,replacePhoto:boolean):Promise<DrawerRow>{
 const doc=parseDocument(document);
 if(photo)validatePhoto(photo);
 // Create the owning row first; file INSERT policy requires an existing owned drawer.
 if(!revision){const {error}=await client().from('drawers').insert({id,owner_id:userId,name:doc.name,document:doc});if(error){if(error.code!=='23505')throw error;const existing=await getDrawer(id);if(existing.revision!==1||existing.photo_path||JSON.stringify(existing.document)!==JSON.stringify(doc))throw new ConflictError();}revision=1;}
 let path=oldPath;
 if(replacePhoto){
  path=null;
  if(photo){const ext=photo.type==='image/jpeg'?'jpg':photo.type==='image/png'?'png':'webp';path=`${userId}/${id}/${crypto.randomUUID()}.${ext}`;const {error}=await bucket().upload(path,photo,{contentType:photo.type,upsert:false});if(error)throw error;}
 }
 const {data,error}=await client().from('drawers').update({name:doc.name,document:doc,photo_path:path}).eq('id',id).eq('revision',revision).select('*').maybeSingle();
 if(error||!data){
  // An ambiguous network failure may have committed: retain the new photo until the row is checked.
  if(!error&&path&&path!==oldPath)await cleanup(userId,[path]);
  if(error)throw error;throw new ConflictError();
 }
 if(oldPath&&path!==oldPath)void cleanup(userId,[oldPath]).catch(()=>{});
 return data;
}
export async function renameDrawer(row:DrawerRow,name:string){const doc=parseDocument({...row.document,name});const {data,error}=await client().from('drawers').update({name:doc.name,document:doc}).eq('id',row.id).eq('revision',row.revision).select('id').maybeSingle();if(error)throw error;if(!data)throw new ConflictError();}
export async function deleteDrawer(userId:string,row:DrawerRow){
 const {data:objects,error:listError}=await bucket().list(`${userId}/${row.id}`,{limit:1000});if(listError)throw listError;
 const paths=(objects??[]).map(o=>`${userId}/${row.id}/${o.name}`);
 const {data,error}=await client().from('drawers').delete().eq('id',row.id).eq('revision',row.revision).select('id').maybeSingle();if(error)throw error;if(!data)throw new ConflictError();await cleanup(userId,paths);
}

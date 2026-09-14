import { z } from 'zod';
import { ALL_ITEM_TYPES } from '../lib/itemCatalog';
import { EMPTY_DRAWER, type DrawerState, type ItemGroup } from '../lib/state';
import type { Layout } from '../place/model';
const dimension = z.number().finite().min(0).max(10000);
const id = z.string().min(1).max(160);
const name = z.string().max(80);
const point = z.tuple([z.number().finite(), z.number().finite()]);
const common = { id, name, count: z.number().int().min(1).max(999), storageOrientation: z.enum(['flat','vertical']).optional() };
const group = z.discriminatedUnion('mode', [
  z.object({...common, mode:z.literal('standard'), type:z.enum(ALL_ITEM_TYPES), customCell:z.object({diameterMm:dimension,lengthMm:dimension})}),
  z.object({...common, mode:z.literal('catalog'), objectId:id}),
  z.object({...common, mode:z.literal('custom'), lengthMm:dimension, widthMm:dimension, heightMm:dimension}),
]);
const spec = z.object({id,name,kind:z.enum(['bin','cyl_pockets','hex_pockets','rect_pockets','spool']),item_shape:z.enum(['cylinder','hex','box']).optional(),length_u:z.number().int().min(1).max(240),width_u:z.number().int().min(1).max(240),height_u:z.number().int().min(1).max(72),quantity:z.number().int().min(1).max(999),length_div:dimension,width_div:dimension,scoops:z.boolean(),labels:z.boolean(),pocket_rows:dimension,pocket_cols:dimension,pocket_depth_mm:dimension,pocket_diam_mm:dimension,pocket_length_mm:dimension,pocket_width_mm:dimension});
export const documentSchema = z.object({
  version:z.literal(1), name:z.string().trim().min(1).max(80), step:z.union([z.literal(1),z.literal(2)]),
  drawer:z.object({widthMm:dimension,heightMm:dimension,depthMm:dimension,imageWidth:dimension,imageHeight:dimension,topLeft:z.array(point).length(4).nullable(),bottomRight:z.array(point).length(4).nullable(),confident:z.boolean(),message:z.string().max(4000)}),
  groups:z.array(group).max(500), usableHeightMm:z.number().min(20).max(500),
  layout:z.object({placed:z.array(z.object({spec,col:z.number().int().min(0).max(240),row:z.number().int().min(0).max(240),rotated:z.boolean()})).max(2000),unplaced:z.array(spec).max(2000)}),
});
export type DrawerDocument = z.infer<typeof documentSchema>;
export function newDocument(): DrawerDocument {
  const {photoFile: _file,photoUrl: _url,...drawer}=EMPTY_DRAWER;
  return {version:1,name:'Untitled drawer',step:1,drawer,groups:[],usableHeightMm:50,layout:{placed:[],unplaced:[]}};
}
export function parseDocument(value:unknown): DrawerDocument {
  const result=documentSchema.safeParse(value);
  if(!result.success) throw new Error('This saved drawer is invalid or uses an unsupported version. Your saved copy has not been changed.');
  if(JSON.stringify(result.data).length>2*1024*1024) throw new Error('This drawer is too large to save.');
  return result.data;
}
export function serialize(name:string,step:1|2,drawer:DrawerState,groups:ItemGroup[],layout:Layout,usableHeightMm:number):DrawerDocument {
 const {photoFile:_file,photoUrl:_url,...measurements}=drawer;
 return parseDocument({version:1,name,step,drawer:measurements,groups,layout,usableHeightMm});
}

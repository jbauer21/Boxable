// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { newDocument } from './accounts/document';

const mocks=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,save:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock('./accounts/Auth',()=>({useAccount:()=>({user:mocks.user,loading:false,recovery:false,error:''}),Auth:()=> <h1>Sign in to save your drawer</h1>}));
vi.mock('./accounts/client',()=>({client:vi.fn()}));
vi.mock('./accounts/drafts',()=>({readDraft:mocks.read,writeDraft:mocks.write}));
vi.mock('./accounts/repository',()=>({saveDrawer:mocks.save,cleanup:vi.fn().mockResolvedValue(undefined),getDrawer:vi.fn(),photoFile:vi.fn(),ConflictError:class extends Error{}}));
vi.mock('./accounts/Library',()=>({Library:()=> <h1>My saved drawers</h1>}));
vi.mock('./place/Plan3D',()=>({Plan3D:()=>null}));

beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();mocks.user={id:'owner'};
 window.location.hash='/planner';window.scrollTo=vi.fn();
 const document=newDocument();document.step=2;document.name='Office';document.drawer.widthMm=420;document.drawer.heightMm=252;
 mocks.read.mockResolvedValue({document,photo:null,id:'drawer',revision:0,photoPath:null,dirty:true});
 mocks.write.mockResolvedValue(undefined);
 mocks.save.mockImplementation(async(_user,id,revision)=>({id,revision:revision+1,photo_path:null}));
});
afterEach(cleanup);

it('Save Drawer stores the plan in the account before opening My drawers',async()=>{
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save Drawer'}));
 await screen.findByRole('heading',{name:'My saved drawers'});
 expect(mocks.save).toHaveBeenCalledWith('owner','drawer',0,expect.objectContaining({name:'Office',layout:{placed:[],unplaced:[]}}),null,null,false);
 expect(window.location.hash).toBe('#/drawers');
 expect(screen.queryByText('Export JSON')).toBeNull();
});

it('preserves a guest drawer and opens sign-in without a cloud write',async()=>{
 mocks.user=null;
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save Drawer'}));
 await screen.findByRole('heading',{name:'Sign in to save your drawer'});
 expect(sessionStorage.getItem('boxable-import-guest')).toBe('yes');
 expect(mocks.write).toHaveBeenLastCalledWith('guest',expect.objectContaining({document:expect.objectContaining({name:'Office'})}));
 expect(mocks.save).not.toHaveBeenCalled();
});

it('keeps the planner open and shows the error when saving fails',async()=>{
 mocks.save.mockRejectedValue(new Error('Connection lost'));
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save Drawer'}));
 await screen.findByText('Connection lost');
 await waitFor(()=>expect((screen.getByRole('button',{name:'Save Drawer'}) as HTMLButtonElement).disabled).toBe(false));
 expect(window.location.hash).toBe('#/planner');
 expect(screen.queryByRole('heading',{name:'My saved drawers'})).toBeNull();
});

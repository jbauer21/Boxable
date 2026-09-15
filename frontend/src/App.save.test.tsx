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

it('only shows My drawers to signed-in users',async()=>{
 mocks.user=null;
 const view=render(<App/>);
 await screen.findByRole('button',{name:'Save Drawer'});
 expect(screen.queryByRole('button',{name:'My drawers'})).toBeNull();
 mocks.user={id:'owner'};view.rerender(<App/>);
 expect(await screen.findByRole('button',{name:'My drawers'})).toBeTruthy();
});

it('retains the planner when guest caching fails',async()=>{
 mocks.user=null;mocks.write.mockRejectedValue(new Error('Storage full'));
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save Drawer'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('could not be cached'));
 expect(window.location.hash).toBe('#/planner');
 expect(mocks.save).not.toHaveBeenCalled();
});

it('resumes a cached save after a confirmation link in a new tab and waits for cloud success',async()=>{
 const document=newDocument();document.step=2;document.name='Guest office';document.drawer.widthMm=420;document.drawer.heightMm=252;
 mocks.read.mockImplementation(async key=>key==='guest'?{document,photo:null,id:null,revision:0,photoPath:null,dirty:true,pendingAccountSave:true}:undefined);
 let complete:(value:unknown)=>void=()=>{};
 mocks.save.mockImplementation((_user,id)=>new Promise(resolve=>{complete=()=>resolve({id,revision:1,photo_path:null});}));
 window.location.hash='/account';render(<App/>);
 await screen.findByRole('button',{name:'Save Drawer'});
 expect(screen.queryByRole('heading',{name:'My saved drawers'})).toBeNull();
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1),{timeout:2500});
 expect(mocks.save.mock.calls[0][3].name).toBe('Guest office');
 complete(null);
 await screen.findByRole('heading',{name:'My saved drawers'});
 expect(mocks.write).toHaveBeenCalledWith('guest',null);
});

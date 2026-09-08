import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { colorFor } from './model';
import type { PlacedContainer } from '../lib/types';

interface Props { placed: PlacedContainer[]; cols: number; rows: number; selected: string; onSelect:(id:string)=>void }
export function Plan3D({placed,cols,rows,selected,onSelect}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const api=useRef<{scene:THREE.Scene;renderer:THREE.WebGLRenderer;camera:THREE.PerspectiveCamera;controls:OrbitControls;items:THREE.Group;floor:THREE.Group;render:()=>void}|null>(null);
  const select=useRef(onSelect);select.current=onSelect;
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!host.current)return;const el=host.current;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError('3D is unavailable in this browser. You can still edit in top view.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#f2f0ea');el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,1,5000),items=new THREE.Group(),floor=new THREE.Group();
    scene.add(items,floor,new THREE.HemisphereLight(0xffffff,0x666178,2.6));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(100,500,200);scene.add(light);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=100;controls.maxDistance=2200;
    const render=()=>renderer.render(scene,camera);controls.addEventListener('change',render);
    const observer=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render()});observer.observe(el);
    const ray=new THREE.Raycaster();let down=[0,0];
    const start=(e:PointerEvent)=>{down=[e.clientX,e.clientY]};
    const click=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=el.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(items.children,true)[0];if(hit){let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.id)o=o.parent;if(o)select.current(o.userData.id);}};
    renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',click);
    api.current={scene,renderer,camera,controls,items,floor,render};
    return()=>{observer.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove();api.current=null;};
  },[]);
  useEffect(()=>{
    const a=api.current;if(!a)return;
    a.floor.children.forEach(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();(o.material as THREE.Material).dispose()}});a.floor.clear();
    const w=cols*42,h=rows*42;
    const bottom=new THREE.Mesh(new THREE.BoxGeometry(w,3,h),new THREE.MeshStandardMaterial({color:'#dedbd3',roughness:1}));bottom.position.set(w/2,-3,h/2);a.floor.add(bottom);
    const pts:number[]=[];for(let c=0;c<=cols;c++)pts.push(c*42,0,0,c*42,0,h);for(let r=0;r<=rows;r++)pts.push(0,0,r*42,w,0,r*42);
    const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));a.floor.add(new THREE.LineSegments(geom,new THREE.LineBasicMaterial({color:'#aaa59b'})));
    a.camera.position.set(w*.9,Math.max(w,h)*1.15,h*1.4);a.controls.target.set(w/2,0,h/2);a.controls.update();a.render();
  },[cols,rows]);
  useEffect(()=>{
    const a=api.current;if(!a)return;
    const ids=new Set(placed.map(p=>p.spec.id));
    const dispose=(o:THREE.Object3D)=>{o.traverse(ch=>{if(ch instanceof THREE.Mesh){ch.geometry.dispose();(ch.material as THREE.Material).dispose()}});a.items.remove(o)};
    [...a.items.children].forEach(o=>{if(!ids.has(o.userData.id))dispose(o)});
    for(const p of placed){const s=p.spec,key=JSON.stringify(s);let g=a.items.children.find(o=>o.userData.id===s.id) as THREE.Group|undefined;
      if(g&&g.userData.key!==key){dispose(g);g=undefined;}
      if(!g){g=new THREE.Group();g.userData={id:s.id,key};const w=s.length_u*42-1,d=s.width_u*42-1,h=s.height_u*7;
        const material=new THREE.MeshStandardMaterial({color:colorFor(s.id),roughness:.65});
        const box=(x:number,y:number,z:number,cx:number,cy:number,cz:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),material.clone());mesh.position.set(cx,cy,cz);g!.add(mesh)};
        box(w,7,d,w/2,3.5,d/2);box(w,h,2,w/2,h/2,1);box(w,h,2,w/2,h/2,d-1);box(2,h,d,1,h/2,d/2);box(2,h,d,w-1,h/2,d/2);
        if(s.kind==='bin'){for(let i=1;i<s.length_div;i++)box(1.5,h-7,d-4,w*i/s.length_div,(h+7)/2,d/2);for(let i=1;i<s.width_div;i++)box(w-4,h-7,1.5,w/2,(h+7)/2,d*i/s.width_div);}
        else if(s.kind==='spool'){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w,d)*.19,Math.min(w,d)*.19,h-7,32),material.clone());mesh.position.set(w/2,(h+7)/2,d/2);g.add(mesh);}
        else {const shape=new THREE.Shape();shape.moveTo(2,2);shape.lineTo(w-2,2);shape.lineTo(w-2,d-2);shape.lineTo(2,d-2);shape.closePath();
          for(let r=0;r<s.pocket_rows;r++)for(let c=0;c<s.pocket_cols;c++){const x=3+(w-6)*(c+.5)/s.pocket_cols,y=3+(d-6)*(r+.5)/s.pocket_rows,path=new THREE.Path();
            if(s.kind==='rect_pockets'){const pw=s.pocket_length_mm,ph=s.pocket_width_mm;path.moveTo(x-pw/2,y-ph/2);path.lineTo(x-pw/2,y+ph/2);path.lineTo(x+pw/2,y+ph/2);path.lineTo(x+pw/2,y-ph/2);path.closePath();}
            else if(s.kind==='hex_pockets'){const rad=s.pocket_diam_mm/Math.sqrt(3);for(let k=0;k<6;k++){const ang=-k*Math.PI/3;k?path.lineTo(x+Math.cos(ang)*rad,y+Math.sin(ang)*rad):path.moveTo(x+rad,y);}path.closePath();}
            else path.absarc(x,y,s.pocket_diam_mm/2,0,Math.PI*2,true);shape.holes.push(path);}
          const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:Math.max(1,h-8),bevelEnabled:false,curveSegments:16}),material.clone());mesh.rotation.x=Math.PI/2;mesh.position.y=h;g.add(mesh);}
        material.dispose();a.items.add(g);
      }
      g.position.set(p.col*42,0,p.row*42);g.rotation.y=p.rotated?-Math.PI/2:0;if(p.rotated)g.position.x+=s.width_u*42-1;
      g.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.emissive.set(s.id===selected?'#563695':'#000000');m.emissiveIntensity=s.id===selected?.12:0;}});
    }a.render();
  },[placed,selected]);
  return <div className="place-three" ref={host} aria-label="3D drawer preview">{error&&<p className="place-empty">{error}</p>}</div>;
}

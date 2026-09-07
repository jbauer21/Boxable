import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PreviewMesh } from "../lib/types";

const COLORS = ["#c45c26", "#3f6b4a", "#3b5f8a", "#8b4d6b", "#c4a35a", "#4d5d6b", "#6b3f2a", "#2f6d6a"];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  meshes: PreviewMesh[];
}

export function DrawerPreview3D({ meshes }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / Math.max(host.clientHeight, 1), 1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c8, 1.1);
    key.position.set(120, 180, 220);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9eb7c8, 0.4);
    fill.position.set(-160, 80, -40);
    scene.add(fill);

    let maxX = 1;
    let maxY = 1;
    let maxZ = 1;
    meshes.forEach((mesh) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(mesh.vertices.length * 3);
      mesh.vertices.forEach((v, i) => {
        positions[i * 3] = v[0];
        positions[i * 3 + 1] = v[2];
        positions[i * 3 + 2] = v[1];
        maxX = Math.max(maxX, v[0]);
        maxY = Math.max(maxY, v[2]);
        maxZ = Math.max(maxZ, v[1]);
      });
      const indexArray: number[] = [];
      for (const tri of mesh.triangles) {
        indexArray.push(tri[0], tri[1], tri[2]);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indexArray);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorFor(mesh.name)),
        metalness: 0.05,
        roughness: 0.55,
      });
      scene.add(new THREE.Mesh(geometry, material));
    });

    scene.add(new THREE.GridHelper(Math.max(maxX, maxZ) + 40, 10, 0x444444, 0x2a2a2a));

    camera.position.set(maxX * 0.6, maxY * 2.2 + 80, maxZ * 1.6 + 80);
    controls.target.set(maxX / 2, maxY / 3, maxZ / 2);
    controls.update();

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [meshes]);

  return <div className="preview-3d" ref={hostRef} />;
}

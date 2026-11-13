import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArrowLeft, ChevronDown, ChevronUp, Sun, Moon, Volume2, VolumeX, Compass } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { soundFX } from '../../lib/audio';
import { apiFetch } from '../../lib/api';

interface LetterNodeInfo {
  letter: string;
  nameAr: string;
  nameEn: string;
  makhrajAr: string;
  makhrajEn: string;
  freq: number;
}

const LETTER_NODES: LetterNodeInfo[] = [
  { letter: 'أ', nameAr: 'الألف', nameEn: 'Alif', makhrajAr: 'الجوف — يخرج بامتداد الصوت من الفم والحلق', makhrajEn: 'Al-Jawf — Empty space of mouth and throat', freq: 440 },
  { letter: 'ب', nameAr: 'الباء', nameEn: 'Baa', makhrajAr: 'الشفتان — بانطباقهما بلطف', makhrajEn: 'Both lips gently closing together', freq: 493.88 },
  { letter: 'ج', nameAr: 'الجيم', nameEn: 'Jeem', makhrajAr: 'وسط اللسان مع ما يحاذيه من الحنك الأعلى', makhrajEn: 'Middle tongue against the upper palate', freq: 523.25 },
  { letter: 'د', nameAr: 'الدال', nameEn: 'Daal', makhrajAr: 'طرف اللسان مع أصول الثنايا العليا', makhrajEn: 'Tip of tongue against upper front teeth roots', freq: 587.33 },
  { letter: 'ر', nameAr: 'الراء', nameEn: 'Raa', makhrajAr: 'طرف اللسان مائلاً إلى ظهره قليلاً', makhrajEn: 'Tip of tongue lightly curved toward upper gum', freq: 659.25 },
  { letter: 'م', nameAr: 'الميم', nameEn: 'Meem', makhrajAr: 'الشفتان مع غنة لطيفة من الخيشوم', makhrajEn: 'Both lips with gentle nasal resonance', freq: 783.99 },
];

const _vec3 = new THREE.Vector3();

function createPlaqueTexture(letter: string, label: string, bgHex: string, fgHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#D99B26';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 232, 232);

  ctx.fillStyle = fgHex;
  ctx.font = 'bold 124px Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 114);

  ctx.fillStyle = '#2DD4BF';
  ctx.font = '600 26px Cairo, sans-serif';
  ctx.fillText(label, 128, 206);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStoneBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 100 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 3, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function Noor3DExplorer({ onExit }: { onExit: () => void }) {
  const { lang, user } = useApp();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<LetterNodeInfo>(LETTER_NODES[0]);
  const [sceneMode, setSceneMode] = useState<'night' | 'day'>('night');
  const [orbitActive, setOrbitActive] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(soundFX.muted);

  const stateRef = useRef({
    sceneMode: 'night' as 'night' | 'day',
    orbitActive: true,
    exploded: false,
    camPreset: 'default' as 'default' | 'top' | 'closeup',
    inspectedCount: 0,
  });

  useEffect(() => {
    stateRef.current.sceneMode = sceneMode;
  }, [sceneMode]);

  useEffect(() => {
    stateRef.current.orbitActive = orbitActive;
  }, [orbitActive]);

  useEffect(() => {
    stateRef.current.exploded = exploded;
  }, [exploded]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const nightBg = new THREE.Color('#091529');
    const dayBg = new THREE.Color('#EAE4D3');
    scene.background = nightBg.clone();
    scene.fog = new THREE.FogExp2('#091529', 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.2, 8.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 1.8, 0);
    controls.minDistance = 4;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI * 0.48;

    // 3-Point Studio Rig
    const hemiLight = new THREE.HemisphereLight('#B8D4FF', '#2A1E12', 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFE4B5', 2.4);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#2DD4BF', 0.9);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const lanternPointLight = new THREE.PointLight('#FFB347', 4.5, 10);
    lanternPointLight.position.set(0, 2.0, 0);
    scene.add(lanternPointLight);

    // Ground Courtyard Floor with procedural bump
    const stoneBump = createStoneBumpTexture();
    const floorGeo = new THREE.CylinderGeometry(18, 18, 0.2, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#132645',
      roughness: 0.85,
      metalness: 0.05,
      bumpMap: stoneBump,
      bumpScale: 0.03,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.1;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Contact shadow plane beneath pedestal
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 128, 128);
    const contactTex = new THREE.CanvasTexture(shadowCanvas);
    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.6 })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.02;
    scene.add(contactPlane);

    // Materials library (varied roughness & metalness across adjacent parts)
    const brassMat = new THREE.MeshPhysicalMaterial({
      color: '#D99B26',
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.4,
    });
    const darkBronzeMat = new THREE.MeshStandardMaterial({
      color: '#4A3720',
      metalness: 0.72,
      roughness: 0.52,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#D8CFB8',
      roughness: 0.82,
      metalness: 0.04,
      bumpMap: stoneBump,
      bumpScale: 0.02,
    });
    const glassCoreMat = new THREE.MeshPhysicalMaterial({
      color: '#FFF3C4',
      emissive: '#FF9E2C',
      emissiveIntensity: 0.75,
      roughness: 0.12,
      metalness: 0.0,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.82 : 1,
      ior: 1.52,
    });

    // Composite Model 1: Stepped Stone Pedestal + Brass Islamic Lantern (Fanoos) (8 parts)
    const lanternGroup = new THREE.Group();
    scene.add(lanternGroup);

    // Part 1: Pedestal base (grounded flush at y = 0)
    const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.35, 8), stoneMat);
    pedBase.position.y = 0.175;
    pedBase.castShadow = true;
    pedBase.receiveShadow = true;
    lanternGroup.add(pedBase);

    // Part 2: Pedestal column
    const pedCol = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.55, 8), darkBronzeMat);
    pedCol.position.y = 0.625;
    pedCol.castShadow = true;
    lanternGroup.add(pedCol);

    // Part 3: Lantern lower brass tray
    const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.18, 8), brassMat);
    lanternBase.position.y = 0.99;
    lanternBase.castShadow = true;
    lanternGroup.add(lanternBase);

    // Part 4: Glowing glass chamber (LatheGeometry)
    const glassPts = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.42, 0.05),
      new THREE.Vector2(0.55, 0.55),
      new THREE.Vector2(0.45, 1.15),
      new THREE.Vector2(0.01, 1.2),
    ];
    const glassGeo = new THREE.LatheGeometry(glassPts, 16);
    const glassMesh = new THREE.Mesh(glassGeo, glassCoreMat);
    glassMesh.position.y = 1.08;
    lanternGroup.add(glassMesh);

    // Part 5: 8 Structural brass ribs around the glass (grouped)
    const cageGroup = new THREE.Group();
    cageGroup.position.y = 1.08;
    const ribGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.24, 8);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeo, darkBronzeMat);
      rib.position.set(Math.cos(angle) * 0.58, 0.62, Math.sin(angle) * 0.58);
      rib.castShadow = true;
      cageGroup.add(rib);
    }
    lanternGroup.add(cageGroup);

    // Part 6: Brass dome roof (LatheGeometry)
    const domePts = [
      new THREE.Vector2(0.66, 0),
      new THREE.Vector2(0.62, 0.15),
      new THREE.Vector2(0.44, 0.42),
      new THREE.Vector2(0.16, 0.68),
      new THREE.Vector2(0.04, 0.88),
    ];
    const domeMesh = new THREE.Mesh(new THREE.LatheGeometry(domePts, 16), brassMat);
    domeMesh.position.y = 2.28;
    domeMesh.castShadow = true;
    lanternGroup.add(domeMesh);

    // Part 7: Finial ring (TorusGeometry)
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 10, 24), brassMat);
    ringMesh.position.y = 3.28;
    lanternGroup.add(ringMesh);

    // Part 8: Crescent Moon atop the lantern (ExtrudeGeometry with bevel)
    const crescentShape = new THREE.Shape();
    crescentShape.absarc(0, 0, 0.28, -Math.PI * 0.65, Math.PI * 0.65, false);
    crescentShape.absarc(0.12, 0, 0.22, Math.PI * 0.58, -Math.PI * 0.58, true);
    const crescentGeo = new THREE.ExtrudeGeometry(crescentShape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    crescentGeo.center();
    const crescentMesh = new THREE.Mesh(crescentGeo, brassMat);
    crescentMesh.position.set(0, 3.65, 0);
    lanternGroup.add(crescentMesh);

    // Instanced stars in the dome sky
    const starCount = 120;
    const starGeo = new THREE.OctahedronGeometry(0.05, 0);
    const starMat = new THREE.MeshStandardMaterial({ color: '#FFE599', emissive: '#D99B26', emissiveIntensity: 0.8 });
    const starInstances = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      const r = 8 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      dummy.position.set(r * Math.cos(theta) * Math.cos(phi), 2 + r * Math.sin(phi), r * Math.sin(theta) * Math.cos(phi));
      const s = 0.6 + Math.random() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      starInstances.setMatrixAt(i, dummy.matrix);
    }
    starInstances.computeBoundingSphere();
    scene.add(starInstances);

    // Orbiting Arabic Letter Plaques (Interactive via Raycasting on Layer 1)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const orbitGroup = new THREE.Group();
    orbitGroup.position.y = 1.95;
    scene.add(orbitGroup);

    const plaqueMeshes: THREE.Mesh[] = [];
    const createdTextures: THREE.Texture[] = [stoneBump, contactTex];

    LETTER_NODES.forEach((node, idx) => {
      const tex = createPlaqueTexture(node.letter, node.nameAr, '#0F213E', '#F8F5EC');
      tex.anisotropy = maxAniso;
      createdTextures.push(tex);

      const plaqueGroup = new THREE.Group();
      const angle = (idx / LETTER_NODES.length) * Math.PI * 2;
      plaqueGroup.position.set(Math.cos(angle) * 2.85, Math.sin(idx * 1.1) * 0.35, Math.sin(angle) * 2.85);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.86, 0.08),
        [brassMat, brassMat, brassMat, brassMat, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 })]
      );
      frame.userData = { letterIndex: idx };
      frame.layers.enable(1);
      plaqueGroup.add(frame);
      plaqueMeshes.push(frame);
      orbitGroup.add(plaqueGroup);
    });

    // Raycaster for interactive plaque clicks
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(plaqueMeshes, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.letterIndex as number;
        const chosen = LETTER_NODES[idx];
        if (chosen) {
          setSelectedLetter(chosen);
          soundFX.playTone(chosen.freq, 0.22, 'triangle', 0.1);
          stateRef.current.inspectedCount += 1;
          if (user?.role === 'student') {
            apiFetch('/api/student/games/progress', {
              method: 'POST',
              body: JSON.stringify({
                game_slug: 'noor-3d-lantern',
                score: Math.min(300, stateRef.current.inspectedCount * 35),
                stars: Math.min(6, Math.max(1, stateRef.current.inspectedCount)),
                completed_levels: 1,
              }),
            }).catch(() => {});
          }
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      // Smooth day/night atmosphere transition
      const isNight = stateRef.current.sceneMode === 'night';
      const targetBg = isNight ? nightBg : dayBg;
      (scene.background as THREE.Color).lerp(targetBg, 1 - Math.exp(-5 * dt));
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(scene.background as THREE.Color);
      }
      starInstances.visible = isNight;
      lanternPointLight.intensity = THREE.MathUtils.damp(lanternPointLight.intensity, isNight ? 5.2 : 1.4, 5, dt);
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, isNight ? 2.1 : 3.2, 5, dt);

      // Exploded view spring/damp separation of lantern parts
      const exp = stateRef.current.exploded ? 1 : 0;
      domeMesh.position.y = THREE.MathUtils.damp(domeMesh.position.y, 2.28 + exp * 0.85, 6, dt);
      ringMesh.position.y = THREE.MathUtils.damp(ringMesh.position.y, 3.28 + exp * 1.15, 6, dt);
      crescentMesh.position.y = THREE.MathUtils.damp(crescentMesh.position.y, 3.65 + exp * 1.35, 6, dt);
      glassMesh.position.y = THREE.MathUtils.damp(glassMesh.position.y, 1.08 + exp * 0.35, 6, dt);

      // Orbit plaques & billboard toward camera
      if (stateRef.current.orbitActive) {
        orbitGroup.rotation.y += dt * 0.28;
      }
      crescentMesh.rotation.y = elapsed * 0.6;
      plaqueMeshes.forEach((mesh, i) => {
        mesh.parent!.position.y = Math.sin(elapsed * 1.4 + i) * 0.16;
        _vec3.copy(camera.position);
        mesh.lookAt(_vec3);
      });

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      createdTextures.forEach((t) => t.dispose());
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [user]);

  return (
    <div className="fixed inset-0 z-50 bg-[#091529] overflow-hidden">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top Bar */}
      <div className="absolute top-4 inset-x-4 flex items-center justify-between pointer-events-none">
        <button
          onClick={onExit}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold bg-[#0F213E] text-[#F8F5EC] border border-[#294A7D] hover:bg-[#162C4E] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          <span>{lang === 'ar' ? 'العودة للأكاديمية' : 'Exit 3D Observatory'}</span>
        </button>

        <div className="pointer-events-auto rounded-xl px-4 py-2 bg-[#0F213E] text-[#F8F5EC] border border-[#294A7D] text-sm font-semibold">
          {selectedLetter.letter} — {lang === 'ar' ? selectedLetter.nameAr : selectedLetter.nameEn}
          <span className="mx-2 text-slate-400">·</span>
          <span className="text-xs font-normal text-teal-300">
            {lang === 'ar' ? selectedLetter.makhrajAr : selectedLetter.makhrajEn}
          </span>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (Zero side-panel occlusion, no backdrop-filter over WebGL) */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(780px,94vw)] transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[calc(100%-36px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex justify-center mb-1">
          <button
            onClick={() => setDockCollapsed((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-t-xl px-4 py-1 text-xs font-semibold bg-[#0F213E] text-[#F8F5EC] border border-b-0 border-[#294A7D] cursor-pointer"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{dockCollapsed ? (lang === 'ar' ? 'إظهار التحكم' : 'Show Controls') : (lang === 'ar' ? 'إخفاء التحكم' : 'Hide Controls')}</span>
          </button>
        </div>

        <div className="rounded-2xl bg-[#0F213E] border border-[#294A7D] p-3 flex flex-wrap items-center justify-center gap-2.5 text-xs font-semibold text-[#F8F5EC]">
          <button
            onClick={() => setSceneMode((m) => (m === 'night' ? 'day' : 'night'))}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 bg-[#162C4E] hover:bg-[#1E3B68] border border-[#294A7D] cursor-pointer"
          >
            {sceneMode === 'night' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-teal-300" />}
            <span>{sceneMode === 'night' ? (lang === 'ar' ? 'إضاءة نهارية' : 'Daylight') : (lang === 'ar' ? 'إضاءة ليلية' : 'Night Sky')}</span>
          </button>

          <button
            onClick={() => setOrbitActive((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 bg-[#162C4E] hover:bg-[#1E3B68] border border-[#294A7D] cursor-pointer"
          >
            <Compass className="w-4 h-4 text-teal-300" />
            <span>{orbitActive ? (lang === 'ar' ? 'إيقاف الدوران' : 'Pause Orbit') : (lang === 'ar' ? 'تشغيل الدوران' : 'Resume Orbit')}</span>
          </button>

          <button
            onClick={() => setExploded((e) => !e)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 border cursor-pointer ${
              exploded
                ? 'bg-[#C98A1E] border-[#D99B26] text-white'
                : 'bg-[#162C4E] hover:bg-[#1E3B68] border-[#294A7D]'
            }`}
          >
            <span>{exploded ? (lang === 'ar' ? 'تجميع الفانوس' : 'Assemble Lantern') : (lang === 'ar' ? 'تفكيك أجزاء الفانوس' : 'Explode Parts')}</span>
          </button>

          <button
            onClick={() => {
              soundFX.muted = !muted;
              setMuted(!muted);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 bg-[#162C4E] hover:bg-[#1E3B68] border border-[#294A7D] cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{muted ? (lang === 'ar' ? 'كتم' : 'Muted') : (lang === 'ar' ? 'صوت' : 'Audio')}</span>
          </button>

          <span className="text-slate-300 px-2">
            {lang === 'ar' ? 'اضغط على أي حرف للتعرف على مخرجه' : 'Click any orbiting letter to inspect'}
          </span>
        </div>
      </div>
    </div>
  );
}

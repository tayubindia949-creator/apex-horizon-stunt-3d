import * as THREE from 'three';
import { LevelDef, RampDef } from './types';

export interface WorldCoinItem {
  id: string;
  value: number;
  mesh: THREE.Mesh;
  collected: boolean;
  pos: THREE.Vector3;
}

export interface WorldRingItem {
  id: string;
  points: number;
  mesh: THREE.Group;
  cleared: boolean;
  pos: THREE.Vector3;
  radius: number;
}

export interface WorldCheckpointItem {
  id: string;
  mesh: THREE.Group;
  cleared: boolean;
  pos: THREE.Vector3;
  width: number;
}

export interface BuiltWorld {
  group: THREE.Group;
  coins: WorldCoinItem[];
  rings: WorldRingItem[];
  checkpoints: WorldCheckpointItem[];
  ramps: RampDef[];
  getGroundHeightAt: (x: number, z: number, prevY: number) => {
    height: number;
    pitch: number;
    onRamp: RampDef | null;
  };
  dispose: () => void;
}

function createAsphaltTexture(
  trackColor: string,
  accentColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = trackColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain
  for (let i = 0; i < 3600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle circuit grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);

  // Dashed lane accents
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(252, 24, 8, 90);
  ctx.fillRect(252, 180, 8, 90);
  ctx.fillRect(252, 340, 8, 90);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRampTexture(accentColor: string, isBoost: boolean, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1E2532';
  ctx.fillRect(0, 0, 256, 512);

  // Side safety stripes
  ctx.fillStyle = isBoost ? '#06B6D4' : accentColor;
  ctx.fillRect(0, 0, 18, 512);
  ctx.fillRect(238, 0, 18, 512);

  // Directional launch chevrons
  ctx.strokeStyle = isBoost ? '#22D3EE' : accentColor;
  ctx.lineWidth = 14;
  for (let y = 70; y < 490; y += 96) {
    ctx.beginPath();
    ctx.moveTo(46, y + 32);
    ctx.lineTo(128, y - 22);
    ctx.lineTo(210, y + 32);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRampMesh(ramp: RampDef, accentColor: string, maxAnisotropy: number, isSoftwareGl: boolean): THREE.Mesh {
  const hw = ramp.width / 2;
  const hl = ramp.length / 2;
  const h = ramp.height;

  // Wedge ramp geometry: climbs from z = -hl (y = 0) up to z = +hl (y = h)
  const shape = new THREE.Shape();
  shape.moveTo(-hl, 0);
  shape.lineTo(hl, 0);
  shape.lineTo(hl, h);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ramp.width,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -hw);
  geo.rotateY(-Math.PI / 2); // Align climb direction along +Z local
  geo.computeVertexNormals();

  const rampTex = createRampTexture(accentColor, Boolean(ramp.isBoost), maxAnisotropy);
  const mat = new THREE.MeshStandardMaterial({
    color: ramp.isBoost ? 0x1e293b : 0x262e3d,
    map: rampTex,
    roughness: 0.48,
    metalness: 0.35,
    emissive: ramp.isBoost ? new THREE.Color(0x0891b2) : new THREE.Color(0x000000),
    emissiveIntensity: ramp.isBoost ? 0.32 : 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(ramp.x, 0, ramp.z);
  mesh.rotation.y = ramp.yaw;
  mesh.castShadow = !isSoftwareGl;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildLevelWorld(
  level: LevelDef,
  maxAnisotropy: number,
  isSoftwareGl: boolean
): BuiltWorld {
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];

  // 1. Extended Natural Terrain Horizon (no floating void!)
  const outerTerrainGeo = new THREE.PlaneGeometry(1400, 1400);
  outerTerrainGeo.rotateX(-Math.PI / 2);
  const outerTerrainMat = new THREE.MeshStandardMaterial({
    color: level.theme === 'coastal' ? 0x1d4d6b : new THREE.Color(level.groundColor),
    roughness: 0.88,
    metalness: 0.05,
  });
  const outerTerrain = new THREE.Mesh(outerTerrainGeo, outerTerrainMat);
  outerTerrain.position.y = -0.18;
  outerTerrain.receiveShadow = true;
  group.add(outerTerrain);

  // 2. Main Playable Asphalt Arena Slab (Y = 0)
  const arenaSize = level.arenaHalfSize * 2;
  const asphaltTex = createAsphaltTexture(level.trackColor, level.accentColor, maxAnisotropy);
  textures.push(asphaltTex);

  const arenaGeo = new THREE.BoxGeometry(arenaSize, 0.4, arenaSize);
  const arenaMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.65,
    metalness: 0.14,
  });
  const arenaMesh = new THREE.Mesh(arenaGeo, arenaMat);
  arenaMesh.position.y = -0.2;
  arenaMesh.receiveShadow = true;
  group.add(arenaMesh);

  // Track oval painted markings (Y = 0.025 to prevent Z-fighting)
  const ringTrackGeo = new THREE.RingGeometry(62, 78, 64);
  ringTrackGeo.rotateX(-Math.PI / 2);
  const ringTrackMat = new THREE.MeshStandardMaterial({
    color: level.accentColor,
    roughness: 0.7,
    transparent: true,
    opacity: 0.18,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const ringTrack = new THREE.Mesh(ringTrackGeo, ringTrackMat);
  ringTrack.position.y = 0.025;
  group.add(ringTrack);

  // 3. Perimeter Guardrails & Natural Scenery (InstancedMesh for high FPS!)
  const half = level.arenaHalfSize;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.55,
  });
  const barrierThickness = 2.4;
  const barrierHeight = 2.2;
  const walls: [number, number, number, number][] = [
    [0, -half, arenaSize + barrierThickness, barrierThickness],
    [0, half, arenaSize + barrierThickness, barrierThickness],
    [-half, 0, barrierThickness, arenaSize],
    [half, 0, barrierThickness, arenaSize],
  ];
  for (const [wx, wz, sx, sz] of walls) {
    const wGeo = new THREE.BoxGeometry(sx, barrierHeight, sz);
    const wMesh = new THREE.Mesh(wGeo, wallMat);
    wMesh.position.set(wx, barrierHeight / 2 - 0.1, wz);
    wMesh.receiveShadow = true;
    group.add(wMesh);
  }

  // Outer perimeter landmarks (rocks/mesas/city towers/alpine peaks) using InstancedMesh
  const landmarkCount = 48;
  const landmarkGeo =
    level.theme === 'midnight'
      ? new THREE.BoxGeometry(14, 42, 14)
      : new THREE.ConeGeometry(16, 36, level.theme === 'canyon' ? 6 : 7);
  const landmarkMat = new THREE.MeshStandardMaterial({
    color:
      level.theme === 'midnight'
        ? 0x162036
        : level.theme === 'canyon'
        ? 0x9a4a2a
        : level.theme === 'summit'
        ? 0x475569
        : 0x3f624d,
    roughness: 0.78,
    metalness: level.theme === 'midnight' ? 0.55 : 0.1,
  });
  const landmarks = new THREE.InstancedMesh(landmarkGeo, landmarkMat, landmarkCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < landmarkCount; i++) {
    const angle = (i / landmarkCount) * Math.PI * 2;
    const dist = half + 32 + ((i * 37) % 70);
    const scaleY = 0.65 + ((i * 19) % 100) / 70;
    const scaleXZ = 0.8 + ((i * 13) % 60) / 100;
    dummy.position.set(Math.cos(angle) * dist, (18 * scaleY) - 2, Math.sin(angle) * dist);
    dummy.rotation.y = (i * 0.7) % Math.PI;
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    landmarks.setMatrixAt(i, dummy.matrix);
  }
  landmarks.computeBoundingSphere();
  group.add(landmarks);

  // 4. Stunt Ramps
  for (const ramp of level.ramps) {
    const rampMesh = createRampMesh(ramp, level.accentColor, maxAnisotropy, isSoftwareGl);
    group.add(rampMesh);
  }

  // 5. Obstacle Pillars
  const pillarMat = new THREE.MeshStandardMaterial({
    color: level.theme === 'midnight' ? 0x06b6d4 : 0x64748b,
    roughness: 0.35,
    metalness: 0.6,
    emissive: level.theme === 'midnight' ? new THREE.Color(0x0891b2) : new THREE.Color(0x000000),
    emissiveIntensity: level.theme === 'midnight' ? 0.45 : 0,
  });
  for (const p of level.pillars) {
    const pGeo = new THREE.CylinderGeometry(p.radius, p.radius * 1.08, p.height, 14);
    const pMesh = new THREE.Mesh(pGeo, pillarMat);
    pMesh.position.set(p.x, p.height / 2, p.z);
    pMesh.castShadow = !isSoftwareGl;
    pMesh.receiveShadow = true;
    group.add(pMesh);
  }

  // 6. Aerial Stunt Rings
  const rings: WorldRingItem[] = [];
  for (const r of level.rings) {
    const ringGroup = new THREE.Group();
    const torusGeo = new THREE.TorusGeometry(r.radius, 0.34, 12, 32);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: new THREE.Color(0xd97706),
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    ringGroup.add(torus);

    ringGroup.position.set(r.x, r.y, r.z);
    ringGroup.rotation.y = r.yaw;
    group.add(ringGroup);

    rings.push({
      id: r.id,
      points: r.points,
      mesh: ringGroup,
      cleared: false,
      pos: new THREE.Vector3(r.x, r.y, r.z),
      radius: r.radius,
    });
  }

  // 7. Collectible Spinning Coins
  const coins: WorldCoinItem[] = [];
  const coinGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.28, 18);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: new THREE.Color(0xb45309),
    emissiveIntensity: 0.55,
    metalness: 0.9,
    roughness: 0.16,
  });
  for (const c of level.coins) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(c.x, c.y, c.z);
    group.add(mesh);
    coins.push({
      id: c.id,
      value: c.value,
      mesh,
      collected: false,
      pos: new THREE.Vector3(c.x, c.y, c.z),
    });
  }

  // 8. Checkpoints (Illuminated Arch Gates)
  const checkpoints: WorldCheckpointItem[] = [];
  for (const cp of level.checkpoints) {
    const cpGroup = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.35, 0.45, 7.5, 10);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: new THREE.Color(0x0891b2),
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.6,
    });

    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-cp.width / 2, 3.75, 0);
    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(cp.width / 2, 3.75, 0);
    const topBarGeo = new THREE.BoxGeometry(cp.width + 0.8, 0.65, 0.75);
    const topBar = new THREE.Mesh(topBarGeo, postMat);
    topBar.position.set(0, 7.5, 0);

    cpGroup.add(leftPost, rightPost, topBar);
    cpGroup.position.set(cp.x, 0, cp.z);
    cpGroup.rotation.y = cp.yaw;
    group.add(cpGroup);

    checkpoints.push({
      id: cp.id,
      mesh: cpGroup,
      cleared: false,
      pos: new THREE.Vector3(cp.x, 0, cp.z),
      width: cp.width,
    });
  }

  // Exact analytical surface query for smooth ramp climbs & launches
  const getGroundHeightAt = (x: number, z: number, prevY: number) => {
    let bestH = 0;
    let bestPitch = 0;
    let bestRamp: RampDef | null = null;

    for (const ramp of level.ramps) {
      const dx = x - ramp.x;
      const dz = z - ramp.z;
      const cos = Math.cos(-ramp.yaw);
      const sin = Math.sin(-ramp.yaw);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hw = ramp.width / 2 + 0.35;
      const hl = ramp.length / 2;
      if (Math.abs(localX) <= hw && localZ >= -hl && localZ <= hl) {
        const progress = (localZ + hl) / ramp.length; // 0 at bottom -> 1 at lip
        const surfaceY = progress * ramp.height;
        // Only snap onto ramp if car isn't soaring high above it
        if (prevY <= surfaceY + 1.4 && surfaceY > bestH) {
          bestH = surfaceY;
          bestPitch = Math.atan2(ramp.height, ramp.length);
          bestRamp = ramp;
        }
      }
    }

    return { height: bestH, pitch: bestPitch, onRamp: bestRamp };
  };

  return {
    group,
    coins,
    rings,
    checkpoints,
    ramps: level.ramps,
    getGroundHeightAt,
    dispose: () => {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      textures.forEach((t) => t.dispose());
    },
  };
}

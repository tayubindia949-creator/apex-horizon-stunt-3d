import * as THREE from 'three';
import { CarSpec, PaintFinish } from './types';

export interface CarRig {
  root: THREE.Group;
  chassis: THREE.Group;
  frontLeftSteer: THREE.Group;
  frontRightSteer: THREE.Group;
  wheels: THREE.Group[];
  nitroFlames: THREE.Mesh[];
  brakeLights: THREE.MeshBasicMaterial;
  paintMaterial: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWheel(
  radius: number,
  width: number,
  rimColor: number,
  isSoftwareGl: boolean
): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Rubber tire (matte, high roughness)
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, isSoftwareGl ? 16 : 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    roughness: 0.86,
    metalness: 0.08,
  });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = !isSoftwareGl;
  wheelGroup.add(tire);

  // Alloy rim barrel (polished metallic contrast)
  const rimGeo = new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, width + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.22,
    metalness: 0.9,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rim);

  // 5-spoke star geometry
  const spokeGeo = new THREE.BoxGeometry(width + 0.04, radius * 1.12, radius * 0.14);
  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8e0,
    roughness: 0.2,
    metalness: 0.92,
  });
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(spokeGeo, spokeMat);
    spoke.rotation.x = (i * Math.PI) / 3;
    wheelGroup.add(spoke);
  }

  // Brake caliper accent
  const caliperGeo = new THREE.BoxGeometry(width * 0.7, radius * 0.36, radius * 0.28);
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.35,
    metalness: 0.4,
  });
  const caliper = new THREE.Mesh(caliperGeo, caliperMat);
  caliper.position.set(0, 0, radius * 0.32);
  wheelGroup.add(caliper);

  return wheelGroup;
}

export function buildProceduralCar(
  spec: CarSpec,
  paint: PaintFinish,
  isSoftwareGl: boolean
): CarRig {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const isBaja = spec.bodyStyle === 'baja';
  const isProto = spec.bodyStyle === 'proto';
  const isHyper = spec.bodyStyle === 'hyper';

  const wheelRadius = isBaja ? 0.52 : 0.4;
  const wheelWidth = isBaja ? 0.38 : 0.3;
  const bodyLength = isBaja ? 4.45 : isProto ? 4.75 : 4.5;
  const bodyWidth = isBaja ? 2.15 : 2.02;
  const rideHeight = isBaja ? 0.56 : 0.34;

  // 1. Primary Clearcoat Car Paint Material
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paint.hex),
    metalness: paint.metalness,
    roughness: paint.roughness,
    clearcoat: paint.clearcoat,
    clearcoatRoughness: 0.08,
  });

  // Carbon fiber matte trim
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x151820,
    roughness: 0.62,
    metalness: 0.22,
  });

  // Tinted cabin optical glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e1726,
    metalness: 0.1,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.45,
    transparent: true,
    opacity: isSoftwareGl ? 0.82 : 0.92,
    clearcoat: 1.0,
    ior: 1.5,
  });

  // Chrome hardware
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.95,
    roughness: 0.14,
  });

  // 2. Sculpted Extruded Side-Profile Silhouette (Primary Body)
  const profile = new THREE.Shape();
  const halfL = bodyLength / 2;
  if (isBaja) {
    profile.moveTo(-halfL, 0.15);
    profile.lineTo(halfL - 0.15, 0.15);
    profile.lineTo(halfL, 0.45);
    profile.lineTo(halfL - 0.55, 0.78);
    profile.lineTo(0.65, 0.85);
    profile.lineTo(0.25, 1.38);
    profile.lineTo(-1.1, 1.38);
    profile.lineTo(-1.45, 0.95);
    profile.lineTo(-halfL, 0.9);
    profile.closePath();
  } else if (isProto) {
    profile.moveTo(-halfL, 0.05);
    profile.lineTo(halfL, 0.05);
    profile.lineTo(halfL - 0.1, 0.34);
    profile.lineTo(1.25, 0.58);
    profile.lineTo(0.5, 0.98);
    profile.lineTo(-0.7, 1.0);
    profile.lineTo(-1.65, 0.62);
    profile.lineTo(-halfL, 0.56);
    profile.closePath();
  } else {
    profile.moveTo(-halfL, 0.08);
    profile.lineTo(halfL, 0.08);
    profile.lineTo(halfL - 0.12, 0.42);
    profile.lineTo(1.05, 0.68);
    profile.lineTo(0.35, 1.12);
    profile.lineTo(-0.85, 1.12);
    profile.lineTo(-1.75, 0.74);
    profile.lineTo(-halfL, 0.66);
    profile.closePath();
  }

  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: bodyWidth - 0.24,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.09,
    bevelSegments: isSoftwareGl ? 2 : 4,
  });
  // Rotate so length is along Z (-Z = forward, +Z = rear) and centered on X
  bodyGeo.translate(0, 0, -(bodyWidth - 0.24) / 2);
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.computeVertexNormals();

  const mainBody = new THREE.Mesh(bodyGeo, paintMaterial);
  mainBody.position.y = rideHeight;
  mainBody.castShadow = !isSoftwareGl;
  mainBody.receiveShadow = true;
  chassis.add(mainBody);

  // 3. Lower Carbon Splitter & Side Skirts
  const floorGeo = new THREE.BoxGeometry(bodyWidth + 0.04, 0.14, bodyLength + 0.16);
  const floorMesh = new THREE.Mesh(floorGeo, carbonMat);
  floorMesh.position.set(0, rideHeight + 0.06, 0);
  floorMesh.castShadow = !isSoftwareGl;
  chassis.add(floorMesh);

  // 4. Sculpted Glass Canopy / Windshield
  const canopyGeo = new THREE.BoxGeometry(bodyWidth * 0.72, isBaja ? 0.42 : 0.36, isProto ? 1.55 : 1.82);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.position.set(0, rideHeight + (isBaja ? 1.14 : isProto ? 0.82 : 0.92), -0.1);
  chassis.add(canopy);

  // 5. Roof Scoop / Baja Roll Cage
  if (isBaja) {
    const rackGeo = new THREE.BoxGeometry(bodyWidth * 0.66, 0.08, 1.1);
    const rack = new THREE.Mesh(rackGeo, carbonMat);
    rack.position.set(0, rideHeight + 1.44, -0.2);
    chassis.add(rack);

    // Spare tire mounted on rear bed
    const spare = createWheel(0.4, 0.24, 0x334155, true);
    spare.rotation.z = Math.PI / 2;
    spare.rotation.x = 0.45;
    spare.position.set(0, rideHeight + 1.02, 1.55);
    chassis.add(spare);
  } else {
    const scoopGeo = new THREE.BoxGeometry(0.42, 0.16, 0.78);
    const scoop = new THREE.Mesh(scoopGeo, carbonMat);
    scoop.position.set(0, rideHeight + (isProto ? 1.04 : 1.16), 0.15);
    chassis.add(scoop);
  }

  // 6. Aerodynamic Rear GT Wing Spoiler (2 pylons + curved airfoil)
  if (!isBaja) {
    const wingY = rideHeight + (isProto ? 1.06 : isHyper ? 1.02 : 0.94);
    const wingZ = halfL - 0.16;
    const bladeGeo = new THREE.BoxGeometry(bodyWidth + 0.14, 0.06, 0.36);
    const blade = new THREE.Mesh(bladeGeo, carbonMat);
    blade.position.set(0, wingY, wingZ);
    blade.rotation.x = 0.14;
    blade.castShadow = !isSoftwareGl;
    chassis.add(blade);

    const endplateGeo = new THREE.BoxGeometry(0.05, 0.22, 0.42);
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(endplateGeo, paintMaterial);
      plate.position.set(side * (bodyWidth / 2 + 0.07), wingY - 0.02, wingZ);
      chassis.add(plate);

      const pylonGeo = new THREE.BoxGeometry(0.06, 0.32, 0.14);
      const pylon = new THREE.Mesh(pylonGeo, carbonMat);
      pylon.position.set(side * 0.45, wingY - 0.18, wingZ);
      chassis.add(pylon);
    }
  }

  // 7. LED Headlight Strips (Front -Z) & Brake Light Bar (Rear +Z)
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const headlightGeo = new THREE.BoxGeometry(0.46, 0.09, 0.08);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(headlightGeo, headlightMat);
    hl.position.set(side * (bodyWidth * 0.33), rideHeight + 0.36, -halfL - 0.05);
    chassis.add(hl);
  }

  const brakeLights = new THREE.MeshBasicMaterial({ color: 0x991b1b });
  const tailGeo = new THREE.BoxGeometry(bodyWidth * 0.78, 0.09, 0.08);
  const tailBar = new THREE.Mesh(tailGeo, brakeLights);
  tailBar.position.set(0, rideHeight + (isBaja ? 0.68 : 0.52), halfL + 0.05);
  chassis.add(tailBar);

  // 8. Twin Chrome Exhaust Pipes + Nitro Jet Cones
  const exhaustGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.26, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.14, 0.95, 10);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.9,
  });

  const nitroFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(side * 0.44, rideHeight + 0.18, halfL + 0.06);
    chassis.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.44, rideHeight + 0.18, halfL + 0.62);
    flame.visible = false;
    chassis.add(flame);
    nitroFlames.push(flame);
  }

  // 9. Four Articulated Wheels (Front left/right steer pivots + spinning hubs)
  const trackHalfWidth = bodyWidth / 2 + 0.05;
  const frontZ = -1.36;
  const rearZ = 1.38;
  const rimHex = spec.id === 'valkyrie' ? 0x94a3b8 : spec.id === 'viper' ? 0xf59e0b : 0x334155;

  const frontLeftSteer = new THREE.Group();
  frontLeftSteer.position.set(-trackHalfWidth, wheelRadius, frontZ);
  root.add(frontLeftSteer);

  const frontRightSteer = new THREE.Group();
  frontRightSteer.position.set(trackHalfWidth, wheelRadius, frontZ);
  root.add(frontRightSteer);

  const flWheel = createWheel(wheelRadius, wheelWidth, rimHex, isSoftwareGl);
  frontLeftSteer.add(flWheel);

  const frWheel = createWheel(wheelRadius, wheelWidth, rimHex, isSoftwareGl);
  frWheel.rotation.y = Math.PI;
  frontRightSteer.add(frWheel);

  const rlWheel = createWheel(wheelRadius, wheelWidth, rimHex, isSoftwareGl);
  rlWheel.position.set(-trackHalfWidth, wheelRadius, rearZ);
  root.add(rlWheel);

  const rrWheel = createWheel(wheelRadius, wheelWidth, rimHex, isSoftwareGl);
  rrWheel.rotation.y = Math.PI;
  rrWheel.position.set(trackHalfWidth, wheelRadius, rearZ);
  root.add(rrWheel);

  // 10. Grounded Contact Shadow Plane (Y = 0.025 to prevent Z-fighting)
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(bodyWidth * 1.45, bodyLength * 1.3);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  const wheels = [flWheel, frWheel, rlWheel, rrWheel];

  return {
    root,
    chassis,
    frontLeftSteer,
    frontRightSteer,
    wheels,
    nitroFlames,
    brakeLights,
    paintMaterial,
    dispose: () => {
      root.traverse((obj) => {
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
      shadowTex.dispose();
    },
  };
}

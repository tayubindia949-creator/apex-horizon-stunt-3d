import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AudioEngine } from './audio';
import { buildProceduralCar, CarRig } from './carBuilder';
import { getCarSpec, getEffectiveCarStats, getPaintFinish, LEVELS } from './catalog';
import {
  CameraMode,
  CarId,
  ControlInputState,
  HudTelemetry,
  LevelDef,
  LevelResult,
  PaintId,
  RampDef,
  UpgradeLevels,
} from './types';
import { buildLevelWorld, BuiltWorld } from './worldBuilder';

export interface EngineCallbacks {
  onTelemetry: (t: HudTelemetry) => void;
  onStuntToast: (label: string, points: number) => void;
  onLevelComplete: (result: LevelResult) => void;
  onContextLost: (lost: boolean) => void;
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _sparkColor = new THREE.Color();

export class StuntGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public audio: AudioEngine;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private isSoftwareGl = false;

  private carRig: CarRig | null = null;
  private world: BuiltWorld | null = null;
  private showroomFloor: THREE.Mesh | null = null;
  private sparkPoints: THREE.Points | null = null;
  private sparkPositions = new Float32Array(120 * 3);
  private sparkVelocities = new Float32Array(120 * 3);
  private sparkLife = new Float32Array(120);
  private sparkCursor = 0;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private lastHudEmit = 0;

  // Mode & Selection
  private mode: 'showroom' | 'playing' | 'paused' = 'showroom';
  private cameraMode: CameraMode = 'chase';
  private activeLevel: LevelDef = LEVELS[0];
  private activeCarId: CarId = 'valkyrie';
  private activePaintId: PaintId = 'amber';
  private activeUpgrades: UpgradeLevels = { engine: 1, nitro: 1, suspension: 1 };

  // Physics State
  private pos = new THREE.Vector3(0, 0, 0);
  private vel = new THREE.Vector3(0, 0, 0);
  private yaw = 0;
  private steerAngle = 0;
  private wheelSpin = 0;
  private suspensionOffset = 0;
  private suspensionVel = 0;
  private wasAirborne = false;
  private airTime = 0;
  private jumpStartPos = new THREE.Vector3();
  private lastRamp: RampDef | null = null;
  private nitroFuel = 1; // 0..1
  private driftAccum = 0;
  private driftScoreTimer = 0;

  // Mission & Run Stats
  private stuntScore = 0;
  private coinsCollected = 0;
  private coinValueSum = 0;
  private ringsCleared = 0;
  private checkpointsCleared = 0;
  private maxJumpDistM = 0;
  private lastJumpDistM = 0;
  private topSpeedKmh = 0;
  private timeRemaining = 90;
  private runFinished = false;
  private showroomAngle = 0.6;

  // Input state (merged keyboard + mobile touch)
  public keyboardInput: ControlInputState = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    nitro: false,
  };
  public touchInput: ControlInputState = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    nitro: false,
  };

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.audio = new AudioEngine();
    this.initRendererAndScene();
    this.initSparkSystem();
    this.setupShowroomEnvironment();
    this.rebuildCar();
    this.startLoop();
  }

  private detectSoftwareGl(): boolean {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initRendererAndScene() {
    this.isSoftwareGl = this.detectSoftwareGl();
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0E131F');
    this.scene.fog = new THREE.FogExp2('#0E131F', 0.0028);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.2, 850);
    this.camera.position.set(5.5, 2.8, 6.5);

    this.hemiLight = new THREE.HemisphereLight(0xa5c9ff, 0x262936, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    this.keyLight.position.set(45, 75, 35);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 260;
    const d = 95;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-40, 28, -50);
    this.scene.add(rimLight);

    window.addEventListener('resize', this.handleResize);
  }

  private initSparkSystem() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.34,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(geo, mat);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);
  }

  private spawnSparks(origin: THREE.Vector3, count: number, colorHex: number) {
    if (this.sparkPoints) {
      const mat = this.sparkPoints.material as THREE.PointsMaterial;
      _sparkColor.setHex(colorHex);
      mat.color.copy(_sparkColor);
    }
    for (let i = 0; i < count; i++) {
      const idx = this.sparkCursor % 120;
      this.sparkCursor++;
      const i3 = idx * 3;
      this.sparkPositions[i3] = origin.x + (Math.random() - 0.5) * 1.2;
      this.sparkPositions[i3 + 1] = origin.y + 0.3 + Math.random() * 0.4;
      this.sparkPositions[i3 + 2] = origin.z + (Math.random() - 0.5) * 1.2;

      this.sparkVelocities[i3] = (Math.random() - 0.5) * 10;
      this.sparkVelocities[i3 + 1] = 3 + Math.random() * 6;
      this.sparkVelocities[i3 + 2] = (Math.random() - 0.5) * 10;
      this.sparkLife[idx] = 0.45 + Math.random() * 0.35;
    }
  }

  private updateSparks(dt: number) {
    if (!this.sparkPoints) return;
    for (let i = 0; i < 120; i++) {
      if (this.sparkLife[i] <= 0) {
        this.sparkPositions[i * 3 + 1] = -999;
        continue;
      }
      this.sparkLife[i] -= dt;
      const i3 = i * 3;
      this.sparkVelocities[i3 + 1] -= 16 * dt;
      this.sparkPositions[i3] += this.sparkVelocities[i3] * dt;
      this.sparkPositions[i3 + 1] += this.sparkVelocities[i3 + 1] * dt;
      this.sparkPositions[i3 + 2] += this.sparkVelocities[i3 + 2] * dt;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
  }

  private setupShowroomEnvironment() {
    if (this.showroomFloor) {
      this.scene.remove(this.showroomFloor);
      this.showroomFloor.geometry.dispose();
      (this.showroomFloor.material as THREE.Material).dispose();
    }
    const geo = new THREE.CylinderGeometry(8.5, 9.2, 0.35, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x161b26,
      roughness: 0.32,
      metalness: 0.65,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.y = -0.18;
    floor.receiveShadow = true;

    // Illuminated amber turntable rim ring
    const rimGeo = new THREE.RingGeometry(8.2, 8.48, 64);
    rimGeo.rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = 0.19;
    floor.add(rim);

    this.showroomFloor = floor;
    this.scene.add(floor);
  }

  public setShowroomMode(carId: CarId, paintId: PaintId, upgrades: UpgradeLevels) {
    this.mode = 'showroom';
    this.audio.updateDrivingAudio(false, 0, false, false, 0);

    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    if (this.showroomFloor) {
      this.showroomFloor.visible = true;
    }

    this.scene.background = new THREE.Color('#0E131F');
    this.scene.fog = new THREE.FogExp2('#0E131F', 0.004);
    this.keyLight.position.set(12, 18, 12);
    this.keyLight.target.position.set(0, 0, 0);

    const needsCarRebuild = this.activeCarId !== carId || this.activePaintId !== paintId;
    this.activeCarId = carId;
    this.activePaintId = paintId;
    this.activeUpgrades = upgrades;

    if (needsCarRebuild) {
      this.rebuildCar();
    }

    if (this.carRig) {
      this.carRig.root.position.set(0, 0, 0);
      this.carRig.root.rotation.set(0, 0, 0);
      this.carRig.chassis.rotation.set(0, 0, 0);
      this.carRig.nitroFlames.forEach((f) => (f.visible = false));
    }
  }

  public startLevel(level: LevelDef, carId: CarId, paintId: PaintId, upgrades: UpgradeLevels) {
    this.activeLevel = level;
    this.activeCarId = carId;
    this.activePaintId = paintId;
    this.activeUpgrades = upgrades;

    if (this.showroomFloor) {
      this.showroomFloor.visible = false;
    }

    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.world = buildLevelWorld(level, maxAniso, this.isSoftwareGl);
    this.scene.add(this.world.group);

    this.scene.background = new THREE.Color(level.skyColor);
    this.scene.fog = new THREE.FogExp2(level.fogColor, level.fogDensity);

    this.rebuildCar();
    this.resetCarToSpawn();

    this.stuntScore = 0;
    this.coinsCollected = 0;
    this.coinValueSum = 0;
    this.ringsCleared = 0;
    this.checkpointsCleared = 0;
    this.maxJumpDistM = 0;
    this.lastJumpDistM = 0;
    this.topSpeedKmh = 0;
    this.timeRemaining = level.mission.timeLimitSec;
    this.runFinished = false;
    this.nitroFuel = 1;
    this.mode = 'playing';

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public resetCarToSpawn() {
    this.pos.set(...this.activeLevel.spawnPos);
    this.vel.set(0, 0, 0);
    this.yaw = this.activeLevel.spawnYaw;
    this.steerAngle = 0;
    this.wasAirborne = false;
    this.airTime = 0;
    this.lastRamp = null;
    if (this.carRig) {
      this.carRig.root.position.copy(this.pos);
      this.carRig.root.rotation.set(0, this.yaw, 0);
      this.carRig.chassis.rotation.set(0, 0, 0);
    }
  }

  public setPaused(paused: boolean) {
    if (this.mode === 'showroom') return;
    this.mode = paused ? 'paused' : 'playing';
    if (paused) {
      this.audio.updateDrivingAudio(false, 0, false, false, 0);
    }
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'dynamic', 'hood'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    return next;
  }

  private rebuildCar() {
    if (this.carRig) {
      this.scene.remove(this.carRig.root);
      this.carRig.dispose();
    }
    const spec = getCarSpec(this.activeCarId);
    const paint = getPaintFinish(this.activePaintId);
    this.carRig = buildProceduralCar(spec, paint, this.isSoftwareGl);
    this.scene.add(this.carRig.root);
  }

  private handleResize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private startLoop() {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      this.update(dt);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private update(dt: number) {
    this.updateSparks(dt);

    if (this.mode === 'showroom') {
      this.showroomAngle += dt * 0.38;
      const camR = 6.2;
      _camGoal.set(
        Math.sin(this.showroomAngle) * camR,
        2.35,
        Math.cos(this.showroomAngle) * camR
      );
      this.camera.position.lerp(_camGoal, 1 - Math.exp(-6 * dt));
      _lookGoal.set(0, 0.72, 0);
      this.camera.lookAt(_lookGoal);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 48, 6, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.mode !== 'playing' || !this.carRig || !this.world || this.runFinished) {
      return;
    }

    // Countdown mission timer
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) {
      this.finishLevel();
      return;
    }

    const input: ControlInputState = {
      throttle: this.keyboardInput.throttle || this.touchInput.throttle,
      brake: this.keyboardInput.brake || this.touchInput.brake,
      left: this.keyboardInput.left || this.touchInput.left,
      right: this.keyboardInput.right || this.touchInput.right,
      nitro: this.keyboardInput.nitro || this.touchInput.nitro,
    };

    const spec = getCarSpec(this.activeCarId);
    const stats = getEffectiveCarStats(spec, this.activeUpgrades);
    const maxSpeedMs = stats.topSpeedKmh / 3.6;

    // Forward (-Z local) and Right (+X local) vectors
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const groundInfo = this.world.getGroundHeightAt(this.pos.x, this.pos.z, this.pos.y);
    const onGround = this.pos.y <= groundInfo.height + 0.14;

    const forwardSpeed = this.vel.x * _forward.x + this.vel.z * _forward.z;
    const lateralSpeed = this.vel.x * _right.x + this.vel.z * _right.z;

    // Nitro logic
    const canNitro = input.nitro && this.nitroFuel > 0.02 && (input.throttle || forwardSpeed > 4);
    if (canNitro) {
      this.nitroFuel = Math.max(0, this.nitroFuel - dt / stats.nitroDurationSec);
    } else {
      this.nitroFuel = Math.min(1, this.nitroFuel + dt * 0.14);
    }

    // Boost ramp pad check
    let onBoostRamp = false;
    if (onGround && groundInfo.onRamp?.isBoost) {
      onBoostRamp = true;
      if (this.lastRamp !== groundInfo.onRamp) {
        this.lastRamp = groundInfo.onRamp;
        this.vel.addScaledVector(_forward, 12);
        this.audio.playRampLaunch();
        this.addStunt('BOOST RAMP', 150);
      }
    } else if (onGround && !groundInfo.onRamp) {
      this.lastRamp = null;
    }

    // Steering
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steerAngle = THREE.MathUtils.damp(this.steerAngle, targetSteer * 0.56, 12, dt);

    if (onGround) {
      const accelForce = stats.accel * (canNitro ? stats.nitroPower : 1.0);
      const activeMaxSpeed = maxSpeedMs * (canNitro ? 1.26 : 1.0);

      if (input.throttle) {
        this.vel.addScaledVector(_forward, accelForce * dt);
      }
      if (input.brake) {
        if (forwardSpeed > 2.5) {
          this.vel.addScaledVector(_forward, -stats.accel * 1.45 * dt);
        } else {
          this.vel.addScaledVector(_forward, -stats.accel * 0.65 * dt);
        }
      }

      // Aerodynamic + rolling drag
      const drag = input.throttle || input.brake ? 0.45 : 1.35;
      this.vel.x *= Math.exp(-drag * dt);
      this.vel.z *= Math.exp(-drag * dt);

      // Lateral tire grip (higher suspension upgrade = tighter grip + controlled drift)
      const grip = input.brake ? 2.4 : 6.2 * stats.handling;
      const lateralKill = Math.min(1, grip * dt);
      this.vel.x -= _right.x * lateralSpeed * lateralKill;
      this.vel.z -= _right.z * lateralSpeed * lateralKill;

      // Clamp top speed
      const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (horizSpeed > activeMaxSpeed && !onBoostRamp) {
        const scale = THREE.MathUtils.damp(horizSpeed, activeMaxSpeed, 6, dt) / horizSpeed;
        this.vel.x *= scale;
        this.vel.z *= scale;
      }

      // Turn yaw scaled by speed
      const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 7.5);
      const dirSign = forwardSpeed >= -0.5 ? 1 : -1;
      this.yaw += this.steerAngle * 2.55 * stats.handling * speedFactor * dirSign * dt;

      // Drift detection & bonus points
      const driftRatio = Math.abs(lateralSpeed) / Math.max(10, Math.abs(forwardSpeed));
      if (Math.abs(forwardSpeed) > 14 && driftRatio > 0.28) {
        this.driftAccum += dt;
        this.driftScoreTimer += dt;
        if (this.driftScoreTimer >= 0.65) {
          this.driftScoreTimer = 0;
          this.addStunt('POWER DRIFT', 120);
          this.spawnSparks(this.pos, 4, 0xf59e0b);
        }
      } else {
        this.driftAccum = 0;
        this.driftScoreTimer = 0;
      }
    } else {
      // Airborne mid-air slight yaw/roll control + gravity
      this.vel.y -= 23.5 * dt;
      this.yaw += this.steerAngle * 1.15 * dt;
      this.airTime += dt;
    }

    // Integrate position
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);

    // Ramp launch / Landing check
    const nextGround = this.world.getGroundHeightAt(this.pos.x, this.pos.z, prevY);
    if (this.pos.y <= nextGround.height) {
      // Just landed from air?
      if (this.wasAirborne && this.airTime > 0.42) {
        const jumpDist = Math.hypot(
          this.pos.x - this.jumpStartPos.x,
          this.pos.z - this.jumpStartPos.z
        );
        this.lastJumpDistM = Math.round(jumpDist);
        if (this.lastJumpDistM > this.maxJumpDistM) {
          this.maxJumpDistM = this.lastJumpDistM;
        }
        const airPts = Math.round(this.airTime * 280 + jumpDist * 12);
        const label = jumpDist > 26 ? `MEGA JUMP ${this.lastJumpDistM}M` : `AIR STUNT ${this.lastJumpDistM}M`;
        this.addStunt(label, airPts);
        this.audio.playLanding(Math.abs(this.vel.y) / 10);
        this.spawnSparks(this.pos, 14, 0x22d3ee);
        this.suspensionVel = -Math.min(6, Math.abs(this.vel.y) * 0.4);
      }

      // Compute upward launch if climbing a ramp
      if (nextGround.onRamp) {
        const rampSlopeVy = Math.max(0, forwardSpeed) * Math.tan(nextGround.pitch);
        this.vel.y = Math.max(this.vel.y, rampSlopeVy);
      } else {
        this.vel.y = 0;
      }

      this.pos.y = nextGround.height;
      this.wasAirborne = false;
      this.airTime = 0;
    } else {
      if (!this.wasAirborne && this.pos.y > nextGround.height + 0.35) {
        this.wasAirborne = true;
        this.airTime = 0;
        this.jumpStartPos.copy(this.pos);
      }
    }

    // Arena Perimeter Guardrail Collision
    const bound = this.activeLevel.arenaHalfSize - 3.2;
    if (Math.abs(this.pos.x) > bound) {
      this.pos.x = Math.sign(this.pos.x) * bound;
      this.vel.x *= -0.45;
      this.spawnSparks(this.pos, 8, 0xef4444);
    }
    if (Math.abs(this.pos.z) > bound) {
      this.pos.z = Math.sign(this.pos.z) * bound;
      this.vel.z *= -0.45;
      this.spawnSparks(this.pos, 8, 0xef4444);
    }

    // Pillar Obstacle Collisions
    for (const p of this.activeLevel.pillars) {
      const dx = this.pos.x - p.x;
      const dz = this.pos.z - p.z;
      const dist = Math.hypot(dx, dz);
      const minD = p.radius + 1.5;
      if (dist < minD && this.pos.y < p.height) {
        const nx = dx / Math.max(0.001, dist);
        const nz = dz / Math.max(0.001, dist);
        this.pos.x = p.x + nx * minD;
        this.pos.z = p.z + nz * minD;
        const dot = this.vel.x * nx + this.vel.z * nz;
        if (dot < 0) {
          this.vel.x -= 1.5 * dot * nx;
          this.vel.z -= 1.5 * dot * nz;
          this.vel.multiplyScalar(0.7);
          this.spawnSparks(this.pos, 10, 0xf59e0b);
        }
      }
    }

    // Collect Coins, Rings & Checkpoints
    const elapsed = this.clock.elapsedTime;
    for (const coin of this.world.coins) {
      if (coin.collected) continue;
      coin.mesh.rotation.y = elapsed * 3.2;
      if (this.pos.distanceToSquared(coin.pos) < 11.5) {
        coin.collected = true;
        coin.mesh.visible = false;
        this.coinsCollected++;
        this.coinValueSum += coin.value;
        this.audio.playCoin();
        this.spawnSparks(coin.pos, 8, 0xfbbf24);
      }
    }

    for (const ring of this.world.rings) {
      if (ring.cleared) continue;
      ring.mesh.rotation.z = elapsed * 1.4;
      const dRing = this.pos.distanceTo(ring.pos);
      if (dRing < ring.radius + 1.6) {
        ring.cleared = true;
        const mat = (ring.mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x059669);
        this.ringsCleared++;
        this.addStunt('SKY RING', ring.points);
        this.audio.playRing();
        this.spawnSparks(ring.pos, 16, 0x10b981);
      }
    }

    for (const cp of this.world.checkpoints) {
      if (cp.cleared) continue;
      const dx = Math.abs(this.pos.x - cp.pos.x);
      const dz = Math.abs(this.pos.z - cp.pos.z);
      if (dx < cp.width * 0.65 && dz < cp.width * 0.65 && this.pos.y < 8) {
        cp.cleared = true;
        cp.mesh.children.forEach((c) => {
          const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.color.setHex(0x10b981);
          mat.emissive.setHex(0x059669);
        });
        this.checkpointsCleared++;
        this.addStunt('CHECKPOINT', 200);
        this.audio.playCheckpoint();
      }
    }

    // Suspension Spring + Visual Rig Animation
    const suspStiffness = 115 + this.activeUpgrades.suspension * 15;
    const suspDamping = 14;
    this.suspensionVel += (-suspStiffness * this.suspensionOffset - suspDamping * this.suspensionVel) * dt;
    this.suspensionOffset = THREE.MathUtils.clamp(this.suspensionOffset + this.suspensionVel * dt, -0.25, 0.25);

    this.carRig.root.position.set(this.pos.x, this.pos.y + this.suspensionOffset, this.pos.z);
    this.carRig.root.rotation.set(0, this.yaw, 0);

    // Body pitch (ramp climb / acceleration squat / air nose tilt) & body roll on steering
    const targetPitch = onGround
      ? nextGround.pitch + (input.throttle ? -0.025 : input.brake ? 0.04 : 0)
      : THREE.MathUtils.clamp(this.vel.y * 0.022, -0.38, 0.42);
    const targetRoll = onGround ? -this.steerAngle * Math.min(0.08, Math.abs(forwardSpeed) * 0.002) : 0;
    this.carRig.chassis.rotation.x = THREE.MathUtils.damp(this.carRig.chassis.rotation.x, targetPitch, 10, dt);
    this.carRig.chassis.rotation.z = THREE.MathUtils.damp(this.carRig.chassis.rotation.z, targetRoll, 10, dt);

    // Wheel steering & spin
    this.carRig.frontLeftSteer.rotation.y = this.steerAngle * 0.72;
    this.carRig.frontRightSteer.rotation.y = this.steerAngle * 0.72;
    this.wheelSpin -= forwardSpeed * dt * 2.2;
    for (const w of this.carRig.wheels) {
      w.rotation.x = this.wheelSpin;
    }

    // Brake light & Nitro flame FX
    this.carRig.brakeLights.color.setHex(input.brake ? 0xff2222 : 0x7f1d1d);
    const flameVisible = canNitro || onBoostRamp;
    for (const f of this.carRig.nitroFlames) {
      f.visible = flameVisible;
      if (flameVisible) {
        const s = 0.85 + Math.random() * 0.45;
        f.scale.set(1, 1, s);
      }
    }

    // Update Shadow Key Light to follow car tightly for crisp shadows
    this.keyLight.position.set(this.pos.x + 45, this.pos.y + 75, this.pos.z + 35);
    this.keyLight.target.position.copy(this.pos);

    // Camera Tracking
    const speedKmh = Math.round(Math.hypot(this.vel.x, this.vel.z) * 3.6);
    if (speedKmh > this.topSpeedKmh) this.topSpeedKmh = speedKmh;

    const speedRatio = Math.min(1, speedKmh / stats.topSpeedKmh);
    const targetFov = this.cameraMode === 'hood' ? 68 + speedRatio * 14 : 58 + speedRatio * (canNitro ? 19 : 13);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
    this.camera.updateProjectionMatrix();

    if (this.cameraMode === 'hood') {
      _camGoal.copy(this.pos).addScaledVector(_forward, 0.45);
      _camGoal.y += 1.55 + this.suspensionOffset;
      _lookGoal.copy(this.pos).addScaledVector(_forward, 22);
      _lookGoal.y += 1.25;
      this.camera.position.lerp(_camGoal, 1 - Math.exp(-24 * dt));
      this.camera.lookAt(_lookGoal);
    } else {
      const distBack = this.cameraMode === 'dynamic' ? 9.2 + speedRatio * 2.4 : 7.8;
      const heightUp = this.cameraMode === 'dynamic' ? 3.8 : 3.1;
      _camGoal.copy(this.pos).addScaledVector(_forward, -distBack);
      _camGoal.y += heightUp;
      this.camera.position.lerp(_camGoal, 1 - Math.exp(-8.5 * dt));

      _lookGoal.copy(this.pos).addScaledVector(_forward, 6.5);
      _lookGoal.y += 1.25;
      this.camera.lookAt(_lookGoal);
    }

    // Engine/Drift/Nitro procedural audio update
    const driftIntensity = onGround ? Math.min(1, Math.abs(lateralSpeed) / 14) : 0;
    this.audio.updateDrivingAudio(true, speedRatio, input.throttle, canNitro || onBoostRamp, driftIntensity);

    // Auto-complete level early if ALL mission objectives are satisfied!
    const m = this.activeLevel.mission;
    const missionDone =
      this.coinsCollected >= m.minCoins &&
      this.stuntScore >= m.minStuntScore &&
      this.ringsCleared >= m.minRings &&
      this.checkpointsCleared >= m.minCheckpoints &&
      this.topSpeedKmh >= m.minTopSpeedKmh &&
      this.maxJumpDistM >= m.maxJumpDistM;

    if (missionDone && this.checkpointsCleared >= this.world.checkpoints.length && this.coinsCollected >= this.world.coins.length) {
      this.finishLevel();
      return;
    }

    // Emit HUD state at ~20Hz so React UI stays ultra-smooth
    if (elapsed - this.lastHudEmit >= 0.05) {
      this.lastHudEmit = elapsed;
      const gear = !onGround
        ? 'AIR'
        : forwardSpeed < -1
        ? 'R'
        : speedKmh < 35
        ? '1'
        : speedKmh < 75
        ? '2'
        : speedKmh < 120
        ? '3'
        : speedKmh < 165
        ? '4'
        : '5';

      this.callbacks.onTelemetry({
        speedKmh,
        gear,
        rpmRatio: Math.min(1, (speedKmh % 48) / 48 * 0.7 + speedRatio * 0.3),
        nitroRatio: this.nitroFuel,
        isNitroActive: canNitro || onBoostRamp,
        isAirborne: !onGround,
        airTimeSec: this.airTime,
        lastJumpDistM: this.lastJumpDistM,
        maxJumpDistM: this.maxJumpDistM,
        topSpeedKmh: this.topSpeedKmh,
        stuntScore: this.stuntScore,
        coinsCollected: this.coinsCollected,
        totalCoinsInLevel: this.world.coins.length,
        ringsCleared: this.ringsCleared,
        totalRingsInLevel: this.world.rings.length,
        checkpointsCleared: this.checkpointsCleared,
        totalCheckpointsInLevel: this.world.checkpoints.length,
        timeRemainingSec: Math.ceil(this.timeRemaining),
        missionComplete: missionDone,
      });
    }
  }

  private addStunt(label: string, points: number) {
    this.stuntScore += points;
    this.callbacks.onStuntToast(label, points);
  }

  public finishLevel() {
    if (this.runFinished || !this.world) return;
    this.runFinished = true;
    this.mode = 'paused';
    this.audio.updateDrivingAudio(false, 0, false, false, 0);

    const m = this.activeLevel.mission;
    const missionPassed =
      this.coinsCollected >= m.minCoins &&
      this.stuntScore >= m.minStuntScore &&
      this.ringsCleared >= m.minRings &&
      this.checkpointsCleared >= m.minCheckpoints &&
      this.topSpeedKmh >= m.minTopSpeedKmh &&
      this.maxJumpDistM >= m.maxJumpDistM;

    const baseRewardCoins = missionPassed ? m.rewardCoins : Math.round(m.rewardCoins * 0.25);
    const stuntBonusCoins = Math.round(this.stuntScore * 0.04) + this.coinValueSum;
    const totalCoinsEarned = baseRewardCoins + stuntBonusCoins;

    if (missionPassed) {
      this.audio.playMissionComplete();
    }

    this.callbacks.onLevelComplete({
      levelId: this.activeLevel.id,
      levelName: this.activeLevel.name,
      missionPassed,
      stuntScore: this.stuntScore,
      coinsCollected: this.coinsCollected,
      baseRewardCoins,
      stuntBonusCoins,
      totalCoinsEarned,
      maxJumpDistM: this.maxJumpDistM,
      topSpeedKmh: this.topSpeedKmh,
      ringsCleared: this.ringsCleared,
      checkpointsCleared: this.checkpointsCleared,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.carRig?.dispose();
    this.world?.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

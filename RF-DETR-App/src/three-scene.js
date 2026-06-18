import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js";

const FAR_Z = -34;
const NEAR_Z = 4.5;
const WORLD_DEPTH = NEAR_Z - FAR_Z;

export function createArenaScene(host) {
  return new ArenaScene(host);
}

class ArenaScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071018);
    this.scene.fog = new THREE.FogExp2(0x071018, 0.035);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);
    this.camera.position.set(0, 0, 7);
    this.camera.lookAt(0, 0, -16);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x071018, 1);
    this.host.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.targetMeshes = new Map();
    this.needsRender = true;

    this.buildLighting();
    this.buildTunnel();
    this.resize();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    if (this.width === width && this.height === height) {
      return false;
    }

    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.needsRender = true;
    return true;
  }

  addTarget(target) {
    const mesh = target.type === "hazard" ? createHazardMesh() : createTargetMesh();
    mesh.position.set(target.worldX, target.worldY, target.z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.userData.baseScale = target.worldRadius;
    mesh.scale.setScalar(target.worldRadius);
    this.scene.add(mesh);
    this.targetMeshes.set(target.id, mesh);
    this.needsRender = true;
  }

  removeTarget(target) {
    const mesh = this.targetMeshes.get(target.id);

    if (!mesh) {
      return;
    }

    this.scene.remove(mesh);
    disposeObject(mesh);
    this.targetMeshes.delete(target.id);
    this.needsRender = true;
  }

  updateTarget(target) {
    const mesh = this.targetMeshes.get(target.id);

    if (!mesh) {
      return;
    }

    mesh.position.set(target.worldX, target.worldY, target.z);
    mesh.rotation.x += target.spinX;
    mesh.rotation.y += target.spinY;
    mesh.rotation.z += target.spinZ;

    const depthProgress = THREE.MathUtils.clamp((target.z - FAR_Z) / WORLD_DEPTH, 0, 1);
    const pulse = 1 + Math.sin(performance.now() * 0.008 + target.seed) * 0.08;
    mesh.scale.setScalar(target.worldRadius * pulse * (0.82 + depthProgress * 0.28));
    this.needsRender = true;
  }

  render() {
    this.resize();
    if (!this.needsRender) {
      return;
    }

    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }

  projectTarget(target) {
    const mesh = this.targetMeshes.get(target.id);

    if (!mesh) {
      return null;
    }

    return this.projectWorldPoint(mesh.position, target.worldRadius);
  }

  projectWorldPoint(position, worldRadius = 0.45) {
    const center = position.clone().project(this.camera);

    if (center.z < -1 || center.z > 1) {
      return null;
    }

    const edgePosition = position.clone().add(new THREE.Vector3(worldRadius, 0, 0));
    const edge = edgePosition.project(this.camera);
    const x = (center.x * 0.5 + 0.5) * this.width;
    const y = (-center.y * 0.5 + 0.5) * this.height;
    const edgeX = (edge.x * 0.5 + 0.5) * this.width;

    return {
      x,
      y,
      radius: Math.max(10, Math.abs(edgeX - x))
    };
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0x9fd6ff, 0x061017, 2.1));

    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(4, 6, 8);
    this.scene.add(key);

    const rim = new THREE.PointLight(0x35d07f, 60, 55);
    rim.position.set(-6, 4, -8);
    this.scene.add(rim);
  }

  buildTunnel() {
    this.tunnel = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x2ddc8c,
      transparent: true,
      opacity: 0.18
    });
    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x59a9ff,
      transparent: true,
      opacity: 0.22
    });

    for (let z = FAR_Z; z < NEAR_Z; z += 4) {
      const ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.RingGeometry(4.8, 4.86, 48)),
        ringMaterial.clone()
      );
      ring.position.z = z;
      this.tunnel.add(ring);
    }

    for (let index = 0; index < 18; index += 1) {
      const angle = (Math.PI * 2 * index) / 18;
      const radius = 4.82;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, FAR_Z),
        new THREE.Vector3(x, y, NEAR_Z)
      ]);
      this.tunnel.add(new THREE.Line(geometry, lineMaterial.clone()));
    }

    this.scene.add(this.tunnel);
  }
}

function createTargetMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x35d07f,
      emissive: 0x0a6b3a,
      roughness: 0.28,
      metalness: 0.24
    })
  );
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0xc7ffe2, transparent: true, opacity: 0.82 })
  );
  group.add(body, wire);
  return group;
}

function createHazardMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.05, 0),
    new THREE.MeshStandardMaterial({
      color: 0xff5a6a,
      emissive: 0x8a1020,
      roughness: 0.34,
      metalness: 0.18
    })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.22, 0.045, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xffb0b7 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(body, ring);
  return group;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

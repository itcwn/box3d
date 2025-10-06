import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BLOCK_SIZE = { x: 6, y: 12, z: 6 }; // cm units
const GRID_LIMIT = 10; // how many blocks allowed from center on X/Z
const HEIGHT_LIMIT = 12; // how many blocks high we allow stacking

const container = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0f17');

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(90, 110, 120);
camera.lookAt(0, BLOCK_SIZE.y / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, BLOCK_SIZE.y / 2, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(60, 120, 90);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 400;
dirLight.shadow.camera.left = -160;
dirLight.shadow.camera.right = 160;
dirLight.shadow.camera.top = 160;
dirLight.shadow.camera.bottom = -160;
scene.add(dirLight);

const gridSize = GRID_LIMIT * 2 + 1;
const gridHelper = new THREE.GridHelper(gridSize * BLOCK_SIZE.x, gridSize, '#1b3a52', '#0f2535');
scene.add(gridHelper);

const groundGeometry = new THREE.PlaneGeometry(gridSize * BLOCK_SIZE.x, gridSize * BLOCK_SIZE.z);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: '#11202f',
  metalness: 0.1,
  roughness: 0.8,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.35,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotateX(-Math.PI / 2);
ground.receiveShadow = true;
ground.name = 'ground';
scene.add(ground);

const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE.x, BLOCK_SIZE.y, BLOCK_SIZE.z);
const baseMaterial = new THREE.MeshStandardMaterial({
  color: '#0f7ae6',
  metalness: 0.2,
  roughness: 0.55,
});

const previewMaterial = new THREE.MeshStandardMaterial({
  color: '#4caf50',
  opacity: 0.4,
  transparent: true,
  depthWrite: false,
  metalness: 0,
  roughness: 1,
});

const previewMesh = new THREE.Mesh(blockGeometry, previewMaterial);
previewMesh.visible = false;
scene.add(previewMesh);

/** @type {Map<string, THREE.Mesh>} */
const blocks = new Map();

const neighborOffsets = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** @type {{ coord: { x: number; y: number; z: number }; valid: boolean; normal: THREE.Vector3 } | null} */
let hoveredPlacement = null;
/** @type {THREE.Mesh | null} */
let hoveredBlock = null;

function coordKey({ x, y, z }) {
  return `${x}|${y}|${z}`;
}

function toPosition({ x, y, z }) {
  return new THREE.Vector3(
    x * BLOCK_SIZE.x,
    y * BLOCK_SIZE.y + BLOCK_SIZE.y / 2,
    z * BLOCK_SIZE.z
  );
}

function isInsideBounds({ x, y, z }) {
  return Math.abs(x) <= GRID_LIMIT && Math.abs(z) <= GRID_LIMIT && y >= 0 && y <= HEIGHT_LIMIT;
}

function hasNeighbor(coord) {
  if (coord.y === 0) {
    return true;
  }

  return neighborOffsets.some((offset) => {
    const neighborKey = coordKey({
      x: coord.x + offset.x,
      y: coord.y + offset.y,
      z: coord.z + offset.z,
    });
    return blocks.has(neighborKey);
  });
}

function canPlace(coord) {
  if (!isInsideBounds(coord)) {
    return false;
  }

  if (blocks.has(coordKey(coord))) {
    return false;
  }

  return hasNeighbor(coord);
}

function addBlock(coord) {
  const mesh = new THREE.Mesh(blockGeometry, baseMaterial.clone());
  mesh.position.copy(toPosition(coord));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.coord = { ...coord };
  scene.add(mesh);
  blocks.set(coordKey(coord), mesh);
}

function removeBlock(mesh) {
  const key = coordKey(mesh.userData.coord);
  scene.remove(mesh);
  blocks.delete(key);
}

function snapToGrid(value, size) {
  return Math.round(value / size);
}

function getPlacementFromIntersection(intersection) {
  if (!intersection) {
    return null;
  }

  if (intersection.object === ground) {
    const point = intersection.point;
    const coord = {
      x: snapToGrid(point.x, BLOCK_SIZE.x),
      y: 0,
      z: snapToGrid(point.z, BLOCK_SIZE.z),
    };
    return {
      coord,
      valid: canPlace(coord),
      normal: new THREE.Vector3(0, 1, 0),
    };
  }

  if (intersection.object.userData && intersection.object.userData.coord) {
    const baseCoord = intersection.object.userData.coord;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
    const worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    const snappedNormal = new THREE.Vector3(
      Math.round(worldNormal.x),
      Math.round(worldNormal.y),
      Math.round(worldNormal.z)
    );

    if (snappedNormal.y === -1 && baseCoord.y === 0) {
      return null;
    }

    const coord = {
      x: baseCoord.x + snappedNormal.x,
      y: baseCoord.y + snappedNormal.y,
      z: baseCoord.z + snappedNormal.z,
    };

    if (coord.y < 0) {
      return null;
    }

    return {
      coord,
      valid: canPlace(coord),
      normal: snappedNormal,
    };
  }

  return null;
}

function updatePreview() {
  if (!hoveredPlacement) {
    previewMesh.visible = false;
    return;
  }

  previewMesh.visible = true;
  previewMesh.position.copy(toPosition(hoveredPlacement.coord));
  previewMesh.material.color.set(hoveredPlacement.valid ? '#4caf50' : '#d32f2f');
  previewMesh.material.opacity = hoveredPlacement.valid ? 0.35 : 0.2;
}

function handlePointer(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([ground, ...blocks.values()], false);
  const intersection = intersects[0];

  hoveredBlock = intersection && intersection.object !== ground ? intersection.object : null;
  hoveredPlacement = getPlacementFromIntersection(intersection);
  updatePreview();
}

function handleClick(event) {
  if (event.button !== 0) {
    return;
  }

  if (event.shiftKey) {
    if (hoveredBlock) {
      removeBlock(hoveredBlock);
      hoveredBlock = null;
      hoveredPlacement = null;
      updatePreview();
    }
    return;
  }

  if (hoveredPlacement && hoveredPlacement.valid) {
    addBlock(hoveredPlacement.coord);
    hoveredPlacement = {
      ...hoveredPlacement,
      valid: canPlace(hoveredPlacement.coord),
    };
    updatePreview();
  }
}

function clearScene() {
  [...blocks.values()].forEach((mesh) => scene.remove(mesh));
  blocks.clear();
  hoveredPlacement = null;
  updatePreview();
}

function exportLayout() {
  const coords = [...blocks.values()].map((mesh) => mesh.userData.coord);
  coords.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  const payload = {
    unit: 'cm',
    blockSize: BLOCK_SIZE,
    count: coords.length,
    coordinates: coords,
  };

  const textarea = document.querySelector('#export-output');
  textarea.value = JSON.stringify(payload, null, 2);
  textarea.focus();
  textarea.select();
}

renderer.domElement.addEventListener('pointermove', handlePointer);
renderer.domElement.addEventListener('pointerdown', handleClick);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const resetButton = document.querySelector('#reset');
const exportButton = document.querySelector('#export');

addBlock({ x: 0, y: 0, z: 0 });

resetButton.addEventListener('click', clearScene);
exportButton.addEventListener('click', exportLayout);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

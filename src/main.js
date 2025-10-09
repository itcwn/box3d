import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BLOCK_SIZE = { x: 6, y: 12, z: 6 }; // cm units
const GRID_LIMIT = 10; // how many blocks allowed from center on X/Z
const HEIGHT_LIMIT = 12; // how many blocks high we allow stacking

const container = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3f5fa');

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
const gridHelper = new THREE.GridHelper(gridSize * BLOCK_SIZE.x, gridSize, '#8cc63f', '#8cc63f');
scene.add(gridHelper);

const groundGeometry = new THREE.PlaneGeometry(gridSize * BLOCK_SIZE.x, gridSize * BLOCK_SIZE.z);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: '#e5f3d8',
  metalness: 0,
  roughness: 1,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.4,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotateX(-Math.PI / 2);
ground.receiveShadow = true;
ground.name = 'ground';
scene.add(ground);

const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE.x, BLOCK_SIZE.y, BLOCK_SIZE.z);

function applyTextureSettings(texture, { repeat = false } = {}) {
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createCanvasTexture(drawFn) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  return applyTextureSettings(texture, { repeat: true });
}

const defaultTopBottomTexture = createCanvasTexture((ctx, size) => {
  ctx.fillStyle = '#d7b58a';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#c49a6c';
  ctx.lineWidth = size * 0.08;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.33);
  ctx.lineTo(size, size * 0.33);
  ctx.moveTo(0, size * 0.66);
  ctx.lineTo(size, size * 0.66);
  ctx.stroke();
});

const defaultSidesTexture = createCanvasTexture((ctx, size) => {
  ctx.fillStyle = '#b98a5a';
  ctx.fillRect(0, 0, size, size);

  const plankCount = 4;
  const plankHeight = size / plankCount;
  ctx.fillStyle = '#a67846';
  for (let i = 0; i < plankCount; i += 1) {
    ctx.fillRect(0, i * plankHeight + plankHeight * 0.05, size, plankHeight * 0.9);
  }

  ctx.strokeStyle = '#8c6239';
  ctx.lineWidth = size * 0.02;
  for (let i = 1; i < plankCount; i += 1) {
    const y = i * plankHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = size * 0.015;
  const segmentWidth = size / plankCount;
  for (let i = 0; i <= plankCount; i += 1) {
    const offset = (i % 2 === 0 ? 0.2 : -0.2) * segmentWidth;
    const x = i * segmentWidth + offset;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
});

const materials = {
  right: new THREE.MeshStandardMaterial({ map: defaultSidesTexture, metalness: 0.2, roughness: 0.55 }),
  left: new THREE.MeshStandardMaterial({ map: defaultSidesTexture, metalness: 0.2, roughness: 0.55 }),
  top: new THREE.MeshStandardMaterial({ map: defaultTopBottomTexture, metalness: 0.1, roughness: 0.4 }),
  bottom: new THREE.MeshStandardMaterial({ map: defaultTopBottomTexture, metalness: 0.1, roughness: 0.4 }),
  front: new THREE.MeshStandardMaterial({ map: defaultSidesTexture, metalness: 0.2, roughness: 0.55 }),
  back: new THREE.MeshStandardMaterial({ map: defaultSidesTexture, metalness: 0.2, roughness: 0.55 }),
};

const blockMaterials = [
  materials.right,
  materials.left,
  materials.top,
  materials.bottom,
  materials.front,
  materials.back,
];

const sideMaterials = [materials.right, materials.left, materials.front, materials.back];
const topBottomMaterials = [materials.top, materials.bottom];

let currentSidesTexture = defaultSidesTexture;
let currentTopBottomTexture = defaultTopBottomTexture;

function disposeTexture(texture) {
  if (texture && texture !== defaultSidesTexture && texture !== defaultTopBottomTexture) {
    texture.dispose();
  }
}

function updateMaterialsMap(targetMaterials, texture) {
  targetMaterials.forEach((material) => {
    material.map = texture;
    material.needsUpdate = true;
  });
}

function setSidesTexture(texture) {
  const nextTexture = texture || defaultSidesTexture;
  const previousTexture = currentSidesTexture;
  currentSidesTexture = nextTexture;
  updateMaterialsMap(sideMaterials, nextTexture);
  if (previousTexture !== nextTexture) {
    disposeTexture(previousTexture);
  }
}

function setTopBottomTexture(texture) {
  const nextTexture = texture || defaultTopBottomTexture;
  const previousTexture = currentTopBottomTexture;
  currentTopBottomTexture = nextTexture;
  updateMaterialsMap(topBottomMaterials, nextTexture);
  if (previousTexture !== nextTexture) {
    disposeTexture(previousTexture);
  }
}

function loadTextureFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const texture = new THREE.Texture(image);
        resolve(applyTextureSettings(texture));
      };
      image.onerror = () => reject(new Error('Nie udało się wczytać obrazu.'));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const ORIENTATIONS = [
  {
    name: 'standing',
    rotation: new THREE.Euler(0, 0, 0),
    size: { x: BLOCK_SIZE.x, y: BLOCK_SIZE.y, z: BLOCK_SIZE.z },
  },
  {
    name: 'lying-x',
    rotation: new THREE.Euler(0, 0, Math.PI / 2),
    size: { x: BLOCK_SIZE.y, y: BLOCK_SIZE.x, z: BLOCK_SIZE.z },
  },
  {
    name: 'lying-z',
    rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
    size: { x: BLOCK_SIZE.x, y: BLOCK_SIZE.x, z: BLOCK_SIZE.y },
  },
];

const EPSILON = 1e-3;

/** @type {Set<THREE.Mesh>} */
const blocks = new Set();
let currentOrientationIndex = 0;
/** @type {HTMLElement | null} */
let blockCountElement = null;

function updateBlockCount() {
  if (blockCountElement) {
    blockCountElement.textContent = blocks.size.toString();
  }
}

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
previewMesh.rotation.copy(getOrientation(currentOrientationIndex).rotation);
scene.add(previewMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** @type {{ coord: { x: number; y: number; z: number }; orientationIndex: number; valid: boolean; normal: THREE.Vector3 } | null} */
let hoveredPlacement = null;
/** @type {THREE.Mesh | null} */
let hoveredBlock = null;

function getOrientation(index) {
  return ORIENTATIONS[((index % ORIENTATIONS.length) + ORIENTATIONS.length) % ORIENTATIONS.length];
}

function toPosition(coord, orientation) {
  return new THREE.Vector3(
    coord.x * BLOCK_SIZE.x,
    coord.y * BLOCK_SIZE.y + orientation.size.y / 2,
    coord.z * BLOCK_SIZE.z
  );
}

function getSizeVector(orientation) {
  return new THREE.Vector3(orientation.size.x, orientation.size.y, orientation.size.z);
}

function getBoundingBox(coord, orientation) {
  return new THREE.Box3().setFromCenterAndSize(toPosition(coord, orientation), getSizeVector(orientation));
}

function coordFromCenter(center, orientation) {
  return {
    x: roundCoordValue(center.x / BLOCK_SIZE.x),
    y: roundCoordValue((center.y - orientation.size.y / 2) / BLOCK_SIZE.y),
    z: roundCoordValue(center.z / BLOCK_SIZE.z),
  };
}

function rangesOverlap(minA, maxA, minB, maxB) {
  return minA < maxB - EPSILON && maxA > minB + EPSILON;
}

function boxesOverlap(boxA, boxB) {
  return (
    rangesOverlap(boxA.min.x, boxA.max.x, boxB.min.x, boxB.max.x) &&
    rangesOverlap(boxA.min.y, boxA.max.y, boxB.min.y, boxB.max.y) &&
    rangesOverlap(boxA.min.z, boxA.max.z, boxB.min.z, boxB.max.z)
  );
}

function facesTouch(boxA, boxB) {
  const touchX =
    (Math.abs(boxA.max.x - boxB.min.x) <= EPSILON || Math.abs(boxB.max.x - boxA.min.x) <= EPSILON) &&
    rangesOverlap(boxA.min.y, boxA.max.y, boxB.min.y, boxB.max.y) &&
    rangesOverlap(boxA.min.z, boxA.max.z, boxB.min.z, boxB.max.z);
  const touchY =
    (Math.abs(boxA.max.y - boxB.min.y) <= EPSILON || Math.abs(boxB.max.y - boxA.min.y) <= EPSILON) &&
    rangesOverlap(boxA.min.x, boxA.max.x, boxB.min.x, boxB.max.x) &&
    rangesOverlap(boxA.min.z, boxA.max.z, boxB.min.z, boxB.max.z);
  const touchZ =
    (Math.abs(boxA.max.z - boxB.min.z) <= EPSILON || Math.abs(boxB.max.z - boxA.min.z) <= EPSILON) &&
    rangesOverlap(boxA.min.x, boxA.max.x, boxB.min.x, boxB.max.x) &&
    rangesOverlap(boxA.min.y, boxA.max.y, boxB.min.y, boxB.max.y);

  return touchX || touchY || touchZ;
}

function horizontalSupportOverlap(boxA, boxB) {
  return rangesOverlap(boxA.min.x, boxA.max.x, boxB.min.x, boxB.max.x) && rangesOverlap(boxA.min.z, boxA.max.z, boxB.min.z, boxB.max.z);
}

function isInsideBounds(coord, orientation) {
  const halfX = orientation.size.x / 2;
  const halfZ = orientation.size.z / 2;
  const posX = coord.x * BLOCK_SIZE.x;
  const posZ = coord.z * BLOCK_SIZE.z;

  const withinX = posX + halfX <= GRID_LIMIT * BLOCK_SIZE.x && posX - halfX >= -GRID_LIMIT * BLOCK_SIZE.x;
  const withinZ = posZ + halfZ <= GRID_LIMIT * BLOCK_SIZE.z && posZ - halfZ >= -GRID_LIMIT * BLOCK_SIZE.z;
  const topY = coord.y * BLOCK_SIZE.y + orientation.size.y;
  const withinY = coord.y >= 0 && topY <= (HEIGHT_LIMIT + 1) * BLOCK_SIZE.y;

  return withinX && withinZ && withinY;
}

function hasNeighbor(candidateBox) {
  if (candidateBox.min.y <= EPSILON) {
    return true;
  }

  let supported = false;

  blocks.forEach((mesh) => {
    if (supported) {
      return;
    }

    const otherBox = mesh.userData.boundingBox;
    if (Math.abs(otherBox.max.y - candidateBox.min.y) <= EPSILON && horizontalSupportOverlap(candidateBox, otherBox)) {
      supported = true;
    }
  });

  if (supported) {
    return true;
  }

  let touchesSide = false;
  blocks.forEach((mesh) => {
    if (touchesSide) {
      return;
    }
    touchesSide = facesTouch(candidateBox, mesh.userData.boundingBox);
  });

  return touchesSide;
}

function canPlace(coord, orientation) {
  if (!isInsideBounds(coord, orientation)) {
    return false;
  }

  const candidateBox = getBoundingBox(coord, orientation);

  for (const mesh of blocks) {
    if (boxesOverlap(candidateBox, mesh.userData.boundingBox)) {
      return false;
    }
  }

  return hasNeighbor(candidateBox);
}

function addBlock(placement) {
  const orientation = getOrientation(placement.orientationIndex);
  const mesh = new THREE.Mesh(blockGeometry, blockMaterials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.copy(orientation.rotation);
  mesh.position.copy(toPosition(placement.coord, orientation));
  const boundingBox = getBoundingBox(placement.coord, orientation);
  mesh.userData = {
    coord: { ...placement.coord },
    orientationIndex: placement.orientationIndex,
    boundingBox,
  };
  scene.add(mesh);
  blocks.add(mesh);
  updateBlockCount();
}

function removeBlock(mesh) {
  scene.remove(mesh);
  blocks.delete(mesh);
  updateBlockCount();
}

function snapAxis(value, baseSize, axisSize) {
  const step = baseSize / axisSize;
  const normalized = value / baseSize;
  return Math.round(normalized / step) * step;
}

function roundCoordValue(value) {
  return Math.round(value * 1000) / 1000;
}

function getPlacementFromIntersection(intersection) {
  if (!intersection) {
    return null;
  }

  if (intersection.object === ground) {
    const point = intersection.point;
    const orientation = getOrientation(currentOrientationIndex);
    const coord = {
      x: roundCoordValue(snapAxis(point.x, BLOCK_SIZE.x, orientation.size.x)),
      y: 0,
      z: roundCoordValue(snapAxis(point.z, BLOCK_SIZE.z, orientation.size.z)),
    };
    return {
      coord,
      orientationIndex: currentOrientationIndex,
      valid: canPlace(coord, orientation),
      normal: new THREE.Vector3(0, 1, 0),
    };
  }

  if (intersection.object.userData && intersection.object.userData.coord) {
    const baseCoord = intersection.object.userData.coord;
    const baseOrientation = getOrientation(intersection.object.userData.orientationIndex ?? 0);
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

    const orientation = getOrientation(currentOrientationIndex);
    const baseCenter = toPosition(baseCoord, baseOrientation);
    const offset = new THREE.Vector3(
      snappedNormal.x * ((baseOrientation.size.x + orientation.size.x) / 2),
      snappedNormal.y * ((baseOrientation.size.y + orientation.size.y) / 2),
      snappedNormal.z * ((baseOrientation.size.z + orientation.size.z) / 2)
    );
    const coord = coordFromCenter(baseCenter.add(offset), orientation);

    if (snappedNormal.y !== 0) {
      coord.x = roundCoordValue(snapAxis(intersection.point.x, BLOCK_SIZE.x, orientation.size.x));
      coord.z = roundCoordValue(snapAxis(intersection.point.z, BLOCK_SIZE.z, orientation.size.z));
    }

    if (coord.y < 0) {
      return null;
    }

    return {
      coord,
      orientationIndex: currentOrientationIndex,
      valid: canPlace(coord, orientation),
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
  const orientation = getOrientation(hoveredPlacement.orientationIndex);
  previewMesh.position.copy(toPosition(hoveredPlacement.coord, orientation));
  previewMesh.rotation.copy(orientation.rotation);
  previewMesh.material.color.set(hoveredPlacement.valid ? '#4caf50' : '#d32f2f');
  previewMesh.material.opacity = hoveredPlacement.valid ? 0.35 : 0.2;
}

function handlePointer(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([ground, ...blocks], false);
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
    addBlock(hoveredPlacement);
    hoveredPlacement = {
      ...hoveredPlacement,
      valid: canPlace(hoveredPlacement.coord, getOrientation(hoveredPlacement.orientationIndex)),
    };
    updatePreview();
  }
}

function clearScene() {
  blocks.forEach((mesh) => scene.remove(mesh));
  blocks.clear();
  updateBlockCount();
  hoveredPlacement = null;
  updatePreview();
}

function exportLayout() {
  const entries = [...blocks].map((mesh) => ({
    coord: mesh.userData.coord,
    orientation: mesh.userData.orientationIndex,
  }));
  entries.sort((a, b) => a.coord.y - b.coord.y || a.coord.z - b.coord.z || a.coord.x - b.coord.x);

  const payload = {
    unit: 'cm',
    blockSize: BLOCK_SIZE,
    count: entries.length,
    coordinates: entries.map((item) => ({
      ...item.coord,
      orientation: getOrientation(item.orientation).name,
    })),
  };

  const textarea = document.querySelector('#export-output');
  textarea.value = JSON.stringify(payload, null, 2);
  textarea.focus();
  textarea.select();
}

renderer.domElement.addEventListener('pointermove', handlePointer);
renderer.domElement.addEventListener('pointerdown', handleClick);

function cycleOrientation(direction) {
  currentOrientationIndex = (currentOrientationIndex + direction + ORIENTATIONS.length) % ORIENTATIONS.length;
  previewMesh.rotation.copy(getOrientation(currentOrientationIndex).rotation);
  if (hoveredPlacement) {
    hoveredPlacement = null;
    updatePreview();
  }
}

function handleKeyDown(event) {
  if (event.code === 'KeyR') {
    event.preventDefault();
    cycleOrientation(event.shiftKey ? -1 : 1);
  }
}

async function handleTextureInputChange(event, target) {
  const input = event.target;
  const file = input.files && input.files[0];

  try {
    if (!file) {
      if (target === 'topBottom') {
        setTopBottomTexture(null);
      } else {
        setSidesTexture(null);
      }
      return;
    }

    const texture = await loadTextureFromFile(file);
    if (target === 'topBottom') {
      setTopBottomTexture(texture);
    } else {
      setSidesTexture(texture);
    }
  } catch (error) {
    console.error(error);
    alert(error.message);
    input.value = '';
    if (target === 'topBottom') {
      setTopBottomTexture(null);
    } else {
      setSidesTexture(null);
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', handleKeyDown);

const resetButton = document.querySelector('#reset');
const exportButton = document.querySelector('#export');
const topBottomInput = document.querySelector('#texture-top-bottom');
const sidesInput = document.querySelector('#texture-sides');
const resetTexturesButton = document.querySelector('#reset-textures');
blockCountElement = document.querySelector('#block-count');
updateBlockCount();

function buildCastleModel() {
  const placements = [];

  const towerPositions = [
    { x: -2, z: -2 },
    { x: 2, z: -2 },
    { x: -2, z: 2 },
    { x: 2, z: 2 },
  ];
  const towerHeight = 4;
  towerPositions.forEach((position) => {
    for (let level = 0; level < towerHeight; level += 1) {
      placements.push({ coord: { x: position.x, y: level, z: position.z }, orientationIndex: 0 });
    }
  });

  placements.push(
    { coord: { x: -0.5, y: 0, z: -2 }, orientationIndex: 1 },
    { coord: { x: 0.5, y: 0, z: -2 }, orientationIndex: 1 },
    { coord: { x: -0.5, y: 0, z: 2 }, orientationIndex: 1 },
    { coord: { x: 0.5, y: 0, z: 2 }, orientationIndex: 1 },
    { coord: { x: -2, y: 0, z: -0.5 }, orientationIndex: 2 },
    { coord: { x: -2, y: 0, z: 0.5 }, orientationIndex: 2 },
    { coord: { x: 2, y: 0, z: -0.5 }, orientationIndex: 2 },
    { coord: { x: 2, y: 0, z: 0.5 }, orientationIndex: 2 },
    { coord: { x: 0, y: 0, z: -1 }, orientationIndex: 1 },
    { coord: { x: 0, y: 0, z: 1 }, orientationIndex: 1 }
  );

  placements.push(
    { coord: { x: 0, y: 0.5, z: -2 }, orientationIndex: 1 },
    { coord: { x: 0, y: 0.5, z: 2 }, orientationIndex: 1 },
    { coord: { x: -2, y: 0.5, z: 0 }, orientationIndex: 2 },
    { coord: { x: 2, y: 0.5, z: 0 }, orientationIndex: 2 }
  );

  placements.push(
    { coord: { x: 0, y: 0, z: 0 }, orientationIndex: 0 },
    { coord: { x: 0, y: 1, z: 0 }, orientationIndex: 0 },
    { coord: { x: 0, y: 2, z: 0 }, orientationIndex: 1 }
  );

  placements.forEach((placement) => {
    const orientation = getOrientation(placement.orientationIndex);
    if (canPlace(placement.coord, orientation)) {
      addBlock(placement);
    }
  });
}

buildCastleModel();

resetButton.addEventListener('click', clearScene);
exportButton.addEventListener('click', exportLayout);
if (topBottomInput) {
  topBottomInput.addEventListener('change', (event) => handleTextureInputChange(event, 'topBottom'));
}
if (sidesInput) {
  sidesInput.addEventListener('change', (event) => handleTextureInputChange(event, 'sides'));
}
if (resetTexturesButton) {
  resetTexturesButton.addEventListener('click', () => {
    if (topBottomInput) {
      topBottomInput.value = '';
    }
    if (sidesInput) {
      sidesInput.value = '';
    }
    setTopBottomTexture(null);
    setSidesTexture(null);
  });
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

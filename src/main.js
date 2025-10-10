import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let blockSize = { x: 6, y: 12, z: 6 }; // cm units
const GRID_LIMIT = 10; // how many blocks allowed from center on X/Z
const HEIGHT_LIMIT = 12; // how many blocks high we allow stacking

const container = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3f5fa');

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(90, 110, 120);
camera.lookAt(0, blockSize.y / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, blockSize.y / 2, 0);

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
dirLight.target.position.set(0, blockSize.y / 2, 0);
scene.add(dirLight.target);

const gridSize = GRID_LIMIT * 2 + 1;
const gridHelper = new THREE.GridHelper(gridSize * blockSize.x, gridSize, '#8cc63f', '#8cc63f');
scene.add(gridHelper);

const groundGeometry = new THREE.PlaneGeometry(gridSize * blockSize.x, gridSize * blockSize.z);
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

let blockGeometry = new THREE.BoxGeometry(blockSize.x, blockSize.y, blockSize.z);
const geometryCache = new Map([['standard', blockGeometry]]);

const textureLoader = new THREE.TextureLoader();

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

function createDefaultTexture(url, settings) {
  const resolvedUrl = typeof url === 'string' ? url : url.href;
  const texture = textureLoader.load(resolvedUrl, () => {
    applyTextureSettings(texture, settings);
  });
  return applyTextureSettings(texture, settings);
}

const defaultTopBottomTexture = createDefaultTexture(new URL('./t1.png', import.meta.url));
const defaultSidesTexture = createDefaultTexture(new URL('./t2.png', import.meta.url));

function normalizeAzimuth(value) {
  return (value % 360 + 360) % 360;
}

function getLightHex(light) {
  return `#${light.color.getHexString()}`;
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return '#ffffff';
  }
  const normalized = value.trim().toLowerCase();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex}`;
  }
  return '#ffffff';
}

function getDirectionalStateFromPosition(position) {
  const distance = position.length();
  if (distance === 0) {
    return { distance: 1, azimuth: 0, elevation: 90 };
  }
  const azimuth = THREE.MathUtils.radToDeg(Math.atan2(position.z, position.x));
  const elevation = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(position.y / distance, -1, 1)));
  return {
    distance,
    azimuth: normalizeAzimuth(azimuth),
    elevation,
  };
}

const defaultDirectionalState = getDirectionalStateFromPosition(dirLight.position.clone());

const defaultLighting = {
  ambientIntensity: ambientLight.intensity,
  ambientColor: getLightHex(ambientLight),
  directionalIntensity: dirLight.intensity,
  directionalColor: getLightHex(dirLight),
  directionalDistance: defaultDirectionalState.distance,
  directionalAzimuth: defaultDirectionalState.azimuth,
  directionalElevation: defaultDirectionalState.elevation,
};

const lightingState = { ...defaultLighting };

function updateDirectionalLightPosition() {
  const phi = THREE.MathUtils.degToRad(90 - lightingState.directionalElevation);
  const theta = THREE.MathUtils.degToRad(lightingState.directionalAzimuth);
  const radius = Math.max(lightingState.directionalDistance, 1);

  const sinPhi = Math.sin(phi);
  dirLight.position.set(
    radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta)
  );
  dirLight.target.updateMatrixWorld();
}

updateDirectionalLightPosition();

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

function createBoxOrientations(size) {
  return [
    {
      name: 'standing',
      rotation: new THREE.Euler(0, 0, 0),
      size: { x: size.x, y: size.y, z: size.z },
    },
    {
      name: 'lying-x',
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      size: { x: size.y, y: size.x, z: size.z },
    },
    {
      name: 'lying-z',
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      size: { x: size.x, y: size.x, z: size.y },
    },
  ];
}

function createConnectorOrientations(size) {
  const orientationSize = { x: size.x, y: size.y, z: size.z };
  return [
    { name: 'square-down', rotation: new THREE.Euler(0, 0, 0), size: { ...orientationSize } },
    { name: 'square-up', rotation: new THREE.Euler(Math.PI, 0, 0), size: { ...orientationSize } },
    { name: 'square-front', rotation: new THREE.Euler(-Math.PI / 2, 0, 0), size: { ...orientationSize } },
    { name: 'square-back', rotation: new THREE.Euler(Math.PI / 2, 0, 0), size: { ...orientationSize } },
    { name: 'square-right', rotation: new THREE.Euler(0, 0, Math.PI / 2), size: { ...orientationSize } },
    { name: 'square-left', rotation: new THREE.Euler(0, 0, -Math.PI / 2), size: { ...orientationSize } },
  ];
}

function createConnectorGeometry() {
  const size = 6;
  const half = size / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size,
    bevelEnabled: false,
    curveSegments: 4,
    steps: 1,
  });

  geometry.center();
  geometry.computeVertexNormals();

  return geometry;
}

const connectorFrontMaterial = new THREE.MeshStandardMaterial({
  color: '#d9b88d',
  metalness: 0.2,
  roughness: 0.65,
});

const connectorSideMaterial = new THREE.MeshStandardMaterial({
  color: '#b98d58',
  metalness: 0.2,
  roughness: 0.6,
});

const connectorMaterials = [connectorFrontMaterial, connectorSideMaterial];

const BLOCK_TYPES = {
  standard: {
    id: 'standard',
    label: 'Klocek 6×6×12 cm',
    size: { x: 6, y: 12, z: 6 },
    createGeometry: () => new THREE.BoxGeometry(6, 12, 6),
    createMaterials: () => blockMaterials,
    createOrientations: (size) => createBoxOrientations(size),
    buildModel: () => buildCastleModel(),
  },
  connector: {
    id: 'connector',
    label: 'Łącznik 6×6×6 cm',
    size: { x: 6, y: 6, z: 6 },
    createGeometry: () => createConnectorGeometry(),
    createMaterials: () => connectorMaterials,
    createOrientations: (size) => createConnectorOrientations(size),
    buildModel: () => buildConnectorModel(),
  },
};

let currentBlockType = BLOCK_TYPES.standard;
let currentBlockMaterials = blockMaterials;
let orientations = createBoxOrientations(blockSize);

const EPSILON = 1e-3;

/** @type {Set<THREE.Mesh>} */
const blocks = new Set();
let currentOrientationIndex = 0;
/** @type {HTMLElement | null} */
let blockCountElement = null;
/** @type {HTMLSelectElement | null} */
let blockTypeSelect = null;

function updateBlockCount() {
  if (blockCountElement) {
    blockCountElement.textContent = blocks.size.toString();
  }
}

function getGeometryForType(type) {
  if (!geometryCache.has(type.id)) {
    geometryCache.set(type.id, type.createGeometry());
  }
  return geometryCache.get(type.id);
}

function setBlockType(typeId, options = {}) {
  const { force = false, initializeModel = false } = options;
  const nextType = BLOCK_TYPES[typeId] || BLOCK_TYPES.standard;

  if (!force && currentBlockType === nextType) {
    if (initializeModel && typeof nextType.buildModel === 'function' && blocks.size === 0) {
      nextType.buildModel();
    }
    return;
  }

  blockSize = { ...nextType.size };
  blockGeometry = getGeometryForType(nextType);
  currentBlockMaterials = nextType.createMaterials();
  orientations = nextType.createOrientations(blockSize);
  currentBlockType = nextType;
  currentOrientationIndex = 0;

  if (previewMesh) {
    previewMesh.geometry = blockGeometry;
    previewMesh.rotation.copy(getOrientation(currentOrientationIndex).rotation);
  }

  if (blockTypeSelect && blockTypeSelect.value !== nextType.id) {
    blockTypeSelect.value = nextType.id;
  }

  controls.target.set(0, blockSize.y / 2, 0);
  dirLight.target.position.set(0, blockSize.y / 2, 0);
  dirLight.target.updateMatrixWorld();
  updateDirectionalLightPosition();

  hoveredPlacement = null;
  updatePreview();

  if (initializeModel && typeof nextType.buildModel === 'function' && blocks.size === 0) {
    nextType.buildModel();
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
  const count = orientations.length;
  if (count === 0) {
    throw new Error('Brak zdefiniowanych orientacji dla bieżącego modelu.');
  }
  return orientations[((index % count) + count) % count];
}

function toPosition(coord, orientation) {
  return new THREE.Vector3(
    coord.x * blockSize.x,
    coord.y * blockSize.y + orientation.size.y / 2,
    coord.z * blockSize.z
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
    x: roundCoordValue(center.x / blockSize.x),
    y: roundCoordValue((center.y - orientation.size.y / 2) / blockSize.y),
    z: roundCoordValue(center.z / blockSize.z),
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
  const posX = coord.x * blockSize.x;
  const posZ = coord.z * blockSize.z;

  const withinX = posX + halfX <= GRID_LIMIT * blockSize.x && posX - halfX >= -GRID_LIMIT * blockSize.x;
  const withinZ = posZ + halfZ <= GRID_LIMIT * blockSize.z && posZ - halfZ >= -GRID_LIMIT * blockSize.z;
  const topY = coord.y * blockSize.y + orientation.size.y;
  const withinY = coord.y >= 0 && topY <= (HEIGHT_LIMIT + 1) * blockSize.y;

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
  const mesh = new THREE.Mesh(blockGeometry, currentBlockMaterials);
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
      x: roundCoordValue(snapAxis(point.x, blockSize.x, orientation.size.x)),
      y: 0,
      z: roundCoordValue(snapAxis(point.z, blockSize.z, orientation.size.z)),
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
      coord.x = roundCoordValue(snapAxis(intersection.point.x, blockSize.x, orientation.size.x));
      coord.z = roundCoordValue(snapAxis(intersection.point.z, blockSize.z, orientation.size.z));
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
    blockSize: blockSize,
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
  const count = orientations.length;
  if (count === 0) {
    return;
  }
  currentOrientationIndex = (currentOrientationIndex + direction + count) % count;
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
const ambientIntensityInput = document.querySelector('#ambient-intensity');
const ambientColorInput = document.querySelector('#ambient-color');
const directionalIntensityInput = document.querySelector('#directional-intensity');
const directionalColorInput = document.querySelector('#directional-color');
const directionalAzimuthInput = document.querySelector('#directional-azimuth');
const directionalElevationInput = document.querySelector('#directional-elevation');
const directionalDistanceInput = document.querySelector('#directional-distance');
const resetLightingButton = document.querySelector('#reset-lighting');

function applyLightingState() {
  ambientLight.intensity = lightingState.ambientIntensity;
  ambientLight.color.set(lightingState.ambientColor);
  dirLight.intensity = lightingState.directionalIntensity;
  dirLight.color.set(lightingState.directionalColor);
  updateDirectionalLightPosition();
}

function syncLightingControls() {
  if (ambientIntensityInput) {
    ambientIntensityInput.value = lightingState.ambientIntensity.toFixed(2);
  }
  if (ambientColorInput) {
    ambientColorInput.value = lightingState.ambientColor;
  }
  if (directionalIntensityInput) {
    directionalIntensityInput.value = lightingState.directionalIntensity.toFixed(2);
  }
  if (directionalColorInput) {
    directionalColorInput.value = lightingState.directionalColor;
  }
  if (directionalAzimuthInput) {
    directionalAzimuthInput.value = lightingState.directionalAzimuth.toFixed(0);
  }
  if (directionalElevationInput) {
    directionalElevationInput.value = lightingState.directionalElevation.toFixed(0);
  }
  if (directionalDistanceInput) {
    directionalDistanceInput.value = lightingState.directionalDistance.toFixed(0);
  }
}

function resetLighting() {
  Object.assign(lightingState, defaultLighting);
  applyLightingState();
  syncLightingControls();
}

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

function buildConnectorModel() {
  const placements = [
    { coord: { x: 0, y: 0, z: 0 }, orientationIndex: 0 },
    { coord: { x: 1, y: 0, z: 0 }, orientationIndex: 0 },
    { coord: { x: 1, y: 0, z: 1 }, orientationIndex: 0 },
    { coord: { x: 0, y: 0, z: 1 }, orientationIndex: 0 },
    { coord: { x: 0, y: 1, z: 0 }, orientationIndex: 0 },
    { coord: { x: 1, y: 1, z: 1 }, orientationIndex: 0 },
    { coord: { x: 0, y: 1, z: 1 }, orientationIndex: 0 },
    { coord: { x: 1, y: 1, z: 0 }, orientationIndex: 0 },
  ];

  placements.forEach((placement) => {
    const orientation = getOrientation(placement.orientationIndex);
    if (canPlace(placement.coord, orientation)) {
      addBlock(placement);
    }
  });
}

blockTypeSelect = document.querySelector('#block-type');
blockCountElement = document.querySelector('#block-count');
updateBlockCount();

const initialTypeId = blockTypeSelect ? blockTypeSelect.value : currentBlockType.id;
setBlockType(initialTypeId, { force: true, initializeModel: true });

if (blockTypeSelect) {
  blockTypeSelect.addEventListener('change', (event) => {
    setBlockType(event.target.value);
  });
}

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

if (ambientIntensityInput) {
  ambientIntensityInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.ambientIntensity = THREE.MathUtils.clamp(value, 0, 1.5);
      ambientLight.intensity = lightingState.ambientIntensity;
      ambientIntensityInput.value = lightingState.ambientIntensity.toFixed(2);
    }
  });
}

if (ambientColorInput) {
  ambientColorInput.addEventListener('input', (event) => {
    const value = normalizeHexColor(event.target.value);
    lightingState.ambientColor = value;
    ambientLight.color.set(value);
  });
}

if (directionalIntensityInput) {
  directionalIntensityInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.directionalIntensity = THREE.MathUtils.clamp(value, 0, 2);
      dirLight.intensity = lightingState.directionalIntensity;
      directionalIntensityInput.value = lightingState.directionalIntensity.toFixed(2);
    }
  });
}

if (directionalColorInput) {
  directionalColorInput.addEventListener('input', (event) => {
    const value = normalizeHexColor(event.target.value);
    lightingState.directionalColor = value;
    dirLight.color.set(value);
  });
}

if (directionalAzimuthInput) {
  directionalAzimuthInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.directionalAzimuth = normalizeAzimuth(value);
      updateDirectionalLightPosition();
      directionalAzimuthInput.value = lightingState.directionalAzimuth.toFixed(0);
    }
  });
}

if (directionalElevationInput) {
  directionalElevationInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.directionalElevation = THREE.MathUtils.clamp(value, -10, 89);
      updateDirectionalLightPosition();
      const formatted = lightingState.directionalElevation.toFixed(0);
      if (directionalElevationInput.value !== formatted) {
        directionalElevationInput.value = formatted;
      }
    }
  });
}

if (directionalDistanceInput) {
  directionalDistanceInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.directionalDistance = THREE.MathUtils.clamp(value, 40, 400);
      updateDirectionalLightPosition();
      const formatted = lightingState.directionalDistance.toFixed(0);
      if (directionalDistanceInput.value !== formatted) {
        directionalDistanceInput.value = formatted;
      }
    }
  });
}

if (resetLightingButton) {
  resetLightingButton.addEventListener('click', resetLighting);
}

applyLightingState();
syncLightingControls();

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const gridUnit = { x: 6, y: 12, z: 6 }; // cm units per grid cell
let currentBlockSize = { ...gridUnit };
let gridLimit = 10; // how many blocks allowed from center on X/Z
let heightLimit = 12; // how many blocks high we allow stacking
const GRID_LIMIT_MIN = 5;
const GRID_LIMIT_MAX = 60;
const HEIGHT_LIMIT_MIN = 1;
const HEIGHT_LIMIT_MAX = 60;

const container = document.querySelector('#app');
const appRoot = container ? container.closest('.kreator-app') : null;

if (!container || !appRoot) {
  throw new Error('Kreator: nie znaleziono elementu kontenera aplikacji.');
}

function getRendererSize() {
  const width = Math.max(container.clientWidth || 0, 320);
  const height = Math.max(container.clientHeight || 0, 320);
  if (width === 0 || height === 0) {
    return { width: Math.max(window.innerWidth, 320), height: Math.max(window.innerHeight, 320) };
  }
  return { width, height };
}

const defaultBackgroundColor = '#f3f5fa';

const scene = new THREE.Scene();
scene.background = new THREE.Color(defaultBackgroundColor);

const defaultCameraPosition = new THREE.Vector3(90, 110, 120);
const defaultCameraTarget = new THREE.Vector3(0, currentBlockSize.y / 2, 0);

const { width: initialWidth, height: initialHeight } = getRendererSize();

const camera = new THREE.PerspectiveCamera(50, initialWidth / initialHeight, 0.1, 1000);
camera.position.copy(defaultCameraPosition);
camera.lookAt(defaultCameraTarget);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(initialWidth, initialHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.copy(defaultCameraTarget);
controls.update();
controls.saveState();

const ambientLight = new THREE.AmbientLight(0xffffff, 2);
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
dirLight.target.position.set(0, currentBlockSize.y / 2, 0);
scene.add(dirLight.target);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: '#e5f3d8',
  metalness: 0,
  roughness: 1,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.4,
});

/** @type {THREE.GridHelper | null} */
let gridHelper = null;
/** @type {THREE.Mesh | null} */
let ground = null;

function disposeGridHelper(helper) {
  if (!helper) {
    return;
  }
  if (helper.geometry) {
    helper.geometry.dispose();
  }
  const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
  materials.forEach((material) => {
    if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  });
}

function disposeGroundMesh(mesh) {
  if (!mesh) {
    return;
  }
  if (mesh.geometry) {
    mesh.geometry.dispose();
  }
}

function rebuildWorkspace() {
  const gridSize = gridLimit * 2 + 1;
  const gridLengthX = gridSize * gridUnit.x;
  const gridLengthZ = gridSize * gridUnit.z;

  const gridVisible = gridHelper ? gridHelper.visible : true;

  if (gridHelper) {
    scene.remove(gridHelper);
    disposeGridHelper(gridHelper);
  }

  gridHelper = new THREE.GridHelper(gridLengthX, gridSize, '#8cc63f', '#8cc63f');
  gridHelper.visible = gridVisible;
  scene.add(gridHelper);

  if (ground) {
    scene.remove(ground);
    disposeGroundMesh(ground);
  }

  const groundGeometry = new THREE.PlaneGeometry(gridLengthX, gridLengthZ);
  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotateX(-Math.PI / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
}

rebuildWorkspace();

function setWorkspaceLimits({ horizontal, vertical }) {
  const nextHorizontal = THREE.MathUtils.clamp(Math.max(gridLimit, horizontal), GRID_LIMIT_MIN, GRID_LIMIT_MAX);
  const nextVertical = THREE.MathUtils.clamp(Math.max(heightLimit, vertical), HEIGHT_LIMIT_MIN, HEIGHT_LIMIT_MAX);

  if (nextHorizontal === gridLimit && nextVertical === heightLimit) {
    syncWorkspaceInputs();
    return false;
  }

  gridLimit = nextHorizontal;
  heightLimit = nextVertical;
  rebuildWorkspace();
  hoveredPlacement = null;
  updatePreview();
  syncWorkspaceInputs();
  return true;
}

function syncWorkspaceInputs() {
  if (workspaceSizeInput) {
    workspaceSizeInput.value = gridLimit.toString();
    workspaceSizeInput.min = gridLimit.toString();
    workspaceSizeInput.max = GRID_LIMIT_MAX.toString();
  }
  if (workspaceHeightInput) {
    workspaceHeightInput.value = heightLimit.toString();
    workspaceHeightInput.min = heightLimit.toString();
    workspaceHeightInput.max = HEIGHT_LIMIT_MAX.toString();
  }
}

function applyWorkspaceInputs() {
  const horizontalRaw = workspaceSizeInput ? Number.parseInt(workspaceSizeInput.value, 10) : gridLimit;
  const verticalRaw = workspaceHeightInput ? Number.parseInt(workspaceHeightInput.value, 10) : heightLimit;
  const horizontal = Number.isNaN(horizontalRaw) ? gridLimit : horizontalRaw;
  const vertical = Number.isNaN(verticalRaw) ? heightLimit : verticalRaw;
  setWorkspaceLimits({ horizontal, vertical });
}

let blockGeometry = new THREE.BoxGeometry(currentBlockSize.x, currentBlockSize.y, currentBlockSize.z);
const geometryCache = new Map([['standard', blockGeometry]]);

const textureLoader = new THREE.TextureLoader();

function applyTextureSettings(texture, { repeat = false } = {}) {
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    let repeatX = 1;
    let repeatY = 1;

    if (repeat === true) {
      repeatX = 1;
      repeatY = 1;
    } else if (typeof repeat === 'number') {
      repeatX = repeat;
      repeatY = repeat;
    } else if (Array.isArray(repeat)) {
      repeatX = typeof repeat[0] === 'number' ? repeat[0] : repeatX;
      if (typeof repeat[1] === 'number') {
        repeatY = repeat[1];
      } else if (typeof repeat[0] === 'number') {
        repeatY = repeat[0];
      }
    } else if (typeof repeat === 'object') {
      const { x, y, width, height } = repeat;
      if (typeof x === 'number') {
        repeatX = x;
      } else if (typeof width === 'number') {
        repeatX = width;
      }

      if (typeof y === 'number') {
        repeatY = y;
      } else if (typeof height === 'number') {
        repeatY = height;
      }
    }

    texture.repeat.set(repeatX, repeatY);
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
const rotundaOuterTexture = createDefaultTexture(new URL('./t3.png', import.meta.url), {
  repeat: true,
});

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

function resetCameraView() {
  controls.reset();
}

function updateGridToggleButtonState(button) {
  if (!button) {
    return;
  }
  const visible = gridHelper.visible;
  button.textContent = visible ? 'Ukryj siatkę' : 'Pokaż siatkę';
  button.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

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

const rotundaOuterMaterial = new THREE.MeshStandardMaterial({
  map: rotundaOuterTexture,
  metalness: 0.2,
  roughness: 0.55,
});

const rotundaInnerMaterial = new THREE.MeshStandardMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

const rotundaMaterials = [materials.top, materials.bottom, rotundaOuterMaterial, rotundaInnerMaterial];

const sideMaterials = [materials.right, materials.left, materials.front, materials.back];
const topBottomMaterials = [materials.top, materials.bottom];

let currentSidesTexture = defaultSidesTexture;
let currentTopBottomTexture = defaultTopBottomTexture;

function resizeRenderer() {
  const { width, height } = getRendererSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
let currentBackgroundTexture = null;

const ROTUNDA_ORIENTATION_CONFIGS = [
  { key: 'upright', label: 'Pionowa', baseRotation: new THREE.Euler(0, 0, 0) },
  { key: 'tilt-forward', label: 'Pochylona (oś X +)', baseRotation: new THREE.Euler(Math.PI / 2, 0, 0) },
  { key: 'tilt-backward', label: 'Pochylona (oś X -)', baseRotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
  { key: 'tilt-right', label: 'Pochylona (oś Z +)', baseRotation: new THREE.Euler(0, 0, Math.PI / 2) },
  { key: 'tilt-left', label: 'Pochylona (oś Z -)', baseRotation: new THREE.Euler(0, 0, -Math.PI / 2) },
];

const ROTUNDA_ORIENTATION_LABELS = Object.fromEntries(
  ROTUNDA_ORIENTATION_CONFIGS.flatMap((config) =>
    Array.from({ length: 4 }, (_, index) => {
      const angle = index * 90;
      return [`arc-${config.key}-${angle}`, `Rotunda – ${config.label}, obrót ${angle}°`];
    })
  )
);

const ORIENTATION_LABELS = {
  standing: 'Stojący',
  'lying-x': 'Leżący (oś X)',
  'lying-z': 'Leżący (oś Z)',
  'square-down': 'Kwadrat (dół)',
  'square-up': 'Kwadrat (góra)',
  'square-front': 'Kwadrat (przód)',
  'square-back': 'Kwadrat (tył)',
  'square-right': 'Kwadrat (prawo)',
  'square-left': 'Kwadrat (lewo)',
  ...ROTUNDA_ORIENTATION_LABELS,
};

function formatOrientationLabel(value) {
  if (!value) {
    return '—';
  }
  if (ORIENTATION_LABELS[value]) {
    return ORIENTATION_LABELS[value];
  }
  const normalized = value.replace(/[-_]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

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

function resetRotundaOuterMaterial() {
  rotundaOuterMaterial.map = rotundaOuterTexture;
  rotundaOuterMaterial.needsUpdate = true;
}

function disposeBackgroundTexture(texture) {
  if (texture) {
    texture.dispose();
  }
}

function clearBackgroundTexture() {
  if (currentBackgroundTexture) {
    disposeBackgroundTexture(currentBackgroundTexture);
    currentBackgroundTexture = null;
  }
}

function setSceneBackgroundColor(color, { skipInputSync = false, skipImageReset = false } = {}) {
  const normalized = normalizeHexColor(color);
  clearBackgroundTexture();
  scene.background = new THREE.Color(normalized);
  if (!skipInputSync && backgroundColorInput) {
    backgroundColorInput.value = normalized;
  }
  if (!skipImageReset && backgroundImageInput) {
    backgroundImageInput.value = '';
  }
}

function resetBackground() {
  setSceneBackgroundColor(defaultBackgroundColor);
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

function createOrientationDefinition({ name, rotation, size, gridStep }) {
  const normalizedSize = { x: size.x, y: size.y, z: size.z };
  const defaultGridStep = {
    x: normalizedSize.x !== 0 ? gridUnit.x / normalizedSize.x : 1,
    z: normalizedSize.z !== 0 ? gridUnit.z / normalizedSize.z : 1,
  };
  return {
    name,
    rotation,
    size: normalizedSize,
    gridStep: {
      x: gridStep?.x ?? defaultGridStep.x,
      z: gridStep?.z ?? defaultGridStep.z,
    },
  };
}

function getGridStep(orientation, axis) {
  const value = orientation.gridStep?.[axis];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const size = axis === 'x' ? orientation.size.x : orientation.size.z;
  return size !== 0 ? gridUnit[axis] / size : 1;
}

function createBoxOrientations(size) {
  return [
    createOrientationDefinition({
      name: 'standing',
      rotation: new THREE.Euler(0, 0, 0),
      size: { x: size.x, y: size.y, z: size.z },
    }),
    createOrientationDefinition({
      name: 'lying-x',
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      size: { x: size.y, y: size.x, z: size.z },
    }),
    createOrientationDefinition({
      name: 'lying-z',
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      size: { x: size.x, y: size.x, z: size.y },
    }),
  ];
}

function createConnectorOrientations(size) {
  const orientationSize = { x: size.x, y: size.y, z: size.z };
  return [
    createOrientationDefinition({
      name: 'square-down',
      rotation: new THREE.Euler(0, 0, 0),
      size: { ...orientationSize },
    }),
    createOrientationDefinition({
      name: 'square-up',
      rotation: new THREE.Euler(Math.PI, 0, 0),
      size: { ...orientationSize },
    }),
    createOrientationDefinition({
      name: 'square-front',
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      size: { ...orientationSize },
    }),
    createOrientationDefinition({
      name: 'square-back',
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      size: { ...orientationSize },
    }),
    createOrientationDefinition({
      name: 'square-right',
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      size: { ...orientationSize },
    }),
    createOrientationDefinition({
      name: 'square-left',
      rotation: new THREE.Euler(0, 0, -Math.PI / 2),
      size: { ...orientationSize },
    }),
  ];
}

function computeAxisAlignedSize(baseSize, rotation) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
  const axes = [
    new THREE.Vector3(baseSize.x, 0, 0).applyMatrix4(matrix),
    new THREE.Vector3(0, baseSize.y, 0).applyMatrix4(matrix),
    new THREE.Vector3(0, 0, baseSize.z).applyMatrix4(matrix),
  ];
  const round = (value) => Math.round(value * 1e6) / 1e6;
  return {
    x: round(Math.abs(axes[0].x) + Math.abs(axes[1].x) + Math.abs(axes[2].x)),
    y: round(Math.abs(axes[0].y) + Math.abs(axes[1].y) + Math.abs(axes[2].y)),
    z: round(Math.abs(axes[0].z) + Math.abs(axes[1].z) + Math.abs(axes[2].z)),
  };
}

function createRotundaOrientations(size) {
  const angleStep = Math.PI / 2;
  const baseSize = { x: size.x, y: size.y, z: size.z };
  return ROTUNDA_ORIENTATION_CONFIGS.flatMap((config) => {
    const baseQuaternion = new THREE.Quaternion().setFromEuler(config.baseRotation);

    return Array.from({ length: 4 }, (_, index) => {
      const angle = angleStep * index;
      const rotationQuaternion = baseQuaternion
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)));
      const rotation = new THREE.Euler().setFromQuaternion(rotationQuaternion, 'XYZ');
      const orientationSize = computeAxisAlignedSize(baseSize, rotation);
      return createOrientationDefinition({
        name: `arc-${config.key}-${index * 90}`,
        rotation,
        size: orientationSize,
        gridStep: { x: 1, z: 1 },
      });
    });
  });
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

function createRotundaGeometry() {
  const height = 12;
  const outerRadius = 18;
  const innerRadius = 12;
  const thetaLength = Math.PI / 2;
  const startAngle = 0;
  const endAngle = startAngle + thetaLength;

  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(startAngle) * outerRadius, Math.sin(startAngle) * outerRadius);
  shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
  shape.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius);
  shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
  shape.lineTo(Math.cos(startAngle) * outerRadius, Math.sin(startAngle) * outerRadius);
  shape.closePath();

  const extrudeSettings = {
    depth: height,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 72,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2, 0);
  geometry.computeVertexNormals();

  const index = geometry.index;
  if (index) {
    const indexArray = index.array;
    const positionArray = geometry.attributes.position.array;
    const normalArray = geometry.attributes.normal.array;
    const outerVertexIndices = new Set();
    const innerOuterThreshold = (outerRadius + innerRadius) / 2;
    const faceNormal = new THREE.Vector3();

    geometry.clearGroups();

    for (let faceIndex = 0; faceIndex < indexArray.length; faceIndex += 3) {
      const aIndex = indexArray[faceIndex] * 3;
      const bIndex = indexArray[faceIndex + 1] * 3;
      const cIndex = indexArray[faceIndex + 2] * 3;

      const normalX = normalArray[aIndex] + normalArray[bIndex] + normalArray[cIndex];
      const normalY =
        normalArray[aIndex + 1] + normalArray[bIndex + 1] + normalArray[cIndex + 1];
      const normalZ =
        normalArray[aIndex + 2] + normalArray[bIndex + 2] + normalArray[cIndex + 2];

      faceNormal.set(normalX, normalY, normalZ).normalize();

      let materialIndex = 2;

      if (faceNormal.y >= 0.5) {
        materialIndex = 0;
      } else if (faceNormal.y <= -0.5) {
        materialIndex = 1;
      } else {
        const ax = positionArray[aIndex];
        const az = positionArray[aIndex + 2];
        const bx = positionArray[bIndex];
        const bz = positionArray[bIndex + 2];
        const cx = positionArray[cIndex];
        const cz = positionArray[cIndex + 2];
        const centroidX = (ax + bx + cx) / 3;
        const centroidZ = (az + bz + cz) / 3;
        const radius = Math.hypot(centroidX, centroidZ);
        materialIndex = radius > innerOuterThreshold ? 2 : 3;
      }

      if (materialIndex === 2) {
        outerVertexIndices.add(indexArray[faceIndex]);
        outerVertexIndices.add(indexArray[faceIndex + 1]);
        outerVertexIndices.add(indexArray[faceIndex + 2]);
      }

      geometry.addGroup(faceIndex, 3, materialIndex);
    }

    geometry.groupsNeedUpdate = true;

    if (outerVertexIndices.size > 0 && geometry.attributes.uv) {
      const uvAttribute = geometry.attributes.uv;
      let minY = Infinity;
      let maxY = -Infinity;

      outerVertexIndices.forEach((vertexIndex) => {
        const y = positionArray[vertexIndex * 3 + 1];
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      });

      const heightRange = Math.max(maxY - minY, 1e-6);

      outerVertexIndices.forEach((vertexIndex) => {
        const baseIndex = vertexIndex * 3;
        const x = positionArray[baseIndex];
        const z = positionArray[baseIndex + 2];
        let angle = Math.atan2(z, x) - startAngle;
        angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        angle = Math.min(Math.max(angle, 0), thetaLength);
        const u = (angle / thetaLength) * 3;
        const y = positionArray[baseIndex + 1];
        const v = (y - minY) / heightRange;
        const uvIndex = vertexIndex * 2;
        uvAttribute.array[uvIndex] = u;
        uvAttribute.array[uvIndex + 1] = v;
      });

      uvAttribute.needsUpdate = true;
    }
  }

  geometry.center();
  geometry.computeVertexNormals();

  return geometry;
}

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
  rotunda: {
    id: 'rotunda',
    label: 'Element rotundy 18 cm',
    size: { x: 18, y: 12, z: 18 },
    createGeometry: () => createRotundaGeometry(),
    createMaterials: () => rotundaMaterials,
    createOrientations: (size) => createRotundaOrientations(size),
    buildModel: () => buildRotundaModel(),
  },
};

let currentBlockType = BLOCK_TYPES.standard;
let currentBlockMaterials = blockMaterials;
let orientations = createBoxOrientations(currentBlockSize);

const orientationDataCache = new Map();

function getOrientationData(typeId) {
  const cached = orientationDataCache.get(typeId);
  if (cached) {
    return cached;
  }
  const type = BLOCK_TYPES[typeId];
  if (!type) {
    throw new Error(`Nieznany typ klocka: ${typeId}`);
  }
  const orientationList = type.createOrientations(type.size);
  const quaternions = orientationList.map((orientation) => new THREE.Quaternion().setFromEuler(orientation.rotation));
  const indexByName = new Map(orientationList.map((orientation, index) => [orientation.name, index]));
  const data = { orientations: orientationList, quaternions, indexByName };
  orientationDataCache.set(typeId, data);
  return data;
}

function getOrientationIndexByName(typeId, name) {
  const data = getOrientationData(typeId);
  return data.indexByName.has(name) ? data.indexByName.get(name) : -1;
}

const EPSILON = 1e-3;

/** @type {Set<THREE.Mesh>} */
const blocks = new Set();
let currentOrientationIndex = 0;
const selectedBlocks = new Set();
const selectionHelpers = new Map();

function createSelectionHelper(mesh) {
  const helper = new THREE.BoxHelper(mesh, 0x2196f3);
  if (helper.material) {
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    materials.forEach((material) => {
      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.85;
    });
  }
  return helper;
}

function addBlockToSelection(mesh) {
  if (selectedBlocks.has(mesh)) {
    return;
  }
  const helper = createSelectionHelper(mesh);
  selectionHelpers.set(mesh, helper);
  selectedBlocks.add(mesh);
  scene.add(helper);
  helper.update();
}

function removeBlockFromSelection(mesh) {
  const helper = selectionHelpers.get(mesh);
  if (helper) {
    scene.remove(helper);
    if (helper.geometry) {
      helper.geometry.dispose();
    }
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    materials.forEach((material) => {
      if (material && typeof material.dispose === 'function') {
        material.dispose();
      }
    });
    selectionHelpers.delete(mesh);
  }
  selectedBlocks.delete(mesh);
}

function toggleBlockSelection(mesh, { additive = false } = {}) {
  if (!mesh) {
    return;
  }
  if (!additive) {
    clearSelection();
  }
  if (selectedBlocks.has(mesh) && additive) {
    removeBlockFromSelection(mesh);
    return;
  }
  addBlockToSelection(mesh);
}

function clearSelection() {
  Array.from(selectedBlocks).forEach((mesh) => removeBlockFromSelection(mesh));
}

function updateSelectionHelper(mesh) {
  const helper = selectionHelpers.get(mesh);
  if (helper) {
    helper.update();
  }
}

function deselectBlock(mesh) {
  if (!mesh) {
    return;
  }
  removeBlockFromSelection(mesh);
}

const ROTATION_TOLERANCE = 1e-3;

const ROTATION_DELTAS = {
  ArrowLeft: { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2 },
  ArrowRight: { axis: new THREE.Vector3(0, 1, 0), angle: -Math.PI / 2 },
  ArrowUp: { axis: new THREE.Vector3(1, 0, 0), angle: -Math.PI / 2 },
  ArrowDown: { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
};

function getRotationDeltaQuaternion(key) {
  const config = ROTATION_DELTAS[key];
  if (!config) {
    return null;
  }
  return new THREE.Quaternion().setFromAxisAngle(config.axis, config.angle);
}

function rotateSelectedBlocksByKey(key) {
  const rotationQuaternion = getRotationDeltaQuaternion(key);
  if (!rotationQuaternion || selectedBlocks.size === 0) {
    return;
  }

  /** @type {{ mesh: THREE.Mesh; orientationIndex: number; orientation: ReturnType<typeof getOrientation> }[]} */
  const updates = [];
  const overrides = new Map();
  let anyChange = false;

  selectedBlocks.forEach((mesh) => {
    const typeId = mesh.userData?.typeId && BLOCK_TYPES[mesh.userData.typeId] ? mesh.userData.typeId : 'standard';
    const { orientations: typeOrientations, quaternions } = getOrientationData(typeId);
    const currentIndex = mesh.userData?.orientationIndex ?? 0;
    const currentQuat = quaternions[currentIndex] || new THREE.Quaternion().setFromEuler(typeOrientations[currentIndex].rotation);
    const targetQuat = rotationQuaternion.clone().multiply(currentQuat).normalize();

    let targetIndex = -1;
    for (let index = 0; index < quaternions.length; index += 1) {
      const candidate = quaternions[index];
      if (candidate.angleTo(targetQuat) <= ROTATION_TOLERANCE) {
        targetIndex = index;
        break;
      }
    }

    if (targetIndex === -1) {
      overrides.set(mesh, mesh.userData.boundingBox);
      updates.push({ mesh, orientationIndex: currentIndex, orientation: typeOrientations[currentIndex] });
      return;
    }

    const orientation = typeOrientations[targetIndex];
    const boundingBox = getBoundingBox(mesh.userData.coord, orientation);
    overrides.set(mesh, boundingBox);
    updates.push({ mesh, orientationIndex: targetIndex, orientation });
    if (targetIndex !== currentIndex) {
      anyChange = true;
    }
  });

  if (!anyChange) {
    return;
  }

  for (const update of updates) {
    if (!isInsideBounds(update.mesh.userData.coord, update.orientation)) {
      return;
    }
  }

  for (const update of updates) {
    if (!canPlace(update.mesh.userData.coord, update.orientation, { ignoreMeshes: update.mesh, boundingBoxesOverride: overrides })) {
      return;
    }
  }

  updates.forEach((update) => {
    const { mesh, orientationIndex, orientation } = update;
    const boundingBox = overrides.get(mesh);
    mesh.rotation.copy(orientation.rotation);
    mesh.position.copy(toPosition(mesh.userData.coord, orientation));
    mesh.userData.orientationIndex = orientationIndex;
    mesh.userData.boundingBox = boundingBox;
    updateSelectionHelper(mesh);
  });

  hoveredPlacement = null;
  updatePreview();
}
/** @type {HTMLElement | null} */
let blockCountElement = null;
/** @type {HTMLElement | null} */
let blockCountByTypeElement = null;
/** @type {HTMLSelectElement | null} */
let blockTypeSelect = null;
/** @type {HTMLSelectElement | null} */
let modelSelect = null;
/** @type {HTMLElement | null} */
let orientationIndicatorElement = null;
/** @type {HTMLButtonElement | null} */
let rotatePrevButton = null;
/** @type {HTMLButtonElement | null} */
let rotateNextButton = null;
/** @type {HTMLElement | null} */
let orientationPreviewElement = null;
/** @type {HTMLElement | null} */
let orientationPreviewDetailsElement = null;
/** @type {THREE.Scene | null} */
let orientationPreviewScene = null;
/** @type {THREE.PerspectiveCamera | null} */
let orientationPreviewCamera = null;
/** @type {THREE.WebGLRenderer | null} */
let orientationPreviewRenderer = null;
/** @type {THREE.Mesh | null} */
let orientationPreviewMesh = null;
/** @type {THREE.DirectionalLight | null} */
let orientationPreviewLight = null;
/** @type {THREE.Mesh | null} */
let orientationPreviewGround = null;
/** @type {HTMLInputElement | null} */
let backgroundColorInput = null;
/** @type {HTMLInputElement | null} */
let backgroundImageInput = null;
/** @type {HTMLElement | null} */
let controlPanelElement = null;
/** @type {HTMLButtonElement | null} */
let menuToggleButton = null;
/** @type {HTMLButtonElement | null} */
let menuCloseButton = null;
/** @type {HTMLInputElement | null} */
let workspaceSizeInput = null;
/** @type {HTMLInputElement | null} */
let workspaceHeightInput = null;
/** @type {HTMLButtonElement | null} */
let workspaceApplyButton = null;
const RESPONSIVE_MENU_QUERY = '(max-width: 768px)';
/** @type {MediaQueryList | null} */
const responsivePanelQuery = typeof window !== 'undefined' ? window.matchMedia(RESPONSIVE_MENU_QUERY) : null;
let menuWasToggledManually = false;

function updateBlockCount() {
  if (blockCountElement) {
    blockCountElement.textContent = blocks.size.toString();
  }

  if (!blockCountByTypeElement) {
    return;
  }

  /** @type {Record<string, number>} */
  const counts = {};
  Object.keys(BLOCK_TYPES).forEach((typeId) => {
    counts[typeId] = 0;
  });

  blocks.forEach((mesh) => {
    const typeId = mesh.userData?.typeId && BLOCK_TYPES[mesh.userData.typeId] ? mesh.userData.typeId : 'standard';
    counts[typeId] = (counts[typeId] ?? 0) + 1;
  });

  const items = blockCountByTypeElement.querySelectorAll('[data-type]');
  items.forEach((item) => {
    const typeId = item.getAttribute('data-type');
    if (!typeId) {
      return;
    }
    const valueElement = item.querySelector('strong');
    if (!valueElement) {
      return;
    }
    const value = counts[typeId] ?? 0;
    valueElement.textContent = value.toString();
  });
}

function setMenuCollapsed(collapsed) {
  appRoot.classList.toggle('menu-collapsed', collapsed);
  if (menuToggleButton) {
    menuToggleButton.setAttribute('aria-expanded', (!collapsed).toString());
  }
  if (controlPanelElement) {
    controlPanelElement.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  }
  resizeRenderer();
}

function syncMenuWithViewport(forceCollapse = false) {
  if (!responsivePanelQuery) {
    setMenuCollapsed(false);
    menuWasToggledManually = false;
    return;
  }

  if (!responsivePanelQuery.matches) {
    setMenuCollapsed(false);
    menuWasToggledManually = false;
    return;
  }

  if (forceCollapse || !menuWasToggledManually) {
    setMenuCollapsed(true);
  }
}

function syncOrientationControls() {
  const total = orientations.length;
  if (orientationIndicatorElement) {
    orientationIndicatorElement.textContent = total > 0 ? `${currentOrientationIndex + 1} / ${total}` : '—';
  }

  const canRotate = total > 1;
  if (rotatePrevButton) {
    rotatePrevButton.disabled = !canRotate;
  }
  if (rotateNextButton) {
    rotateNextButton.disabled = !canRotate;
  }
}

function resizeOrientationPreviewRenderer() {
  if (!orientationPreviewRenderer || !orientationPreviewElement || !orientationPreviewCamera) {
    return;
  }
  const size = Math.max(orientationPreviewElement.clientWidth, 1);
  orientationPreviewRenderer.setPixelRatio(window.devicePixelRatio);
  orientationPreviewRenderer.setSize(size, size, false);
  orientationPreviewCamera.aspect = 1;
  orientationPreviewCamera.updateProjectionMatrix();
}

function updateOrientationPreviewCamera() {
  if (!orientationPreviewCamera || !orientationPreviewLight) {
    return;
  }
  const orientation = getOrientation(currentOrientationIndex);
  const maxDimension = Math.max(orientation.size.x, orientation.size.y, orientation.size.z);
  const distance = maxDimension * 2.4;
  orientationPreviewCamera.position.set(distance, distance, distance);
  orientationPreviewCamera.lookAt(0, 0, 0);
  orientationPreviewLight.position.set(distance * 1.2, distance * 1.4, distance * 1.1);
  orientationPreviewLight.target.position.set(0, 0, 0);
  orientationPreviewLight.target.updateMatrixWorld();
}

function updateOrientationPreview(options = {}) {
  if (!orientationPreviewMesh) {
    return;
  }

  const orientation = getOrientation(currentOrientationIndex);
  orientationPreviewMesh.geometry = blockGeometry;
  orientationPreviewMesh.material = currentBlockMaterials;
  orientationPreviewMesh.rotation.copy(orientation.rotation);
  orientationPreviewMesh.position.set(0, 0, 0);

  if (orientationPreviewGround) {
    orientationPreviewGround.position.set(0, -orientation.size.y / 2, 0);
  }

  if (options.resetCamera) {
    updateOrientationPreviewCamera();
  }

  if (orientationPreviewDetailsElement) {
    orientationPreviewDetailsElement.textContent = `${currentBlockType.label} • ${formatOrientationLabel(orientation.name)}`;
  }
}

function initOrientationPreview() {
  if (orientationPreviewMesh || !orientationPreviewElement) {
    return;
  }

  orientationPreviewScene = new THREE.Scene();
  orientationPreviewScene.background = new THREE.Color('#f6f8fb');

  orientationPreviewCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);

  orientationPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  orientationPreviewRenderer.shadowMap.enabled = false;
  orientationPreviewRenderer.setClearAlpha(0);
  orientationPreviewElement.appendChild(orientationPreviewRenderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  orientationPreviewLight = new THREE.DirectionalLight(0xffffff, 0.9);
  orientationPreviewScene.add(ambient);
  orientationPreviewScene.add(orientationPreviewLight);
  orientationPreviewLight.target.position.set(0, 0, 0);
  orientationPreviewScene.add(orientationPreviewLight.target);

  const groundGeometry = new THREE.PlaneGeometry(60, 60);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#dbe6f4', metalness: 0, roughness: 1, side: THREE.DoubleSide });
  orientationPreviewGround = new THREE.Mesh(groundGeometry, groundMaterial);
  orientationPreviewGround.rotateX(-Math.PI / 2);
  orientationPreviewScene.add(orientationPreviewGround);

  orientationPreviewMesh = new THREE.Mesh(blockGeometry, currentBlockMaterials);
  orientationPreviewMesh.castShadow = false;
  orientationPreviewMesh.receiveShadow = false;
  orientationPreviewScene.add(orientationPreviewMesh);

  resizeOrientationPreviewRenderer();
  updateOrientationPreview({ resetCamera: true });
}

function getGeometryForType(type) {
  if (!geometryCache.has(type.id)) {
    geometryCache.set(type.id, type.createGeometry());
  }
  return geometryCache.get(type.id);
}

function setBlockType(typeId, options = {}) {
  const { force = false } = options;
  const nextType = BLOCK_TYPES[typeId] || BLOCK_TYPES.standard;

  if (!force && currentBlockType === nextType) {
    return;
  }

  currentBlockSize = { ...nextType.size };
  blockGeometry = getGeometryForType(nextType);
  currentBlockMaterials = nextType.createMaterials();
  if (nextType.id === BLOCK_TYPES.rotunda.id) {
    resetRotundaOuterMaterial();
  }
  const orientationData = getOrientationData(nextType.id);
  orientations = orientationData.orientations;
  currentBlockType = nextType;
  currentOrientationIndex = 0;

  if (previewMesh) {
    previewMesh.geometry = blockGeometry;
    previewMesh.rotation.copy(getOrientation(currentOrientationIndex).rotation);
  }

  if (blockTypeSelect && blockTypeSelect.value !== nextType.id) {
    blockTypeSelect.value = nextType.id;
  }

  controls.target.set(0, currentBlockSize.y / 2, 0);
  dirLight.target.position.set(0, currentBlockSize.y / 2, 0);
  dirLight.target.updateMatrixWorld();
  updateDirectionalLightPosition();

  hoveredPlacement = null;
  updatePreview();

  updateOrientationPreview({ resetCamera: true });
  syncOrientationControls();
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
    coord.x * gridUnit.x,
    coord.y * gridUnit.y + orientation.size.y / 2,
    coord.z * gridUnit.z
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
    x: roundCoordValue(snapAxis(center.x, gridUnit.x, getGridStep(orientation, 'x'))),
    y: roundCoordValue((center.y - orientation.size.y / 2) / gridUnit.y),
    z: roundCoordValue(snapAxis(center.z, gridUnit.z, getGridStep(orientation, 'z'))),
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
  const posX = coord.x * gridUnit.x;
  const posZ = coord.z * gridUnit.z;

  const withinX = posX + halfX <= gridLimit * gridUnit.x && posX - halfX >= -gridLimit * gridUnit.x;
  const withinZ = posZ + halfZ <= gridLimit * gridUnit.z && posZ - halfZ >= -gridLimit * gridUnit.z;
  const topY = coord.y * gridUnit.y + orientation.size.y;
  const withinY = coord.y >= 0 && topY <= (heightLimit + 1) * gridUnit.y;

  return withinX && withinZ && withinY;
}

function normalizeIgnoredMeshes(ignoreMeshes) {
  if (!ignoreMeshes) {
    return new Set();
  }
  if (ignoreMeshes instanceof Set) {
    return ignoreMeshes;
  }
  if (Array.isArray(ignoreMeshes)) {
    return new Set(ignoreMeshes);
  }
  return new Set([ignoreMeshes]);
}

function getBoundingBoxForMesh(mesh, overrides) {
  if (!mesh) {
    return null;
  }
  if (overrides && overrides.has(mesh)) {
    return overrides.get(mesh);
  }
  return mesh.userData?.boundingBox ?? null;
}

function hasNeighbor(candidateBox, { ignoreMeshes = null, boundingBoxesOverride = null } = {}) {
  if (candidateBox.min.y <= EPSILON) {
    return true;
  }

  const ignored = normalizeIgnoredMeshes(ignoreMeshes);
  let supported = false;

  blocks.forEach((mesh) => {
    if (supported || ignored.has(mesh)) {
      return;
    }

    const otherBox = getBoundingBoxForMesh(mesh, boundingBoxesOverride);
    if (!otherBox) {
      return;
    }
    if (Math.abs(otherBox.max.y - candidateBox.min.y) <= EPSILON && horizontalSupportOverlap(candidateBox, otherBox)) {
      supported = true;
    }
  });

  if (supported) {
    return true;
  }

  let touchesSide = false;
  blocks.forEach((mesh) => {
    if (touchesSide || ignored.has(mesh)) {
      return;
    }
    const otherBox = getBoundingBoxForMesh(mesh, boundingBoxesOverride);
    if (!otherBox) {
      return;
    }
    touchesSide = facesTouch(candidateBox, otherBox);
  });

  return touchesSide;
}

function canPlace(coord, orientation, { ignoreMeshes = null, boundingBoxesOverride = null } = {}) {
  if (!isInsideBounds(coord, orientation)) {
    return false;
  }

  const candidateBox = getBoundingBox(coord, orientation);
  const ignored = normalizeIgnoredMeshes(ignoreMeshes);

  for (const mesh of blocks) {
    if (ignored.has(mesh)) {
      continue;
    }
    const otherBox = getBoundingBoxForMesh(mesh, boundingBoxesOverride);
    if (!otherBox) {
      continue;
    }
    if (boxesOverlap(candidateBox, otherBox)) {
      return false;
    }
  }

  return hasNeighbor(candidateBox, { ignoreMeshes, boundingBoxesOverride });
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
    typeId: currentBlockType.id,
    boundingBox,
  };
  scene.add(mesh);
  blocks.add(mesh);
  updateBlockCount();
}

function removeBlock(mesh) {
  deselectBlock(mesh);
  scene.remove(mesh);
  blocks.delete(mesh);
  updateBlockCount();
}

function snapAxis(value, baseSize, step) {
  const effectiveStep = step > 0 ? step : 1;
  const normalized = value / baseSize;
  return Math.round(normalized / effectiveStep) * effectiveStep;
}

function roundCoordValue(value) {
  return Math.round(value * 1000) / 1000;
}

function createCenteredPlacementsFromExport(exportData, typeId) {
  const { orientations: typeOrientations } = getOrientationData(typeId);
  const placements = [];
  const boundingBoxes = [];

  exportData.coordinates.forEach((entry) => {
    const orientationIndex = getOrientationIndexByName(typeId, entry.orientation);
    if (orientationIndex === -1) {
      return;
    }

    const coord = {
      x: roundCoordValue(entry.x),
      y: roundCoordValue(entry.y),
      z: roundCoordValue(entry.z),
    };

    const orientation = typeOrientations[orientationIndex];
    const boundingBox = getBoundingBox(coord, orientation);
    placements.push({ coord, orientationIndex });
    boundingBoxes.push(boundingBox);
  });

  if (placements.length === 0) {
    return placements;
  }

  const union = boundingBoxes.reduce((accumulator, box) => {
    if (!accumulator) {
      return box.clone();
    }
    return accumulator.union(box);
  }, null);

  if (!union) {
    return placements;
  }

  const center = union.getCenter(new THREE.Vector3());
  const offset = {
    x: roundCoordValue(center.x / gridUnit.x),
    z: roundCoordValue(center.z / gridUnit.z),
  };

  return placements.map((placement) => ({
    coord: {
      x: roundCoordValue(placement.coord.x - offset.x),
      y: placement.coord.y,
      z: roundCoordValue(placement.coord.z - offset.z),
    },
    orientationIndex: placement.orientationIndex,
  }));
}

function applyPlacementsForType(typeId, placements) {
  setBlockType(typeId, { force: true });
  placements.forEach((placement) => {
    const orientation = getOrientation(placement.orientationIndex);
    if (canPlace(placement.coord, orientation)) {
      addBlock(placement);
    }
  });
}

function getPlacementFromIntersection(intersection) {
  if (!intersection) {
    return null;
  }

  if (intersection.object === ground) {
    const point = intersection.point;
    const orientation = getOrientation(currentOrientationIndex);
    const coord = {
      x: roundCoordValue(snapAxis(point.x, gridUnit.x, getGridStep(orientation, 'x'))),
      y: 0,
      z: roundCoordValue(snapAxis(point.z, gridUnit.z, getGridStep(orientation, 'z'))),
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
      coord.x = roundCoordValue(snapAxis(intersection.point.x, gridUnit.x, getGridStep(orientation, 'x')));
      coord.z = roundCoordValue(snapAxis(intersection.point.z, gridUnit.z, getGridStep(orientation, 'z')));
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

  if (event.ctrlKey || event.metaKey) {
    if (hoveredBlock) {
      toggleBlockSelection(hoveredBlock, { additive: true });
    } else {
      clearSelection();
    }
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
    clearSelection();
    return;
  }

  if (!hoveredBlock && selectedBlocks.size > 0) {
    clearSelection();
  }
}

function clearScene() {
  clearSelection();
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
    blockSize: currentBlockSize,
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
  syncOrientationControls();
  updateOrientationPreview();
}

function isInteractiveElementFocused() {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }
  if (activeElement.isContentEditable) {
    return true;
  }
  const tagName = activeElement.tagName;
  if (tagName === 'INPUT') {
    return true;
  }
  return tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function handleKeyDown(event) {
  const isInteractive = isInteractiveElementFocused();

  if (!isInteractive && event.code === 'KeyR') {
    event.preventDefault();
    cycleOrientation(event.shiftKey ? -1 : 1);
    return;
  }

  if (!isInteractive && ROTATION_DELTAS[event.key]) {
    event.preventDefault();
    rotateSelectedBlocksByKey(event.key);
    return;
  }

  if (!isInteractive && event.key === 'Escape') {
    if (selectedBlocks.size > 0) {
      event.preventDefault();
      clearSelection();
    }
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

async function handleBackgroundImageChange(event) {
  const input = event.target;
  const file = input.files && input.files[0];

  if (!file) {
    setSceneBackgroundColor(backgroundColorInput ? backgroundColorInput.value : defaultBackgroundColor, {
      skipImageReset: true,
    });
    return;
  }

  try {
    const texture = await loadTextureFromFile(file);
    clearBackgroundTexture();
    currentBackgroundTexture = texture;
    scene.background = texture;
  } catch (error) {
    console.error(error);
    alert(error.message);
    input.value = '';
    resetBackground();
  }
}

window.addEventListener('resize', () => {
  resizeRenderer();
  resizeOrientationPreviewRenderer();
});

window.addEventListener('keydown', handleKeyDown);

orientationIndicatorElement = document.querySelector('#orientation-indicator');
rotatePrevButton = document.querySelector('#rotate-prev');
rotateNextButton = document.querySelector('#rotate-next');
orientationPreviewElement = document.querySelector('#orientation-preview');
orientationPreviewDetailsElement = document.querySelector('#orientation-preview-details');
const resetViewButton = document.querySelector('#reset-view');
const toggleGridButton = document.querySelector('#toggle-grid');

initOrientationPreview();
resizeRenderer();

if (rotatePrevButton) {
  rotatePrevButton.addEventListener('click', () => {
    cycleOrientation(-1);
  });
}

if (rotateNextButton) {
  rotateNextButton.addEventListener('click', () => {
    cycleOrientation(1);
  });
}

if (resetViewButton) {
  resetViewButton.addEventListener('click', () => {
    resetCameraView();
  });
}

if (toggleGridButton) {
  updateGridToggleButtonState(toggleGridButton);
  toggleGridButton.addEventListener('click', () => {
    gridHelper.visible = !gridHelper.visible;
    updateGridToggleButtonState(toggleGridButton);
  });
}

const resetButton = document.querySelector('#reset');
const exportButton = document.querySelector('#export');
const topBottomInput = document.querySelector('#texture-top-bottom');
const sidesInput = document.querySelector('#texture-sides');
const resetTexturesButton = document.querySelector('#reset-textures');
backgroundColorInput = document.querySelector('#background-color');
backgroundImageInput = document.querySelector('#background-image');
const resetBackgroundButton = document.querySelector('#reset-background');
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

const FORT_MODEL_EXPORT = {
  unit: 'cm',
  blockSize: { x: 6, y: 12, z: 6 },
  count: 29,
  coordinates: [
    { x: -8, y: 0, z: 2, orientation: 'standing' },
    { x: -6.5, y: 0, z: 2, orientation: 'lying-x' },
    { x: -5, y: 0, z: 2, orientation: 'standing' },
    { x: -3.5, y: 0, z: 2, orientation: 'lying-x' },
    { x: -2, y: 0, z: 2, orientation: 'standing' },
    { x: -8, y: 0, z: 3.5, orientation: 'lying-z' },
    { x: -5, y: 0, z: 3.5, orientation: 'lying-z' },
    { x: -2, y: 0, z: 3.5, orientation: 'lying-z' },
    { x: -8, y: 0, z: 5, orientation: 'standing' },
    { x: -6.5, y: 0, z: 5, orientation: 'lying-x' },
    { x: -5, y: 0, z: 5, orientation: 'standing' },
    { x: -3.5, y: 0, z: 5, orientation: 'lying-x' },
    { x: -2, y: 0, z: 5, orientation: 'standing' },
    { x: -8, y: 0, z: 6.5, orientation: 'lying-z' },
    { x: -5, y: 0, z: 6.5, orientation: 'lying-z' },
    { x: -2, y: 0, z: 6.5, orientation: 'lying-z' },
    { x: -8, y: 0, z: 8, orientation: 'standing' },
    { x: -6.5, y: 0, z: 8, orientation: 'lying-x' },
    { x: -5, y: 0, z: 8, orientation: 'standing' },
    { x: -3.5, y: 0, z: 8, orientation: 'lying-x' },
    { x: -2, y: 0, z: 8, orientation: 'standing' },
    { x: -5, y: 0.5, z: 4, orientation: 'standing' },
    { x: -6, y: 0.5, z: 5, orientation: 'standing' },
    { x: -4, y: 0.5, z: 5, orientation: 'standing' },
    { x: -5, y: 0.5, z: 6, orientation: 'standing' },
    { x: -6, y: 1, z: 4, orientation: 'standing' },
    { x: -4, y: 1, z: 4, orientation: 'standing' },
    { x: -6, y: 1, z: 6, orientation: 'standing' },
    { x: -4, y: 1, z: 6, orientation: 'standing' },
  ],
};

function buildFortModel() {
  const placements = createCenteredPlacementsFromExport(FORT_MODEL_EXPORT, 'standard');
  applyPlacementsForType('standard', placements);
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

function buildRotundaModel() {
  const placements = [{ coord: { x: 0, y: 0, z: 0 }, orientationIndex: 0 }];

  placements.forEach((placement) => {
    const orientation = getOrientation(placement.orientationIndex);
    if (canPlace(placement.coord, orientation)) {
      addBlock(placement);
    }
  });
}

const MODEL_PRESETS = [
  { id: 'fort', label: 'Fort', build: () => buildFortModel() },
  { id: 'empty', label: 'Nowy pusty projekt', build: () => setBlockType('standard', { force: true }) },
  {
    id: 'castle-demo',
    label: 'Zamek demonstracyjny',
    build: () => {
      setBlockType('standard', { force: true });
      buildCastleModel();
    },
  },
  {
    id: 'connector-demo',
    label: 'Łączniki – przykład',
    build: () => {
      setBlockType('connector', { force: true });
      buildConnectorModel();
    },
  },
  {
    id: 'rotunda-demo',
    label: 'Rotunda – przykład',
    build: () => {
      setBlockType('rotunda', { force: true });
      buildRotundaModel();
    },
  },
];

function loadModelPreset(modelId, { skipSelectSync = false } = {}) {
  const preset = MODEL_PRESETS.find((item) => item.id === modelId);
  if (!preset) {
    return;
  }
  clearScene();
  preset.build();
  if (!skipSelectSync && modelSelect && modelSelect.value !== modelId) {
    modelSelect.value = modelId;
  }
}

modelSelect = document.querySelector('#model-select');
blockTypeSelect = document.querySelector('#block-type');
blockCountElement = document.querySelector('#block-count');
blockCountByTypeElement = document.querySelector('#block-count-by-type');
controlPanelElement = document.querySelector('#control-panel');
menuToggleButton = document.querySelector('#menu-toggle');
menuCloseButton = document.querySelector('#menu-close');
workspaceSizeInput = document.querySelector('#workspace-size');
workspaceHeightInput = document.querySelector('#workspace-height');
workspaceApplyButton = document.querySelector('#workspace-apply');
syncWorkspaceInputs();

const tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

function activateTab(targetId) {
  if (!targetId) {
    return;
  }

  const targetPanel = tabPanels.find((panel) => panel.id === targetId);
  if (!targetPanel) {
    return;
  }

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === targetId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) {
      button.removeAttribute('tabindex');
    } else {
      button.setAttribute('tabindex', '-1');
    }
  });

  tabPanels.forEach((panel) => {
    if (panel.id === targetId) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  if (targetId === 'panel-project') {
    resizeOrientationPreviewRenderer();
  }
}

tabButtons.forEach((button, index) => {
  button.addEventListener('click', () => {
    activateTab(button.dataset.tabTarget);
  });

  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + tabButtons.length) % tabButtons.length;
    const nextButton = tabButtons[nextIndex];
    activateTab(nextButton.dataset.tabTarget);
    nextButton.focus();
  });
});

const initialTab = tabButtons.find((button) => button.classList.contains('is-active'));
if (initialTab) {
  activateTab(initialTab.dataset.tabTarget);
}

if (menuToggleButton) {
  menuToggleButton.addEventListener('click', () => {
    const isCollapsed = appRoot.classList.contains('menu-collapsed');
    setMenuCollapsed(!isCollapsed);
    menuWasToggledManually = true;
  });
}

if (menuCloseButton) {
  menuCloseButton.addEventListener('click', () => {
    setMenuCollapsed(true);
    menuWasToggledManually = true;
  });
}

syncMenuWithViewport(true);

if (responsivePanelQuery) {
  responsivePanelQuery.addEventListener('change', (event) => {
    if (!event.matches) {
      setMenuCollapsed(false);
      menuWasToggledManually = false;
      return;
    }
    if (!menuWasToggledManually) {
      setMenuCollapsed(true);
    }
  });
}

updateBlockCount();

const initialTypeId = blockTypeSelect ? blockTypeSelect.value : currentBlockType.id;
setBlockType(initialTypeId, { force: true });

const initialModelId = modelSelect ? modelSelect.value || 'fort' : 'fort';
if (modelSelect && !modelSelect.value) {
  modelSelect.value = initialModelId;
}
loadModelPreset(initialModelId, { skipSelectSync: true });

if (modelSelect) {
  modelSelect.addEventListener('change', (event) => {
    loadModelPreset(event.target.value);
  });
}

if (blockTypeSelect) {
  blockTypeSelect.addEventListener('change', (event) => {
    setBlockType(event.target.value);
  });
}

if (workspaceApplyButton) {
  workspaceApplyButton.addEventListener('click', () => {
    applyWorkspaceInputs();
  });
}

const handleWorkspaceInputKeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyWorkspaceInputs();
  }
};

if (workspaceSizeInput) {
  workspaceSizeInput.addEventListener('keydown', handleWorkspaceInputKeydown);
}
if (workspaceHeightInput) {
  workspaceHeightInput.addEventListener('keydown', handleWorkspaceInputKeydown);
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

if (backgroundColorInput) {
  const normalized = normalizeHexColor(backgroundColorInput.value || defaultBackgroundColor);
  backgroundColorInput.value = normalized;
  backgroundColorInput.addEventListener('input', (event) => {
    const value = normalizeHexColor(event.target.value);
    setSceneBackgroundColor(value);
    if (backgroundColorInput && backgroundColorInput.value !== value) {
      backgroundColorInput.value = value;
    }
  });
}

if (backgroundImageInput) {
  backgroundImageInput.addEventListener('change', handleBackgroundImageChange);
}

if (resetBackgroundButton) {
  resetBackgroundButton.addEventListener('click', () => {
    if (backgroundColorInput) {
      backgroundColorInput.value = defaultBackgroundColor;
    }
    resetBackground();
  });
}

if (ambientIntensityInput) {
  ambientIntensityInput.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value)) {
      lightingState.ambientIntensity = THREE.MathUtils.clamp(value, 0, 3);
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
      lightingState.directionalIntensity = THREE.MathUtils.clamp(value, 0, 4);
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
  if (orientationPreviewRenderer && orientationPreviewScene && orientationPreviewCamera) {
    orientationPreviewRenderer.render(orientationPreviewScene, orientationPreviewCamera);
  }
  requestAnimationFrame(animate);
}

animate();

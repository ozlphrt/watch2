import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { GUI } from 'lil-gui';
import { createWatchFace } from './watch/watchFace.js';
import { createWatchArms } from './watch/watchArms.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Camera position
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.062);
scene.add(ambientLight);

// Main directional light (sun-like)
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.17);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
// Configure shadow camera for better shadow quality
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.bias = -0.0001;
scene.add(directionalLight);

// Additional fill light for better visibility
const fillLight = new THREE.DirectionalLight(0xffffff, 0.884);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

// Physics
let physicsWorld = null;
let RAPIER_READY = false;
let arms = null; // Watch arms group

// Game state
const gameState = {
  selectedCubes: [],
  cubes: [],
  score: 0,
  pairsRemoved: 0,
  selectionLights: [],
  pairAttracting: false,
  matchChecked: false,
};

// Colors and Greek letters
const COLORS = [
  { name: 'red', hex: 0xff0000 },
  { name: 'blue', hex: 0x0000ff },
  { name: 'yellow', hex: 0xffff00 },
];

const GREEK_LETTERS = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];

// Initialize Rapier
async function initPhysics() {
  await RAPIER.init();
  RAPIER_READY = true;
  
  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
  physicsWorld = new RAPIER.World(gravity);
  
  // Create ground (watch face)
  const groundSize = 2.0;
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
  const groundBody = physicsWorld.createRigidBody(groundBodyDesc);
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, 0.1, groundSize);
  groundColliderDesc.setTranslation(0, -0.1, 0);
  physicsWorld.createCollider(groundColliderDesc, groundBody);
  
  // Create watch face
  const watchGroup = createWatchFace();
  scene.add(watchGroup);
  
  // Create watch arms
  arms = createWatchArms();
  scene.add(arms);
  
  // Spawn initial cubes
  spawnInitialCubes();
}

// Create texture map for cube faces (shows letter in color)
function createLetterTexture(letter, color, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  
  // Larger font size to fill the surface (increased from 0.6 to 0.85)
  const fontSize = size * 0.85;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw dark outline first (multiple strokes for thicker, bolder outline)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(4, size * 0.04); // Much thicker outline
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  
  // Draw outline multiple times for much thicker, bolder effect
  for (let i = 0; i < 5; i++) {
    ctx.strokeText(letter, size / 2, size / 2);
  }
  
  // Draw letter in the cube's color on top
  ctx.fillStyle = color;
  ctx.fillText(letter, size / 2, size / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Create emissive map for highlighting letters (glowing effect)
function createEmissiveMap(letter, color, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Black background (only letter will glow)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  
  // Match the font size from the main texture
  const fontSize = size * 0.85;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw dark outline for emissive map too (so it matches)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(4, size * 0.04); // Much thicker outline
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  
  // Draw outline multiple times for much thicker, bolder effect
  for (let i = 0; i < 5; i++) {
    ctx.strokeText(letter, size / 2, size / 2);
  }
  
  // Draw letter in bright color for glow
  ctx.fillStyle = color;
  ctx.fillText(letter, size / 2, size / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Create cube with Greek letter
function createCubeWithLetter(size) {
  const colorIndex = Math.floor(Math.random() * COLORS.length);
  const letterIndex = Math.floor(Math.random() * GREEK_LETTERS.length);
  const color = COLORS[colorIndex];
  const letter = GREEK_LETTERS[letterIndex];
  
  // Use RoundedBoxGeometry for rounded edges and corners
  const geometry = new RoundedBoxGeometry(size, size, size, 4, size * 0.1);
  const materials = [];
  
  // Create color hex string for textures
  const colorHex = `#${color.hex.toString(16).padStart(6, '0')}`;
  
  // Create texture map (shows letter on white background)
  const letterTexture = createLetterTexture(letter, colorHex, 256);
  
  // Create emissive map for highlighting (glowing effect when selected)
  const emissiveMap = createEmissiveMap(letter, colorHex, 256);
  
  // Create material for all faces with texture and emissive map
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // White cube walls
    map: letterTexture, // Texture showing the Greek letter in color
    metalness: 0.0,
    roughness: 0.5,
    emissive: 0x000000, // No emission by default
    emissiveIntensity: 0,
    emissiveMap: emissiveMap, // Used for highlighting when selected
  });
  
  // All 6 faces use the same material (same letter and color on all faces)
  for (let i = 0; i < 6; i++) {
    materials.push(material);
  }
  
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true; // Cubes cast shadows
  mesh.receiveShadow = true; // Cubes can also receive shadows from other objects
  mesh.userData.material = material;
  mesh.userData.faceShapes = [{ shape: letter, color: color.name }];
  
  return { mesh, letter, color: color.name, faceShapes: [{ shape: letter, color: color.name }] };
}

// Spawn initial cubes
function spawnInitialCubes() {
  const cubeSize = 0.2;
  const count = 20;
  
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 3;
    const y = 2 + Math.random() * 2;
    const z = (Math.random() - 0.5) * 3;
    
    const { mesh, faceShapes } = createCubeWithLetter(cubeSize);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    
    // Create physics body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    const body = physicsWorld.createRigidBody(bodyDesc);
    body.setTranslation(new RAPIER.Vector3(x, y, z));
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(cubeSize / 2, cubeSize / 2, cubeSize / 2);
    physicsWorld.createCollider(colliderDesc, body);
    
    gameState.cubes.push({
      mesh,
      rigidBody: body,
      faceShapes,
    });
  }
}

// Raycasting for selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
  if (gameState.pairAttracting) return;
  
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(gameState.cubes.map(c => c.mesh));
  
  if (intersects.length > 0) {
    const cubeMesh = intersects[0].object;
    const cubeIndex = gameState.cubes.findIndex(c => c.mesh === cubeMesh);
    if (cubeIndex !== -1) {
      selectCube(cubeIndex);
    }
  }
}

renderer.domElement.addEventListener('click', onMouseClick);

// Select cube
function selectCube(index) {
  if (gameState.pairAttracting) {
    console.log("Cannot select/deselect while pairs are attracting.");
    return;
  }
  
  const cube = gameState.cubes[index];
  if (!cube) return;
  
  const isSelected = gameState.selectedCubes.includes(index);
  
  if (isSelected) {
    // Deselect
    gameState.selectedCubes = gameState.selectedCubes.filter(i => i !== index);
    const material = cube.mesh.userData.material;
    if (material) {
      material.color.setHex(0xffffff);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
    }
    
    // Remove light
    const lightIndex = gameState.selectionLights.findIndex(l => l.cubeIndex === index);
    if (lightIndex !== -1) {
      const lightData = gameState.selectionLights[lightIndex];
      scene.remove(lightData.light);
      lightData.light.dispose();
      gameState.selectionLights.splice(lightIndex, 1);
    }
    
    gameState.matchChecked = false;
  } else {
    // Select
    if (gameState.selectedCubes.length >= 2) {
      // Deselect first cube
      const firstIndex = gameState.selectedCubes[0];
      selectCube(firstIndex);
    }
    
    gameState.selectedCubes.push(index);
    const material = cube.mesh.userData.material;
    const cubeColor = cube.faceShapes[0].color;
    const colorObj = COLORS.find(c => c.name === cubeColor);
    const colorHex = colorObj?.hex || 0xffffff;
    
    // Brightened colors for highlighting
    let emissiveColorHex = colorHex;
    if (cubeColor === 'red') emissiveColorHex = 0xff2222;
    else if (cubeColor === 'blue') emissiveColorHex = 0x0022ff;
    else if (cubeColor === 'yellow') emissiveColorHex = 0xffff00;
    
    if (material) {
      material.color.setHex(0xffffff);
      material.emissive.setHex(emissiveColorHex);
      // Yellow is naturally brighter, so reduce its intensity more
      material.emissiveIntensity = cubeColor === 'yellow' ? 2.5 : 6.0;
      material.metalness = 0.1;
      material.roughness = 0.2;
      material.needsUpdate = true;
    }
    
    // Add point light
    const cubePos = cube.rigidBody.translation();
    const pointLight = new THREE.PointLight(colorHex, 0.5, 5.0);
    pointLight.position.set(cubePos.x, cubePos.y, cubePos.z);
    scene.add(pointLight);
    gameState.selectionLights.push({ light: pointLight, cubeIndex: index });
    
    // NEW BEHAVIOR: When 2 cubes are selected, check match ONCE and start attraction if matched
    if (gameState.selectedCubes.length === 2 && !gameState.pairAttracting && !gameState.matchChecked) {
      const [idx1, idx2] = gameState.selectedCubes;
      const c1 = gameState.cubes[idx1];
      const c2 = gameState.cubes[idx2];
      
      if (c1 && c2) {
        // Mark as checked immediately to prevent repeated checks
        gameState.matchChecked = true;
        
        const face1 = c1.faceShapes[0];
        const face2 = c2.faceShapes[0];
        
        if (face1.shape === face2.shape && face1.color === face2.color) {
          // MATCH: Start attraction - cubes will move towards each other
          gameState.pairAttracting = true;
          console.log(`✓ Match! ${face1.shape} ${face1.color} - starting attraction`);
        } else {
          // NO MATCH: Deselect after delay
          setTimeout(() => {
            // Only deselect if still not attracting (safety check)
            if (!gameState.pairAttracting && gameState.selectedCubes.length === 2) {
              gameState.selectedCubes.forEach(idx => {
                const c = gameState.cubes[idx];
                if (!c) return;
                const m = c.mesh.userData.material;
                if (m) {
                  m.color.setHex(0xffffff);
                  m.emissive.setHex(0x000000);
                  m.emissiveIntensity = 0;
                  m.needsUpdate = true;
                }
                const lightIdx = gameState.selectionLights.findIndex(l => l.cubeIndex === idx);
                if (lightIdx !== -1) {
                  const lightData = gameState.selectionLights[lightIdx];
                  scene.remove(lightData.light);
                  lightData.light.dispose();
                  gameState.selectionLights.splice(lightIdx, 1);
                }
              });
              gameState.selectedCubes = [];
              gameState.matchChecked = false;
            }
          }, 1000);
        }
      }
    }
  }
}

// Remove cubes
function removeCubes(indices) {
  const sortedIndices = [...indices].sort((a, b) => b - a);
  
  sortedIndices.forEach(index => {
    const cube = gameState.cubes[index];
    if (!cube) return;
    
    // Remove from scene
    scene.remove(cube.mesh);
    cube.mesh.geometry.dispose();
    if (Array.isArray(cube.mesh.material)) {
      cube.mesh.material.forEach(m => m.dispose());
    } else {
      cube.mesh.material.dispose();
    }
    
    // Remove from physics
    physicsWorld.removeRigidBody(cube.rigidBody);
    
    // Remove selection light
    const lightIndex = gameState.selectionLights.findIndex(l => l.cubeIndex === index);
    if (lightIndex !== -1) {
      const lightData = gameState.selectionLights[lightIndex];
      scene.remove(lightData.light);
      lightData.light.dispose();
      gameState.selectionLights.splice(lightIndex, 1);
    }
  });
  
  // Remove from array
  sortedIndices.forEach(index => {
    gameState.cubes.splice(index, 1);
  });
  
  // Update selection indices
  gameState.selectedCubes = gameState.selectedCubes
    .map(idx => {
      let newIdx = idx;
      sortedIndices.forEach(removedIdx => {
        if (idx > removedIdx) newIdx--;
      });
      return newIdx;
    })
    .filter(idx => !sortedIndices.includes(gameState.cubes.findIndex((c, i) => i === idx)));
  
  // Clear selection
  gameState.selectedCubes = [];
  gameState.pairAttracting = false;
  gameState.matchChecked = false;
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  if (!RAPIER_READY || !physicsWorld) return;
  
  // Update watch arms (animate based on current time)
  if (arms) {
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes();
    const hours = now.getHours();

    const secondsRotation = Math.PI - (seconds / 60) * Math.PI * 2;
    const minutesRotation = Math.PI - (minutes / 60) * Math.PI * 2;
    const hoursRotation = Math.PI - ((hours % 12) / 12) * Math.PI * 2;

    if (arms.userData && arms.userData.secondHand) {
      arms.userData.secondHand.rotation.y = secondsRotation;
    }
    if (arms.userData && arms.userData.minuteHand) {
      arms.userData.minuteHand.rotation.y = minutesRotation;
    }
    if (arms.userData && arms.userData.hourHand) {
      arms.userData.hourHand.rotation.y = hoursRotation;
    }
  }
  
  // Physics step
  physicsWorld.step();
  
  // Sync mesh positions with physics
  gameState.cubes.forEach(cube => {
    const pos = cube.rigidBody.translation();
    cube.mesh.position.set(pos.x, pos.y, pos.z);
    const rot = cube.rigidBody.rotation();
    cube.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  });
  
  // Update selection lights
  gameState.selectionLights.forEach(lightData => {
    const cube = gameState.cubes[lightData.cubeIndex];
    if (cube) {
      const pos = cube.rigidBody.translation();
      lightData.light.position.set(pos.x, pos.y, pos.z);
    }
  });
  
  // Handle pair attraction
  if (gameState.pairAttracting && gameState.selectedCubes.length === 2) {
    const [index1, index2] = gameState.selectedCubes;
    const cube1 = gameState.cubes[index1];
    const cube2 = gameState.cubes[index2];
    
    if (cube1 && cube2) {
      const pos1 = cube1.rigidBody.translation();
      const pos2 = cube2.rigidBody.translation();
      
      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dz = pos2.z - pos1.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance > 0.1) {
        const attractionForce = 5.0;
        const invDistance = 1.0 / distance;
        const dirX = dx * invDistance;
        const dirY = dy * invDistance;
        const dirZ = dz * invDistance;
        
        const force1 = new RAPIER.Vector3(dirX * attractionForce, dirY * attractionForce, dirZ * attractionForce);
        const force2 = new RAPIER.Vector3(-dirX * attractionForce, -dirY * attractionForce, -dirZ * attractionForce);
        cube1.rigidBody.applyImpulse(force1, true);
        cube2.rigidBody.applyImpulse(force2, true);
      } else {
        // Cubes are close, remove them
        const face1 = cube1.faceShapes[0];
        gameState.score += 10;
        gameState.pairsRemoved++;
        console.log(`Match! Removed pair (${face1.shape} ${face1.color}). Score: ${gameState.score}, Pairs: ${gameState.pairsRemoved}`);
        removeCubes([index1, index2]);
        gameState.pairAttracting = false;
        gameState.matchChecked = false;
        gameState.selectedCubes = [];
      }
    }
  }
  
  // Update debug panel stats
  if (typeof gameParams !== 'undefined') {
    gameParams.score = gameState.score;
    gameParams.pairsRemoved = gameState.pairsRemoved;
    gameParams.cubeCount = gameState.cubes.length;
  }
  
  controls.update();
  renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug Panel
const gui = new GUI({ title: 'Debug Panel', width: 300 });
// Press 'H' to toggle visibility

// Camera controls
const cameraFolder = gui.addFolder('Camera');
const cameraParams = {
  x: camera.position.x,
  y: camera.position.y,
  z: camera.position.z,
  reset: () => {
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    cameraParams.x = camera.position.x;
    cameraParams.y = camera.position.y;
    cameraParams.z = camera.position.z;
    cameraFolder.updateDisplay();
  }
};
cameraFolder.add(cameraParams, 'x', -20, 20).onChange((v) => { camera.position.x = v; });
cameraFolder.add(cameraParams, 'y', -20, 20).onChange((v) => { camera.position.y = v; });
cameraFolder.add(cameraParams, 'z', -20, 20).onChange((v) => { camera.position.z = v; });
cameraFolder.add(cameraParams, 'reset');
cameraFolder.open();

// Lighting controls
const lightFolder = gui.addFolder('Lighting');
const lightParams = {
  ambientIntensity: 1.062,
  directionalIntensity: 1.17,
  fillIntensity: 0.884,
  shadows: true,
};
lightFolder.add(lightParams, 'ambientIntensity', 0, 2).onChange((v) => { ambientLight.intensity = v; });
lightFolder.add(lightParams, 'directionalIntensity', 0, 2).onChange((v) => { directionalLight.intensity = v; });
lightFolder.add(lightParams, 'fillIntensity', 0, 2).onChange((v) => { fillLight.intensity = v; });
lightFolder.add(lightParams, 'shadows').onChange((v) => {
  renderer.shadowMap.enabled = v;
  directionalLight.castShadow = v;
});
lightFolder.open();

// Physics controls
const physicsFolder = gui.addFolder('Physics');
const physicsParams = {
  gravity: -9.81,
};
physicsFolder.add(physicsParams, 'gravity', -20, 0).onChange((v) => {
  if (physicsWorld) {
    physicsWorld.gravity = new RAPIER.Vector3(0, v, 0);
  }
});
physicsFolder.open();

// Game controls
const gameFolder = gui.addFolder('Game');
const gameParams = {
  spawnCubes: () => {
    if (physicsWorld) {
      spawnInitialCubes();
    }
  },
  clearCubes: () => {
    gameState.cubes.forEach(cube => {
      scene.remove(cube.mesh);
      cube.mesh.geometry.dispose();
      if (Array.isArray(cube.mesh.material)) {
        cube.mesh.material.forEach(m => m.dispose());
      } else {
        cube.mesh.material.dispose();
      }
      if (physicsWorld) {
        physicsWorld.removeRigidBody(cube.rigidBody);
      }
    });
    gameState.cubes = [];
    gameState.selectedCubes = [];
    gameState.pairAttracting = false;
    gameState.matchChecked = false;
    // Clear lights
    gameState.selectionLights.forEach(lightData => {
      scene.remove(lightData.light);
      lightData.light.dispose();
    });
    gameState.selectionLights = [];
  },
  score: 0,
  pairsRemoved: 0,
  cubeCount: 0,
};
gameFolder.add(gameParams, 'spawnCubes');
gameFolder.add(gameParams, 'clearCubes');
gameFolder.add(gameParams, 'score').listen();
gameFolder.add(gameParams, 'pairsRemoved').listen();
gameFolder.add(gameParams, 'cubeCount').listen();
gameFolder.open();

// Toggle debug panel with 'H' key
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    if (gui._hidden) {
      gui.show();
    } else {
      gui.hide();
    }
  }
});

// Start
initPhysics().then(() => {
  animate();
});


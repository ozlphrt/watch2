import * as THREE from 'three';

/**
 * Creates a text texture from canvas
 */
export function createTextTexture(text, size = 512, aspectRatio = 1, centerSquare = false) {
  const canvas = document.createElement('canvas');
  canvas.width = size * aspectRatio; // Wider canvas if aspectRatio > 1
  canvas.height = size;
  const context = canvas.getContext('2d');
  
  // Clear canvas with transparent background
  context.clearRect(0, 0, canvas.width, canvas.height);
  
  // Use a larger, bolder font for better visibility
  context.fillStyle = '#000000';
  // Adjust font size based on text length - smaller for longer text like "MON"
  // Use smaller font to ensure text fits within bounds
  const fontSize = text.length > 2 ? size * 0.4 : size * 0.5;
  context.font = `bold ${fontSize}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  
  // If centerSquare is true, render text only in the center square area
  // This prevents text stretching when mapped to a wider plane
  if (centerSquare && aspectRatio > 1) {
    // Save context to clip to square area
    const squareSize = size;
    const offsetX = (canvas.width - squareSize) / 2;
    context.save();
    context.beginPath();
    context.rect(offsetX, 0, squareSize, squareSize);
    context.clip();
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    context.restore();
  } else {
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a watch face at the origin (Y=0)
 * Watch face lies in the XZ plane (horizontal)
 */
export function createWatchFace() {
  const group = new THREE.Group();
  
  // Main watch face disc
  // Use CircleGeometry instead - creates a flat disc in XZ plane by default
  // Transform: local (disc in XY) → world (disc in XZ)
  const faceGeometry = new THREE.CircleGeometry(3, 64); // Scaled up from 2 to 3
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.1,
    roughness: 0.7,
    side: THREE.DoubleSide // Visible from both sides
  });
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  // Rotate around X by PI/2 to move from XY plane to XZ plane (horizontal)
  face.rotation.x = Math.PI / 2; // Transform: XY plane → XZ plane
  face.receiveShadow = true; // Watch face receives shadows
  group.add(face);
  
  // Major ticks (at hour positions) - 12 ticks
  // Ticks stand vertically (along Y-axis) on the watch face, in YZ plane (green/blue surface)
  // Positioned outside the numbers
  const majorTickMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2; // Start at 12 o'clock (North/+Z)
    
    // Major tick: stands vertically on watch face, outside numbers
    const tickRadius = 2.9; // Position of tick (even further outside numbers at radius 2.5)
    const tickHeight = 0.03; // Height of tick (vertical) - even more reduced
    const tickWidth = 0.08; // Width of tick (radial thickness)
    const tickDepth = 0.08; // Depth of tick (tangential)
    
    // BoxGeometry: (width=X, height=Y, depth=Z)
    // Tick stands vertically (Y is height), extends in XZ plane
    const majorTickGeometry = new THREE.BoxGeometry(tickWidth, tickHeight, tickDepth);
    const majorTick = new THREE.Mesh(majorTickGeometry, majorTickMaterial);
    
    // Position at tick radius, standing on watch face
    const x = Math.cos(angle) * tickRadius;
    const z = Math.sin(angle) * tickRadius;
    majorTick.position.set(x, tickHeight / 2, z); // Center tick vertically on watch face
    
    // No rotation needed - tick stands vertically (default Y-up orientation)
    group.add(majorTick);
  }
  
  // Minor ticks (at 5-minute intervals) - 48 ticks (4 between each hour)
  const minorTickMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
  for (let i = 0; i < 60; i++) {
    // Skip hour positions (multiples of 5) - those are major ticks
    if (i % 5 === 0) continue;
    
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    
    // Minor tick: shorter, stands vertically, outside numbers
    const tickRadius = 2.88; // Slightly inside major ticks but even further outside numbers
    const tickHeight = 0.02; // Even more reduced height
    const tickWidth = 0.04;
    const tickDepth = 0.04;
    
    const minorTickGeometry = new THREE.BoxGeometry(tickWidth, tickHeight, tickDepth);
    const minorTick = new THREE.Mesh(minorTickGeometry, minorTickMaterial);
    
    // Position at tick radius, standing on watch face
    const x = Math.cos(angle) * tickRadius;
    const z = Math.sin(angle) * tickRadius;
    minorTick.position.set(x, tickHeight / 2, z); // Center tick vertically
    
    // No rotation needed - tick stands vertically
    group.add(minorTick);
  }
  
  // Hour numbers (1-12) as planes lying flat on watch face (XZ plane)
  const hourNumbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const numberMeshes = []; // Store number meshes for physics colliders
  
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2; // Start at 12 o'clock (North/+Z)
    
    // Hour number text as a plane (not a sprite)
    const number = hourNumbers[i];
    const textTexture = createTextTexture(number.toString(), 512);
    const textMaterial = new THREE.MeshStandardMaterial({
      map: textTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    });
    
    // Create a plane geometry for the number
    const textPlane = new THREE.PlaneGeometry(0.6, 0.6); // Scaled up from 0.4
    const textMesh = new THREE.Mesh(textPlane, textMaterial);
    
    // Position the plane flat on the watch face (in XZ plane)
    const numberRadius = 2.5; // Scaled up from 1.65
    const x = Math.cos(angle) * numberRadius;
    const z = Math.sin(angle) * numberRadius;
    
    textMesh.position.set(x, 0.09, z); // Scaled up from 0.06
    // Rotate plane to lie flat in XZ plane (same as watch face)
    textMesh.rotation.x = -Math.PI / 2; // Rotate from XY to XZ plane
    
    group.add(textMesh);
    numberMeshes.push(textMesh); // Store for physics colliders
  }
  
  // Store number meshes for physics setup
  group.userData.numberMeshes = numberMeshes;
  
  // Center pin (where arms attach)
  // Pin extends vertically (along Y-axis) from the watch face
  const pinRadius = 0.12; // Increased from 0.075 - larger diameter
  const pinHeight = 0.4; // Increased from 0.225 - taller
  const pinGeometry = new THREE.CylinderGeometry(pinRadius, pinRadius, pinHeight, 16);
  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const pin = new THREE.Mesh(pinGeometry, pinMaterial);
  // No rotation needed - cylinder default is along Y-axis (vertical)
  // Position so bottom sits on watch face (Y=0), center is at half height
  pin.position.y = pinHeight / 2; // Center of cylinder at half its height
  pin.castShadow = true; // Pin casts shadows
  group.add(pin);
  
  // Day and date display (positioned to the left of 3 o'clock, in one row)
  // 3 o'clock is at angle = (3/12) * 2π - π/2 = 0, so x = 2.5, z = 0
  // Position day and date to the left of the number 3, side by side, properly aligned
  // Day text (e.g., "MON", "TUE") - use square canvas to prevent stretching
  const dayTexture = createTextTexture('MON', 512, 1); // Square canvas - text at natural proportions
  const dayMaterial = new THREE.MeshStandardMaterial({
    map: dayTexture,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  });
  // Use a slightly wider plane (1.2:1 ratio) to prevent clipping while minimizing stretching
  const dayPlane = new THREE.PlaneGeometry(0.6, 0.5); // Slightly wider to prevent clipping, minimal stretching
  const dayMesh = new THREE.Mesh(dayPlane, dayMaterial);
  dayMesh.position.set(1.3, 0.12, 0); // To the left of 3 o'clock, aligned horizontally
  dayMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat in XZ plane (horizontal)
  dayMesh.rotation.y = 0; // No Y rotation - text faces straight
  dayMesh.rotation.z = 0; // No Z rotation - text is straight
  group.add(dayMesh);
  
  // Date text (e.g., "15", "23")
  const dateTexture = createTextTexture('15', 512);
  const dateMaterial = new THREE.MeshStandardMaterial({
    map: dateTexture,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  });
  const datePlane = new THREE.PlaneGeometry(0.45, 0.45); // Larger square plane for date
  const dateMesh = new THREE.Mesh(datePlane, dateMaterial);
  dateMesh.position.set(1.8, 0.12, 0); // Bit more spacing from MON
  dateMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat in XZ plane (horizontal)
  dateMesh.rotation.y = 0; // No Y rotation - text faces straight
  dateMesh.rotation.z = 0; // No Z rotation - text is straight
  group.add(dateMesh);
  
  // Cube counter display (positioned at midpoint between center and 9 o'clock)
  // 9 o'clock is at angle = (9/12) * 2π - π/2 = π, so position is (-2.5, 0.09, 0)
  // Midpoint between center (0, 0, 0) and 9 (-2.5, 0.09, 0) is (-1.25, 0.045, 0)
  const cubeCounterTexture = createTextTexture('0', 512);
  const cubeCounterMaterial = new THREE.MeshStandardMaterial({
    map: cubeCounterTexture,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  });
  const cubeCounterPlane = new THREE.PlaneGeometry(0.8, 0.8); // Bigger size
  const cubeCounterMesh = new THREE.Mesh(cubeCounterPlane, cubeCounterMaterial);
  cubeCounterMesh.position.set(-1.25, 0.12, 0); // Midpoint between center and 9 o'clock
  cubeCounterMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat in XZ plane (horizontal)
  cubeCounterMesh.rotation.y = 0;
  cubeCounterMesh.rotation.z = 0;
  group.add(cubeCounterMesh);
  
  // Store references for updates
  group.userData.dayMesh = dayMesh;
  group.userData.dateMesh = dateMesh;
  group.userData.dayMaterial = dayMaterial;
  group.userData.dateMaterial = dateMaterial;
  group.userData.cubeCounterMesh = cubeCounterMesh;
  group.userData.cubeCounterMaterial = cubeCounterMaterial;
  
  return group;
}


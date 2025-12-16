import * as THREE from 'three';

/**
 * Sets up coordinate system verification helpers
 * Per CURSOR_RULES.md §6.3: Display AxesHelper, GridHelper, object origins
 * 
 * Coordinate system: Right-handed, Y-up
 * X: East(+)/West(-)
 * Y: Up(+)/Down(-)
 * Z: South(+)/North(-)
 */
export function setupCoordinateSystem(scene) {
  const axesGroup = new THREE.Group();
  const axisLength = 5;
  const axisRadius = 0.1; // Thick axes
  
  // X-axis (East) - Red
  const xGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 16);
  const xMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
  const xAxis = new THREE.Mesh(xGeometry, xMaterial);
  xAxis.rotation.z = -Math.PI / 2; // Rotate to point along X-axis
  xAxis.position.x = axisLength / 2;
  axesGroup.add(xAxis);
  
  // Arrow head for X-axis
  const xArrowGeometry = new THREE.ConeGeometry(axisRadius * 2, axisRadius * 3, 16);
  const xArrow = new THREE.Mesh(xArrowGeometry, xMaterial);
  xArrow.rotation.z = -Math.PI / 2;
  xArrow.position.x = axisLength;
  axesGroup.add(xArrow);
  
  // Y-axis (Up) - Green
  const yGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 16);
  const yMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
  const yAxis = new THREE.Mesh(yGeometry, yMaterial);
  yAxis.position.y = axisLength / 2;
  axesGroup.add(yAxis);
  
  // Arrow head for Y-axis
  const yArrowGeometry = new THREE.ConeGeometry(axisRadius * 2, axisRadius * 3, 16);
  const yArrow = new THREE.Mesh(yArrowGeometry, yMaterial);
  yArrow.position.y = axisLength;
  axesGroup.add(yArrow);
  
  // Z-axis (South) - Blue
  const zGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 16);
  const zMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 0.5 });
  const zAxis = new THREE.Mesh(zGeometry, zMaterial);
  zAxis.rotation.x = Math.PI / 2; // Rotate to point along Z-axis
  zAxis.position.z = axisLength / 2;
  axesGroup.add(zAxis);
  
  // Arrow head for Z-axis
  const zArrowGeometry = new THREE.ConeGeometry(axisRadius * 2, axisRadius * 3, 16);
  const zArrow = new THREE.Mesh(zArrowGeometry, zMaterial);
  zArrow.rotation.x = Math.PI / 2;
  zArrow.position.z = axisLength;
  axesGroup.add(zArrow);
  
  scene.add(axesGroup);
  
  // Grid helper: XZ plane (horizontal ground plane)
  // Shows grid in X (East-West) and Z (South-North) directions
  // Adjusted colors for lighter background
  const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xcccccc);
  scene.add(gridHelper);
  
  return { axesHelper: axesGroup, gridHelper };
}


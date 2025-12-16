import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Creates watch arms (seconds, minutes, hours)
 * Arms rotate around Y-axis (pointing up) at watch center
 * Arms extend in the XZ plane (horizontal)
 * Each arm is in its own group so rotation happens around watch center (origin)
 */
export function createWatchArms() {
  const group = new THREE.Group();
  
  // Order: second, minute, hour (to match main.js rotation assignments)
  
  // Second arm (longest, tapered) - RED
  // Tapered: thicker at center, thinner at tip
  const secondArmGroup = new THREE.Group();
  // Use CylinderGeometry with different radii for taper
  // radiusTop (tip) < radiusBottom (center) for taper effect
  const secondArmLength = 2.8; // Longer arm
  const secondArmGeometry = new THREE.CylinderGeometry(
    0.025, // radiusTop (tip - thinner) - increased thickness
    0.06,  // radiusBottom (center - thicker) - increased thickness
    secondArmLength, // height (length of arm)
    8 // segments
  );
  const secondArmMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff6600, // Orange
    metalness: 0.0,
    roughness: 0
  });
  const secondArm = new THREE.Mesh(secondArmGeometry, secondArmMaterial);
  // Rotate to be horizontal (along Z-axis instead of Y-axis)
  secondArm.rotation.x = Math.PI / 2; // Rotate 90 degrees around X to make it horizontal
  secondArm.position.z = secondArmLength / 2; // Position so center is at origin
  secondArm.position.y = 0.08; // Below minute and hour arms
  secondArm.castShadow = true; // Second arm casts shadows
  secondArmGroup.add(secondArm);
  group.add(secondArmGroup);
  
  // Minute arm (medium) - BLACK with rounded base
  const minuteArmGroup = new THREE.Group();
  // Use RoundedBoxGeometry for rounded ends at the base (center)
  const minuteArmGeometry = new RoundedBoxGeometry(0.12, 0.045, 1.8, 3, 0.06); // width, height, depth, segments, roundness
  const minuteArmMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x7d7d7d, // Gray
    metalness: 0.0,
    roughness: 0
  });
  const minuteArm = new THREE.Mesh(minuteArmGeometry, minuteArmMaterial);
  minuteArm.position.z = 0.9; // Scaled up from 0.6
  minuteArm.position.y = 0.35; // Higher to avoid overlapping with cubes
  minuteArm.castShadow = true; // Minute arm casts shadows
  minuteArmGroup.add(minuteArm);
  group.add(minuteArmGroup);
  
  // Hour arm (shortest, thickest) - BLACK with rounded base
  const hourArmGroup = new THREE.Group();
  // Use RoundedBoxGeometry for rounded ends at the base (center)
  const hourArmGeometry = new RoundedBoxGeometry(0.16, 0.045, 1.2, 3, 0.08); // width, height, depth, segments, roundness
  const hourArmMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6e6e6e, // Dark gray
    metalness: 0.0,
    roughness: 0
  });
  const hourArm = new THREE.Mesh(hourArmGeometry, hourArmMaterial);
  hourArm.position.z = 0.6; // Scaled up from 0.4
  hourArm.position.y = 0.30; // Higher to avoid overlapping with cubes
  hourArm.castShadow = true; // Hour arm casts shadows
  hourArmGroup.add(hourArm);
  group.add(hourArmGroup);
  
  // Store references for animation (matching the order: second, minute, hour)
  group.userData.secondHand = secondArmGroup;
  group.userData.minuteHand = minuteArmGroup;
  group.userData.hourHand = hourArmGroup;
  
  return group;
}

import * as THREE from 'three';

// The PSX pipeline works entirely in display (gamma) space, like the
// original hardware: hex colours are used as-is, no linear conversion.
THREE.ColorManagement.enabled = false;

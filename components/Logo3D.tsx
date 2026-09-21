import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Bundled once, reused by every mounted instance.
const MODEL = require('../assets/models/logo-3d.glb');

type Logo3DProps = {
  /** Width/height of the square viewport in dp. */
  size?: number;
  /** Rotation speed in radians per frame. */
  spinSpeed?: number;
};

/**
 * Renders the brand's 3D logo, gently spinning, using a tiny WebGL scene.
 * Designed to be dropped in anywhere a loading indicator is needed.
 *
 * Kept intentionally minimal (no postprocessing, no shadows, single draw
 * call, capped pixel ratio) so it stays light on CPU/GPU and doesn't add
 * perceptible delay before it appears.
 */
export function Logo3D({ size = 110, spinSpeed = 0.018 }: Logo3DProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const onContextCreate = async (gl: any) => {
    const renderer = new Renderer({ gl });
    renderer.setPixelRatio(1);
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    // Transparent background so it blends with any screen behind it.
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      32,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 4.2);

    // Simple, cheap studio-style lighting for a polished look.
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2.5, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(-3, -1.5, -2);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    try {
      const asset = Asset.fromModule(MODEL);
      await asset.downloadAsync();

      const loader = new GLTFLoader();
      const gltf: any = await new Promise((resolve, reject) => {
        loader.load(asset.localUri ?? asset.uri, resolve, undefined, reject);
      });

      const model = gltf.scene as THREE.Object3D;

      // Normalize arbitrary export scale/position so it always frames nicely.
      const box = new THREE.Box3().setFromObject(model);
      const dimensions = new THREE.Vector3();
      box.getSize(dimensions);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);
      const maxDimension = Math.max(dimensions.x, dimensions.y, dimensions.z) || 1;
      const scale = 1.7 / maxDimension;
      model.scale.setScalar(scale);
      // Slight tilt gives a more dynamic, professional "product shot" angle.
      pivot.rotation.x = -0.15;

      pivot.add(model);

      if (mountedRef.current) {
        setReady(true);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.warn('Logo3D: failed to load 3D logo, falling back silently', error);
    }

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      pivot.rotation.y += spinSpeed;
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  };

  return (
    <Animated.View style={[styles.container, { width: size, height: size, opacity }]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Logo3D;

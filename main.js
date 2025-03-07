"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

import {
  AmbientLight,
  Clock,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  PMREMGenerator,
  RingGeometry,
  MeshBasicMaterial,
  Vector3,
  Quaternion,
  AnimationMixer,
  AudioListener,
  Audio,
  AudioLoader,
  TextureLoader,
  PlaneGeometry
} from 'three';

// XR Emulator
import { DevUI } from '@iwer/devui';
import { XRDevice, metaQuest3 } from 'iwer';

// XR
import { XRButton } from 'three/addons/webxr/XRButton.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// If you prefer to import the whole library, with the THREE prefix, use the following line instead:
// import * as THREE from 'three'

// NOTE: three/addons alias is supported by Rollup: you can use it interchangeably with three/examples/jsm/  

// Importing Ammo can be tricky.
// Vite supports webassembly: https://vitejs.dev/guide/features.html#webassembly
// so in theory this should work:
//
// import ammoinit from 'three/addons/libs/ammo.wasm.js?init';
// ammoinit().then((AmmoLib) => {
//  Ammo = AmmoLib.exports.Ammo()
// })
//
// But the Ammo lib bundled with the THREE js examples does not seem to export modules properly.
// A solution is to treat this library as a standalone file and copy it using 'vite-plugin-static-copy'.
// See vite.config.js
// 
// Consider using alternatives like Oimo ou cannon-es
import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
  GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// Example of hard link to official repo for data, if needed
// const MODEL_PATH = 'https://raw.githubusercontent.com/mrdoob/three.js/r173/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

async function setupXR(xrMode) {

  if (xrMode !== 'immersive-vr') return;

  // iwer setup: emulate vr session
  let nativeWebXRSupport = false;
  if (navigator.xr) {
    nativeWebXRSupport = await navigator.xr.isSessionSupported(xrMode);
  }

  if (!nativeWebXRSupport) {
    const xrDevice = new XRDevice(metaQuest3);
    xrDevice.installRuntime();
    xrDevice.fovy = (75 / 180) * Math.PI;
    xrDevice.ipd = 0;
    window.xrdevice = xrDevice;
    xrDevice.controllers.right.position.set(0.15649, 1.43474, -0.38368);
    xrDevice.controllers.right.quaternion.set(
      0.14766305685043335,
      0.02471366710960865,
      -0.0037767395842820406,
      0.9887216687202454,
    );
    xrDevice.controllers.left.position.set(-0.15649, 1.43474, -0.38368);
    xrDevice.controllers.left.quaternion.set(
      0.14766305685043335,
      0.02471366710960865,
      -0.0037767395842820406,
      0.9887216687202454,
    );
    new DevUI(xrDevice);
  }
}

await setupXR('immersive-ar');



let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let model = null;
let pig = null;
let nb_donuts = 0;
let donuts_collected = 0;
let donuts = [];
let pigMixer = null;
let walkAction = null;
let idleAction = null;
let eatingAction = null;
let pointSound = null;
let victorySound = null;
let dohSound = null;
let footprintTexture = null;

const clock = new Clock();

function loadModel() {
  const loader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./WebXR/jsm/libs/draco/gltf/');
  loader.setDRACOLoader(dracoLoader);

  loader.load('./WebXR/assets/donut.glb', (gltf) => {
    model = gltf.scene;
    model.visible = false;
    scene.add(model);
  }, undefined, (error) => {
    console.error('An error happened while loading the model:', error);
  });
}

function loadPig() {
  const loader = new GLTFLoader();
  loader.load('./WebXR/assets/pig.glb', (gltf) => {
    pig = gltf.scene;
    pig.visible = false;

    pigMixer = new AnimationMixer(pig);
    walkAction = pigMixer.clipAction(gltf.animations[7]);
    idleAction = pigMixer.clipAction(gltf.animations[2]);
    eatingAction = pigMixer.clipAction(gltf.animations[3]);
  }, undefined, (error) => {
    console.error('An error happened while loading the pig model:', error);
  });
}

function loadSounds() {
  const listener = new AudioListener();
  camera.add(listener);

  const audioLoader = new AudioLoader();

  pointSound = new Audio(listener);
  audioLoader.load('./WebXR/assets/point.mp3', (buffer) => {
    pointSound.setBuffer(buffer);
    pointSound.setVolume(0.5);
  });

  victorySound = new Audio(listener);
  audioLoader.load('./WebXR/assets/victory.mp3', (buffer) => {
    victorySound.setBuffer(buffer);
    victorySound.setVolume(0.5);
  });

  dohSound = new Audio(listener);
  audioLoader.load('./WebXR/assets/doh.mp3', (buffer) => {
    dohSound.setBuffer(buffer);
    dohSound.setVolume(0.5);
  });
}

function loadFootprintTexture() {
  const textureLoader = new TextureLoader();
  footprintTexture = textureLoader.load('./WebXR/assets/empreinte-pig.png');
}

function placePigOnCeiling(position_donut) {
  if (reticle.visible && pig) {
    const offset = new Vector3(
      (Math.random() - 0.5) * 2,
      0,
      (Math.random() - 0.5) * 2
    );
    const pigPosition = position_donut.clone().add(offset);

    pig.position.copy(pigPosition);
    pig.scale.set(0.3, 0.3, 0.3);

    ensurePigIsUpsideDown();
    pig.visible = true;
    scene.add(pig);
  }
}

const onSelect = () => {
  placeDonutOnSurface();
};

function placeDonutOnSurface() {
  if (reticle.visible && model) {
    const donut = model.clone();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    reticle.matrix.decompose(position, quaternion, scale);

    const normal = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    if (normal.y < -0.5) {
      donut.position.copy(position);
      donut.quaternion.copy(quaternion);
      donut.scale.copy(scale);
      donut.visible = true;
      scene.add(donut);
      donuts.push(donut);
      if (nb_donuts == 0) {
        placePigOnCeiling(donut.position);
        nb_donuts++;
      }
    } else {
      console.log('Surface is not a ceiling, donut not placed.');
      dohSound.play();
    }
  }
}

function collectClosestDonut() {
  if (donuts.length > 0 && pig) {
    let closestDonut = null;
    let minDistance = Infinity;
    donuts.forEach(donut => {
      const distance = pig.position.distanceTo(donut.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestDonut = donut;
      }
    });

    if (closestDonut) {
      ensurePigIsUpsideDown();
      const direction = new Vector3().subVectors(closestDonut.position, pig.position).normalize();
      pig.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), direction);
      pig.position.add(direction.multiplyScalar(0.01));
      if (!walkAction.isRunning()) {
        idleAction.stop();
        eatingAction.stop();
        walkAction.play();
      }
      if (pig.position.distanceTo(closestDonut.position) < 0.1) {
        scene.remove(closestDonut);
        donuts = donuts.filter(donut => donut !== closestDonut);
        donuts_collected++;
        walkAction.stop();
        eatingAction.play();
        pointSound.play();
        if (donuts_collected % 10 === 0) {
          victorySound.play();
        }
        setTimeout(() => {
          eatingAction.stop();
          idleAction.play();
        }, 2000);
      }
      placeFootprint(pig.position);
    } else {
      if (!idleAction.isRunning()) {
        walkAction.stop();
        eatingAction.stop();
        idleAction.play();
      }
    }
  } else {
    if (pig) {
      if (!idleAction.isRunning() && pig) {
        walkAction.stop();
        eatingAction.stop();
        idleAction.play();
      }
    }
  }
}

function placeFootprint(position) {
  const footprintGeometry = new PlaneGeometry(0.1, 0.1);
  const footprintMaterial = new MeshBasicMaterial({ map: footprintTexture, transparent: true });
  const footprint = new Mesh(footprintGeometry, footprintMaterial);
  footprint.position.copy(position);
  footprint.rotation.x = -Math.PI / 2;
  scene.add(footprint);

  setTimeout(() => {
    scene.remove(footprint);
  }, 5000);
}

function ensurePigIsUpsideDown() {
  if (pig) {
    const ceilingNormal = new Vector3(0, -1, 0);
    const pigUp = new Vector3(0, 1, 0).applyQuaternion(pig.quaternion);
    if (pigUp.dot(ceilingNormal) < 0.99) {
      const rotationAxis = new Vector3().crossVectors(pigUp, ceilingNormal).normalize();
      const angle = Math.acos(pigUp.dot(ceilingNormal));
      pig.quaternion.setFromAxisAngle(rotationAxis, angle);
    }
  }
}

// Main loop
const animate = (timestamp, frame) => {
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (pigMixer) pigMixer.update(delta);
  ensurePigIsUpsideDown();
  renderer.render(scene, camera);

  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((referenceSpace) => {
        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
          hitTestSource = source;
        });
      });

      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        const pose = hit.getPose(referenceSpace);
        reticle.matrix.fromArray(pose.transform.matrix);

        if (model) {
          model.visible = true;
          model.position.setFromMatrixPosition(reticle.matrix);
          model.quaternion.setFromRotationMatrix(reticle.matrix);
        }
      } else {
        reticle.visible = false;
        if (model) {
          model.visible = false;
        }
      }
    }
  }

  collectClosestDonut();
};

const init = () => {
  scene = new Scene();

  const aspect = window.innerWidth / window.innerHeight;
  camera = new PerspectiveCamera(75, aspect, 0.1, 10);
  camera.position.set(0, 1.6, 0);

  const light = new AmbientLight(0xffffff, 1.0);
  scene.add(light);

  const hemiLight = new HemisphereLight(0xffffff, 0xbbbbff, 3);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const environment = new RoomEnvironment();
  const pmremGenerator = new PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(environment).texture;

  const xrButton = XRButton.createButton(renderer, {
    optionalFeatures: ['hit-test']
  });
  xrButton.style.backgroundColor = 'skyblue';
  document.body.appendChild(xrButton);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.update();

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
  console.log('Controller initialized:', controller);

  reticle = new Mesh(
    new RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    session.requestReferenceSpace('local').then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        hitTestSource = source;
        localSpace = referenceSpace;
        console.log('Hit test source and local space initialized.');
      });
    });
    document.getElementById
  });

  loadModel();
  loadPig();
  loadSounds();
  loadFootprintTexture();

  window.addEventListener('resize', onWindowResize, false);
};

window.init = init;

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}
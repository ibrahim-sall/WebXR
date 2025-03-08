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
  PositionalAudio,
  AudioLoader,
  TextureLoader,
  PlaneGeometry,
  DoubleSide
} from 'three';

// XR Emulator
import { DevUI } from '@iwer/devui';
import { XRDevice, metaQuest3 } from 'iwer';

// XR
import { XRButton } from 'three/addons/webxr/XRButton.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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

let camera, scene, renderer, localSpace;
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
let deathAction = null;
let pointSound = null;
let victorySound = null;
let dohSound = null;
let footprintTexture = null;
let lastMovementTime = Date.now();
let lastFootprintTime = 0;
let lastDeathActionTime = 0;

const clock = new Clock();


////////////////////////////////////////____LOADING MODELS____////////////////////////////////////////


function loadModel() {
  /**
   * Loads a 3D model using GLTFLoader and DRACOLoader.
   * 
   * @returns {Promise<void>} A promise that resolves when the model is successfully loaded and added to the scene, or rejects if an error occurs.
   * 
   * @throws {Error} If an error occurs while loading the model.
   * 
   * @example
   * loadModel()
   *   .then(() => {
   *     console.log('Model loaded successfully');
   *   })
   *   .catch((error) => {
   *     console.error('Failed to load model:', error);
   *   });
   */
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./WebXR/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    loader.load('./assets/donut.glb', (gltf) => {
      model = gltf.scene;
      model.visible = false;
      scene.add(model);
      resolve();
    }, undefined, (error) => {
      console.error('An error happened while loading the model:', error);
      reject(error);
    });
  });
}

function loadPig() {

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load('./assets/pig.glb', (gltf) => {
      pig = gltf.scene;
      pig.visible = false;

      pigMixer = new AnimationMixer(pig);
      walkAction = pigMixer.clipAction(gltf.animations[7]);
      idleAction = pigMixer.clipAction(gltf.animations[2]);
      eatingAction = pigMixer.clipAction(gltf.animations[3]);
      deathAction = pigMixer.clipAction(gltf.animations[0]);

      resolve();
    }, undefined, (error) => {
      console.error('An error happened while loading the pig model:', error);
      reject(error);
    });
  });
}


function loadSounds() {
  /**
 * Loads the sound assets for the application.
 * 
 * This function loads three positional audio files: point.mp3, victory.mp3, and doh.mp3.
 * It adds an AudioListener to the camera and sets up the audio properties for each sound.
 * 
 * @returns {Promise<void>} A promise that resolves when all sounds are loaded successfully, 
 * or rejects if there is an error loading any of the sounds.
 * 
 * @throws {Error} If there is an error loading any of the sound files.
 */

  return new Promise((resolve, reject) => {
    const listener = new AudioListener();
    camera.add(listener);

    const audioLoader = new AudioLoader();

    pointSound = new PositionalAudio(listener);
    audioLoader.load('./assets/point.mp3', (buffer) => {
      pointSound.setBuffer(buffer);
      pointSound.setRefDistance(1);
      pointSound.setVolume(0.5);
    });

    victorySound = new PositionalAudio(listener);
    audioLoader.load('./assets/victory.mp3', (buffer) => {
      victorySound.setBuffer(buffer);
      victorySound.setRefDistance(1);
      victorySound.setVolume(0.5);
    });

    dohSound = new PositionalAudio(listener);
    audioLoader.load('./assets/doh.mp3', (buffer) => {
      dohSound.setBuffer(buffer);
      dohSound.setRefDistance(1);
      dohSound.setVolume(0.5);
      resolve();
    }, undefined, (error) => {
      console.error('An error happened while loading the sounds:', error);
      reject(error);
    });
  });
}

function loadFootprintTexture() {
  return new Promise((resolve, reject) => {
    const textureLoader = new TextureLoader();
    footprintTexture = textureLoader.load('./assets/empreinte-pig.png', resolve, undefined, (error) => {
      console.error('An error happened while loading the footprint texture:', error);
      reject(error);
    });
  });
}

////////////////////////////////////////____PLACEMENTS____////////////////////////////////////////


function placePigOnCeiling(position_donut) {
  /**
   * Places a pig object on the ceiling at a random offset from the given position.
   *
   * @param {Vector3} position_donut - The base position from which the pig's position is calculated.
   */
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


async function placeDonutOnSurface() {
  /**
   * Places a donut model on the surface if the reticle is visible and the surface is a ceiling.
   * If the surface is not a ceiling, plays a sound indicating the donut was not placed.
   * 
   * Preconditions:
   * - `reticle` must be visible.
   * - `model` must be defined.
   * 
   * Postconditions:
   * - If the surface is a ceiling, a donut is placed at the reticle's position and orientation.
   * - If no donuts have been placed yet, a pig is placed on the ceiling.
   * - If the surface is not a ceiling, a sound is played, no donut is placed.
   * 
   * @async
   * @function placeDonutOnSurface
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */

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
      dohSound.position.copy(position);
      scene.add(dohSound);
      dohSound.play();
    }
  }
}


////////////////////////////////////////____MOOOOOOOVE____////////////////////////////////////////


function collectClosestDonut() {
  /**
  * Collects the closest donut to the pig.
  * 
  * This function finds the closest donut to the pig, moves the pig towards it, and handles the animations and sounds associated with collecting the donut. 
  * If the pig collects a donut, it updates the scene and plays the appropriate sounds and animations. 
  * Every 10 donuts collected triggers a victory sound.
  * 
  * Preconditions:
  * - `donuts` is an array of donut objects with a `position` property.
  * - `pig` is an object with `position`, `quaternion`, and animation actions (`walkAction`, `idleAction`, `eatingAction`).
  * - `scene` is the Three.js scene object.
  * - `pointSound` and `victorySound` are sound objects.
  * 
  * Postconditions:
  * - The closest donut is removed from the scene and the `donuts` array.
  * - The pig's position and animations are updated.
  * - Sounds are played based on the actions performed.
  * 
  * @function collectClosestDonut
  */
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
      lastMovementTime = Date.now();
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
        pointSound.position.copy(pig.position);
        scene.add(pointSound);
        pointSound.play();
        if (donuts_collected % 10 === 0) {
          victorySound.position.copy(pig.position);
          scene.add(victorySound);
          victorySound.play();
          const updateVictorySoundPosition = () => {
            victorySound.position.copy(pig.position);
            if (victorySound.isPlaying) {
              requestAnimationFrame(updateVictorySoundPosition);
            }
          };
          updateVictorySoundPosition();
        }
        setTimeout(() => {
          eatingAction.stop();
          idleAction.play();
        }, 2000);
      }
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

function placeFootprint(position, direction) {
  const footprintGeometry = new PlaneGeometry(0.4, 0.4);
  const footprintMaterial = new MeshBasicMaterial({ map: footprintTexture, transparent: true, side: DoubleSide });
  const footprint = new Mesh(footprintGeometry, footprintMaterial);
  footprint.position.copy(position);
  footprint.rotation.x = -Math.PI / 2;

  const angle = Math.atan2(direction.z, direction.x);
  footprint.rotation.z = angle;

  scene.add(footprint);

  setTimeout(() => {
    scene.remove(footprint);
  }, 5000);
}

////////////////////////////////////////____PLACE BIG UPSIDE DOWN by brute force____////////////////////////////////////////
//this is still not working for first placement

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

function checkPigMovement() {
  const currentTime = Date.now();
  if (currentTime - lastMovementTime > 30000 && currentTime - lastDeathActionTime > 30000) {
    if (!deathAction.isRunning()) {
      idleAction.stop();
      walkAction.stop();
      eatingAction.stop();
      deathAction.play();
      lastDeathActionTime = currentTime;
      setTimeout(() => {
        deathAction.stop();
        idleAction.play();
      }, deathAction._clip.duration * 1000);
    }
  }
}

////////////////////////////////////////____MAIN LOOP____////////////////////////////////////////


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
  checkPigMovement();

  if (walkAction.isRunning()) {
    const currentTime = Date.now();
    if (currentTime - lastFootprintTime > 1000) {
      const direction = new Vector3();
      pig.getWorldDirection(direction);
      placeFootprint(pig.position, direction);
      lastFootprintTime = currentTime;
    }
  }
};

////////////////////////////////////////____INIT____////////////////////////////////////////
export const init = async () => {
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
  });

  await Promise.all([
    loadModel(),
    loadPig(),
    loadSounds(),
    loadFootprintTexture()
  ]);

  window.addEventListener('resize', onWindowResize, false);
};

window.init = init;

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}
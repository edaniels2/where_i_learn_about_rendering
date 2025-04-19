import { Camera } from '../camera.js';
import { Floor, Wall } from '../shapes.js';
import { Geometry } from '../geometry.js';
import { Vec3 } from '../../vector.js';
import { fromObjFile } from '../../obj-file.js';
import { Rasterizer } from './rasterizer.js';
import { SquareMatrix } from '../../matrix.js';

// reorganize to a class that you can instantiate with a scene definition
const camera = new Camera();
const fov = 60;
const fovRad = fov * Math.PI / 180;
const fovHalf = fovRad / 2;

const light = {
  origin: new Vec3(-10, 10, 5),
  intensity: 20,
  ambient: 0.25,
};
let shapes = [
  // new Wall({endpoints: [{x: 0, z: -1}, {x: -0.25, z: -1}], bottom: -0.25, height: 0.25}),
  // new Wall({endpoints: [{x: 0.25, z: -1}, {x: 0, z: -1}], bottom: -0.25, height: 0.25}),
  // new Wall({endpoints: [{x: 0, z: -1}, {x: -0.25, z: -1}], bottom: 0, height: 0.25}),
  // new Wall({endpoints: [{x: 0.25, z: -1}, {x: 0, z: -1}], bottom: 0, height: 0.25}),

  new Floor(new Vec3(0, -1.35, -12), {size: 1000, color: new Vec3(0.65, 0.72, 0.67),}),
  // new Wall({endpoints: [{x: 6, z: 6}, {x: 6, z: -18}], bottom: -1.35,}),
  // new Wall({endpoints: [{x: 6, z: -18}, {x: -6, z: -18}], bottom: -1.35,}),
  // new Wall({endpoints: [{x: -6, z: -18}, {x: -6, z: 6}], bottom: -1.35,}),
  // new Wall({endpoints: [{x: -6, z: 6}, {x: 6, z: 6}], bottom: -1.35,}),
  fromObjFile('../../models/lamp.obj', new Vec3(2, -0.35, -12), {size: 0.3, disableBackfaceCulling: true, contrast: 2.7,}),
  fromObjFile('../../models/power_lines.obj', new Vec3(4, 4.55, -14), {size: 0.1, disableBackfaceCulling: true,}),
  fromObjFile('../../models/cessna.obj', new Vec3(-10, 12, -50), {size: 0.3, rotateZ: -0.2, rotateX: 0.4, disableBackfaceCulling: true, contrast: 0.0001,}),
  fromObjFile('../../models/minicooper_no_windows.obj', new Vec3(0, -1.35, -10), {size: 0.03, color: new Vec3(0.8, 0.33, 0.3), rotateX: -Math.PI / 2, rotateY: 0.3,}),
  fromObjFile('../../models/car.obj', new Vec3(-3, -1.35, -14), {color: new Vec3(1.1, 0.9, 0.12), rotateY: -Math.PI / 2, disableBackfaceCulling: true,}),
  fromObjFile('../../models/al.obj', new Vec3(-4, -0.37, -12), {size: 0.3, color: new Vec3(3,3,3), rotateY: Math.PI / 3, rotateZ: -0.08, contrast: 1.4, disableBackfaceCulling: true,}),
];

let /**@type{number}*/worldW, /**@type{number}*/worldH;
let prevT = 0, prevX = 0, prevY = 0;
let /**@type{number}*/halfWorldW, /**@type{number}*/halfWorldH;
let /**@type{number}*/rasterW, /**@type{number}*/rasterH;
let /**@type{HTMLCanvasElement}*/canvas, /**@type{CanvasRenderingContext2D}*/ctx;
let movement = new Vec3, prevMovementTime = 0;

/** @type{Rasterizer} */
let rasterizer;
let viewingFrustrum;

export function main() {
  canvas = document.querySelector('canvas');
  // ctx = canvas.getContext('2d');
  if (canvas.width && canvas.height) {
    rasterW = canvas.width;
    rasterH = canvas.height;
  } else {
    const { width, height } = canvas.getBoundingClientRect();
    rasterW = canvas.width = width;
    rasterH = canvas.height = height;
  }
  const aspect = rasterW / rasterH;
  worldW = Math.atan(fovHalf);
  worldH = worldW / aspect;
  halfWorldW = worldW / 2;
  halfWorldH = worldH / 2;

  viewingFrustrum = {
    top: halfWorldH,
    bottom: -halfWorldH,
    right: halfWorldW,
    left: -halfWorldW,
    fovHalf,
    focalLength: 0.1,
    nearClip: 0.3,
    farClip: 150,
  };
  rasterizer = new Rasterizer(rasterW, rasterH, viewingFrustrum, canvas);

  initializeKeyboardEvents();
  initializePointerEvents();
  initializeSettings();

  const promiseShapes = shapes.map(shape => shape instanceof Promise ? shape : Promise.resolve(shape));
  Promise.all(promiseShapes).then((resolved) => {
    shapes = resolved;
    requestAnimationFrame(render);
  });
}

function render() {
  // performance.mark('start');
  const cameraTransform = camera.positionAndScale.multiply(camera.rotation);
  const lightOrigin = light.origin.transform(cameraTransform);
  rasterizer.clear();
  for (const shape of shapes) {
    const pointTransform = shape.rotation.multiply(shape.positionAndScale).multiply(cameraTransform);
    const rotationTransform = shape.rotation.multiply(camera.rotation);
    const shapeLocation = shape.location.transform(cameraTransform);
    for (const facet of shape.facets) {
      /**@type{Vec3}*/let sNormal;
      const currentFacet = [];
      let vShading = [];
      // convert to world space & cull surfaces not facing the camera
      for (let i = 0; i < facet.length; i ++) {
        const point = facet[i];
        const pt = point.transform(pointTransform);
        pt.normal = point.normal?.transform(rotationTransform);
        currentFacet.push(pt);
      }
      if (!shape.disableBackfaceCulling) {
        sNormal = facet.normal.transform(rotationTransform);
        // back face culling removes things that should be visible on a couple
        // of the models, maybe they're left handed or something.
        let pointOnPlane = currentFacet[2];
        if (sNormal.dot(pointOnPlane) > 0) {
          continue;
        }
      }
      currentFacet.color = facet.color || shape.color;
      if (shape.contrast === 0) {
        rasterizer.pushPolygon(currentFacet, currentFacet.color);
      } else if (currentFacet.color instanceof Vec3) {
        const lightIntensity = light.intensity * shape.contrast; // maybe contrast isn't the right word
        if (currentFacet[0].normal) {
          // vertex normals available, calculate smooth shading
          for (const pt of currentFacet) {
            const lightRay = lightOrigin.sub(pt);
            const attenuation = lightIntensity / lightRay.magnitude;
            let shading = pt.normal.dot(lightRay.normalize());
            shading *= attenuation;
            shading *= 1 - light.ambient;
            shading += light.ambient;
            vShading.push(Math.max(shading, 0));
          }
        } else {
          // use calculated surface normals for shading, sometimes results in
          // 'inverted' lighting for complex shapes where it's hard to tell which
          // direction is pointing out, but usually it's ok. Setting an objects
          // contrast at or near 0 removes the effect.
          vShading = null;
          const lightRay = lightOrigin.sub(shapeLocation);
          const attenuation = lightIntensity / lightRay.magnitude;
          if (!sNormal) {
            sNormal = facet.normal.transform(rotationTransform);
          }
          let shading = sNormal.dot(lightRay.normalize());
          shading *= attenuation;
          shading *= 1 - light.ambient;
          shading += light.ambient;
          currentFacet.color = currentFacet.color.scale(Math.max(shading, 0));
        }
      }

      rasterizer.pushPolygon(currentFacet, currentFacet.color, { vShading });
    }
  }
  rasterizer.render();
  // performance.mark('end');
  // performance.measure('duration', 'start', 'end');
  // console.log(performance.getEntriesByName('duration')[0].duration)
  // performance.clearMeasures();
  // performance.clearMarks();
  // ctx.putImageData(rasterizer.imageData, 0, 0);
  // ctx.moveTo(0, rasterH / 2);
  // ctx.lineTo(rasterW, rasterH / 2);
  // ctx.moveTo(rasterW / 2, 0);
  // ctx.lineTo(rasterW / 2, rasterH);
  // ctx.stroke();
  updateCameraLocation();
}

function initializePointerEvents() {
  // const movementScale = 3 / Math.min(rasterW, rasterH);
  const movementScale = 3 / canvas.getBoundingClientRect().width;
  document.addEventListener('pointerdown', mouseDown);

  function mouseDown(/**@type{PointerEvent}*/event) {
    const {
      top: canvasTop,
      left: canvasLeft,
    } = canvas.getBoundingClientRect();
    const clickCoords = new Vec3(
      event.clientX - canvasLeft,
      event.clientY - canvasTop,
      0);
    prevX = event.pageX;
    prevY = event.pageY;
    /**@type{Geometry}*/let hitObj;
    // const transform = camera.positionAndScale.multiply(camera.rotation);
    // for (const shape of shapes) {
    //   if (shape.fixed) {
    //     continue;
    //   }
    //   const shapeLocation = shape.location.transform(transform);
    //   // TODO this hitbox thing kind of sucks. Try using the edge detection
    //   // method from rasterizer to detect object clicks
    //   const hitbox = shape.getHitBox(transform, worldW / screen.near,
    //       worldH / screen.near, rasterW, rasterH);
    //   const hit = clickCoords.y > hitbox.top && clickCoords.y < hitbox.bottom
    //     && clickCoords.x < hitbox.right && clickCoords.x > hitbox.left;
    //   if (hit && (!hitObj || hitObj.depth < -shapeLocation.z)) {
    //     hitObj = shape;
    //   }
    // }
    hitObj ||= camera;
    const moveShape = e => mouseMove(e, hitObj);
    document.addEventListener('pointermove', moveShape);
    document.addEventListener('pointerup', () => document.removeEventListener('pointermove', moveShape));
  }

  function mouseMove(/**@type{PointerEvent}*/event, /**@type{Geometry}*/shape = null) {
    const movingShapes = shape ? [ shape ] : shapes;
    for (const shape of movingShapes) {
      shape.rotateY((event.pageX - prevX) * movementScale);
      shape.rotateX((event.pageY - prevY) * movementScale);
    }
    prevX = event.pageX;
    prevY = event.pageY;

    requestAnimationFrame(t => {
      // timestamp check probably not necessary
      if (t != prevT) {
        render();
      }
      prevT = t;
    });
  }
}

function initializeKeyboardEvents() {
  document.addEventListener('keydown', startMove);
  document.addEventListener('keyup', stopMove);

  function startMove(/**@type{KeyboardEvent}*/event) {
    movement.sane();
    switch (event.key) {
      case 'w':
        if (movement.z) {
          return;
        }
        movement.z += 1;
        break;
      case 's':
        if (movement.z) {
          return;
        }
        movement.z -= 1;
        break;
      case 'a':
        if (movement.x) {
          return;
        }
        movement.x += 1;
        break;
      case 'd':
        if (movement.x) {
          return;
        }
        movement.x -= 1;
        break;
    }
    movement = movement.scale(2).normalize().scale(0.5);
    prevMovementTime = performance.now() - 8;
    updateCameraLocation();
  }

  function stopMove(/**@type{KeyboardEvent}*/event) {
    switch (event.key) {
      case 'w':
      case 's':
        movement.z = 0;
        break;
      case 'a':
      case 'd':
        movement.x = 0;
        break;
    }
    movement = movement.scale(2).normalize().scale(0.5);
    updateCameraLocation();
  }
}

function updateCameraLocation() {
  if (movement.magnitude) {
    const now = performance.now();
    const scale = (now - prevMovementTime) / 128;
    prevMovementTime = now;
    const translation = movement.scale(scale).transform(
      SquareMatrix.rotationY(camera.rotationComponents.y).invert());
    camera.translate(translation.x, 0, translation.z);
    requestAnimationFrame(t => {
      if (t != prevT) {
        render();
      }
      prevT = t;
    });
  }
}

function initializeSettings() {
  const aa = document.getElementById('antialias');
  aa.checked = rasterizer.ANTI_ALIASING;
  aa.addEventListener('change', e => {
    rasterizer.ANTI_ALIASING = e.target.checked;
    render();
  });

  const lightingInputs = {
    x: document.getElementById('lightX'),
    y: document.getElementById('lightY'),
    z: document.getElementById('lightZ'),
    ambient: document.getElementById('lightA'),
    intensity: document.getElementById('lightI'),
  };
  lightingInputs.x.value = light.origin.x;
  lightingInputs.y.value = light.origin.y;
  lightingInputs.z.value = light.origin.z;
  lightingInputs.ambient.value = light.ambient * 100;
  lightingInputs.intensity.value = light.intensity;

  for (const c of ['x', 'y', 'z']) {
    lightingInputs[c].addEventListener('change', e => {
      light.origin[c] = Number(e.target.value);
      render();
    });
  }
  lightingInputs.ambient.addEventListener('change', e => {
    light.ambient = Number(e.target.value) / 100;
    render();
  });
  lightingInputs.intensity.addEventListener('change', e => {
    light.intensity = Number(e.target.value);
    render();
  });
}

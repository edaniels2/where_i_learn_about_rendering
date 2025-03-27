import { Camera } from '../camera.js';
import { HorizontalPlane } from '../shapes.js';
import { Geometry } from '../geometry.js';
import { Vec3 } from '../../vector.js';
import { ObjFile } from '../../obj-file.js';
import { Rasterizer } from './rasterizer.js';

// reorganize to a class that you can instantiate with a scene definition
const camera = new Camera();
const fov = 60;

const light = {
  origin: new Vec3(-10, 10, 5),
  intensity: 20,
  ambient: 0.25,
};
const shapes = [
  new HorizontalPlane(new Vec3(0, -1, -12), {size: 10, color: new Vec3(0.65, 0.72, 0.67)}),
];

let /**@type{number}*/worldW, /**@type{number}*/worldH;
let prevT = 0, prevX = 0, prevY = 0;
let /**@type{number}*/halfWorldW, /**@type{number}*/halfWorldH;
let /**@type{number}*/rasterW, /**@type{number}*/rasterH;
let /**@type{HTMLCanvasElement}*/canvas, /**@type{CanvasRenderingContext2D}*/ctx;
let movement = new Vec3, prevMovementTime = 0;

/** @type{Rasterizer} */
let rasterizer;
let screen;

export function main() {
  canvas = document.querySelector('canvas');
  ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  rasterW = canvas.width = width;
  rasterH = canvas.height = height;
  const aspect = width / height;
  const fovRad = fov * Math.PI / 180;
  worldW = Math.atan(fovRad / 2);
  worldH = worldW / aspect;
  halfWorldW = worldW / 2;
  halfWorldH = worldH / 2;

  const asyncShapes = [
    new ObjFile('/models/lamp.obj').parse().then(Model => {
      const model = new Model(new Vec3(2, 0, -12), {size: 0.3, color: new Vec3(1.2, 1.2, 1.2), fixed: true, disableBackfaceCulling: true, contrast: 2.7});
      shapes.push(model);
    }),
    new ObjFile('/models/power_lines.obj').parse().then(Model => {
      const model = new Model(new Vec3(4, 4.9, -14), {size: 0.1, color: new Vec3(0.3, 0.3, 0.3), fixed: true, disableBackfaceCulling: true});
      shapes.push(model);
    }),
    new ObjFile('/models/cessna.obj').parse().then(Model => {
      const model = new Model(new Vec3(-10, 6, -50), {size: 0.3, color: new Vec3(1.3, 1.4, 1.35), rotateZ: -0.2, rotateX: 0.4, disableBackfaceCulling: true, contrast: 0.6});
      shapes.push(model);
    }),
    new ObjFile('/models/minicooper_no_windows.obj').parse().then(Model => {
      const model = new Model(new Vec3(0, -1, -10), {size: 0.03, color: new Vec3(0.4, 0.53, 0.7), rotateX: -Math.PI / 2, rotateY: 0.3});
      shapes.push(model);
    }),
  ];

  screen = {
    top: halfWorldH,
    bottom: -halfWorldH,
    right: halfWorldW,
    left: -halfWorldW,
    near: 0.1,
    far: 1000,
  };
  rasterizer = new Rasterizer(rasterW, rasterH, screen);

  initializeKeyboardEvents();
  initializePointerEvents();
  initializeSettings();

  Promise.all(asyncShapes).then(() => requestAnimationFrame(render));
}

function render() {
  const cameraTransform = camera.positionAndScale.multiply(camera.rotation);
  const lightOrigin = light.origin.transform(cameraTransform);
  rasterizer.clear();
  for (const shape of shapes) {
    const pointTransform = shape.rotation.multiply(shape.positionAndScale).multiply(cameraTransform);
    const rotationTransform = shape.rotation.multiply(camera.rotation);
    // should probably use a more rigorous compare, but this works well enough to quickly
    // cull some objects which would otherwise eat up a lot of processing time
    const outOfView = shape.location.transform(cameraTransform)
      .normalize().dot(new Vec3(0, 0, -1)) < 0.42;
    if (outOfView) {
      continue;
    }
    for (const facet of shape.facets) {
      let vShading = [];
      const currentFacet = [];
      // convert to world space
      for (const point of facet) {
        const pt = point.transform(pointTransform);
        pt.normal = point.normal?.transform(rotationTransform);
        currentFacet.push(pt);
      }
      currentFacet.color = facet.color || shape.color;

      if (shape.pointCloud || shape.wireframe) {
        rasterizer.pushPolygon(currentFacet, currentFacet.color);
      } else {
        /**@type{Vec3}*/let sNormal;
        sNormal = facet.normal.transform(rotationTransform);
        if (!shape.disableBackfaceCulling) {
          // back face culling doesn't work on a couple of the models,
          // maybe they're left handed or something.
          let pointOnPlane = currentFacet[2];
          if (sNormal.dot(pointOnPlane) > 0) {
            continue;
          }
        }

        if (currentFacet.color instanceof Vec3) {
          const lightIntensity = light.intensity * shape.contrast; // maybe contrast isn't the right word
          if (currentFacet[0].normal) {
            for (const pt of currentFacet) {
              const lightRay = lightOrigin.sub(pt);
              const attenuation = lightIntensity / lightRay.magnitude;
              let shading = pt.normal.dot(lightRay.normalize());
              shading *= attenuation;
              shading *= 1 - light.ambient;
              shading += light.ambient;
              vShading.push(shading);
            }
          } else {
            vShading = null;
            const lightRay = lightOrigin.sub(currentFacet[0]);
            const attenuation = lightIntensity / lightRay.magnitude;
            if (!sNormal) {
              sNormal = facet.normal.transform(rotationTransform);
            }
            let shading = sNormal.dot(lightRay.normalize());
            shading *= attenuation;
            shading *= 1 - light.ambient;
            shading += light.ambient;
            currentFacet.color = currentFacet.color.scale(shading);
          }
        }
      }

      rasterizer.pushPolygon(currentFacet, currentFacet.color, { vShading });
    }
  }
  ctx.putImageData(rasterizer.imageData, 0, 0);
  updateCameraLocation();
}

function initializePointerEvents() {
  const movementScale = 3 / Math.min(rasterW, rasterH);
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
    const translation = movement.scale(scale).transform(camera.rotation.invert());
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
  // const near = document.getElementById('near');
  // near.value = screen.near;
  // near.addEventListener('change', e => {
  //   screen.near = Number(e.target.value);
  //   render();
  // });

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

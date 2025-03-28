import { Camera } from '../camera.js';
import { Floor } from '../shapes.js';
import { Geometry, Plane } from '../geometry.js';
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
  new Floor(new Vec3(0, -1, -12), {size: 15, color: new Vec3(0.65, 0.72, 0.67)}),
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
/**@type{Plane}*/
let clippingPlane;
let clippedZ;

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

  const externalModels = [
    new ObjFile('../../models/lamp.obj').parse().then(Model => {
      const model = new Model(new Vec3(2, 0, -12), {size: 0.3, disableBackfaceCulling: true, contrast: 2.7});
      shapes.push(model);
    }),
    new ObjFile('../../models/power_lines.obj').parse().then(Model => {
      const model = new Model(new Vec3(4, 4.9, -14), {size: 0.1, disableBackfaceCulling: true});
      shapes.push(model);
    }),
    new ObjFile('../../models/cessna.obj').parse().then(Model => {
      const model = new Model(new Vec3(-10, 6, -50), {size: 0.3, rotateZ: -0.2, rotateX: 0.4, disableBackfaceCulling: true, contrast: 0.01});
      shapes.push(model);
    }),
    new ObjFile('../../models/minicooper_no_windows.obj').parse().then(Model => {
      const model = new Model(new Vec3(0, -1, -10), {size: 0.03, color: new Vec3(0.4, 0.53, 0.7), rotateX: -Math.PI / 2, rotateY: 0.3});
      shapes.push(model);
    }),
    new ObjFile('../../models/car.obj').parse().then(Model => {
      const model = new Model(new Vec3(-3, -1, -14), {color: new Vec3(1.1, 0.9, 0.12), rotateY: -Math.PI / 2, disableBackfaceCulling: true});
      shapes.push(model);
    }),
    new ObjFile('../../models/al.obj').parse().then(Model => {
      const model = new Model(new Vec3(-4, -0.02, -12), {size: 0.3, color: new Vec3(3,3,3), rotateY: Math.PI / 3, rotateZ: -0.08, contrast: 1.4, disableBackfaceCulling: true});
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
  clippingPlane = new Plane(new Vec3(0, 0, 1), -screen.near);
  clippedZ = clippingPlane.d - 5e-5;

  initializeKeyboardEvents();
  initializePointerEvents();
  initializeSettings();

  Promise.all(externalModels).then(() => requestAnimationFrame(render));
}

function render() {
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
      const clipPts = [];
      let vShading = [];
      // convert to world space & clip surfaces behind the camera
      // TODO clip the whole viewing frustrum, should improve performance
      for (let i = 0; i < facet.length; i ++) {
        const point = facet[i];
        const pt = point.transform(pointTransform);
        pt.normal = point.normal?.transform(rotationTransform);
        currentFacet.push(pt);
        if (pt.z >= screen.near) {
          pt.index = i;
          clipPts.push(pt);
        }
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
      if (clipPts.length == currentFacet.length) {
        // all vertices are clipped so there's nothing to render
        continue;
      } else if (clipPts.length) {
        let a, b;
        const firstClipped = clipPts[0];
        const firstPrev = facet.at(firstClipped.index - 1);
        const firstNext = facet.at((firstClipped.index + 1) % facet.length);
        const lastClipped = clipPts.at(-1);
        const lastPrev = facet.at(lastClipped.index - 1);
        const lastNext = facet.at((lastClipped.index + 1) % facet.length);
        if (firstPrev.z < screen.near) {
          a = firstPrev;
        } else if (firstNext.z < screen.near) {
          a = firstNext;
        } else {
          // this probably shouldn't happen but if it does we have to
          // abandon clipping, maybe continue instead of break
          break;
        }
        if (lastNext.z < screen.near) {
          b = lastNext;
        } else if (lastPrev.z < screen.near) {
          b = lastPrev;
        } else {
          // this probably shouldn't happen but if it does we have to
          // abandon clipping, maybe continue instead of break
          break;
        }
        const aIntersect = clippingPlane.intersection(firstClipped, a);
        const bIntersect = clippingPlane.intersection(lastClipped, b);
        aIntersect.z = clippedZ; // something is probably wrong with intersection calculation
        bIntersect.z = clippedZ;
        aIntersect.normal = firstClipped.normal; // not exactly right but good enough
        bIntersect.normal = lastClipped.normal;
        const discard = clipPts.slice(1, -1);
        currentFacet.splice(firstClipped.index, 1, aIntersect);
        discard.forEach(d => currentFacet.splice(currentFacet.findIndex(c => c === d), 1));
        let lastIndex, deleteCount;
        if (firstClipped === lastClipped) {
          lastIndex = currentFacet.findIndex(c => c === aIntersect);
          deleteCount = 0;
        } else {
          lastIndex = currentFacet.findIndex(c => c === lastClipped);
          deleteCount = 1;
        }
        currentFacet.splice(lastIndex, deleteCount, bIntersect);
      }
      currentFacet.color = facet.color || shape.color;

      if (shape.pointCloud || shape.wireframe) {
        rasterizer.pushPolygon(currentFacet, currentFacet.color);
      } else {

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
            const lightRay = lightOrigin.sub(shapeLocation);
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

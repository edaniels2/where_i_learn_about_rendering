import { Camera } from './camera.js';
import { Cube, Pyramid } from './shapes.js';
import { Dinosaur } from './dino.js';
import { Geometry } from './geometry.js';
import { SquareMatrix } from '../matrix.js';
import { Teapot } from './teapot.js';
import { Vec3 } from '../vector.js';

// pretty happy with everything except detecting click on shapes, it barely works
// TODO: how to display polygons when some vertices cross the z=0 plane?

// WIP; supposedly a perspective projection matrix
// const projectionMatrix  = new SquareMatrix();
// const n = 0.5;
// const f = 10;
// const fov = 90;
// const s = 1 / Math.tan((fov / 2) * (Math.PI / 180));
// const sz = -f / (f - n);
// const tz = -(f * n) / (f - n);
// projectionMatrix.set([
//   [s, 0, 0, 0],
//   [0, s, 0, 0],
//   [0, 0, sz, -1],
//   [0, 0, tz, 0],
// ]);

// move constants to a config file
const camera = new Camera();

const light = {
  origin: new Vec3(-10, 16, -2),
  ambient: 0.25,
};
const table = new Cube(new Vec3(0, -0.75, -5), {size: 0.5, color: new Vec3(0.9, 0.8, 0.8)});
const shapes = [
  table,
  new Teapot(new Vec3(0, -0.5, -5), {size: 0.1, color: new Vec3(0.9, 0.95, 1), topOf: table}),
  new Dinosaur(new Vec3(-1, -0.4, -5), {size: 0.08, opacity: 0.5, rotateY: -0.1, strokeStyle: '#444'}),
  new Pyramid(new Vec3(-3, -0.5, -7), {opacity: 0.5}),
  new Pyramid(new Vec3(2.5, -0.5, -3), {opacity: 0.5}),
  new Cube(new Vec3(3, -0.5, -7), {opacity: 0.5}),
  new Cube(new Vec3(-2.5, -0.5, -3), {opacity: 0.5}),
];

let /**@type{number}*/worldW, /**@type{number}*/worldH;
let prevT = 0, prevX = 0, prevY = 0;
let /**@type{number}*/halfWorldW, /**@type{number}*/halfWorldH;
let /**@type{number}*/rasterW, /**@type{number}*/rasterH;
let /**@type{HTMLCanvasElement}*/canvas, /**@type{CanvasRenderingContext2D}*/ctx;
let movement = new Vec3, prevMovementTime = 0;

export function main() {
  canvas = document.querySelector('canvas');
  ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  rasterW = canvas.width = width;
  rasterH = canvas.height = height;
  const aspect = width / height;
  if (width > height) {
    worldW = aspect;
    worldH = worldW / aspect;
  } else if (height > width) {
    worldH = 1 / aspect;
    worldW = worldH * aspect;
  }
  halfWorldW = worldW / 2;
  halfWorldH = worldH / 2;

  initializeKeyboardEvents();
  initializePointerEvents();
  initializeLighting();

  requestAnimationFrame(render);
}

function render() {
  const cameraTransform = camera.positionAndScale.multiply(camera.rotation);
  ctx.clearRect(0, 0, rasterW, rasterH);
  shapes.sort((a, b) => {
    if (a.topOf === b) {
      return 1;
    }
    if (b.topOf === a) {
      return -1;
    }
    return a.location.transform(cameraTransform).z - b.location.transform(cameraTransform).z;
  });
  for (const shape of shapes) {
    const pointTransform = shape.rotation.multiply(shape.positionAndScale).multiply(cameraTransform);
    // should use fov angle for compare, but this works
    const outOfView = shape.location.transform(cameraTransform)
      .normalize().dot(new Vec3(0, 0, -1)) < 0.5;
    if (outOfView) {
      continue;
    }
    const frameFacets = [];
    for (const facet of shape.facets) {
      const currentFacet = [];
      // convert to world space
      for (const point of facet) {
        currentFacet.push(point.transform(pointTransform));
      }
      currentFacet.color = facet.color || shape.color;

      if (shape.pointCloud) {
        frameFacets.push(currentFacet);
      } else {
        // draw if surface normal points toward the camera or object is transparent
        const normal = facet.normal.transform(shape.rotation.multiply(camera.rotation));
        let pointOnPlane = currentFacet[2];
        if (normal.dot(pointOnPlane) < 0) {
          currentFacet.facing = true;
        }
        if (currentFacet.facing || shape.opacity != 1) {
          frameFacets.push(currentFacet);
          if (currentFacet.color instanceof Vec3) {
            const origin = light.origin.transform(cameraTransform);
            const fCenter = currentFacet.reduce((t, p) => t = t.add(p)).scale(1 / currentFacet.length);
            const attenuation = origin.sub(fCenter).magnitude * 0.05;
            let lighting = normal.normalize().dot(origin.sub(fCenter).normalize());
            lighting /= attenuation;
            lighting *= 1 - light.ambient;
            lighting += light.ambient;
            currentFacet.color = currentFacet.color.scale(lighting);
          }
        }
      }
    }

    // maybe
    if (shape.opacity) {
      frameFacets.sort((a, b) => a.facing == b.facing ? 0 : (a.facing ? 1 : (b.facing ? -1 : 0)));
    }
    if (shape.zSortFacets) {
      frameFacets.sort((a, b) => {
        if (Math.min(...a.map(p => p.z)) - Math.max(...b.map(p => p.z)) > 0.1) {
          return 1;
        }
        if (Math.min(...a.map(p => p.z)) - Math.min(...b.map(p => p.z)) > 1e-5) {
          return 1;
        }
        return 0;
      });
    }

    for (const facet of frameFacets) {
      ctx.beginPath();
      let first = true;
      let colorString = '';
      if (facet.color instanceof Vec3) {
        colorString = `color(display-p3 ${facet.color.x} ${facet.color.y} ${facet.color.z}`;
        if (shape.opacity || facet.opacity) {
          colorString += ` / ${shape.opacity}`;
        }
        colorString += ')';
      } else {
        colorString = facet.color || 'lightblue';
      }
      for (const pt of facet) {
        // this is the conversion from world coordinates in 3d space
        // to display coordinates. Ideally figure out how to handle
        // with a matrix tranform (the perspective projection matrix)
        // const projected = pt.transform(projectionMatrix);
        // const x = (projected.x + halfWorldW) / worldW * rasterW;
        // const y = (1 - (projected.y + halfWorldH) / worldH) * rasterH;
        const x = (pt.x / Math.abs(pt.z) + halfWorldW) / worldW * rasterW;
        const y = (1 - (pt.y / Math.abs(pt.z) + halfWorldH) / worldH) * rasterH;

        if (shape.pointCloud) {
          const fillSize = 25 / -pt.z;
          ctx.fillStyle = 'lightblue'
          ctx.fillRect(x, y, fillSize, fillSize);
        } else {
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.strokeStyle = shape.strokeStyle || colorString;
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = colorString;
      ctx.strokeStyle = shape.strokeStyle || colorString;
      if (!shape.pointCloud) {
        if (shape.facetOutline || !shape.opacity) {
          ctx.closePath();
          ctx.stroke();
        }
        ctx.fill();
      }
    }
  }
  updateCameraLocation();
}

function initializeLighting() {
  const lightingInput = {
    x: document.getElementById('lightX'),
    y: document.getElementById('lightY'),
    z: document.getElementById('lightZ'),
    ambient: document.getElementById('lightA'),
  };
  lightingInput.x.value = light.origin.x;
  lightingInput.y.value = light.origin.y;
  lightingInput.z.value = light.origin.z;
  lightingInput.ambient.value = light.ambient * 100;

  for (const c of ['x', 'y', 'z']) {
    lightingInput[c].addEventListener('change', () => {
      light.origin[c] = Number(lightingInput[c].value);
      render();
    });
  }
  lightingInput.ambient.addEventListener('change', () => {
    light.ambient = Number(lightingInput.ambient.value) / 100;
    render();
  });

  return light;
}

function initializePointerEvents() {
  const movementScale = 3 / Math.min(rasterW, rasterH);
  canvas.addEventListener('pointerdown', mouseDown);

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
    const transform = camera.positionAndScale.multiply(camera.rotation);
    for (const shape of shapes) {
      if (shape.fixed) {
        continue;
      }
      const shapeLocation = shape.location.transform(transform);
      const hitbox = shape.getHitBox(transform, worldW, worldH, rasterW, rasterH);
      const hit = clickCoords.y > hitbox.top && clickCoords.y < hitbox.bottom
        && clickCoords.x < hitbox.right && clickCoords.x > hitbox.left;
      if (hit && (!hitObj || hitObj.depth < -shapeLocation.z)) {
        hitObj = shape;
      }
    }
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

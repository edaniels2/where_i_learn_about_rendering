import { Cube, Geometry, Pyramid } from './geometry.js';
import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';

// WIP; supposedly a perspective projection matrix
// const projectionMatrix  = new SquareMatrix();
// const n = 0.5;
// const f = 100;
// const fov = 60;
// const s = 1 / Math.tan(fov * (Math.PI / 180)); // if not square scale x and y must account for aspect ratio
// const sz = -f / (f - n);
// const tz = -(f * n) / (f - n);
// projectionMatrix.set([
//   [s, 0, 0, 0],
//   [0, s, 0, 0],
//   [0, 0, sz, -1],
//   [0, 0, tz, 0],
// ]);

// move constants to a config file

const light = {
  origin: new Vec3(2, 2, 0),
  ambient: 0.4,
};
const shapes = [
  new Pyramid(new Vec3(-1, 0, -4)),
  new Cube(new Vec3(1, 0, -4))
];

const worldW = 1, worldH = 1;
const halfWorldW = worldW / 2, halfWorldH = worldH / 2;
let prevT = 0, prevX = 0, prevY = 0;
let /**@type{number}*/rasterW, /**@type{number}*/rasterH;
let /**@type{HTMLCanvasElement}*/canvas, /**@type{CanvasRenderingContext2D}*/ctx;

export function main() {
  canvas = document.querySelector('canvas');
  ctx = canvas.getContext('2d');
  rasterW = canvas.width;
  rasterH = canvas.height;

  initializePointer();
  initializeLighting();

  requestAnimationFrame(() => render());
}

function render() {
  ctx.clearRect(0, 0, rasterW, rasterH);
  for (const shape of shapes) {
    const facets = shape.facets;
    const frameFacets = [];
    for (const facet of facets) {
      const currentFacet = [];
      // convert to world space
      for (const point of facet) {
        currentFacet.push(point.transform(shape.rotationMatrix.multiply(shape.positionMatrix)));
        currentFacet.color = facet.color;
        currentFacet.label = facet.label;
      }

      // find the normal to the surface and only draw if it points toward the camera
      const a0 = currentFacet[0].sub(currentFacet[2]);
      const a1 = currentFacet[1].sub(currentFacet[2]);
      let normal = a0.cross(a1);
      // if the norm is pointing "in" to the center of the shape it must be reversed
      if (normal.dot(currentFacet[2].transform(shape.positionMatrix.invert())) < 0) {
        normal = normal.scale(-1);
      }
      if (normal.dot(currentFacet[2]) < 0) {
        frameFacets.push(currentFacet);
      }
      if (currentFacet.color instanceof Vec3) {
        const fCenter = currentFacet.reduce((t, p) => t = t.add(p)).scale(1 / currentFacet.length);
        let lighting = normal.normalize().dot(light.origin.sub(fCenter).normalize());
        lighting = clamp(lighting, 0, 1 - light.ambient) + light.ambient;
        currentFacet.color = currentFacet.color.scale(lighting);
      }
    }

    for (const facet of frameFacets) {
      ctx.beginPath();
      let first = true;
      for (const pt of facet) {
        // this is the conversion from world coordinates in 3d space
        // to display coordinates. Ideally figure out how to handle
        // with a matrix tranform (the perspective projection matrix)
        const x = (pt.x / -pt.z + halfWorldW) / worldW * rasterW;
        const y = (1 - (pt.y / -pt.z + halfWorldH) / worldH) * rasterH;
  
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.strokeStyle = 'black';
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
      if (facet.color instanceof Vec3) {
        ctx.strokeStyle = `color(display-p3 ${facet.color.x} ${facet.color.y} ${facet.color.z}`;
        ctx.fillStyle = `color(display-p3 ${facet.color.x} ${facet.color.y} ${facet.color.z}`;
      } else {
        ctx.strokeStyle = facet.color;
        ctx.fillStyle = facet.color;
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
  }
}

function clamp(/**@type{number}*/value, /**@type{number}*/min, /**@type{number}*/max) {
  if (value <= min) {
    return min;
  }
  if (value >= max) {
    return max;
  }
  return value;
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

function initializePointer() {
  const movementScaleX = 3 / canvas.getBoundingClientRect().width;
  const movementScaleY = 3 / canvas.getBoundingClientRect().height;
  canvas.addEventListener('pointerdown', mouseDown);

  function mouseDown(/**@type{PointerEvent}*/event) {
    const {
      top: canvasTop,
      left: canvasLeft,
      width: canvasWidth,
      height: canvasHeight,
    } = canvas.getBoundingClientRect();
    const clickCoords = new Vec3(
      (event.clientX - (canvasLeft + canvasWidth / 2)) / canvasWidth * worldW,
      ((canvasTop + canvasHeight / 2) - event.clientY) / canvasHeight * worldH,
      0);
    prevX = event.pageX;
    prevY = event.pageY;
    for (const shape of shapes) {
      const worldCoords = clickCoords.scale(shape.depth);
      worldCoords.z = -shape.depth;
      // simple hitbox, for now at least. checking to see if vectors from opposite corners
      // of a boundary box around the shape have some component along both the x and y axis
      // toward the center. it works well enough, but eventually I'd like to figure out how
      // to check for intersection with a triangle
      const topLeft = worldCoords.sub(shape.topLeft);
      const bottomRight = worldCoords.sub(shape.bottomRight);
      const hit = topLeft.dot(new Vec3(1, 0, 0)) > 0 && topLeft.dot(new Vec3(0, -1, 0)) > 0
        && bottomRight.dot(new Vec3(-1, 0, 0)) > 0 && bottomRight.dot(new Vec3(0, 1, 0)) > 0
      if (hit) {
        const moveShape = e => mouseMove(e, shape);
        document.addEventListener('pointermove', moveShape);
        document.addEventListener('pointerup', () => document.removeEventListener('pointermove', moveShape));
        return;
      }
    }
  }

  function mouseMove(/**@type{PointerEvent}*/event, /**@type{Geometry}*/shape = null) {
    const movingShapes = shape ? [ shape ] : shapes;
    for (const shape of movingShapes) {
      shape.rotateY((event.pageX - prevX) * movementScaleX);
      shape.rotateX((event.pageY - prevY) * movementScaleY);
    }
    prevX = event.pageX;
    prevY = event.pageY;
    requestAnimationFrame(t => {
      if (t != prevT) {
        render();
      }
      prevT = t;
    });
  }
}

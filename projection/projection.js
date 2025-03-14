import { Cube, Geometry, Pyramid } from './geometry.js';
import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';
import { Teapot } from './teapot.js';
import { Dinosaur } from './dino.js';


const projectionMatrix  = new SquareMatrix();
// move constants to a config file

const light = {
  origin: new Vec3(2, 2, 0),
  ambient: 0.4,
};
const shapes = [
  new Dinosaur(new Vec3(-4, -2, -15), {size: .3, opacity: 0.6, strokeStyle: '#444'}),
  new Pyramid(new Vec3(-3, 0.5, -16), {size: 4, opacity: 0.9}),
  new Cube(new Vec3(10, 5, -35), {size: 10}),
  new Cube(new Vec3(1, -1, -10), {size: 3, opacity: 0.7, rotateX: 0.707, rotateY: -0.3, rotateZ: 0.1}),
  new Teapot(new Vec3(-3, 4, -18), {rotateX: 0.3})
];

let worldW = 1, worldH = 1;
let prevT = 0, prevX = 0, prevY = 0;
let /**@type{number}*/halfWorldW, /**@type{number}*/halfWorldH;
let /**@type{number}*/rasterW, /**@type{number}*/rasterH;
let /**@type{HTMLCanvasElement}*/canvas, /**@type{CanvasRenderingContext2D}*/ctx;

export function main() {
  canvas = document.querySelector('canvas');
  ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  rasterW = canvas.width = width;
  rasterH = canvas.height = height;
  const aspect = width / height;
  if (width > height) {
    worldW = aspect;
  } else if (height > width) {
    worldH = 1 / aspect;
  }
  halfWorldW = worldW / 2;
  halfWorldH = worldH / 2;

  // WIP; supposedly a perspective projection matrix
  // const n = 0.5;
  // const f = 100;
  // const fov = 60;
  // const s = 1 / Math.tan((fov / 2) * (Math.PI / 180));
  // const sz = -f / (f - n);
  // const tz = -(f * n) / (f - n);
  // projectionMatrix.set([
  //   [s * aspect, 0, 0, 0],
  //   [0, s, 0, 0],
  //   [0, 0, sz, -1],
  //   [0, 0, tz, 0],
  // ]);

  initializePointerEvents();
  initializeLighting();

  requestAnimationFrame(render);
}

function render() {
  ctx.clearRect(0, 0, rasterW, rasterH);
  shapes.sort((a, b) => b.depth - a.depth);
  for (const shape of shapes) {
    const pointTransform = shape.rotation.multiply(shape.positionAndScale);
    const facets = shape.facets;
    const frameFacets = [];
    for (const facet of facets) {
      const currentFacet = [];
      // convert to world space
      for (const point of facet) {
        currentFacet.push(point.transform(pointTransform));
      }
      currentFacet.color = facet.color;

      if (shape.pointCloud || shape.flat) {
        frameFacets.push(currentFacet);
      } else {
        // only draw if surface normal points toward the camera
        const normal = facet.normal.transform(shape.rotation);
        let pointOnPlane = currentFacet[2];
        if (normal.dot(pointOnPlane) < 0) {
          currentFacet.facing = true;
        }
        if (currentFacet.facing || shape.opacity != 1) {
          frameFacets.push(currentFacet);
        }
        if (currentFacet.color instanceof Vec3) {
          const fCenter = currentFacet.reduce((t, p) => t = t.add(p)).scale(1 / currentFacet.length);
          const attenuation = light.origin.sub(fCenter).magnitude * 0.1;
          let lighting = normal.normalize().dot(light.origin.sub(fCenter).normalize()) / attenuation;
          lighting = clamp(lighting, 0, 1 - light.ambient) + light.ambient;
          currentFacet.color = currentFacet.color.scale(lighting);
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
        const x = (pt.x / -pt.z + halfWorldW) / worldW * rasterW;
        const y = (1 - (pt.y / -pt.z + halfWorldH) / worldH) * rasterH;

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
        if (!shape.opacity) {
          ctx.closePath();
          ctx.stroke();
        }
        ctx.fill();
      }
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

function initializePointerEvents() {
  const movementScale = 3 / Math.min(rasterW, rasterH);
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
    /**@type{Geometry}*/let hitObj;
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
        && bottomRight.dot(new Vec3(-1, 0, 0)) > 0 && bottomRight.dot(new Vec3(0, 1, 0)) > 0;
      if (hit && (!hitObj || hitObj.depth > shape.depth)) {
        hitObj = shape;
      }
    }
    if (hitObj) {
      const moveShape = e => mouseMove(e, hitObj);
      document.addEventListener('pointermove', moveShape);
      document.addEventListener('pointerup', () => document.removeEventListener('pointermove', moveShape));
    }
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

import { Cube, Geometry } from './geometry.js';
import { Vec3 } from '../vector.js';

const worldW = 1, worldH = 1;
const halfWorldW = worldW / 2, halfWorldH = worldH / 2;
let prevT = 0, prevX = 0, prevY = 0;
let rasterW, rasterH;
export function main() {
  const canvas = document.querySelector('canvas');
  rasterW = canvas.width;
  rasterH = canvas.height;
  const ctx = canvas.getContext('2d');
  // TODO update render fn to handle multiple objects
  const shape = new Cube(new Vec3(0, 0, -2));

  // WIP; supposedly a perspective projection matrix
  // let t  = new SquareMatrix();
  // const n = 0.5;
  // const f = 5.5;
  // const fov = 60;
  // const s = 1 / Math.tan(fov * Math.PI / 360); // if not square scale x and y must account for aspect ratio
  // t.set([
  //   [s, 0, 0, 0],
  //   [0, s, 0, 0],
  //   [0, 0, -f / (f - n), -1],
  //   [0, 0, -(f * n) / (f - n), 0],
  // ]);

  document.addEventListener('pointerdown', mouseDown);

  function mouseDown(/**@type{PointerEvent}*/event) {
    prevX = event.pageX;
    prevY = event.pageY;
    document.addEventListener('pointermove', mouseMove);
    document.addEventListener('pointerup', () => document.removeEventListener('pointermove', mouseMove));
  }

  const movementScaleX = 3 / canvas.getBoundingClientRect().width;
  const movementScaleY = 3 / canvas.getBoundingClientRect().height;
  function mouseMove(/**@type{PointerEvent}*/event) {
    shape.rotateY((event.pageX - prevX) * movementScaleX);
    shape.rotateX((event.pageY - prevY) * movementScaleY);
    prevX = event.pageX;
    prevY = event.pageY;
  }

  requestAnimationFrame(() => render(shape, ctx));
}

function render(/**@type{Geometry}*/shape, /**@type{CanvasRenderingContext2D}*/ctx) {
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
    let aNorm = a0.cross(a1);
    // if the norm is pointing "in" to the center of the shape it must be reversed
    if (aNorm.dot(currentFacet[2].transform(shape.positionMatrix.invert())) < 0) {
      aNorm = aNorm.scale(-1);
    }
    if (aNorm.dot(currentFacet[2]) < 0) {
      frameFacets.push(currentFacet);
    }
  }

  ctx.clearRect(0, 0, rasterW, rasterH);
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
    ctx.closePath();
    if (facet.color instanceof Vec3) {
      ctx.strokeStyle = `color(display-p3 ${facet.color.x} ${facet.color.y} ${facet.color.z}`;
      ctx.fillStyle = `color(display-p3 ${facet.color.x} ${facet.color.y} ${facet.color.z}`;
    } else {
      ctx.strokeStyle = facet.color;
      ctx.fillStyle = facet.color;
    }
    ctx.stroke();
    ctx.fill();
  }

  requestAnimationFrame(t => {
    // probably not needed
    if (t === prevT) {
      return;
    }
    render(shape, ctx);
    prevT = t;
  });
}

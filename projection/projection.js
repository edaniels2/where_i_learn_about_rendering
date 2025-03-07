import { SquareMatrix } from "../matrix.js";
import { Vec3 } from "../vector.js";

let width, height;
export function main() {
  const canvas = document.querySelector('canvas');
  width = canvas.width;
  height = canvas.height;
  const ctx = canvas.getContext('2d');
  const facets = [
    // back
    [new Vec3(-.5, .5, -2), new Vec3(-.5, -.5, -2), new Vec3(.5, -.5, -2)],
    [new Vec3(-.5, .5, -2), new Vec3(.5, .5, -2), new Vec3(.5, -.5, -2)],
    // bottom
    [new Vec3(-.5, -.5, -2), new Vec3(-.5, -.5, -1), new Vec3(.5, -.5, -1)],
    [new Vec3(-.5, -.5, -2), new Vec3(.5, -.5, -2), new Vec3(.5, -.5, -1)],
    // right
    [new Vec3(.5, .5, -1), new Vec3(.5, .5, -2), new Vec3(.5, -.5, -2)],
    [new Vec3(.5, .5, -1), new Vec3(.5, -.5, -1), new Vec3(.5, -.5, -2)],
    // left
    [new Vec3(-.5, .5, -1), new Vec3(-.5, .5, -2), new Vec3(-.5, -.5, -2)],
    [new Vec3(-.5, .5, -1), new Vec3(-.5, -.5, -1), new Vec3(-.5, -.5, -2)],
    // top
    [new Vec3(.5, .5, -1), new Vec3(-.5, .5, -1), new Vec3(-.5, .5, -2)],
    [new Vec3(-.5, .5, -2), new Vec3(.5, .5, -2), new Vec3(.5, .5, -1)],
    // front
    [new Vec3(-.5, .5, -1), new Vec3(-.5, -.5, -1), new Vec3(.5, -.5, -1)],
    [new Vec3(-.5, .5, -1), new Vec3(.5, .5, -1), new Vec3(.5, -.5, -1)],

  ];
  let t  = new SquareMatrix();
  const n = 0.5;
  const f = 5.5;
  const fov = 60;
  const s = 1 / Math.tan(fov * Math.PI / 360); // if not square scale x and y must be separated using aspect ratio
  t.set([ // wip; supposedly a perspective projection matrix
    [s, 0, 0, 0],
    [0, s, 0, 0],
    [0, 0, -f / (f - n), -1],
    [0, 0, -(f * n) / (f - n), 0],
  ]);

  document.addEventListener('pointerdown', mouseDown);

  function mouseDown(/**@type{PointerEvent}*/event) {
    const downFn = mouseMove.bind(null, event.pageX, event.pageY);
    document.addEventListener('pointermove', downFn);
    document.addEventListener('pointerup', () => document.removeEventListener('pointermove', downFn));
  }

  function mouseMove(startX, startY, /**@type{PointerEvent}*/event) {
    rotateY = (startX + event.clientX) * 1e-2;
    rotateX = (startY - event.clientY) * 1e-2;
  }

  requestAnimationFrame(() => render(facets, ctx));
}

let prevT = 0;
let rotateX = 0, rotateY = 0;
function render(/**@type{Vec3[][]}*/facets, /**@type{CanvasRenderingContext2D}*/ctx) {
  const frameFacets = [];
  for (const facet of facets) {
    const currentFacet = [];
    for (const point of facet) {
      // this is not the way it's generally done
      currentFacet.push(point.transform(
        SquareMatrix.translate(0, 0, 1.5) // align with world axes (defined the cube with z = -1.5 at the center)
          .multiply(SquareMatrix.rotationX(rotateX)) // randomized rotation to test viewing angles
          .multiply(SquareMatrix.rotationY(rotateY))
          .multiply(SquareMatrix.translate(0, 0, -1.5)) // put it back to original distance
      ));
    }
    frameFacets.push(currentFacet);
  }
  frameFacets.sort((a, b) => {
    const avgZa = a.reduce((total, p) => total + p.z, 0) / a.length;
    const avgZb = b.reduce((total, p) => total + p.z, 0) / b.length;
    if (avgZa === avgZb) {
      return 0;
    }
    return avgZa > avgZb ? 1 : -1;
  });
  ctx.clearRect(0, 0, width, height);
  for (const facet of frameFacets) {
    ctx.beginPath();
    let first = true;
    for (const pt of facet) {
      const x = (pt.x / -pt.z + 1) / 2 * width;
      const y = (1 - (pt.y / -pt.z + 1) / 2) * height;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    ctx.stroke();
    ctx.fillStyle = 'lightblue';
    ctx.fill();
  }

  requestAnimationFrame(t => {
    if (t === prevT) {
      return;
    }
    render(facets, ctx);
    prevT = t;
  });
}

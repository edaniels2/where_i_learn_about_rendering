const WRITE_32 = true;
const ANTI_ALIASING = false;
const PROJECTION_MATRIX = true;
const PERSPECTIVE_CORRECTION = {
  z: false,
  shading: false, // probably never needed?
};

/**@type OffscreenCanvasRenderingContext2D */
// let ctx;
// /**@type ImageData */
// let imageData;
/**@type Uint8ClampedArray */
let imageBuffer;
/**@type Float64Array */
let zBuffer;
/**@type Float64Array */
let colorBuffer;
/**@type SquareMatrix */
let projectionMatrix;
/**@type number */
let halfWidth;
/**@type number */
let halfHeight;
/**@type number */
let worldWidthInv;
/**@type number */
let worldHeightInv;
let screen, width, height;

onmessage = function (/**@type{MessageEvent<{imageBuffer: SharedArrayBuffer, zBuffer: SharedArrayBuffer, width: number, height: number, screen, triangle: {vertices: number[][], attributes: object}, render: boolean}>}*/e) {

  if (e.data.triangle) {
    pushTriangle(e.data.triangle);
    return;
  }

  if (e.data.render) {
    // ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (e.data.clear) {
    imageBuffer.fill(255);
    zBuffer.fill(Infinity);
    // colorBuffer.fill(1);
    return;
  }

  if (e.data.imageBuffer) {
    screen = e.data.screen;
    width = e.data.width;
    height = e.data.height;
    const n = screen.focalLength;
    const f = screen.farClip;
    const s = n / screen.right;
    const sz = -f / (f - n);
    const tz = -2 * f * n / (f - n);
    // ctx = e.data.canvas.getContext('2d');
    // imageData = new ImageData(e.data.width, e.data.height);
    if (WRITE_32) {
      imageBuffer = new Uint32Array(e.data.imageBuffer);
    } else {
      imageBuffer = new Uint8ClampedArray(e.data.imageBuffer);
    }
    // imageData.data.set(imageBuffer);
    zBuffer = new Float64Array(e.data.zBuffer);
    // colorBuffer = new Float64Array(width * height * 4).fill(1);
    projectionMatrix  = new SquareMatrix();
    projectionMatrix.set([
      [s, 0, 0, 0],
      [0, s, 0, 0],
      [0, 0, sz, -1],
      [0, 0, tz, 0],
    ]);
    halfWidth = width / 2;
    halfHeight = height / 2;
    worldWidthInv = 1 / screen.right;
    worldHeightInv = 1 / screen.top;
  }

}

function pushTriangle(/**@type{{vertices: number[][], attributes: object}}*/triangle) {
  /**@type{Vec3[]}*/const rasterVts = [];
  const vertices = triangle.vertices;
  const vShading = triangle.attributes?.vShading;
  let color = new Vec3(triangle.attributes.color.x, triangle.attributes.color.y, triangle.attributes.color.z);
  let top = height, left = width, bottom = 0, right = 0;

  for (let i = 0; i < vertices.length; i++) {
    let pt = worldToRaster(vertices[i]);
    rasterVts.push(pt);
    if (pt.y < top) {
      top = Math.max(Math.floor(pt.y), 0);
    }
    if (pt.y > bottom) {
      bottom = Math.min(Math.ceil(pt.y), height);
    }
    if (pt.x < left) {
      left = Math.max(Math.floor(pt.x), 0);
    }
    if (pt.x > right) {
      right = Math.min(Math.ceil(pt.x), width);
    }
  }
  if (!(left < right) || !(top < bottom)) {
    return;
  }

  let z10, z20, shad10, shad20;
  if (PERSPECTIVE_CORRECTION.z) {
    z10 = 1 / rasterVts[1].z - 1 / rasterVts[0].z;
    z20 = 1 / rasterVts[2].z - 1 / rasterVts[0].z;
  } else {
    z10 = rasterVts[1].z - rasterVts[0].z;
    z20 = rasterVts[2].z - rasterVts[0].z;
  }
  if (PERSPECTIVE_CORRECTION.shading) {
    shad10 = vShading ? (1 / vShading[1] - 1 / vShading[0]) : null;
    shad20 = vShading ? (1 / vShading[2] - 1 / vShading[0]) : null;
  } else {
    shad10 = vShading ? (vShading[1] - vShading[0]) : null;
    shad20 = vShading ? (vShading[2] - vShading[0]) : null;
  }

  const w1Gen = getEdgeCalculations(rasterVts[2], rasterVts[0], {x: left, y: top});
  const w2Gen = getEdgeCalculations(rasterVts[0], rasterVts[1], {x: left, y: top});
  const area = edgeFn(rasterVts[0], rasterVts[1], rasterVts[2]);
  const areaInv = 1 / area;
  // const tileSize = 8; // wip

  for (let y = top; y < bottom; y++) {
    let hit = false;
    for (let x = left; x < right; x++) {

      const weight = pxWeight(/* w0Gen,  */w1Gen, w2Gen, area);
      if (!weight) {
        if (hit) {
          break;
        }
        w1Gen.nextX();
        w2Gen.nextX();
        continue;
      }
      hit = true;

      const w1 = w1Gen.current() * areaInv;
      const w2 = w2Gen.current() * areaInv;
      const pt  = new Vec3(x, y, 1);
      let ptColor = color;

      if (PERSPECTIVE_CORRECTION.z) {
        pt.z = 1 / (1 / rasterVts[0].z + w1 * z10 + w2 * z20);
      } else {
        // pt.z = w0 * rasterVts[0].z + w1 * rasterVts[1].z + w2 * rasterVts[2].z;
        pt.z = rasterVts[0].z + w1 * z10 + w2 * z20;
      }

      const pixelIndex = y * width + x;
      if (pt.z <= zBuffer[pixelIndex]) {
        const imageDataStart = pixelIndex * 4;
        if (vShading) {
          let shade;
          if (PERSPECTIVE_CORRECTION.shading) {
            shade = 1 / (1 / vShading[0] + w1 * shad10 + w2 * shad20);
          } else {
            shade = vShading[0] + w1 * shad10 + w2 * shad20;
          }
          ptColor = color.scale(Math.min(shade, 1));
        }
        let r, g, b;
        // if (false/*  && this.ANTI_ALIASING && weight == 1 */) {
          // const coef = 127.5 * weight;
          // const weight0 = 127.5 * (2 - weight);
          // r = Math.floor((this.colorBuffer[imageDataStart + 0]/*  * weight0 */ + ptColor.x/*  * coef */) * 127.5);
          // g = Math.floor((this.colorBuffer[imageDataStart + 1]/*  * weight0 */ + ptColor.y/*  * coef */) * 127.5);
          // b = Math.floor((this.colorBuffer[imageDataStart + 2]/*  * weight0 */ + ptColor.z/*  * coef */) * 127.5);

          // r = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 0] * this.colorBuffer[imageDataStart + 0] + ptColor.x * ptColor.x) * 127.5);
          // g = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 1] * this.colorBuffer[imageDataStart + 1] + ptColor.y * ptColor.y) * 127.5);
          // b = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 2] * this.colorBuffer[imageDataStart + 2] + ptColor.z * ptColor.z) * 127.5);
        // } else {
          r = Math.floor(ptColor.x * 255);
          g = Math.floor(ptColor.y * 255);
          b = Math.floor(ptColor.z * 255);
        // }
        if (WRITE_32) {
          imageBuffer[pixelIndex] = r | g << 8 | b << 16 | 255 << 24;
        } else {
          imageBuffer[imageDataStart + 0] = r;
          imageBuffer[imageDataStart + 1] = g;
          imageBuffer[imageDataStart + 2] = b;
          // is alpha useful in this context? Transparency would have to account for
          // a weighted sum of colors for each visible facet in this pixel
          imageBuffer[imageDataStart + 3] = 255;
        }
        zBuffer[pixelIndex] = pt.z;
        // if (false /* this.ANTI_ALIASING */) {
        //   this.colorBuffer[imageDataStart + 0] = ptColor.x;
        //   this.colorBuffer[imageDataStart + 1] = ptColor.y;
        //   this.colorBuffer[imageDataStart + 2] = ptColor.z;
        // }
      }

      // w0Gen.nextX();
      w1Gen.nextX();
      w2Gen.nextX();
    }

    // w0Gen.nextY();
    w1Gen.nextY();
    w2Gen.nextY();
  }
}

function worldToRaster(/**@type{Vec3}*/ point) {
  let xScreen, yScreen, z;
  point = new Vec3(point.x, point.y, point.z);
  if (PROJECTION_MATRIX) {
    const pt = point.project(projectionMatrix);
    xScreen = pt.x;
    yScreen = pt.y;
    z = pt.z
  } else {
    z = -point.z;
    const coef = screen.focalLength / z;
    xScreen = point.x * coef;
    yScreen = point.y * coef;
  }
  // const { right, left, top, bottom } = this.screen;
  // const xNDC = 2 * xScreen / (right - left) - (right + left) / (right - left); // but assuming l == -r much of that simplifies to zero
  // const yNDC = 2 * yScreen / (top - bottom) - (top + bottom) / (top - bottom); // same
  const xNDC = xScreen * worldWidthInv;
  const yNDC = yScreen * worldHeightInv;
  const xRaster = (xNDC + 1) * halfWidth;
  const yRaster = (1 - yNDC) * halfHeight;
  return new Vec3(xRaster, yRaster, z);
}

function getEdgeCalculations(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{{x: number, y: number}}*/pt) {
  let antialias = false;
  let halfStepX, halfStepY;
  let stepToCenter = 0, brSampleOffset = 0;
  const offset = ANTI_ALIASING ? 0.25 : 0.5;
  pt.x = Math.floor(pt.x) + offset;
  pt.y = Math.floor(pt.y) + offset;
  const xStep = (b.y - a.y);
  const yStep = (a.x - b.x);
  if (ANTI_ALIASING) {
    antialias = true;
    halfStepX = xStep * 0.5;
    halfStepY = yStep * 0.5;
    stepToCenter = halfStepX * 0.5 + halfStepY * 0.5;
    brSampleOffset = halfStepY + halfStepX;
  }
  const edge = b.sub(a);
  const initial = edgeFn(a, b, pt);
  const coordinateGenerator = {
    rowStart: initial,
    topLeft: initial,
    current() {
      return this.topLeft + stepToCenter;
      if (antialias) {
        return this.topLeft + stepToCenter;
      }
      return this.topLeft;
    },
    // atOffset(x, y) { // this would be used for tile testing whenever i figure out how
    //   return this.topLeft + this.yStep * y + this.xStep * x;
    // },
    nextX() {
      if (antialias) {
        this.topLeft += xStep;
        // this.topRight += xStep;
        // this.bottomLeft += xStep;
        this.bottomRight += xStep;
      } else {
        this.topLeft += xStep;
      }
    },
    nextY() {
      if (antialias) {
        this.rowStart += yStep;
        this.topLeft = this.rowStart;
        // this.topRight = this.topLeft + halfStepX;
        // this.bottomLeft = this.topLeft + halfStepY;
        this.bottomRight = this.topLeft + brSampleOffset;
      } else {
        this.rowStart += yStep;
        this.topLeft = this.rowStart;
      }
    },
    // topRight: undefined,
    // bottomLeft: undefined,
    bottomRight: undefined,
    topLeftEdge: undefined,
  };
  if (antialias) {
    // const initialBottom = initial + halfStepY;
    // coordinateGenerator.topRight = initial + halfStepX;
    // coordinateGenerator.bottomLeft = initialBottom;
    coordinateGenerator.bottomRight = coordinateGenerator.topLeft + brSampleOffset;
    coordinateGenerator.topLeftEdge = edge.y < 0 || (edge.y == 0 && edge.x > 0);
  }
  return coordinateGenerator;
}

function edgeFn(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{Vec3}*/pt) {
  return (pt.x - a.x) * (b.y - a.y) - (pt.y - a.y) * (b.x - a.x);
}

function pxWeight(/* w0, */ w1, w2, area) {
  const antialias = ANTI_ALIASING;
  if (!antialias) {
    return /* sampleInside(w0, 'topLeft') && */ sampleInside(w1, 'topLeft') && sampleInside(w2, 'topLeft')
      && (w1['topLeft'] + w2['topLeft']) <= area;
  }
  const tl = /* sampleInside(w0, 'topLeft') && */ sampleInside(w1, 'topLeft') && sampleInside(w2, 'topLeft')
    && (w1['topLeft'] + w2['topLeft']) <= area;
  // const tr = sampleInside(w0, 'topRight') && sampleInside(w1, 'topRight') && sampleInside(w2, 'topRight');
  // const bl = sampleInside(w0, 'bottomLeft') && sampleInside(w1, 'bottomLeft') && sampleInside(w2, 'bottomLeft');
  const br = /* sampleInside(w0, 'bottomRight') && */ sampleInside(w1, 'bottomRight') && sampleInside(w2, 'bottomRight')
    && (w1['bottomRight'] + w2['bottomRight']) <= area;
  return tl + br;

  function sampleInside(sample, quadrant) {
    // return sample[quadrant] > 0 || (sample.topLeftEdge && sample[quadrant] == 0);
    // if (antialias) {
    //   return (sample[quadrant] > 0) || (sample[quadrant] == 0 && sample.topLeftEdge);
    // }
    return sample[quadrant] >= 0;
  }
}
class Matrix extends Array {
  /**@returns{Matrix}*/
  transpose() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      result[i] = [];
      for (let j = 0; j < this[0].length; j++) {
        result[i][j] = this[j][i];
      }
    }
    Object.setPrototypeOf(result, Object.getPrototypeOf(this));
    return result;
  }
}

class SquareMatrix extends Matrix {
  constructor(size = 4) {
    super();
    for (let i = 0; i < size; i++) {
      this[i] = Array(size).fill(0);
      this[i][i] = 1;
    }
  }

  set(values) {
    if (this.length != values.length) {
      throw new Error('Incompatible length to populate matrix');
    }
    for (let i = 0; i < this.length; i++) {
      if (this[i].length != values[i].length) {
        throw new Error('Incompatible length to populate matrix');
      }
      for (let j = 0; j < this[i].length; j++) {
        this[i][j] = values[i][j];
      }
    }
  }

  copy() {
    const result = new SquareMatrix(this.length);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this[0].length; j++) {
        result[i][j] = this[i][j];
      }
    }
    return result;
  }

  multiply(/** @type {Array} */ m) {
    if (this[0].length != m.length) {
      throw new Error('Matrices incompatible for multiplication');
    }
    const result = new SquareMatrix(this.length);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < m[0].length; j++) {
        result[i] ??= [];
        result[i][j] = 0;
        for (let p = 0; p < this[0].length; p++) {
          result[i][j] += this[i][p] * m[p][j];
        }
      }
    }
    return result;
  }

  /**@returns{SquareMatrix}*/
  invert() {
    const minors = new SquareMatrix(this.length);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this.length; j++) {
        const coef = (i + j) % 2 ? -1 : 1; // applies cofactor
        minors[i][j] = coef * this.drop(i, j).determinant();
      }
    }

    const result = minors.transpose();
    const det = this.determinant();
    const coef = 1 / det;
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this.length; j++) {
        result[i][j] *= coef;
      }
    }
    return result;
  }

  drop(/**@type{number}*/i, /**@type{number}*/j) {
    const remaining = new SquareMatrix(this.length - 1);
    for (let m = 0; m < this.length; m++) {
      for (let n = 0; n < this.length; n++) {
        if (m == i || n == j) {
          continue;
        }
        remaining[m > i ? m - 1 : m][n > j ? n - 1 : n] = this[m][n];
      }
    }
    return remaining;
  }

  determinant() {
    if (this.length  == 2) {
      return this[0][0] * this[1][1] - this[0][1] * this[1][0];
    }
    let result = 0;
    for (let i = 0; i < this.length; i++) {
      const coef = i % 2 ? -1 : 1;
      result += coef * this[0][i] * this.drop(0, i).determinant();
    }
    return result;
  }

  static multiply(m, n) {
    return new SquareMatrix(m.length).set(m).multiply(n);
  }

  static rotationX(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[1][1] = cos;
    result[1][2] = sin;
    result[2][1] = -1 * sin;
    result[2][2] = cos;
    return result;
  }

  static rotationY(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[0][0] = cos;
    result[0][2] = -1 * sin;
    result[2][0] = sin;
    result[2][2] = cos;
    return result;
  }

  static rotationZ(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[0][0] = cos;
    result[0][1] = sin;
    result[1][0] = -1 * sin;
    result[1][1] = cos;
    return result;
  }

  static zUp(size = 4) {
    const result = new SquareMatrix(size);
    result[1][1] = 0;
    result[2][2] = 0;
    result[1][2] = 1;
    result[2][1] = 1;
    return result;
  }

  static translate(/**@type{number}*/x, /**@type{number}*/y, /**@type{number}*/z) {
    const result = new SquareMatrix;
    result[3][0] = x;
    result[3][1] = y;
    result[3][2] = z;
    return result;
  }

  static scale(/**@type{number}*/x, /**@type{number}*/y, z = 1) {
    const result = new SquareMatrix;
    result[0][0] = x;
    result[1][1] = y;
    result[2][2] = z;
    return result;
  }
}

class Vec3 {
  /**@type{number}*/#mag;
  /**@type{Vec3}*/#normalized;
  #x;
  #y;
  #z;

  constructor(x=0, y=0, z=0) {
    /** @type number */this.#x = x;
    /** @type number */this.#y = y;
    /** @type number */this.#z = z;
  }

  // allow for caching calculated values; probably will treat
  // this class as immutable anyway but this is safer
  get x() { return this.#x; }
  set x(value) {
    this.#x = value;
    this.#normalized = undefined;
  }

  get y() { return this.#y; }
  set y(value) {
    this.#y = value;
    this.#normalized = undefined;
  }

  get z() { return this.#z; }
  set z(value) {
    this.#z = value;
    this.#normalized = undefined;
  }

  get magnitude() {
    if (!this.#mag) {
      const magSq = this.dot(this);
      this.#mag = Math.sqrt(magSq);
    }
    return this.#mag;
  }

  /**@returns{Vec3}*/
  normalize() {
    if (!this.#normalized) {
      const coef = 1 / this.magnitude;
      this.#normalized = new Vec3(this.x * coef, this.y * coef, this.z * coef);
    }
    return this.#normalized;
  }

  dot(/** @type {Vec3} */ v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(/** @type {Vec3} */ v) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  add(/** @type {Vec3} */ v) {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(/** @type {Vec3} */ v) {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(/** @type {number|Vec3} */ r) {
    if (r instanceof Vec3) {
      return new Vec3(this.x * r.x, this.y * r.y, this.z * r.z);
    }
    return new Vec3(this.x * r, this.y * r, this.z * r);
  }

  transform(m) {
    return this.matrixMultiply(m);
  }

  project(m) {
    return this.matrixMultiply(m, false);
  }

  matrixMultiply(/** @type {SquareMatrix} */ m, affine = true) {
    let x = this.x * m[0][0] + this.y * m[1][0] + this.z * m[2][0] + m[3][0];
    let y = this.x * m[0][1] + this.y * m[1][1] + this.z * m[2][1] + m[3][1];
    let z = this.x * m[0][2] + this.y * m[1][2] + this.z * m[2][2] + m[3][2];
    if (!affine) {
      const w = this.x * m[0][3] + this.y * m[1][3] + this.z * m[2][3] + m[3][3];
      if (w != 1) {
        const wInv = 1 / w;
        x *= wInv;
        y *= wInv;
        z *= wInv;
      }
    }
    return new Vec3(x, y, z);
  }

  sane() {
    if (isNaN(this.x)) {
      this.x = 0;
    }
    if (isNaN(this.y)) {
      this.y = 0;
    }
    if (isNaN(this.z)) {
      this.z = 0;
    }
  }
}


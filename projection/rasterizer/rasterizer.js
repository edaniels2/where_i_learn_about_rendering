import { SquareMatrix } from '../../matrix.js';
import { Vec3 } from '../../vector.js';

const PROJECTION_MATRIX = true;
const PERSPECTIVE_CORRECTION = {
  z: true,
  shading: false,
};

export class Rasterizer {

  constructor(/**@type{number*/width, /**@type{number*/height,
    /**@type{{top: number, bottom: number, left: number, right: number, near: number, far: number}}*/screen
  ) {
    width = Math.ceil(width);
    height = Math.ceil(height);
    this.imageData = new ImageData(width, height);
    this.zBuffer = Array(width * height).fill(Infinity);
    this.screen = screen;
    this.clipNear = this.screen.near;
    this.clipFar = this.screen.far;

    if (PROJECTION_MATRIX) {
      PERSPECTIVE_CORRECTION.z = false; // handled in the projection
      this.projectionMatrix  = new SquareMatrix();
      const n = screen.near;
      const f = screen.far;
      const s = n / screen.right;
      const sz = -f / (f - n);
      const tz = -2 * f * n / (f - n);
      this.clipNear = -1;
      this.clipFar = 1;
      this.projectionMatrix.set([
        [s, 0, 0, 0],
        [0, s, 0, 0],
        [0, 0, sz, -1],
        [0, 0, tz, 0],
      ]);
    }
  }

  clear() {
    this.imageData.data.fill(0);
    this.zBuffer.fill(Infinity);
  }

  pushTriangle(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, /**@type{{vShading: number[]}}*/attributes) {
    /**@type{Vec3}*/const rasterVts = [];
    const vShading = attributes?.vShading;
    let top = this.imageData.height, left = this.imageData.width, bottom = 0, right = 0;
    let visible = true;
    let clip = false;
    for (let i = 0; i < vertices.length; i++) {
      let pt = this.worldToRaster(vertices[i]);
      if (pt.z <= this.clipNear || pt.z >= this.clipFar) {
        clip = true;
        visible = false;
      } else {
        // visible = true;
      }
      rasterVts.push(pt);
      if (pt.y < top) {
        top = Math.max(Math.ceil(pt.y), 0);
      }
      if (pt.y > bottom) {
        bottom = Math.min(Math.ceil(pt.y), this.imageData.height);
      }
      if (pt.x < left) {
        left = Math.max(Math.ceil(pt.x), 0);
      }
      if (pt.x > right) {
        right = Math.min(Math.ceil(pt.x), this.imageData.width);
      }
    }
    if (!visible) {
      return;
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

    /**Barycentric coordinate test increment for anti-aliasing*/
    const s = 1;
    const w0Gen = this.getEdgeCalculations(rasterVts[1], rasterVts[2], {x: left, y: top}, s);
    const w1Gen = this.getEdgeCalculations(rasterVts[2], rasterVts[0], {x: left, y: top}, s);
    const w2Gen = this.getEdgeCalculations(rasterVts[0], rasterVts[1], {x: left, y: top}, s);
    const area = this.edgeFn(rasterVts[0], rasterVts[1], rasterVts[2]);
    // const tileSize = 8; // wip

    for (let y = top; y < bottom; y++) {
      if (y < 0 || y >= this.imageData.height) {
        // shouldn't happen
        debugger;
        w0Gen.nextY();
        w1Gen.nextY();
        w2Gen.nextY();
        continue;
      }
      for (let x = left; x < right; x++) {
        let fillTile = false;
        if (x < 0 || x > this.imageData.width) {
          // shouldn't happen
          debugger;
          w0Gen.nextX();
          w1Gen.nextX();
          w2Gen.nextX();
          continue;
        }

        if (!w0Gen.inside()) {
          w0Gen.nextX();
          w1Gen.nextX();
          w2Gen.nextX();
          continue;
        }

        if (!w1Gen.inside()) {
          w0Gen.nextX();
          w1Gen.nextX();
          w2Gen.nextX();
          continue;
        }

        if (!w2Gen.inside()) {
          w0Gen.nextX();
          w1Gen.nextX();
          w2Gen.nextX();
          continue;
        }

        const w1 = w1Gen.current / area;
        const w2 = w2Gen.current / area;
        const pt  = new Vec3(x, y, 1);
        let ptColor = color;

        if (PERSPECTIVE_CORRECTION.z) {
          pt.z = 1 / (1 / rasterVts[0].z + w1 * z10 + w2 * z20);
        } else {
          pt.z = rasterVts[0].z + w1 * z10 + w2 * z20;
        }

        const pixelIndex = y * this.imageData.width + x;
        if (pt.z < this.zBuffer[pixelIndex]) {
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
          this.imageData.data[imageDataStart + 0] = Math.floor(ptColor.x * 255);
          this.imageData.data[imageDataStart + 1] = Math.floor(ptColor.y * 255);
          this.imageData.data[imageDataStart + 2] = Math.floor(ptColor.z * 255);
          // is alpha useful in this context? Transparency would have to account for
          // a weighted sum of colors for each visible facet in this pixel
          this.imageData.data[imageDataStart + 3] = 255;
          this.zBuffer[pixelIndex] = pt.z;
        }

        w0Gen.nextX();
        w1Gen.nextX();
        w2Gen.nextX();
      }

      w0Gen.nextY();
      w1Gen.nextY();
      w2Gen.nextY();
    }
  }

  /**
   * Divide an n-sided polygon into triangles for rasterization. Maybe not the best
   * way this could be done but seems to work fine
   */
  pushPolygon(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, attributes) {
    this.pushTriangle(vertices.slice(0, 3), color, attributes);
    if (vertices.length > 3) {
      const vRemaining = [vertices.at(0), ...vertices.slice(2)];
      if (attributes.vShading) {
        attributes.vShading.splice(1, 1);
      }
      this.pushPolygon(vRemaining, color, attributes);
    }
  }

  worldToRaster(/**@type{Vec3}*/ point) {
    let xScreen, yScreen, z;
    if (PROJECTION_MATRIX) {
      const pt = point.project(this.projectionMatrix);
      xScreen = pt.x;
      yScreen = pt.y;
      z = pt.z
    } else {
      z = -point.z;
      xScreen = this.screen.near * point.x / z;
      yScreen = this.screen.near * point.y / z;
    }
    // const { right, left, top, bottom } = this.screen;
    // const xNDC = 2 * xScreen / (right - left) - (right + left) / (right - left); // but assuming l == -r much of that simplifies to zero
    // const yNDC = 2 * yScreen / (top - bottom) - (top + bottom) / (top - bottom); // same
    const xNDC = xScreen / (this.screen.right);
    const yNDC = yScreen / (this.screen.top);
    const xRaster = (xNDC + 1) / 2 * this.imageData.width;
    const yRaster = (1 - yNDC) / 2 * this.imageData.height;
    return new Vec3(xRaster, yRaster, z);
  }

  edgeFn(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{Vec3}*/pt) {
    return (pt.x - a.x) * (b.y - a.y) - (pt.y - a.y) * (b.x - a.x);
  }

  getEdgeCalculations(/**@type{Vec3}*/a, /**@type{Vec3}*/b,
    /**@type{{x: number, y: number}}*/pt, /**@type{number}*/s
  ) {
    const initial = this.edgeFn(a, b, pt);
    return {
      initial,
      rowStart: initial,
      current: initial,
      xStep: (b.y - a.y) * s,
      yStep: (a.x - b.x) * s,
      inside() {
        return this.current >= 0;
      },
      atOffset(x, y) {
        return this.current + this.yStep * y + this.xStep * x;
      },
      nextX() {
        this.current += this.xStep;
      },
      nextY() {
        this.rowStart += this.yStep;
        this.current = this.rowStart;
      },
    };
  }
}
import { Plane } from '../geometry.js';
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
    const aspect = width / height;
    this.imageData = new ImageData(width, height);
    this.zBuffer = new Float64Array(width * height).fill(Infinity);
    this.screen = screen;

    /**
     * anti-aliasing is a work in progress. It does smooth the jagged edges - maybe
     * even correctly, but creates gaps between adjacent triangles and takes too much
     * processing. From what i've read it should be doable with minimal marginal compute
     */
    this.ANTI_ALIASING = false;
    this.stencilBuffer = new Float64Array(width * height * 4).fill(1);

    const normalLeft = new Vec3(-1, 0, 0).transform(SquareMatrix.rotationY(-screen.fovHalf));
    const normalRight = normalLeft.scale(new Vec3(-1, 1, 1));
    const fovVertHalf = screen.fovHalf / aspect;
    const normalBottom = new Vec3(0, -1, 0).transform(SquareMatrix.rotationX(fovVertHalf));
    const normalTop = normalBottom.scale(new Vec3(1, -1, 1));
    this.clippingPlanes = [
      new Plane(new Vec3(0, 0, -1), -screen.near),
      new Plane(normalLeft, 0),
      new Plane(normalRight, 0),
      new Plane(normalBottom, 0),
      new Plane(normalTop, 0),
    ];

    if (PROJECTION_MATRIX) {
      PERSPECTIVE_CORRECTION.z = false; // handled in the projection
      this.projectionMatrix  = new SquareMatrix();
      const n = screen.near;
      const f = screen.far;
      const s = n / screen.right;
      const sz = -f / (f - n);
      const tz = -2 * f * n / (f - n);
      this.projectionMatrix.set([
        [s, 0, 0, 0],
        [0, s, 0, 0],
        [0, 0, sz, -1],
        [0, 0, tz, 0],
      ]);
    }
  }

  clear() {
    this.imageData.data.fill(255);
    this.zBuffer.fill(Infinity);
    this.stencilBuffer.fill(1);
  }

  pushTriangle(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, /**@type{{vShading: number[]}}*/attributes) { // probably move color into attributes
    const visible = this.clip(vertices, color, attributes);
    if (!visible) {
      return;
    }
    /**@type{Vec3[]}*/const rasterVts = [];
    const vShading = attributes?.vShading;
    let top = this.imageData.height, left = this.imageData.width, bottom = 0, right = 0;

    for (let i = 0; i < vertices.length; i++) {
      let pt = this.worldToRaster(vertices[i]);
      rasterVts.push(pt);
      if (pt.y < top) {
        top = Math.max(Math.floor(pt.y), 0);
      }
      if (pt.y > bottom) {
        bottom = Math.min(Math.ceil(pt.y), this.imageData.height);
      }
      if (pt.x < left) {
        left = Math.max(Math.floor(pt.x), 0);
      }
      if (pt.x > right) {
        right = Math.min(Math.ceil(pt.x), this.imageData.width);
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

    const w0Gen = this.getEdgeCalculations(rasterVts[1], rasterVts[2], {x: left, y: top});
    const w1Gen = this.getEdgeCalculations(rasterVts[2], rasterVts[0], {x: left, y: top});
    const w2Gen = this.getEdgeCalculations(rasterVts[0], rasterVts[1], {x: left, y: top});
    const area = this.edgeFn(rasterVts[0], rasterVts[1], rasterVts[2]);
    // const tileSize = 8; // wip

    for (let y = top; y < bottom; y++) {
      if (y < 0 || y > this.imageData.height) {
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

        if (!this.pxInside(w0Gen, w1Gen, w2Gen)) {
            w0Gen.nextX();
            w1Gen.nextX();
            w2Gen.nextX();
            continue;
        }

        // const w0 = w0Gen.current() / area;
        const w1 = w1Gen.current() / area;
        const w2 = w2Gen.current() / area;
        const pt  = new Vec3(x, y, 1);
        let ptColor = color;

        if (PERSPECTIVE_CORRECTION.z) {
          pt.z = 1 / (1 / rasterVts[0].z + w1 * z10 + w2 * z20);
        } else {
          // pt.z = w0 * rasterVts[0].z + w1 * rasterVts[1].z + w2 * rasterVts[2].z;
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
          let r, g, b;
          const weight = this.pxWeight(w0Gen, w1Gen, w2Gen);
          if (this.ANTI_ALIASING && weight !== 4) {
            const coef = Math.floor(64 * (weight));
            const weight0 = Math.floor(64 * (4 - weight));
            r = Math.floor(this.stencilBuffer[imageDataStart + 0] * weight0 + ptColor.x * coef);
            g = Math.floor(this.stencilBuffer[imageDataStart + 1] * weight0 + ptColor.y * coef);
            b = Math.floor(this.stencilBuffer[imageDataStart + 2] * weight0 + ptColor.z * coef);

            // r = Math.floor(this.imageData.data[imageDataStart + 0] * weight0 + ptColor.x * coef);
            // g = Math.floor(this.imageData.data[imageDataStart + 1] * weight0 + ptColor.y * coef);
            // b = Math.floor(this.imageData.data[imageDataStart + 2] * weight0 + ptColor.z * coef);
          } else {
            r = Math.floor(ptColor.x * 255);
            g = Math.floor(ptColor.y * 255);
            b = Math.floor(ptColor.z * 255);
          }
          this.imageData.data[imageDataStart + 0] = r;
          this.imageData.data[imageDataStart + 1] = g;
          this.imageData.data[imageDataStart + 2] = b;
          // is alpha useful in this context? Transparency would have to account for
          // a weighted sum of colors for each visible facet in this pixel
          this.imageData.data[imageDataStart + 3] = 255;
          this.zBuffer[pixelIndex] = pt.z;
          if (this.ANTI_ALIASING) {
            this.stencilBuffer[imageDataStart + 0] = ptColor.x;
            this.stencilBuffer[imageDataStart + 1] = ptColor.y;
            this.stencilBuffer[imageDataStart + 2] = ptColor.z;
            // this.stencilBuffer[imageDataStart + 3] = 1;
          }
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
   * way this could be done but seems to work fine, as long as none of the angles
   * between vertices are >= 180 degrees
   */
  pushPolygon(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, attributes) {
    this.pushTriangle(vertices.slice(0, 3), color, attributes);
    if (vertices.length > 3) {
      const vRemaining = [vertices.at(0), ...vertices.slice(2)];
      if (attributes?.vShading) {
        attributes.vShading.splice(1, 1);
      }
      this.pushPolygon(vRemaining, color, attributes);
    }
  }

  worldToClipSpace(/**@type{Vec3}*/point) {
    const pt = point.project(this.projectionMatrix);
    const x = pt.x / this.screen.right;
    const y = pt.y / this.screen.top;
    return new Vec3(x, y, pt.z);
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

  getEdgeCalculations(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{{x: number, y: number}}*/pt) {
    let antialias = false;
    let halfStepX, halfStepY;
    let stepToCenter = 0;
    const offset = this.ANTI_ALIASING ? 0.25 : 0.5;
    pt.x = Math.floor(pt.x) + offset;
    pt.y = Math.floor(pt.y) + offset;
    const xStep = (b.y - a.y);
    const yStep = (a.x - b.x);
    if (this.ANTI_ALIASING) {
      antialias = true;
      halfStepX = xStep * 0.5;
      halfStepY = yStep * 0.5;
      stepToCenter = halfStepX * 0.5 + halfStepY * 0.5;
    }
    // const edge = b.sub(a);
    const initial = this.edgeFn(a, b, pt);
    const coordinateGenerator = {
      rowStart: initial,
      topLeft: initial,
      current() {
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
          this.topRight += xStep;
          this.bottomLeft += xStep;
          this.bottomRight += xStep;
        } else {
          this.topLeft += xStep;
        }
      },
      nextY() {
        if (antialias) {
          this.rowStart += yStep;
          this.topLeft = this.rowStart;
          this.topRight = this.topLeft + halfStepX;
          this.bottomLeft = this.topLeft + halfStepY;
          this.bottomRight = this.bottomLeft + halfStepX;
        } else {
          this.rowStart += yStep;
          this.topLeft = this.rowStart;
        }
      },
      topRight: undefined,
      bottomLeft: undefined,
      bottomRight: undefined,
      topLeftEdge: undefined,
    };
    if (antialias) {
      const initialBottom = initial + halfStepY;
      coordinateGenerator.topRight = initial + halfStepX;
      coordinateGenerator.bottomLeft = initialBottom;
      coordinateGenerator.bottomRight = initialBottom + halfStepX;
      // coordinateGenerator.topLeftEdge = edge.y < 0 || (edge.y == 0 && edge.x > 0);
    }
    return coordinateGenerator;
  }

  clip(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, /**@type{{vShading: number[]}}*/attributes) {
    // TODO use clip space, i think it's supposed to be a faster calculation
    const clipSpaceVertices = [];
    for (const plane of this.clippingPlanes) {
      const clipPts = [];
      for (let i = 0; i < vertices.length; i++) {
        // convert vertex to clip space
        // let pt = this.worldToClipSpace(vertices[i]);
        const pt = vertices[i];
        if (pt.dot(plane.normal) < -plane.d) {
          pt.index = i;
          clipPts.push(pt);
        }
      }
      if (clipPts.length == 3) {
        // entire triangle clipped, nothing to render
        return false;
      }
      if (clipPts.length == 2) {
        // in this case we can modify the existing triangle and continue
        const clipA = clipPts[0];
        const clipB = clipPts[1];
        let inside = vertices.at(clipA.index - 1);
        if (inside == clipB) {
          inside = vertices.at(clipB.index - 1);
        }
        const aIntersect = plane.intersection(clipA, inside);
        const bIntersect = plane.intersection(clipB, inside);
        // TODO recalculate attributes instead of just copying,
        // but this is maybe good enough for now
        aIntersect.normal = clipA.normal;
        bIntersect.normal = clipB.normal;
        vertices[clipA.index] = aIntersect;
        vertices[clipB.index] = bIntersect;
      }
      if (clipPts.length == 1) {
        // discard this triangle and create two new ones
        const clip = clipPts[0];
        const a = vertices.at(clip.index - 1);
        const b = vertices.at((clip.index + 1) % vertices.length);
        const aIntersect = plane.intersection(clip, a);
        const bIntersect = plane.intersection(clip, b);
        aIntersect.normal = clip.normal;
        bIntersect.normal = clip.normal;
        attributes?.vShading?.splice(clip.index, 0, attributes.vShading[clip.index]);
        vertices.splice(clip.index, 1, aIntersect, bIntersect);
        this.pushPolygon(vertices, color, attributes);
        return false;
      }
    }
    return true;
  }

  pxInside(w0, w1, w2) {
    return !!this.pxWeight(w0, w1, w2);
  }

  pxWeight(w0, w1, w2) {
    const antialias = this.ANTI_ALIASING;
    if (!antialias) {
      return sampleInside(w0, 'topLeft') && sampleInside(w1, 'topLeft') && sampleInside(w2, 'topLeft');
    }
    const tl = sampleInside(w0, 'topLeft') && sampleInside(w1, 'topLeft') && sampleInside(w2, 'topLeft');
    const tr = sampleInside(w0, 'topRight') && sampleInside(w1, 'topRight') && sampleInside(w2, 'topRight');
    const bl = sampleInside(w0, 'bottomLeft') && sampleInside(w1, 'bottomLeft') && sampleInside(w2, 'bottomLeft');
    const br = sampleInside(w0, 'bottomRight') && sampleInside(w1, 'bottomRight') && sampleInside(w2, 'bottomRight');
    return (tl + tr + bl + br);

    function sampleInside(sample, quadrant) {
      // if (antialias) {
      //   return sample[quadrant] > 0 || (sample[quadrant] == 0 && sample.topLeftEdge);
      // }
      return sample[quadrant] >= 0;
    }
  }
}
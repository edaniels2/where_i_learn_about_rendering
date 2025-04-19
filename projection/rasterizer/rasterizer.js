import { Plane } from '../geometry.js';
import { SquareMatrix } from '../../matrix.js';
import { Vec3 } from '../../vector.js';

const NUM_WORKERS = 3;
const WRITE_32 = true;

const SHOW_TESTED = false;

const PROJECTION_MATRIX = true;
const PERSPECTIVE_CORRECTION = {
  z: true,
  shading: false, // probably never needed?
};

export class Rasterizer {

  constructor(/**@type{number*/width, /**@type{number*/height,
    /**@type{{top: number, bottom: number, left: number, right: number, near: number, far: number}}*/screen,
    /**@type HTMLCanvasElement*/canvas,
  ) {
    width = Math.ceil(width);
    height = Math.ceil(height);
    const aspect = width / height;
    const byteLength = width * height * 4;
    this.halfWidth = width / 2;
    this.halfHeight = height / 2;
    this.worldWidthInv = 1 / screen.right;
    this.worldHeightInv = 1 / screen.top;
    this.imageData = new ImageData(width, height);
    this.zBuffer = new Float64Array(width * height).fill(Infinity);
    if (WRITE_32) {
      this.imageDataView = new DataView(this.imageData.data.buffer);
    }

    // this.sharedImageBuffer = new SharedArrayBuffer(byteLength);
    // const sharedZBuffer = new SharedArrayBuffer(byteLength * 2);
    // this.imageBuffer = new Uint8ClampedArray(this.sharedImageBuffer);


    this.screen = screen;
    this.ctx = canvas.getContext('2d');

    /**
     * anti-aliasing is a work in progress. It does smooth the jagged edges - maybe
     * even correctly, but creates gaps between adjacent triangles and takes too much
     * processing. From what i've read it should be doable with minimal marginal compute
     */
    this.ANTI_ALIASING = false;
    this.colorBuffer = new Float64Array(byteLength).fill(1);

    const normalLeft = new Vec3(-1, 0, 0).transform(SquareMatrix.rotationY(-screen.fovHalf));
    const normalRight = normalLeft.scale(new Vec3(-1, 1, 1));
    const fovVertHalf = screen.fovHalf / aspect;
    const normalBottom = new Vec3(0, -1, 0).transform(SquareMatrix.rotationX(fovVertHalf));
    const normalTop = normalBottom.scale(new Vec3(1, -1, 1));
    this.clippingPlanes = [
      new Plane(new Vec3(0, 0, 1), screen.farClip),
      new Plane(new Vec3(0, 0, -1), -screen.nearClip),
      new Plane(normalLeft, 0),
      new Plane(normalRight, 0),
      new Plane(normalBottom, 0),
      new Plane(normalTop, 0),
    ];

    if (PROJECTION_MATRIX) {
      PERSPECTIVE_CORRECTION.z = false; // doesn't seem to make any difference and a bit less compute with it off
      this.projectionMatrix  = new SquareMatrix();
      const n = screen.focalLength;
      const f = screen.farClip;
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
    // /**@type (Worker&{busy: boolean})[] */
    // this.workers = Array(NUM_WORKERS).fill().map(() => new Worker('./rasterizer.worker.js'));
    // this.workers.forEach(w => w.postMessage({ imageBuffer: this.sharedImageBuffer, zBuffer: sharedZBuffer, width, height, screen }));
    // this.workerIndex = 0;
  }

  render() {
    // this.imageData.data.set(this.imageBuffer);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  clear() {
    // this.workers.forEach(w => w.postMessage({ clear: true }));
    this.imageData.data.fill(255);
    this.zBuffer.fill(Infinity);
    this.colorBuffer.fill(1);
  }

  pushTriangle(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, /**@type{{vShading: number[]}}*/attributes) { // probably move color into attributes
    const visible = this.clip(vertices, color, attributes);
    if (!visible) {
      return;
    }

    // attributes.color = {x: color.x, y: color.y, z: color.z};
    // vertices = vertices.map(v => ({x: v.x, y: v.y, z: v.z}));
    // const workerNum = this.workerIndex++ % NUM_WORKERS;
    // const currentWorker = this.workers[workerNum];
    // if (currentWorker) {
    //   currentWorker.postMessage({triangle: {vertices, attributes}});
    // }
    // return;

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

    // const w0Gen = this.getEdgeCalculations(rasterVts[1], rasterVts[2], {x: left, y: top});
    const w1Gen = this.getEdgeCalculations(rasterVts[2], rasterVts[0], {x: left, y: top});
    const w2Gen = this.getEdgeCalculations(rasterVts[0], rasterVts[1], {x: left, y: top});
    const area = this.edgeFn(rasterVts[0], rasterVts[1], rasterVts[2]);
    const areaInv = 1 / area;
    // const tileSize = 8; // wip

    for (let y = top; y < bottom; y++) {
      // if (y < 0 || y > this.imageData.height) {
      //   // shouldn't happen
      //   debugger;
      //   w0Gen.nextY();
      //   w1Gen.nextY();
      //   w2Gen.nextY();
      //   continue;
      // }
      let hit = false;
      for (let x = left; x < right; x++) {
        // visualise tested area
        // if (SHOW_TESTED) {
        //   const pixelIndex = y * this.imageData.width + x;
        //   const imageDataStart = pixelIndex * 4;
        //   this.imageData.data[imageDataStart + 0] = 100;
        //   this.imageData.data[imageDataStart + 1] = 200;
        //   this.imageData.data[imageDataStart + 2] = 100;
        //   this.imageData.data[imageDataStart + 3] = 200;
        // }
        // let fillTile = false;
        // if (x < 0 || x > this.imageData.width) {
        //   // shouldn't happen
        //   debugger;
        //   w0Gen.nextX();
        //   w1Gen.nextX();
        //   w2Gen.nextX();
        //   continue;
        // }

        const weight = this.pxWeight(/* w0Gen,  */w1Gen, w2Gen, area);
        if (!weight) {
          if (hit) {
            break;
          }
          // w0Gen.nextX();
          w1Gen.nextX();
          w2Gen.nextX();
          continue;
        }
        hit = true;

        // const w0 = w0Gen.current() * areaInv;
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

        const pixelIndex = y * this.imageData.width + x;
        if (pt.z < this.zBuffer[pixelIndex]/*  || (this.ANTI_ALIASING && weight == 1) */) { // this is closer to fixed; it must be related to the z buffer check
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
          if (/* false &&  */this.ANTI_ALIASING && weight == 1) {
            // const coef = 127.5 * weight;
            // const weight0 = 127.5 * (2 - weight);
            r = Math.floor((this.colorBuffer[imageDataStart + 0]/*  * weight0 */ + ptColor.x/*  * coef */) * 127.5);
            g = Math.floor((this.colorBuffer[imageDataStart + 1]/*  * weight0 */ + ptColor.y/*  * coef */) * 127.5);
            b = Math.floor((this.colorBuffer[imageDataStart + 2]/*  * weight0 */ + ptColor.z/*  * coef */) * 127.5);

            // r = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 0] * this.colorBuffer[imageDataStart + 0] + ptColor.x * ptColor.x) * 127.5);
            // g = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 1] * this.colorBuffer[imageDataStart + 1] + ptColor.y * ptColor.y) * 127.5);
            // b = Math.floor(Math.sqrt(this.colorBuffer[imageDataStart + 2] * this.colorBuffer[imageDataStart + 2] + ptColor.z * ptColor.z) * 127.5);
          } else {
            r = Math.floor(ptColor.x * 255);
            g = Math.floor(ptColor.y * 255);
            b = Math.floor(ptColor.z * 255);
          }
          if (WRITE_32) {
            // r = Math.max(r, 0);
            // g = Math.max(g, 0);
            // b = Math.max(b, 0);
            r = Math.min(r, 255);
            g = Math.min(g, 255);
            b = Math.min(b, 255);
            this.imageDataView.setUint32(imageDataStart, r | g << 8 | b << 16 | 255 << 24, true);
          } else {
            this.imageData.data[imageDataStart + 0] = r;
            this.imageData.data[imageDataStart + 1] = g;
            this.imageData.data[imageDataStart + 2] = b;
            // is alpha useful in this context? Transparency would have to account for
            // a weighted sum of colors for each visible facet in this pixel
            this.imageData.data[imageDataStart + 3] = 255;
          }
          this.zBuffer[pixelIndex] = pt.z;
          if (this.ANTI_ALIASING) {
            this.colorBuffer[imageDataStart + 0] = ptColor.x;
            this.colorBuffer[imageDataStart + 1] = ptColor.y;
            this.colorBuffer[imageDataStart + 2] = ptColor.z;
          }
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

  /**
   * Divide an n-sided polygon into triangles for rasterization. Maybe not the best
   * way this could be done but seems to work fine, as long as none of the angles
   * between vertices are >= 180 degrees
   */
  pushPolygon(/**@type{Vec3[]}*/vertices, /**@type{Vec3}*/color, attributes) {
    if (vertices.length == 3) {
      this.pushTriangle(vertices, color, attributes);
    } else {
      const firstTriangle = vertices.slice(0, 3).map(v => new Vec3(v.x, v.y, v.z));
      this.pushTriangle(firstTriangle, color, attributes);
      const vRemaining = [vertices.at(0), ...vertices.slice(2)];
      // const aRemaining = structuredClone(attributes);
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

  clipSpaceToRaster(/**@type{Vec3}*/ point) {
    const xRaster = (point.x + 1) * this.halfWidth;
    const yRaster = (1 - point.y) * this.halfHeight;
    return new Vec3(xRaster, yRaster, z);
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
      const coef = this.screen.focalLength / z;
      xScreen = point.x * coef;
      yScreen = point.y * coef;
    }
    // const { right, left, top, bottom } = this.screen;
    // const xNDC = 2 * xScreen / (right - left) - (right + left) / (right - left); // but assuming l == -r much of that simplifies to zero
    // const yNDC = 2 * yScreen / (top - bottom) - (top + bottom) / (top - bottom); // same
    const xNDC = xScreen * this.worldWidthInv;
    const yNDC = yScreen * this.worldHeightInv;
    const xRaster = (xNDC + 1) * this.halfWidth;
    const yRaster = (1 - yNDC) * this.halfHeight;
    return new Vec3(xRaster, yRaster, z);
  }

  edgeFn(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{Vec3}*/pt) {
    return (pt.x - a.x) * (b.y - a.y) - (pt.y - a.y) * (b.x - a.x);
  }

  getEdgeCalculations(/**@type{Vec3}*/a, /**@type{Vec3}*/b, /**@type{{x: number, y: number}}*/pt) {
    let antialias = false;
    let halfStepX, halfStepY;
    let stepToCenter = 0, brSampleOffset = 0;
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
      brSampleOffset = halfStepY + halfStepX;
    }
    const edge = b.sub(a);
    const initial = this.edgeFn(a, b, pt);
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

  pxWeight(/* w0, */ w1, w2, area) {
    const antialias = this.ANTI_ALIASING;
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
      if (antialias) {
        return (sample[quadrant] > 0) || (sample[quadrant] == 0 && sample.topLeftEdge);
      }
      return sample[quadrant] >= 0;
    }
  }
}
import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';

export class Geometry {
  /**@type{SquareMatrix}*/#centerPointInv;
  /**@type{SquareMatrix}*/#rotation;
  /**@type{SquareMatrix}*/positionAndScale;
  /**@type{SquareMatrix}*/centerPointOffset;
  /**@type{Vec3[][]}*/facets = [];
  facetOutline = true;
  hitboxSize = 1;

  #r = {x: 0, y: 0, z: 0};

  constructor(/**@type{Vec3}*/position, /**@type{object}*/options) {
    this.size = options?.size || 1;
    this.opacity = options?.opacity || 1;
    if (options?.strokeStyle) {
      this.strokeStyle = options.strokeStyle;
    }
    // can these combined? i tried to but either i did something wrong or it just has to be kept separate.
    // again I probably need to learn more linear algebra.
    this.positionAndScale = SquareMatrix.scale(this.size, this.size, this.size)
      .multiply(SquareMatrix.translate(position.x, position.y, position.z));
    this.#rotation = new SquareMatrix;
    this.define();
    if (this.centerPointOffset) {
      for (let i = 0; i < this.facets.length; i++) {
        for (let j = 0; j < this.facets[i].length; j++) {
          this.facets[i][j] = this.facets[i][j].transform(this.centerPointOffset);
        }
      }
    }
    if (this.normals) {
      this.mapNormals();
    } else if (!this.pointCloud) {
      this.facets.forEach(this.calculateNormal);
    }
    options?.rotateX && this.rotateX(options.rotateX);
    options?.rotateY && this.rotateY(options.rotateY);
    options?.rotateZ && this.rotateZ(options.rotateZ);
  }

  define() { }

  randomColors(/**@type{number}*/facetsPerColor = 1) {
    const numColors = Math.floor(this.facets.length / facetsPerColor);
    const colors = Array(numColors).fill().map(() => 
      new Vec3(Math.random(), Math.random(), Math.random()));
    for (let i = 0; i < this.facets.length; i++) {
      const iColor = Math.floor(i / facetsPerColor)
      this.facets[i].color = colors[iColor];
      this.facets[i].label = colors[iColor];
    }
  }

  mapNormals() {
    if (this.facets.length != this.normals?.length) {
      throw new Error(`Number of normal vectors does not match number of polygons in model - ${this.constructor.name}`)
    }
    for (let i = 0; i < this.facets.length; i++) {
      this.facets[i].normal = this.normals[i];
    }
  }

  // maybe make a facet class and put the normal vector in a private/getter
  calculateNormal(/**@type{Vec3[]}*/facet) {
    const a = facet[0];
    const b = facet[1];
    const c = facet[2];
    const ac = a.sub(c);
    const bc = b.sub(c);
    facet.normal = ac.cross(bc);
    // if the norm is not pointing away from the center of the shape it must be reversed
    const outwardComponent = facet.normal.dot(c);
    if (outwardComponent < 0) {
      facet.normal = facet.normal.scale(-1);
    }
    if (facet.invertNorm) {
      facet.normal = facet.normal.scale(-1);
    }
    return facet.normal;
  }

  rotateX(/**@type{number}*/radians) {
    this.#rotation = this.rotation.multiply(SquareMatrix.rotationX(radians));
  }

  rotateY(/**@type{number}*/radians) {
    this.#rotation = this.rotation.multiply(SquareMatrix.rotationY(radians));
  }

  rotateZ(/**@type{number}*/radians) {
    this.#rotation = this.rotation.multiply(SquareMatrix.rotationZ(radians));
  }

  translate(x, y, z) {
    this.positionAndScale = this.positionAndScale.multiply(SquareMatrix.translate(x, y, z));
  }

  get location() {
    const [x, y, z] = this.positionAndScale[3];
    return new Vec3(x, y, z);
  }

  get rotation() {
    return this.#rotation
  }

  getHitBox(
    /**@type{SquareMatrix}*/cameraTransform,
    /**@type{}number*/worldW,
    /**@type{}number*/worldH,
    /**@type{}number*/rasterW,
    /**@type{}number*/rasterH
  ) {
    const transform = this.rotation.multiply(this.positionAndScale).multiply(cameraTransform);
    let right = -Infinity;
    let top = -Infinity;
    let left = Infinity;
    let bottom = Infinity;
    for (let i = 0; i < this.facets.length; i++) {
      for (let j = 0; j < this.facets[i].length; j++) {
        const point = this.facets[i][j].transform(transform);
        right = Math.max(right, point.x);
        left = Math.min(left, point.x);
        top = Math.max(top, point.y);
        bottom = Math.min(bottom, point.y);
      }
    }
    left = (left / this.depth + worldW / 2) / worldW * rasterW;
    right = (right / this.depth + worldW / 2) / worldW * rasterW;
    top = (1 - (top / this.depth + worldH / 2) / worldH) * rasterH;
    bottom = (1 - (bottom / this.depth + worldH / 2) / worldH) * rasterH;
    return { top, bottom, left, right };
  }

  get depth() {
    return this.positionAndScale[3][2] * -1;
  }

  get topLeft() {
    const offset = this.size * this.hitboxSize / 2;
    return new Vec3(
      this.positionAndScale[3][0] - offset,
      this.positionAndScale[3][1] + offset,
      this.depth);
  }

  get bottomRight() {
    const offset = this.size * this.hitboxSize / 2;
    return new Vec3(
      this.positionAndScale[3][0] + offset,
      this.positionAndScale[3][1] - offset,
      this.depth);
  }

  get centerPointInv() {
    if (this.centerPointOffset && !this.#centerPointInv) {
      this.#centerPointInv = this.centerPointOffset.invert();
    }
    return this.#centerPointInv;
  }
}

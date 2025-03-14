import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';

export class Geometry {
  /**@type{SquareMatrix}*/#centerPointInv;
  /**@type{SquareMatrix}*/positionAndScale;
  /**@type{SquareMatrix}*/position;
  /**@type{SquareMatrix}*/scale;
  /**@type{SquareMatrix}*/centerPointOffset;
  /**@type{SquareMatrix}*/rotation;
  /**@type{Vec3[][]}*/facets;
  facetOutline = true;
  hitboxSize = 1;

  constructor(/**@type{Vec3}*/position, /**@type{object}*/options) {
    this.size = options?.size || 1;
    this.opacity = options?.opacity || 1;
    if (options?.strokeStyle) {
      this.strokeStyle = options.strokeStyle;
    }
    // can these combined? i tried to but either i did something wrong or it just has to be kept separate.
    // again I probably need to learn more linear algebra.
    this.position = SquareMatrix.translate(position.x, position.y, position.z);
    this.scale = SquareMatrix.scale(this.size, this.size);
    this.positionAndScale = SquareMatrix.scale(this.size, this.size, this.size)
      .multiply(SquareMatrix.translate(position.x, position.y, position.z));
    this.rotation = new SquareMatrix;
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
    this.rotation = this.rotation.multiply(SquareMatrix.rotationX(radians));
  }

  rotateY(/**@type{number}*/radians) {
    this.rotation = this.rotation.multiply(SquareMatrix.rotationY(radians));
  }

  rotateZ(/**@type{number}*/radians) {
    this.rotation = this.rotation.multiply(SquareMatrix.rotationZ(radians));
  }

  get depth() {
    return this.positionAndScale[3][2] * -1; // maybe don't invert?
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

// try a distinction between 3- and 4-vertex surfaces

export class Cube extends Geometry {
  define() {
    const left = -0.5;
    const back = -0.5;
    const bottom = -0.5;
    const right = 0.5;
    const top = 0.5;
    const front = 0.5;
    this.facets = [
      // back
      [new Vec3(left, top, back), new Vec3(left, bottom, back), new Vec3(right, bottom, back)],
      [new Vec3(left, top, back), new Vec3(right, top, back), new Vec3(right, bottom, back)],
      // bottom
      [new Vec3(left, bottom, back), new Vec3(left, bottom, front), new Vec3(right, bottom, front)],
      [new Vec3(left, bottom, back), new Vec3(right, bottom, back), new Vec3(right, bottom, front)],
      // right
      [new Vec3(right, top, front), new Vec3(right, top, back), new Vec3(right, bottom, back)],
      [new Vec3(right, top, front), new Vec3(right, bottom, front), new Vec3(right, bottom, back)],
      // left
      [new Vec3(left, top, front), new Vec3(left, top, back), new Vec3(left, bottom, back)],
      [new Vec3(left, top, front), new Vec3(left, bottom, front), new Vec3(left, bottom, back)],
      // top
      [new Vec3(right, top, front), new Vec3(left, top, front), new Vec3(left, top, back)],
      [new Vec3(left, top, back), new Vec3(right, top, back), new Vec3(right, top, front)],
      // front
      [new Vec3(left, top, front), new Vec3(left, bottom, front), new Vec3(right, bottom, front)],
      [new Vec3(left, top, front), new Vec3(right, top, front), new Vec3(right, bottom, front)],
    ];
    this.randomColors(2);
  }
}

export class Pyramid extends Geometry {
  define() {
    const left = -0.5;
    const back = -0.5;
    const bottom = -0.5;
    const right = 0.5;
    const top = 0.5;
    const front = 0.5;
    this.facets = [
      //base
      [new Vec3(left, bottom, back), new Vec3(left, bottom, front), new Vec3(right, bottom, front)],
      [new Vec3(left, bottom, back), new Vec3(right, bottom, back), new Vec3(right, bottom, front)],
      //front
      [new Vec3(left, bottom, front), new Vec3(right, bottom, front), new Vec3(0, top, 0)],
      //back
      [new Vec3(left, bottom, back), new Vec3(right, bottom, back), new Vec3(0, top, 0)],
      //left
      [new Vec3(left, bottom, back), new Vec3(left, bottom, front), new Vec3(0, top, 0)],
      //right
      [new Vec3(right, bottom, back), new Vec3(right, bottom, front), new Vec3(0, top, 0)],
    ];
    this.randomColors();
    // base is 2 triangles, everything else is 1
    this.facets[1].color = this.facets[0].color;
  }
}

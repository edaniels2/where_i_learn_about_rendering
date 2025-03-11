import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';

export class Geometry {
  /**@type{SquareMatrix}*/positionMatrix;
  /**@type{SquareMatrix}*/rotationMatrix;
  /**@type{Vec3[][]}*/facets;

  constructor(/**@type{Vec3}*/position, /**@type{number}*/size) {
    const halfSize = size / 2;
    this.top = halfSize;
    this.bottom = -halfSize;
    this.right = halfSize;
    this.left = -halfSize;
    this.front = halfSize;
    this.back = -halfSize;
    // can these combined? i tried to but either i did something wrong or it just has to be kept separate.
    // again I probably need to learn more linear algebra.
    this.positionMatrix = new SquareMatrix().multiply(SquareMatrix.translate(position.x, position.y, position.z));
    this.rotationMatrix = new SquareMatrix;
  }

  randomColors(/**@type{number}*/facetsPerColor = 1) {
    const colors = Array(this.facets.length).fill()
      .map(() => new Vec3(Math.random(), Math.random(), Math.random()));
    for (let i = 0; i < this.facets.length; i++) {
      const iColor = Math.floor(i / facetsPerColor)
      this.facets[i].color = colors[iColor];
      this.facets[i].label = colors[iColor];
    }
  }

  rotateX(/**@type{number}*/radians) {
    this.rotationMatrix = this.rotationMatrix.multiply(SquareMatrix.rotationX(radians));
  }

  rotateY(/**@type{number}*/radians) {
    this.rotationMatrix = this.rotationMatrix.multiply(SquareMatrix.rotationY(radians));
  }

  rotateZ(/**@type{number}*/radians) {
    this.rotationMatrix = this.rotationMatrix.multiply(SquareMatrix.rotationZ(radians));
  }

  get depth() {
    return this.positionMatrix[3][2] * -1; // maybe don't invert?
  }

  get topLeft() {
    return new Vec3(
      this.positionMatrix[3][0] + this.left,
      this.positionMatrix[3][1] + this.top,
      this.depth);
  }

  get bottomRight() {
    return new Vec3(
      this.positionMatrix[3][0] + this.right,
      this.positionMatrix[3][1] + this.bottom,
      this.depth);
  }
}

export class Cube extends Geometry {
  constructor(/**@type{Vec3}*/position, /**@type{number}*/size = 1) {
    super(position, size);
    this.facets = [
      // back
      [new Vec3(this.left, this.top, this.back), new Vec3(this.left, this.bottom, this.back), new Vec3(this.right, this.bottom, this.back)],
      [new Vec3(this.left, this.top, this.back), new Vec3(this.right, this.top, this.back), new Vec3(this.right, this.bottom, this.back)],
      // bottom
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.left, this.bottom, this.front), new Vec3(this.right, this.bottom, this.front)],
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.right, this.bottom, this.back), new Vec3(this.right, this.bottom, this.front)],
      // right
      [new Vec3(this.right, this.top, this.front), new Vec3(this.right, this.top, this.back), new Vec3(this.right, this.bottom, this.back)],
      [new Vec3(this.right, this.top, this.front), new Vec3(this.right, this.bottom, this.front), new Vec3(this.right, this.bottom, this.back)],
      // left
      [new Vec3(this.left, this.top, this.front), new Vec3(this.left, this.top, this.back), new Vec3(this.left, this.bottom, this.back)],
      [new Vec3(this.left, this.top, this.front), new Vec3(this.left, this.bottom, this.front), new Vec3(this.left, this.bottom, this.back)],
      // top
      [new Vec3(this.right, this.top, this.front), new Vec3(this.left, this.top, this.front), new Vec3(this.left, this.top, this.back)],
      [new Vec3(this.left, this.top, this.back), new Vec3(this.right, this.top, this.back), new Vec3(this.right, this.top, this.front)],
      // front
      [new Vec3(this.left, this.top, this.front), new Vec3(this.left, this.bottom, this.front), new Vec3(this.right, this.bottom, this.front)],
      [new Vec3(this.left, this.top, this.front), new Vec3(this.right, this.top, this.front), new Vec3(this.right, this.bottom, this.front)],
    ];
    this.randomColors(2);
  }
}

export class Pyramid extends Geometry {
  constructor(/**@type{Vec3}*/position, /**@type{number}*/height = 1) {
    super(position, height);
    this.facets = [
      //base
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.left, this.bottom, this.front), new Vec3(this.right, this.bottom, this.front)],
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.right, this.bottom, this.back), new Vec3(this.right, this.bottom, this.front)],
      //front
      [new Vec3(this.left, this.bottom, this.front), new Vec3(this.right, this.bottom, this.front), new Vec3(0, this.top, 0)],
      //back
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.right, this.bottom, this.back), new Vec3(0, this.top, 0)],
      //left
      [new Vec3(this.left, this.bottom, this.back), new Vec3(this.left, this.bottom, this.front), new Vec3(0, this.top, 0)],
      //right
      [new Vec3(this.right, this.bottom, this.back), new Vec3(this.right, this.bottom, this.front), new Vec3(0, this.top, 0)],
    ];
    this.randomColors();
    // base is 2 triangles, everything else is 1
    this.facets[1].color = this.facets[0].color;
  }
}

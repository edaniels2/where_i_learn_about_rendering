import { Geometry } from './geometry.js';
import { SquareMatrix } from '../matrix.js';
import { Vec3 } from '../vector.js';

// const twoPi = Math.PI * 2;

export class Camera extends Geometry {
  #r = {x: 0, y: 0, z: 0};
  /**@type{SquareMatrix}*/#rotation;

  constructor(position) {
    super(position || new Vec3);
  }

  rotateX(/**@type{number}*/radians) {
    this.#r.x += radians;
    // this.#r.x = this.#r.x % (twoPi);
    // if (this.#r.x < 0) {
    //   this.#r.x += twoPi;
    // }
    // if (this.#r.x > Math.PI) {
    //   this.#r.x = -(this.#r.x - Math.PI / 2);
    // }
    this.#rotation = null;
  }

  rotateY(/**@type{number}*/radians) {
    this.#r.y += radians;
    // this.#r.y = this.#r.y % (twoPi);
    // if (this.#r.y < 0) {
    //   this.#r.y += twoPi;
    // }
    // if (this.#r.y > Math.PI) {
    //   this.#r.y = -(this.#r.y - Math.PI / 2);
    // }
    this.#rotation = null;
  }

  rotateZ(/**@type{number}*/radians) {
    this.#r.z += radians;
    // this.#r.z = this.#r.z % (twoPi);
    // if (this.#r.z < 0) {
    //   this.#r.z += twoPi;
    // }
    // if (this.#r.z > Math.PI) {
    //   this.#r.z = -(this.#r.z - Math.PI / 2);
    // }
    this.#rotation = null;
  }

  get rotation() {
    if (!this.#rotation) {
      this.#rotation = new SquareMatrix().multiply(
        SquareMatrix.rotationZ(this.#r.z)
      ).multiply(
        SquareMatrix.rotationY(this.#r.y)
      ).multiply(
        SquareMatrix.rotationX(this.#r.x)
      );
    }
    return this.#rotation
  }

  get rotationComponents() {
    return {...this.#r};
  }
}
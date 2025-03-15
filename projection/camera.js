import { Geometry } from './geometry.js';
import { SquareMatrix } from '../matrix.js';

export class Camera extends Geometry {
  #r = {x: 0, y: 0, z: 0};
  /**@type{SquareMatrix}*/#rotation;

  rotateX(/**@type{number}*/radians) {
    this.#r.x += radians;
    this.#rotation = null;
  }

  rotateY(/**@type{number}*/radians) {
    this.#r.y += radians;
    this.#rotation = null;
  }

  rotateZ(/**@type{number}*/radians) {
    this.#r.z += radians;
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
}
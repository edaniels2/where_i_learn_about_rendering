import { Geometry } from './geometry.js';

export class Floor extends Geometry {
  define() {
    const left = -0.5;
    const right = 0.5;
    const back = -0.5;
    const front = 0.5;
    this.groups = [{
      vertices: [
        right, 0, back,
        left, 0, back,
        left, 0, front,
        right, 0, front,
        right, 0, back,
        left, 0, front,
        right, 0, front,
      ],
      normals: [
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      ]
    }];
  }
}

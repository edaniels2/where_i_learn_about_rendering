import { Fixed, Geometry } from './geometry.js';
import { Vec3 } from '../vector.js';

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
      [new Vec3(left, bottom, back), new Vec3(left, top, back), new Vec3(right, top, back), new Vec3(right, bottom, back)],
      // bottom
      [new Vec3(left, bottom, front), new Vec3(left, bottom, back), new Vec3(right, bottom, back), new Vec3(right, bottom, front)],
      // right
      [new Vec3(right, top, back), new Vec3(right, top, front), new Vec3(right, bottom, front), new Vec3(right, bottom, back)],
      // left
      [new Vec3(left, top, front), new Vec3(left, top, back), new Vec3(left, bottom, back), new Vec3(left, bottom, front)],
      // top
      [new Vec3(right, top, back), new Vec3(left, top, back), new Vec3(left, top, front), new Vec3(right, top, front)],
      // front
      [new Vec3(left, top, front), new Vec3(left, bottom, front), new Vec3(right, bottom, front), new Vec3(right, top, front)],
    ];
    if (this.color) {
      this.facets.forEach(f => f.color = this.color);
    } else {
      this.randomColors();
    }
  }
}

export class Floor extends Fixed {
  define() {
    const left = -0.5;
    const right = 0.5;
    const back = -0.5;
    const front = 0.5;
    this.facets = [[new Vec3(right, 0, back), new Vec3(left, 0, back), new Vec3(left, 0, front), new Vec3(right, 0, front)]];
    if (this.options?.smoothShading) {
      this.normals = [[new Vec3(right, 2, back).normalize(), new Vec3(left, 2, back).normalize(), new Vec3(left, 2, front).normalize(), new Vec3(right, 2, front).normalize()]];
    } else {
      this.normals = [new Vec3(0, 1, 0)];
    }
    if (this.color) {
      this.facets[0].color = this.color;
    } else {
      this.randomColors();
    }
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
      [new Vec3(left, bottom, back), new Vec3(right, bottom, back), new Vec3(right, bottom, front), new Vec3(left, bottom, front)],
      //front
      [new Vec3(left, bottom, front), new Vec3(right, bottom, front), new Vec3(0, top, 0)],
      //back
      [new Vec3(left, bottom, back), new Vec3(0, top, 0), new Vec3(right, bottom, back)],
      //left
      [new Vec3(left, bottom, back), new Vec3(left, bottom, front), new Vec3(0, top, 0)],
      //right
      [new Vec3(right, bottom, back), new Vec3(0, top, 0), new Vec3(right, bottom, front)],
    ];
    this.randomColors();
  }
}

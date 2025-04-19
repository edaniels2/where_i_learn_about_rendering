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

export class Wall extends Fixed {
  constructor(options) {
    super(new Vec3, options);
  }

  // this way depends on the order the endpoints are defined, need to generalize that
  define() {
    /**@type{number}*/const bottom = this.options?.bottom == undefined ? -1 : this.options.bottom;
    /**@type{number}*/const top = this.options?.top || bottom + (this.options?.height || 4);
    /**@type{Vec3}*/const a = this.options?.endpoints[0]; // maybe add some validation
    /**@type{Vec3}*/const b = this.options?.endpoints[1];
    if (this.contrast == undefined) {
      this.contrast = 0.001;
    }
    this.facets = [
      [
        new Vec3(a.x, bottom, a.z),
        new Vec3(a.x, top, a.z),
        new Vec3(b.x, top, b.z),
        new Vec3(b.x, bottom, b.z),
      ],
    ];
    this.facets[0].invertNorm = true;
    if (this.options?.color) {
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

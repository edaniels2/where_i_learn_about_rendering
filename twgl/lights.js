import * as twgl from './twgl_lib/twgl-full.module.js';

export function mapLightsToType(config) {
  switch (config.type) {
    case 'triangle':
      return new TriangleLight(config);
    case 'rectangle':
      return new RectangleLight(config);
  }
}

/* abstract */
class LightBase {
  constructor(config) {
    this.intensity = config.intensity ?? 1;
    this.color = config.color ??= [1, 0.8928, 0.7777]; // default warm light
    this.on = config.on ?? true;
  }

  // getVertices() { }

  // getUniforms(matWorld, matRotation) { }
}

export class RectangleLight extends LightBase {
  constructor(config) {
    super(config);
    this.v0 = [...config.v0];
    this.v1 = [...config.v1];
    this.v2 = [...config.v2];
    this.edge1 = twgl.v3.subtract(this.v1, this.v0);
    this.edge2 = twgl.v3.subtract(this.v2, this.v0);
    this.v3 = twgl.v3.add(this.v1, this.edge2);
    this.normal = twgl.v3.normalize(twgl.v3.cross(this.edge1, this.edge2));
    this.area = Math.sqrt(twgl.v3.dot(this.edge1,this.edge1)) * Math.sqrt(twgl.v3.dot(this.edge2, this.edge2));
  }

  getVertices() {
    return [...this.v0, ...this.v1, ...this.v2, ...this.v2, ...this.v1, ...this.v3];
  }

  getUniforms(matWorld, matRotation) {
    return {
      area: this.area,
      intensity: this.on ? this.intensity : 0,
      color: this.color,
      v0: twgl.m4.transformPoint(matWorld, this.v0),
      edge1: twgl.m4.transformPoint(matRotation, this.edge1),
      edge2: twgl.m4.transformPoint(matRotation, this.edge2),
      n: twgl.m4.transformDirection(matRotation, this.normal),
    };
  }
}

export class TriangleLight extends LightBase {
  // more or less works but there are some things wrong,
  // probably both here and in the shader; read up and revisit
  constructor(config) {
    super(config);
    const v01 = twgl.v3.subtract(config.vtx1, config.vtx0);
    const v02 = twgl.v3.subtract(config.vtx2, config.vtx0);
    const n = twgl.v3.normalize(twgl.v3.cross(v01, v02));
    const uX = twgl.v3.divScalar(v01, twgl.v3.dot(v01, v01));
    const uY = twgl.v3.cross(n, uX);
    const r = [
      uX[0], uY[0], n[0], 0,
      uX[1], uY[1], n[1], 0,
      uX[2], uY[2], n[2], 0,
      0, 0, 0, 1
    ];
    const v1 = twgl.m4.transformPoint(r, v01);
    const v2 = twgl.m4.transformPoint(r, v02);
    const area = 0.5 * v1[0] * v2[1];
    this.pdf = 1 / area;
    this.mat = twgl.m4.inverse(r);
    this.v1 = [v1[0], v1[1]];
    this.v2 = [v2[0], v2[1]];
    this.vtx0 = [...config.vtx0];
    this.vtx1 = [...config.vtx1];
    this.vtx2 = [...config.vtx2];
  }

  getVertices() {
    return this.vtx0.concat(this.vtx1, this.vtx2);
  }

  getUniforms(matWorld, matRotation) {
    return {
      vtx0: twgl.m4.transformPoint(matWorld, this.vtx0),
      vtx1: twgl.m4.transformPoint(matWorld, this.vtx1),
      vtx2: twgl.m4.transformPoint(matWorld, this.vtx2),
      mat: twgl.m4.multiply(matRotation, this.mat),
      intensity: this.on ? this.intensity : 0,
      color: this.color,
      v1: this.v1,
      v2: this.v2,
      pdf: this.pdf,
    }
  }
}

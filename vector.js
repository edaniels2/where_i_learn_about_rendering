import { SquareMatrix } from './matrix.js';

export class Vec3 {
  /**@type{number}*/#mag;
  /**@type{Vec3}*/#normalized;
  #x;
  #y;
  #z;

  constructor(x=0, y=0, z=0) {
    /** @type number */this.#x = x;
    /** @type number */this.#y = y;
    /** @type number */this.#z = z;
  }

  // allow for caching calculated values; probably will treat
  // this class as immutable anyway but this is safer
  get x() { return this.#x; }
  set x(value) {
    this.#x = value;
    this.#normalized = undefined;
  }

  get y() { return this.#y; }
  set y(value) {
    this.#y = value;
    this.#normalized = undefined;
  }

  get z() { return this.#z; }
  set z(value) {
    this.#z = value;
    this.#normalized = undefined;
  }

  get magnitude() {
    if (!this.#mag) {
      const magSq = this.dot(this);
      this.#mag = Math.sqrt(magSq);
    }
    return this.#mag;
  }

  /**@returns{Vec3}*/
  normalize() {
    if (!this.#normalized) {
      const coef = 1 / this.magnitude;
      this.#normalized = new Vec3(this.x * coef, this.y * coef, this.z * coef);
    }
    return this.#normalized;
  }

  dot(/** @type {Vec3} */ v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(/** @type {Vec3} */ v) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  add(/** @type {Vec3} */ v) {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(/** @type {Vec3} */ v) {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(/** @type {number|Vec3} */ r) {
    if (r instanceof Vec3) {
      return new Vec3(this.x * r.x, this.y * r.y, this.z * r.z);
    }
    return new Vec3(this.x * r, this.y * r, this.z * r);
  }

  transform(m) {
    return this.matrixMultiply(m);
  }

  project(m) {
    return this.matrixMultiply(m, false);
  }

  matrixMultiply(/** @type {SquareMatrix} */ m, affine = true) {
    let x = this.x * m[0][0] + this.y * m[1][0] + this.z * m[2][0] + m[3][0];
    let y = this.x * m[0][1] + this.y * m[1][1] + this.z * m[2][1] + m[3][1];
    let z = this.x * m[0][2] + this.y * m[1][2] + this.z * m[2][2] + m[3][2];
    if (!affine) {
      const w = this.x * m[0][3] + this.y * m[1][3] + this.z * m[2][3] + m[3][3];
      if (w != 1) {
        const wInv = 1 / w;
        x *= wInv;
        y *= wInv;
        z *= wInv;
      }
    }
    return new Vec3(x, y, z);
  }

  sane() {
    if (isNaN(this.x)) {
      this.x = 0;
    }
    if (isNaN(this.y)) {
      this.y = 0;
    }
    if (isNaN(this.z)) {
      this.z = 0;
    }
  }

  // toSpherical() {
  //   // need the transformation here? swaps z and y axes
  //   // const t = SquareMatrix.zUp();
  //   const p = this
  //     // .transform(t)
  //     .normalize();
  //   const theta = Math.acos(p.z);
  //   const phi = Math.atan2(p.y, p.x);
  //   const twoPi = 2 * Math.PI;
  //   const r = Math.sqrt(this.dot(this));
  //   if (phi < 0) {
  //     phi += twoPi;
  //   } else if (phi > twoPi) {
  //     phi -= twoPi;
  //   }
  //   return { theta, phi, r };
  // }

  // get cosTheta() {
  //   return this.normalize().z;
  // }

  // get sinSqTheta() {
  //   return 1 - this.cosTheta * this.cosTheta;
  // }

  // // maybe momoize this also
  // get sinTheta() {
  //   return Math.sqrt(this.sinSqTheta);
  // }

  // // got a bit lost on this part, not sure if these are correct
  // get cosPhi() {
  //   const sinTheta = this.sinTheta;
  //   if (sinTheta === 0) {
  //     return 1;
  //   }
  //   return this.normalize().x / sinTheta;
  // }

  // get sinPhi() {
  //   const sinTheta = this.sinTheta;
  //   if (sinTheta === 0) {
  //     return 0;
  //   }
  //   return this.normalize().y / sinTheta;
  // }

  // // make a spherical class?
  // static toCartesian({theta, phi, r}) {
  //   const sinTheta = Math.sin(theta);
  //   const x = Math.cos(phi) * sinTheta;
  //   const y = Math.sin(phi) * sinTheta;
  //   const z = Math.cos(theta);
  //   return new Vec3(x * r, y * r, z * r)
  //     // .transform(SquareMatrix.zUp());
  // }

  // // also fairly unsure but i got the same result as the one example given
  // coordinateSystem() {
  //   const normal = new Vec3(this.x, this.y, this.z);
  //   let tangent, bitangent;
  //   if (Math.abs(this.x) > Math.abs(this.y)) {
  //     const lengthInverse = 1 / Math.sqrt(this.x * this.x + this.z * this.z);
  //     tangent = new Vec3(this.z * lengthInverse, 0, this.x * -1 * lengthInverse);
  //   } else {
  //     const lengthInverse = 1 / Math.sqrt(this.y * this.y + this.z * this.z);
  //     tangent = new Vec3(0, this.z * -1 * lengthInverse, this.y * lengthInverse);
  //   }
  //   bitangent = this.cross(tangent);
  //   return { normal, tangent, bitangent };
  // }
}

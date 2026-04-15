// try a better math lib
import { Vec3 } from '../vector.js';

export class Geometry {
  /**@type{number}*/transparency;
  /**@type{number}*/reflectivity;
  /**@type{Vec3}*/surfaceColor;
  /**@type{Vec3|undefined}*/emissionColor;
  /**@typs{number}*/epsilon = 0.00001;
  intersect(/**@type{Vec3}*/rayOrig, /**@type{Vec3}*/rayDir) { }
  surfaceNormal(/**@type{Vec3}*/pt) { }
}

export class Sphere extends Geometry {
  constructor(
    /**@type{Vec3}*/center,
    /**@type{number}*/radius,
    /**@type{Vec3}*/surfaceColor,
    /**@type{number}*/reflectivity,
    /**@type{number}*/transparency,
    /**@type{Vec3}*/emissionColor = new Vec3,
  ) {
    super();
    /**@type{Vec3}*/this.center = center;
    /**@type{number}*/this.r = radius;
    /**@type{number}*/this.rSq = radius * radius;
    /**@type{Vec3}*/this.surfaceColor = surfaceColor;
    /**@type{Vec3}*/this.emissionColor = emissionColor;
    /**@type{number}*/this.transparency = transparency;
    /**@type{number}*/this.reflectivity = reflectivity;
  }

  /**
   * If the given ray intersects the sphere return the distance along the ray
   * where it enters (t0) and exits (t1)
   */
  intersect(/**@type{Vec3}*/rayOrig, /**@type{Vec3}*/rayDir) {
    const l = this.center.sub(rayOrig);
    // not sure why they call it tca; this is the component of distance from ray
    // origin to sphere center in the direction of the ray. Key here is that it
    // increases as the ray points nearer to the sphere center
    const tca = l.dot(rayDir);
    if (tca < 0) {
      // this would mean the ray direction is > 90˚ from the object so it can't
      // be visible, and squaring it for the next step would likely give false hits
      return null;
    }
    // this calculates the distance squared (along the perpendicular of a line from
    // ray origin to sphere center) to ray; `l` is the hypotenuse, `tca` is a leg lying
    // along the ray direction. Meaning if d <= sphere radius then it intersects.
    const dSq = l.dot(l) - tca * tca;
    if (dSq > this.rSq) {
      return null;
    }
    // this is half of the distance where the ray is 'inside' the sphere, again
    // not clear on their naming, maybe something to do with a tangent?
    const thc = Math.sqrt(this.rSq - dSq);
    return {
      t0: tca - thc, // distance to front surface
      t1: tca + thc, // distance to rear surface
    };
  }

  /**
   * Return the normal vector at the given point (assumes pt is on the sphere surface)
   */
  surfaceNormal(/**@type{Vec3}*/pt) {
    return pt.sub(this.center).normalize();
  }
}

export class Triangle extends Geometry {
  /**@type{Vec3}*/#surfaceNormal;
  /**@type{Vec3}*/v0v1;

  constructor(
    /**@type{[number, number, number]}*/v0,
    /**@type{[number, number, number]}*/v1,
    /**@type{[number, number, number]}*/v2,
    /**@type{Vec3}*/surfaceColor,
    /**@type{number}*/reflectivity,
    /**@type{number}*/transparency,
    /**@type{Vec3}*/emissionColor = new Vec3,
  ) {
    super();
    /**@type{Vec3}*/this.v0 = new Vec3(...v0);
    /**@type{Vec3}*/this.v1 = new Vec3(...v1);
    /**@type{Vec3}*/this.v2 = new Vec3(...v2);
    /**@type{Vec3}*/this.surfaceColor = surfaceColor;
    /**@type{Vec3}*/this.emissionColor = emissionColor;
    /**@type{number}*/this.transparency = transparency;
    /**@type{number}*/this.reflectivity = reflectivity;
    this.v0v1 = this.v1.sub(this.v0);
    const v0v2 = this.v2.sub(this.v0);
    this.#surfaceNormal = this.v0v1.cross(v0v2);
  }

  surfaceNormal() {
    return this.#surfaceNormal;
  }

  intersect(/**@type{Vec3}*/rayOrig, /**@type{Vec3}*/rayDir) {
    rayDir = rayDir.normalize();
    const nDotRayDir = this.#surfaceNormal.dot(rayDir);
    const facing = Math.abs(nDotRayDir) > this.epsilon; // use an epsilon to avoid divide by 0
    if (!facing) {
      return null;
    }
    // (shortest) distance from origin to the plane of the triangle
    const d = -this.#surfaceNormal.dot(this.v0);
    // distance from origin to ray-plane intersection
    const t = -(this.#surfaceNormal.dot(rayOrig) + d) / nDotRayDir;
    if (t < 0) {
      // intersection is behind the ray origin
      return null;
    }
    // p = ray-plane intersection point
    const p = rayOrig.add(rayDir.scale(t));
    // inside-outside test
    /**@type{Vec3}*/let pNorm;
    const v0p = p.sub(this.v0);
    pNorm = this.v0v1.cross(v0p);
    if (this.#surfaceNormal.dot(pNorm) < 0) {
      return null;
    }

    const v1v2 = this.v2.sub(this.v1);
    const v1p = p.sub(this.v1);
    pNorm = v1v2.cross(v1p);
    if (this.#surfaceNormal.dot(pNorm) < 0) {
      return null;
    }

    const v2v0 = this.v0.sub(this.v2);
    const v2p = p.sub(this.v2);
    pNorm = v2v0.cross(v2p);
    if (this.#surfaceNormal.dot(pNorm) < 0) {
      return null;
    }

    return {t0: t, t1: t};
  }
}

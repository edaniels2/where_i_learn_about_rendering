import { Vec3 } from "../vector.js";

/**
 * Entirely copied from https://github.com/scratchapixel/scratchapixel-code/blob/main/introduction-to-ray-tracing/raytracer.cpp
 * and transposed to js. Next i'll try one where i actually understand what it's doing.
*/

const MAX_RAY_DEPTH = 5;

// base class for renderable objects
class Geometry {
  /**@type{number}*/transparency;
  /**@type{number}*/reflectivity;
  /**@type{Vec3}*/surfaceColor;
  /**@type{Vec3|undefined}*/emissionColor;
  intersect(/**@type{Vec3}*/rayOrig, /**@type{Vec3}*/rayDir) { }
  surfaceNormal(/**@type{Vec3}*/pt) { }
}

class Sphere extends Geometry {
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

// weighed average of 2 values; `mix` param is the % of b
function mix(/**@type{number}*/a, /**@type{number}*/b, /**@type{number}*/mix) {
  return b * mix + a * (1 - mix);
}

function trace(/**@type{Vec3}*/rayOrig, /**@type{Vec3}*/rayDir, /**@type{Geometry[]}*/objects, /**@type{number}*/depth) {
  let tnear = Infinity; // keeps track of distance to nearest object in ray path
  /**@type{Geometry|null}*/let nearestObject = null;

  for (let i = 0; i < objects.length; i++) {
    const intersection = objects[i].intersect(rayOrig, rayDir);
    if (intersection) {
      let { t0, t1 } = intersection;
      if (t0 < 0) {
        // this surface is behind the camera
        t0 = t1;
      }
      if (t0 < tnear) {
        // this is the new nearest object
        tnear = t0;
        nearestObject = objects[i];
      }
    }
  }
  // if there's no intersection return white
  if (!nearestObject) {
    // seems like anything >= 1, 1, 1 should be the same (and that looks true
    // for primary rays with no intersection) but the colors of the objects are
    // brighter as this increases beyond 1. some subtlety of reflections i guess.
    return new Vec3(1.5, 1.5, 1.5);
  }
  let surfaceColor = new Vec3(0, 0, 0);
  const hitPoint = rayOrig.add(rayDir.scale(tnear)); // point of intersection
  let surfaceNormal = nearestObject.surfaceNormal(hitPoint); // normal vector at hit point
  // If the normal and the view direction are not opposite to each other
  // reverse the normal direction. That also means we are inside the object so set
  // the inside bool to true.
  // bias is used to ensure secondary rays don't end up 'trapped' inside the object
  // due to rounding errors.
  const bias = 1e-4;
  let inside = false;
  if (rayDir.dot(surfaceNormal) > 0) {
    surfaceNormal = surfaceNormal.scale(-1);
    inside = true;
  }

  // this is the math & optics heavy part, which i understand tenuously at best
  if ((nearestObject.transparency > 0 || nearestObject.reflectivity > 0) && depth < MAX_RAY_DEPTH) {
    const facingRatio = rayDir.dot(surfaceNormal) * -1;
    // change the mix value to tweak the effect
    const fresnelEffect = mix(Math.pow(1 - facingRatio, 3), 1, 0.1);
    // compute reflection direction (all input vectors are already normalized)
    const reflDir = rayDir.sub(surfaceNormal.scale(2 * rayDir.dot(surfaceNormal))).normalize();
    const reflection = trace(hitPoint.add(surfaceNormal.scale(bias)), reflDir, objects, depth + 1);
    let refraction = new Vec3(0, 0, 0);
    // if the object is also transparent compute refraction ray (transmission)
    if (nearestObject.transparency) {
      const eta = inside ? 1.1 : 1 / 1.1; // refraction index as ray crosses material boundary
      const cosi = surfaceNormal.dot(rayDir) * -1;
      const k = 1 - eta * eta * (1 - cosi * cosi);
      const refrDir = rayDir.scale(eta).add(surfaceNormal.scale(eta * cosi - Math.sqrt(k))).normalize();
      refraction = trace(hitPoint.sub(surfaceNormal.scale(bias)), refrDir, objects, depth + 1);
    }
    // the result is a mix of reflection and refraction (if the object is transparent)
    surfaceColor = reflection.scale(fresnelEffect)
      .add(refraction.scale((1 - fresnelEffect) * nearestObject.transparency))
      .scale(nearestObject.surfaceColor);
  } else {
    // it's a diffuse object, only need shadow ray(s) with no recursion
    for (let i = 0; i < objects.length; i++) {
      if (objects[i].emissionColor.x > 0) {
        // this is a light
        let transmission = new Vec3(1, 1, 1);
        const lightDir = objects[i].center.sub(hitPoint).normalize();
        for (let j = 0; j < objects.length; j++) {
          if (i != j) {
            const intersection = objects[j].intersect(hitPoint.add(surfaceNormal.scale(bias)), lightDir);
            if (intersection) {
              transmission = new Vec3(0, 0, 0);
              break;
            }
          }
        }
        surfaceColor = surfaceColor.add(
          nearestObject.surfaceColor.scale(transmission)
            .scale(Math.max(0, surfaceNormal.dot(lightDir)))
            .scale(objects[i].emissionColor)
        )
      }
    }
  }
  return surfaceColor.add(nearestObject.emissionColor);
}

// Main rendering function. We compute a camera ray for each pixel of the image
// trace it and return a color. If the ray hits an object, we return the color of the
// object at the intersection point, else we return the background color.
function render(/**@type{Geometry[]}*/objects, width=640, height=480) {
  const invWidth = 1 / width;
  const invHeight = 1 / height;
  const image = new ImageData(width, height);
  const fov = 60; // determines visible scene coordinates; 30 is about -5 to 5
  // const fov = Math.PI / 6;
  const aspect = width / height;
  const angle = Math.tan(Math.PI * 0.5 * fov / 180);
  // const angle = Math.tan(fov / 2);
  let dataIndex = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xx = (2 * ((x + 0.5) * invWidth) - 1) * angle * aspect;
      const yy = (1 - 2 * ((y + 0.5) * invHeight)) * angle;
      const rayDir = new Vec3(xx, yy, -1).normalize();
      const pixelColor = trace(new Vec3, rayDir, objects, 0);
      image.data[dataIndex + 0] = pixelColor.x * 255;
      image.data[dataIndex + 1] = pixelColor.y * 255;
      image.data[dataIndex + 2] = pixelColor.z * 255;
      image.data[dataIndex + 3] = 255; // alpha channel; can we do anything interesting with this?
      dataIndex += 4;
    }
  }
  return image;
}

// Create the scene which is composed of spheres and lights (which are also spheres).
// Then, once the scene description is complete render that scene to the canvas.
export function main() {
  const canvas = document.querySelector('canvas');
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const objects = [
    new Sphere(new Vec3(-10, 20, -30), 3, new Vec3(0, 0, 0), 0, 0, new Vec3(3, 2.5, 2.5)), // light source
    new Sphere(new Vec3(10, 20, -30), 3, new Vec3(0, 0, 0), 0, 0, new Vec3(2.5, 2.5, 3)), // light source
    new Sphere(new Vec3(0, 20, -30), 3, new Vec3(0, 0, 0), 0, 0, new Vec3(2.5, 3, 2.5)), // light source
    new Sphere(new Vec3(0, 10, -5), 3, new Vec3(0, 0, 0), 0, 0, new Vec3(1, 1, 1)), // light source

    new Sphere(new Vec3(0, -10004, -20), 10000, new Vec3(0.09, 0.10, 0.11), 0, 0), // creates a "floor"

    new Sphere(new Vec3(0, 0, -20), 4, new Vec3(1.00, 0.32, 0.36), 1, 0.5),
    new Sphere(new Vec3(-3, 2, -24), 3, new Vec3(0.28, 0.45, 0.26), 0, 0),
    new Sphere(new Vec3(5, -1, -15), 2, new Vec3(0.90, 0.76, 0.46), 1, 0),
    new Sphere(new Vec3(5, 0, -25), 3, new Vec3(0.65, 0.77, 0.97), 1, 0),
    new Sphere(new Vec3(-5.5, 0, -15), 3, new Vec3(0.90, 0.90, 0.90), 1, 0),
    new Sphere(new Vec3(1, -0.5, -12), 2, new Vec3(1, 1, 1), 0, 0.9),
  ];
  ctx.putImageData(render(objects, width, height), 0, 0);
}

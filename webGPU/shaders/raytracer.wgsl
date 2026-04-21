struct Ray {
  origin: vec3f,
  direction: vec3f,
};

struct HitInfo {
  hit: bool,
  dist: f32,
  hitPoint: vec3f,
  normal: vec3f,
  material: Material,
};

struct Material {
  color: vec4f,
  emitColor: vec4f,
  emitIntensity: f32,
};

struct Triangle {
  A: vec3f,
  B: vec3f,
  C: vec3f,
  normA: vec3f,
  normB: vec3f,
  normC: vec3f,
  materialIndex: u32,
};

struct Sphere {
  position: vec3f,
  radius: f32,
  material: Material,
};

const far = 1e6;
const maxBounceCount = 5;
const raysPerPixel = 1;

@group(0) @binding(0) var renderTexture: texture_storage_2d<bgra8unorm, write>;
@group(0) @binding(1) var<uniform> ndcParams: vec2f;
@group(0) @binding(2) var<uniform> viewParams: vec3f;
@group(0) @binding(3) var<uniform> camLocalToWorld: mat4x4f;
@group(0) @binding(4) var<storage, read> materials: array<Material>;
@group(0) @binding(5) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(6) var<storage, read_write> rngSeed: vec2f;
@group(0) @binding(7) var<storage, read> triangles: array<Triangle>;

@compute @workgroup_size(1) 
fn main(@builtin(global_invocation_id) id: vec3u) {
  let rngX = f32(id.x) + 0.5;
  let rngY = f32(id.y) + 0.5;
  var rngState = rngSeed + vec2f(rngY) * vec2f(rngX);
  let ndc: vec2f = (vec2f(id.xy)) * ndcParams;
  let screen: vec2f = vec2f(2 * ndc.x - 1, 1 - 2 * ndc.y);
  let viewPointLocal: vec3f = vec3f(screen, -1.0) * viewParams;
  let viewPoint: vec3f = (camLocalToWorld * vec4(viewPointLocal, 1.0)).xyz;
  let rayOrigin: vec3f = (camLocalToWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  let rayDirection: vec3f = normalize(viewPoint - rayOrigin);
  let ray = Ray(rayOrigin, rayDirection);
  let color = vec4f(trace(ray, &rngState).xyz, 1);

  textureStore(renderTexture, id.xy, color);
}

fn trace(ray: Ray, rngState: ptr<function, vec2f>) -> vec4f {
  var newRay = ray;
  var hitInfo: HitInfo;
  var rayColor = vec4f(1);
  var incomingLight = vec4f(0);
  for (var i: u32 = 0; i < maxBounceCount; i++) {
    hitInfo = calculateRayCollision(newRay);
    if (hitInfo.hit) {
      newRay.origin = hitInfo.hitPoint;
      newRay.direction = normalize(hitInfo.normal + randNormalDistrubution(rngState));
      let material = hitInfo.material;
      let emittedLight = material.emitColor * material.emitIntensity;
      incomingLight += emittedLight * rayColor;
      rayColor *= material.color;
    } else {
      break;
    }
  }
  return incomingLight;
}

fn calculateRayCollision(ray: Ray) -> HitInfo {
  var nearest = HitInfo(false, far, vec3f(0), vec3f(0), Material(vec4f(0), vec4f(0), 0));
  // let numSpheres = arrayLength(&spheres);
  let numTriangles = arrayLength(&triangles);
  // for (var i: u32 = 0; i < numSpheres; i++) {
  //   let sphere = spheres[i];
  //   let hitInfo = raySphereIntersection(ray, sphere);
  //   if (hitInfo.hit && hitInfo.dist < nearest.dist) {
  //     nearest = hitInfo;
  //   }
  // }
  for (var i: u32 = 0; i < numTriangles; i++) {
    let tri = triangles[i];
    let material = materials[tri.materialIndex];
    let hitInfo = rayTriangleIntersection(ray, tri, material);
    if (hitInfo.hit && hitInfo.dist < nearest.dist) {
      nearest = hitInfo;
    }
  }

  return nearest;
}

fn rayTriangleIntersection(ray: Ray, tri: Triangle, material: Material) -> HitInfo {
  let edge1 = tri.B - tri.A;
  let edge2 = tri.C - tri.A;
  let normal = cross(edge1, edge2);
  let aToOrigin = ray.origin - tri.A;
  let aoCrossRayDir = cross(aToOrigin, ray.direction);
  let determinant = -dot(ray.direction, normal);
  let inverseDeterminant = 1.0 / determinant;

  let dist = dot(aToOrigin, normal) * inverseDeterminant;
  // barycentric coordinates
  let u = dot(edge2, aoCrossRayDir) * inverseDeterminant;
  let v = -dot(edge1, aoCrossRayDir) * inverseDeterminant;
  let w = 1.0 - u - v;

  return HitInfo(
    determinant >= 1e-6 && dist >= 0.0 && u >= 0.0 && v >= 0.0 && w >= 0.0,
    dist,
    ray.origin + ray.direction * dist,
    normalize(tri.normA * w + tri.normB * u + tri.normC * v),
    material
  );
}

fn raySphereIntersection(ray: Ray, sphere: Sphere) -> HitInfo {
  var hitInfo = HitInfo(false, far, vec3f(0.0), vec3f(0.0), Material(vec4f(0), vec4f(0), 0));
  let rayOriginRelativeSphere = ray.origin - sphere.position;
  // follows from (ray.origin + ray.direction * distance)^2 = sphere.radius^2
  // solving for distance yields a quadratic equation with coefficients:
  let a = 1.0;// dot(ray.dir, ray.dir); // is always 1 assuming normalized ray direction
  let b = 2.0 * dot(rayOriginRelativeSphere, ray.direction);
  let c = dot(rayOriginRelativeSphere, rayOriginRelativeSphere) - sphere.radius * sphere.radius;
  // quadratic discriminant (the part under the sqRt)
  let discriminant = b * b - 4.0 * a * c;
  if (discriminant >= 0.0) {
    // quad equation only has a real solution, i.e. an intersection, when discriminant is positive
    let dist = (-b - sqrt(discriminant)) / (2.0 * a);
    if (dist >= 0.0) {
      // ignoring intersections behind ray
      hitInfo.hit = true;
      hitInfo.dist = dist;
      hitInfo.hitPoint = ray.origin + ray.direction * dist;
      hitInfo.normal = normalize(hitInfo.hitPoint - sphere.position);
      hitInfo.material = sphere.material;
    }
  }
  return hitInfo;
}

fn rand(rngState: ptr<function, vec2f>) -> vec3f {
	var p3 = fract(vec3((*rngState).xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz+33.33);
  let result = fract((p3.xxy+p3.yzz)*p3.zyx);
  *rngState += p3.zx * p3.y;
  return result;
}

fn randNormalDistrubution(rngState: ptr<function, vec2f>) -> vec3f {
  let a = 2.0 * 3.1415926 * rand(rngState);
  let b = sqrt(-2.0 * log(rand(rngState)));
  return b * cos(a);
}

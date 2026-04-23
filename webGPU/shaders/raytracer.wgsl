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

struct Mesh {
  firstTriangle: u32,
  nextMeshFirstTriangle: u32,
  materialIndex: u32,
  boxMin: vec3f,
  boxMax: vec3f,
};

struct Triangle {
  A: vec3f,
  B: vec3f,
  C: vec3f,
  normA: vec3f,
  normB: vec3f,
  normC: vec3f,
};

struct Sphere {
  position: vec3f,
  radius: f32,
  material: Material,
};

const far = 1e6;
const maxBounceCount = 4;
const raysPerPixel = 1;

@group(0) @binding(0) var renderTexture: texture_storage_2d<bgra8unorm, write>;
@group(0) @binding(1) var<uniform> ndcParams: vec2f;
@group(0) @binding(2) var<uniform> viewParams: vec3f;
@group(0) @binding(3) var<uniform> camLocalToWorld: mat4x4f;
@group(0) @binding(4) var<storage, read> materials: array<Material>;
@group(0) @binding(5) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(6) var<uniform> rngSeed: vec2f;
@group(0) @binding(7) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(8) var<storage, read> meshes: array<Mesh>;

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
  var ray = Ray(rayOrigin, rayDirection);
  let color = vec4f(trace(&ray, &rngState).xyz, 1);

  textureStore(renderTexture, id.xy, color);
}

fn trace(rayPtr: ptr<function, Ray>, rngState: ptr<function, vec2f>) -> vec4f {
  var hitInfo = HitInfo(false, far, vec3f(0), vec3f(0), Material(vec4f(0), vec4f(0), 0.0));
  var rayColor = vec4f(1);
  var incomingLight = vec4f(0);
  for (var i: u32 = 0; i < maxBounceCount; i++) {
    calculateRayCollision(rayPtr, &hitInfo);
    if (hitInfo.hit) {
      (*rayPtr).origin = hitInfo.hitPoint;
      (*rayPtr).direction = normalize(hitInfo.normal + randNormalDistrubution(rngState));
      incomingLight += hitInfo.material.emitColor * hitInfo.material.emitIntensity * rayColor;
      rayColor *= hitInfo.material.color;
    } else {
      break;
    }
    hitInfo.hit = false;
  }
  return incomingLight;
}

fn calculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>) {
  let numMeshes = arrayLength(&meshes);
  for (var i: u32 = 0; i < numMeshes; i++) {
    for (var j: u32 = meshes[i].firstTriangle; j < meshes[i].nextMeshFirstTriangle; j++) {
      let tri = triangles[j];
      let material = materials[meshes[i].materialIndex];
      if (intersectsBoundingBox(rayPtr, meshes[i].boxMin, meshes[i].boxMax)) {
        rayTriangleIntersection(rayPtr, tri, material, hitInfoPtr);
      }
    }
  }
}

fn rayTriangleIntersection(rayPtr: ptr<function, Ray>, tri: Triangle, material: Material, hitInfoPtr: ptr<function, HitInfo>) {
  let edge1 = tri.B - tri.A;
  let edge2 = tri.C - tri.A;
  let normal = cross(edge1, edge2);
  let aToOrigin = (*rayPtr).origin - tri.A;
  let aoCrossRayDir = cross(aToOrigin, (*rayPtr).direction);
  let determinant = -dot((*rayPtr).direction, normal);
  let inverseDeterminant = 1.0 / determinant;

  let dist = dot(aToOrigin, normal) * inverseDeterminant;
  // barycentric coordinates
  let u = dot(edge2, aoCrossRayDir) * inverseDeterminant;
  let v = -dot(edge1, aoCrossRayDir) * inverseDeterminant;
  let w = 1.0 - u - v;

  let hit = determinant >= 1e-6 && dist >= 0.0 && u >= 0.0 && v >= 0.0 && w >= 0.0;
  if (hit && dist < (*hitInfoPtr).dist) {
    (*hitInfoPtr).hit = true;
    (*hitInfoPtr).dist = dist;
    (*hitInfoPtr).hitPoint = (*rayPtr).origin + (*rayPtr).direction * dist;
    (*hitInfoPtr).normal = normalize(tri.normA * w + tri.normB * u + tri.normC * v);
    (*hitInfoPtr).material = material;
  }
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

fn intersectsBoundingBox(rayPtr: ptr<function, Ray>, min: vec3f, max: vec3f) -> bool {
  var tMin: f32 = (min.x - (*rayPtr).origin.x) / (*rayPtr).direction.x;
  var tMax: f32 = (max.x - (*rayPtr).origin.x) / (*rayPtr).direction.x;
  var temp: f32;
  if (tMin > tMax) {
    temp = tMin;
    tMin = tMax;
    tMax = temp;
  }
  var tyMin = (min.y - (*rayPtr).origin.y) / (*rayPtr).direction.y;
  var tyMax = (max.y - (*rayPtr).origin.y) / (*rayPtr).direction.y;
  if (tyMin > tyMax) {
    temp = tyMin;
    tyMin = tyMax;
    tyMax = temp;
  }
  if ((tMin > tyMax) || tyMin > tMax) {
    return false;
  }
  if (tyMin > tMin) {
    tMin = tyMin;
  }
  if (tyMax < tMax) {
    tMax = tyMax;
  }
  var tzMin = (min.z - (*rayPtr).origin.z) / (*rayPtr).direction.z;
  var tzMax = (max.z - (*rayPtr).origin.z) / (*rayPtr).direction.z;
  if (tzMin > tzMax) {
    temp = tzMin;
    tzMin = tzMax;
    tzMax = temp;
  }
  if ((tMin > tzMax) || tzMin > tMax) {
    return false;
  }

  return true;
}

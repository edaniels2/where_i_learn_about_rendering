struct Ray {
  origin: vec3f,
  direction: vec3f,
  invDir: vec3f,
};

struct HitInfo {
  hit: bool,
  dist: f32,
  hitPoint: vec3f,
  normal: vec3f,
  material: Material,
};

struct BoxTest {
  dist: f32,
  hit: bool,
};

struct Material {
  color: vec4f,
  emitColor: vec4f,
  emitIntensity: f32,
  reflection: f32,
};

struct Mesh {
  firstTriangle: u32,
  nextMeshFirstTriangle: u32,
  materialIndex: u32,
  boxMin: vec3f,
  boxMax: vec3f,
};

struct BVHNode {
  boxMin: vec3f,
  firstTriangleIndex: u32,
  boxMax: vec3f,
  numTriangles: u32,
  childIndexA: u32,
}

struct Triangle {
  A: vec3f,
  // can put 4 bytes in each of these slots without any extra memory cost
  normA: vec3f,
  // 
  B: vec3f,
  sfcNormX: f32,
  normB: vec3f,
  sfcNormY: f32,
  C: vec3f,
  sfcNormZ: f32,
  normC: vec3f,
  materialIndex: u32,
};

struct StaticUniforms {
  environmentLight: vec4f,
  cameraToWorld: mat4x4f,
  frustrumParams: vec3f,
  rngSeed: u32,
  ndcParams: vec2f,
  heatMap: u32,
  heatMapThreshold: u32,
  // bvh roots array?
  bvhEnd: u32,
  useBVH: u32,
};

const far = 1e6;
const maxBounceCount = 4;
const raysPerPixel = 1;

@group(0) @binding(0) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(1) var<storage, read> meshes: array<Mesh>;
@group(0) @binding(4) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> materials: array<Material>;
@group(0) @binding(3) var<uniform> staticUniforms: StaticUniforms;

@vertex fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
  return position;
}

@fragment fn fs_main(@builtin(position) clip_position: vec4f) -> @location(0) vec4f {
  let pixelX = u32(clip_position.x);
  let pixelY = u32(clip_position.y);
  var rngState = staticUniforms.rngSeed * 719393 + (pixelX* pixelY + pixelX);
  let ndc: vec2f = (vec2f(clip_position.xy)) * staticUniforms.ndcParams;
  let screen: vec2f = vec2f(2 * ndc.x - 1, 1 - 2 * ndc.y);
  let viewPointLocal: vec3f = vec3f(screen, -1.0) * staticUniforms.frustrumParams;
  let viewPoint: vec3f = (staticUniforms.cameraToWorld * vec4(viewPointLocal, 1.0)).xyz;
  let rayOrigin: vec3f = (staticUniforms.cameraToWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  let rayDirection: vec3f = normalize(viewPoint - rayOrigin);
  let invDir = vec3f(1) / rayDirection;
  var ray = Ray(rayOrigin, rayDirection, vec3f(1) / rayDirection);
  var incomingLight = vec4f(0);
  for (var i: u32 = 0; i < raysPerPixel; i++) {
    ray.origin = rayOrigin;
    ray.direction = rayDirection;
    ray.invDir = invDir;
    incomingLight += trace(&ray, &rngState);
  }
  return vec4f((incomingLight.rgb / raysPerPixel), 1);
}

fn trace(rayPtr: ptr<function, Ray>, rngState: ptr<function, u32>) -> vec4f {
  var rayColor = vec4f(1);
  var incomingLight = vec4f(0);
  var hitInfo = HitInfo(false, far, vec3f(0), vec3f(0), Material(vec4f(0), vec4f(0), 0.0, 0));
  var numTests: u32;
  for (var i: u32 = 0; i <= maxBounceCount; i++) {
    if (staticUniforms.useBVH == 1) {
      bvhCalculateRayCollision(rayPtr, &hitInfo, &numTests);
    } else {
      bbCalculateRayCollision(rayPtr, &hitInfo, &numTests);
    }
    if (hitInfo.hit) {
      let diffuseDir = normalize(hitInfo.normal + randomDirection(rngState));
      let specularDir = reflect((*rayPtr).direction, hitInfo.normal);
      (*rayPtr).direction = normalize(interpolate(diffuseDir, specularDir, hitInfo.material.reflection));
      (*rayPtr).invDir = vec3f(1) / (*rayPtr).direction;
      (*rayPtr).origin = hitInfo.hitPoint;
      incomingLight += hitInfo.material.emitColor * hitInfo.material.emitIntensity * rayColor;
      rayColor *= hitInfo.material.color;
      let p = max(max(rayColor.r, rayColor.g), rayColor.b);
      if (p < 1e-6) {
        // stop if there's not any appreciable light to contribute (probably should randomize this)
        break;
      }
      // rayColor *= 1.0 / p; // sebastian does this, not sure why. it basically scales all colors so their max component is 1
    } else {
      incomingLight += staticUniforms.environmentLight * rayColor;
      break;
    }
    hitInfo.hit = false;
    hitInfo.dist = far;
  }
  if (staticUniforms.heatMap == 1) {
    let r = f32(numTests) / (f32(staticUniforms.heatMapThreshold) * 0.25);
    let g = f32(numTests) / (f32(staticUniforms.heatMapThreshold) * 0.5);
    let b = f32(numTests) / f32(staticUniforms.heatMapThreshold);
    return vec4f(r,g,b, 1);
  }
  return incomingLight;
}

fn bvhCalculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>, numTestsPtr: ptr<function, u32>) {
  let maxLp = arrayLength(&bvhNodes);
  var lpCount: u32 = 0;
  var nodesToTest: array<u32, 10>;
  var sp: u32 = 0;
  nodesToTest[sp] = 0;
  sp = sp + 1;
  while (sp > 0 && lpCount < maxLp) {
    lpCount++;
    sp = sp - 1;
    let node = bvhNodes[nodesToTest[sp]];
    if (intersectsBoundingBox(rayPtr, node.boxMin, node.boxMax, (*hitInfoPtr).dist)) {
      if (node.childIndexA == 0) {
        let end = node.firstTriangleIndex + node.numTriangles;
        for (var i: u32 = node.firstTriangleIndex; i < end; i++) {
          let tri = triangles[i];
          let mtl = materials[tri.materialIndex];
          rayTriangleIntersection(rayPtr, tri, mtl, hitInfoPtr);
          (*numTestsPtr)++;
        }
      } else {
        nodesToTest[sp] = node.childIndexA;
        sp = sp + 1;
        nodesToTest[sp] = node.childIndexA + 1;
        sp = sp + 1;
      }
    }
  }
  let totalTris = arrayLength(&triangles);
  for (var i: u32 = staticUniforms.bvhEnd; i < totalTris; i++) {
    let tri = triangles[i];
    let mtl = materials[tri.materialIndex];
    rayTriangleIntersection(rayPtr, tri, mtl, hitInfoPtr);
    (*numTestsPtr)++;
  }
}

fn bbCalculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>, numTestsPtr: ptr<function, u32>) {
  let numMeshes = arrayLength(&meshes);
  for (var i: u32 = 0; i < numMeshes; i++) {
    if (intersectsBoundingBox(rayPtr, meshes[i].boxMin, meshes[i].boxMax, (*hitInfoPtr).dist)) {
      for (var j: u32 = meshes[i].firstTriangle; j < meshes[i].nextMeshFirstTriangle; j++) {
        let tri = triangles[j];
        let material = materials[tri.materialIndex];
        rayTriangleIntersection(rayPtr, tri, material, hitInfoPtr);
        (*numTestsPtr)++;
      }
    }
  }
}

fn rayTriangleIntersection(rayPtr: ptr<function, Ray>, tri: Triangle, material: Material, hitInfoPtr: ptr<function, HitInfo>) {
  let ray = *rayPtr;
  let edge1 = tri.B - tri.A;
  let edge2 = tri.C - tri.A;
  let normal = vec3f(tri.sfcNormX, tri.sfcNormY, tri.sfcNormZ);
  let aToOrigin = ray.origin - tri.A;
  let aoCrossRayDir = cross(aToOrigin, ray.direction);
  let determinant = -dot(ray.direction, normal);
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
    (*hitInfoPtr).hitPoint = ray.origin + ray.direction * dist;
    (*hitInfoPtr).normal = normalize(tri.normA * w + tri.normB * u + tri.normC * v);
    (*hitInfoPtr).material = material;
  }
}

fn rand1d(rngState: ptr<function, u32>) -> f32 {
  *rngState *= 747796405 + 2891336453;
  var result = ((*rngState >> ((*rngState >> 28) + 4)) ^ *rngState) * 277803737;
  result = (result >> 22) ^ result;
  return f32(result) / 4294967295.0;
}

fn randNormalDistrubution(rngState: ptr<function, u32>) -> f32 {
  let a = 2.0 * 3.1415926 * rand1d(rngState);
  let b = sqrt(-2.0 * log(rand1d(rngState)));
  return b * cos(a);
}

fn randomDirection(rngState: ptr<function, u32>) -> vec3f {
  let x = randNormalDistrubution(rngState);
  let y = randNormalDistrubution(rngState);
  let z = randNormalDistrubution(rngState);
  return normalize(vec3(x, y, z));
}

fn rayBoxIntersection(rayPtr: ptr<function, Ray>, boxMin: vec3f, boxMax: vec3f) -> BoxTest {
  let ray = *rayPtr;
  let tMin: vec3f = (boxMin - ray.origin) * ray.invDir;
  let tMax: vec3f = (boxMax - ray.origin) * ray.invDir;
  let t1 = min(tMin, tMax);
  let t2 = max(tMin, tMax);
  let distFar = min(min(t2.x, t2.y), t2.z);
  let distNear = max(max(t1.x, t1.y), t1.z);
  let hit = distFar >= distNear && distFar > 0;
  return BoxTest(distNear, true);
}

fn intersectsBoundingBox(rayPtr: ptr<function, Ray>, boxMin: vec3f, boxMax: vec3f, hitDist: f32) -> bool {
  let ray = *rayPtr;
  let tx1: f32 = (boxMin.x - ray.origin.x) * ray.invDir.x;
  let tx2: f32 = (boxMax.x - ray.origin.x) * ray.invDir.x;
  var tmin: f32 = min( tx1, tx2 );
  var tmax: f32 = max( tx1, tx2 );
  let ty1: f32 = (boxMin.y - ray.origin.y) * ray.invDir.y;
  let ty2: f32 = (boxMax.y - ray.origin.y) * ray.invDir.y;
  tmin = max( tmin, min( ty1, ty2 ) );
  tmax = min( tmax, max( ty1, ty2 ) );
  let tz1: f32 = (boxMin.z - ray.origin.z) * ray.invDir.z;
  let tz2: f32 = (boxMax.z - ray.origin.z) * ray.invDir.z;
  tmin = max( tmin, min( tz1, tz2 ) );
  tmax = min( tmax, max( tz1, tz2 ) );
  return tmax >= tmin && tmin < hitDist && tmax > 0;
}

fn interpolate(a: vec3f, b: vec3f, t: f32) -> vec3f {
  return a + (b - a) * t;
}

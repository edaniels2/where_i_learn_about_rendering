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
  texCoords: vec2f,
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
  textureIndex: i32,
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
  texCoordAx: f32,
  normA: vec3f,
  texCoordAy: f32,
  B: vec3f,
  texCoordBx: f32,
  normB: vec3f,
  texCoordBy: f32,
  C: vec3f,
  texCoordCx: f32,
  normC: vec3f,
  texCoordCy: f32,
  sfcNormX: f32,
  sfcNormY: f32,
  sfcNormZ: f32,
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
};

const far = 1e6;
const maxBounceCount = 4;
const raysPerPixel = 1;

@group(0) @binding(0) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(1) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> materials: array<Material>;
@group(0) @binding(3) var<uniform> staticUniforms: StaticUniforms;
@group(1) @binding(0) var texSampler: sampler;
// interpolate texture bindings in the js? that may be the only way to support a dynamic number of textures
@group(1) @binding(1) var texture0: texture_2d<f32>;
@group(1) @binding(2) var texture1: texture_2d<f32>;
@group(1) @binding(3) var texture2: texture_2d<f32>;

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
  // not sure what I'm doing wrong, trying to average multiple rays per pixel
  // makes everything look flat
  // for (var i: u32 = 0; i < raysPerPixel; i++) {
    ray.origin = rayOrigin;
    ray.direction = rayDirection;
    ray.invDir = invDir;
    incomingLight += trace(&ray, &rngState);
  // }
  // incomingLight /= f32(raysPerPixel);
  return vec4f(incomingLight.rgb, 1);
}

fn trace(rayPtr: ptr<function, Ray>, rngState: ptr<function, u32>) -> vec4f {
  var rayColor = vec4f(1);
  var incomingLight = vec4f(0);
  var hitInfo = HitInfo(false, far, vec3f(0), vec3f(0), vec2f(0), Material(vec4f(0), vec4f(0), 0.0, 0, -1));
  var numTests: u32;
  for (var i: u32 = 0; i <= maxBounceCount; i++) {
    bvhCalculateRayCollision(rayPtr, &hitInfo, &numTests);
    if (hitInfo.hit) {
      let diffuseDir = normalize(hitInfo.normal + randomDirection(rngState));
      let specularDir = reflect((*rayPtr).direction, hitInfo.normal);
      (*rayPtr).direction = normalize(interpolate(diffuseDir, specularDir, hitInfo.material.reflection));
      (*rayPtr).invDir = vec3f(1) / (*rayPtr).direction;
      (*rayPtr).origin = hitInfo.hitPoint;
      incomingLight += hitInfo.material.emitColor * hitInfo.material.emitIntensity * rayColor;
      rayColor *= getMaterialColor(hitInfo);
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

fn getMaterialColor(hitInfo: HitInfo) -> vec4f {
  switch hitInfo.material.textureIndex {
    default: {
      return hitInfo.material.color;
    }
    case 0: {
      // mix with base color?
      return textureSample(texture0, texSampler, hitInfo.texCoords);
    }
    case 1: {
      return textureSample(texture1, texSampler, hitInfo.texCoords);
    }
    case 2: {
      return textureSample(texture2, texSampler, hitInfo.texCoords);
    }
  }
}

fn bvhCalculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>, numTestsPtr: ptr<function, u32>) {
  let maxLp = arrayLength(&bvhNodes) * 2;
  var lpCount: u32 = 0;
  var nodesToTest: array<u32, 64>;
  var sp: i32 = 1;
  var node: BVHNode = bvhNodes[0];
  while (sp >= 0 && lpCount < maxLp) {
    lpCount++;
    if (node.childIndexA == 0) {
      let end = node.firstTriangleIndex + node.numTriangles;
      for (var i: u32 = node.firstTriangleIndex; i < end; i++) {
        let tri = triangles[i];
        let mtl = materials[tri.materialIndex];
        rayTriangleIntersection(rayPtr, tri, mtl, hitInfoPtr);
        (*numTestsPtr)++;
      }
      sp--;
      node = bvhNodes[nodesToTest[sp]];
      continue;
    }
    let childA = bvhNodes[node.childIndexA];
    let childB = bvhNodes[node.childIndexA + 1];
    let distA = rayBoxIntersection(rayPtr, childA.boxMin, childA.boxMax);
    let distB = rayBoxIntersection(rayPtr, childB.boxMin, childB.boxMax);
    var nearDist = distA;
    var nearChild = childA;
    var farDist = distB;
    var farChildIndex = node.childIndexA + 1;
    if (distA > distB) {
      nearDist = distB;
      nearChild = childB;
      farDist = distA;
      farChildIndex = node.childIndexA;
    }
    if (nearDist > (*hitInfoPtr).dist) {
      sp = sp - 1;
      node = bvhNodes[nodesToTest[sp]];
    } else {
      node = nearChild;
      if (farDist < (*hitInfoPtr).dist) {
        nodesToTest[sp] = farChildIndex;
        sp = sp + 1;
      }
    }
  }
}

// fn bbCalculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>, numTestsPtr: ptr<function, u32>) {
//   let numMeshes = arrayLength(&meshes);
//   for (var i: u32 = 0; i < numMeshes; i++) {
//     if (intersectsBoundingBox(rayPtr, meshes[i].boxMin, meshes[i].boxMax, (*hitInfoPtr).dist)) {
//       for (var j: u32 = meshes[i].firstTriangle; j < meshes[i].nextMeshFirstTriangle; j++) {
//         let tri = triangles[j];
//         let material = materials[tri.materialIndex];
//         rayTriangleIntersection(rayPtr, tri, material, hitInfoPtr);
//         (*numTestsPtr)++;
//       }
//     }
//   }
// }

fn rayTriangleIntersection(rayPtr: ptr<function, Ray>, tri: Triangle, material: Material, hitInfoPtr: ptr<function, HitInfo>) {
  let ray = *rayPtr;
  let edge1 = tri.B - tri.A;
  let edge2 = tri.C - tri.A;
  let normal = vec3f(tri.sfcNormX, tri.sfcNormY, tri.sfcNormZ);
  let aToOrigin = ray.origin - tri.A;
  let aoCrossRayDir = cross(aToOrigin, ray.direction);
  let determinant = -dot(ray.direction, normal);
  if (determinant < 1e-64) {
    return;
  }
  let inverseDeterminant = 1.0 / determinant;

  let dist = dot(aToOrigin, normal) * inverseDeterminant;
  // barycentric coordinates
  let u = dot(edge2, aoCrossRayDir) * inverseDeterminant;
  let v = -dot(edge1, aoCrossRayDir) * inverseDeterminant;
  let w = 1.0 - u - v;

  let hit = dist >= 0.0 && u >= 0.0 && v >= 0.0 && w >= 0.0;
  if (hit && dist < (*hitInfoPtr).dist) {
    (*hitInfoPtr).hit = true;
    (*hitInfoPtr).dist = dist;
    (*hitInfoPtr).hitPoint = ray.origin + ray.direction * dist;
    (*hitInfoPtr).normal = normalize(tri.normA * w + tri.normB * u + tri.normC * v);
    (*hitInfoPtr).texCoords = vec2f(tri.texCoordAx, tri.texCoordAy) * w 
      + vec2f(tri.texCoordBx, tri.texCoordBy) * u
      + vec2f(tri.texCoordCx, tri.texCoordCy) * v;
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

fn rayBoxIntersection(rayPtr: ptr<function, Ray>, boxMin: vec3f, boxMax: vec3f) -> f32 {
  let ray = *rayPtr;
  let tMin: vec3f = (boxMin - ray.origin) * ray.invDir;
  let tMax: vec3f = (boxMax - ray.origin) * ray.invDir;
  let t1 = min(tMin, tMax);
  let t2 = max(tMin, tMax);
  let distFar = min(min(t2.x, t2.y), t2.z);
  let distNear = max(max(t1.x, t1.y), t1.z);
  let hit = distFar >= distNear && distFar > 0;
  if (hit) {
    return distNear;
  }
  return far;
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

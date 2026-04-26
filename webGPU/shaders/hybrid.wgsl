struct vOut {
  @builtin(position) clip_position: vec4f,
  @location(0) vn: vec3f,
  @location(1) mtlColor: vec4f,
  @location(2) mtlEmit: vec4f,
  @location(3) mtlEmitIntensity: f32,
  @location(4) mtlReflection: f32,
};

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
  reflection: f32,
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
  normA: vec3f,
  B: vec3f,
  normB: vec3f,
  C: vec3f,
  normC: vec3f,
};

struct Vertex {
  position: vec3f,
  normal: vec3f,
};

struct StaticUniforms {
  cameraToWorld: mat4x4f,
  frustrumParams: vec3f,
  rngSeed: u32,
  ndcParams: vec2f,
};

const far = 1e6;
const maxBounceCount = 4;
const raysPerPixel = 1;

@group(0) @binding(0) var<storage, read> vertices: array<Vertex>;
@group(0) @binding(1) var<storage, read> meshes: array<Mesh>;
@group(0) @binding(2) var<storage, read> materials: array<Material>;
@group(0) @binding(3) var<uniform> staticUniforms: StaticUniforms;

@vertex fn vs_main(
  @location(0) position: vec4f,
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) materialIndex: u32,
) -> vOut {
  var out: vOut;
  let vertex = vertices[vertexIndex];
  let mtl = materials[materialIndex];
  out.clip_position = position;
  out.vn = vertex.normal;
  out.mtlColor = mtl.color;
  out.mtlEmit = mtl.emitColor;
  out.mtlEmitIntensity = mtl.emitIntensity;
  out.mtlReflection = mtl.reflection;
  return out;
}

@fragment fn fs_main(inputs: vOut) -> @location(0) vec4f {
  let pixelX = u32(inputs.clip_position.x);
  let pixelY = u32(inputs.clip_position.y);
  var rngState = staticUniforms.rngSeed * 719393 + (pixelX* pixelY + pixelX);
  let ndc: vec2f = (vec2f(inputs.clip_position.xy)) * staticUniforms.ndcParams;
  let screen: vec2f = vec2f(2 * ndc.x - 1, 1 - 2 * ndc.y);
  let viewPointLocal: vec3f = vec3f(screen, -1.0) * staticUniforms.frustrumParams;
  let viewPoint: vec3f = (staticUniforms.cameraToWorld * vec4(viewPointLocal, 1.0)).xyz;
  let rayOrigin: vec3f = (staticUniforms.cameraToWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  let rayDirection: vec3f = normalize(viewPoint - rayOrigin);
  var ray = Ray(rayOrigin, rayDirection);
  return vec4f(trace(&ray, &rngState).xyz, 1);
}

fn trace(rayPtr: ptr<function, Ray>, rngState: ptr<function, u32>) -> vec4f {
  var rayColor = vec4f(1);
  var incomingLight = vec4f(0);
  var hitInfo = HitInfo(false, far, vec3f(0), vec3f(0), Material(vec4f(0), vec4f(0), 0.0, 0));
  for (var i: u32 = 0; i <= maxBounceCount; i++) {
    calculateRayCollision(rayPtr, &hitInfo);
    if (hitInfo.hit) {
      let diffuseDir = normalize(hitInfo.normal + randomDirection(rngState));
      let specularDir = reflect((*rayPtr).direction, hitInfo.normal);
      (*rayPtr).direction = normalize(lerp(diffuseDir, specularDir, hitInfo.material.reflection));
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
      break;
    }
    hitInfo.hit = false;
    hitInfo.dist = far;
  }
  return incomingLight;
}

fn calculateRayCollision(rayPtr: ptr<function, Ray>, hitInfoPtr: ptr<function, HitInfo>) {
  let numMeshes = arrayLength(&meshes);
  for (var i: u32 = 0; i < numMeshes; i++) {
    if (intersectsBoundingBox(rayPtr, meshes[i].boxMin, meshes[i].boxMax)) {
      let material = materials[meshes[i].materialIndex];
      for (var j: u32 = meshes[i].firstTriangle; j < meshes[i].nextMeshFirstTriangle; j++) {
        // refactor meshes to index by vertex instead of triangle
        let vtxIndex = j * 3;
        let tri = Triangle(
          vertices[vtxIndex].position,
          vertices[vtxIndex].normal,
          vertices[vtxIndex + 1].position,
          vertices[vtxIndex + 1].normal,
          vertices[vtxIndex + 2].position,
          vertices[vtxIndex + 2].normal,
        );
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

fn lerp(a: vec3f, b: vec3f, t: f32) -> vec3f {
  return a + (b - a) * t;
}

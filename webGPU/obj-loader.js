import { mat4, vec3, quat } from 'gl-matrix';
import { MtlFile } from './mtl-loader.js';
/**
 * @typedef {import('./mtl-file.js').Material} Material
 */

export async function fromObjFile(/**@type{string}*/path, /**@type{Vec3}*/position, /**@type{ModelOptions}*/options) {
  const Model = await new ObjFile(path).parse();
  return new Model(position, options);
}

/**@type{Object.<string: MtlFile>}*/let mtlFiles = {};

export class ObjFile {
  constructor(/**@type{string}*/path) {
    const pathParts = path.split('/');
    this.name = pathParts.pop();
    this.dir = pathParts.join('/');
    this.path = path;
  }

  async parse() {
    const content = await (await fetch(this.path)).text();
    const /**@type{FacetGroup[]}*/ facetGroups = [];
    const /**@type{Material[]}*/ materials = {};
    const /**@type{number[]}*/ vertices = [];
    const /**@type{number[]}*/ normals = [];
    const /**@type{number[]}*/ texCoords = [];
    const /**@type{number[]}*/ combinedIndexes = [];
    const /**@type{number[]}*/ vertexIndexes = [];
    const /**@type{number[]}*/ normalIndexes = [];
    const /**@type{number[]}*/ textureIndexes = [];
    const /**@type{number[]}*/ dereferencedVertices = [];
    const /**@type{number[]}*/ dereferencedTexCoords = [];
    const /**@type{number[]}*/ dereferencedNormals = [];
    let /**@type{number}*/ xMin = Infinity;
    let /**@type{number}*/ yMin = Infinity;
    let /**@type{number}*/ zMin = Infinity;
    let /**@type{number}*/ xMax = -Infinity;
    let /**@type{number}*/ yMax = -Infinity;
    let /**@type{number}*/ zMax = -Infinity;
    let /**@type{number}*/ currentIndex = 0;
    let /**@type{FacetGroup}*/ currentGroup;
    let /**@type{Object.<string, Material>}*/ currentMtlFile;
    let /**@type{Material}*/ currentMtl;
    let /**@type{string}*/ mtlPath;
    let name = '';
    let triangleIndex = 0;

    for (const line of content.split(/\n/)) {
      if (line.startsWith('mtllib')) {
        mtlPath = line.split(/\s+/)[1];
        if (!mtlFiles[mtlPath]) {
          mtlFiles[mtlPath] = await new MtlFile(this.dir + '/' + mtlPath).parse();
        }
        currentMtlFile = mtlFiles[mtlPath];
      }
      if (line.startsWith('g')) {
        name = line.split(/\s+/)[1] || 'no_name';
      }
      if (currentMtlFile && line.startsWith('usemtl')) {
        const mtlName = line.split(/\s+/)[1];
        currentMtl = currentMtlFile[mtlName];
        materials[mtlName] = currentMtl;
        if (!currentGroup || currentGroup?.length) {
          // make sure we start a new group on material changes
          const currentName = name || currentGroup?.name || 'no_name';
          currentGroup = new FacetGroup(currentName, currentMtl, currentIndex, triangleIndex);
          facetGroups.push(currentGroup);
        } else {
          currentGroup.material = currentMtl;
        }
      }
      if (line.startsWith('v ')) {
        const [x, y, z] = line.split(' ').slice(1).map(Number);
        vertices.push(x, y, z);
        if (x < xMin) { xMin = x };
        if (y < yMin) { yMin = y };
        if (z < zMin) { zMin = z };
        if (x > xMax) { xMax = x };
        if (y > yMax) { yMax = y };
        if (z > zMax) { zMax = z };
      }
      if (line.startsWith('vn ')) {
        const [x, y, z] = line.split(/\s+/).slice(1).map(Number);
        normals.push(x, y, z);
      }
      if (line.startsWith('vt ')) {
        const [x, y] = line.split(/\s+/).slice(1).map(Number);
        texCoords.push(x, y);
      }
      if (line.startsWith('f ')) {
        if (!currentGroup) {
          // throw new Error('does this happen?');
          currentGroup = new FacetGroup('no_name', currentMtl, currentIndex);
          facetGroups.push(currentGroup);
        }
        const indexes = line.trim().split(/\s+/).slice(1).map(index => {
          const [vertex, texture, normal] = index.split('/');
          return { vertex, texture, normal };
        });
        if (indexes.length == 0) {
          throw new Error('This shouldn\'t happen');
        }
        while (indexes.length >= 3) {
          const triangle = indexes.slice(0, 3);
          if (triangle[0].vertex) {
            const a = triangle[0].vertex - 1;
            const b = triangle[1].vertex - 1;
            const c = triangle[2].vertex - 1;
            vertexIndexes.push(a, b, c);
            const aStart = a * 3;
            const bStart = b * 3;
            const cStart = c * 3;
            const A = [vertices[aStart], vertices[aStart + 1], vertices[aStart + 2]];
            const B = [vertices[bStart], vertices[bStart + 1], vertices[bStart + 2]];
            const C = [vertices[cStart], vertices[cStart + 1], vertices[cStart + 2]];
            currentGroup.updateBoundingBox(A);
            currentGroup.updateBoundingBox(B);
            currentGroup.updateBoundingBox(C);
            dereferencedVertices.push(
              vertices[aStart], vertices[aStart + 1], vertices[aStart + 2],
              vertices[bStart], vertices[bStart + 1], vertices[bStart + 2],
              vertices[cStart], vertices[cStart + 1], vertices[cStart + 2],
            );
            combinedIndexes.push(a, b, c);
          }
          if (triangle[0].texture) {
            const a = triangle[0].texture - 1;
            const b = triangle[1].texture - 1;
            const c = triangle[2].texture - 1;
            textureIndexes.push(a, b, c);
            const aStart = a * 2;
            const bStart = b * 2;
            const cStart = c * 2;
            dereferencedTexCoords.push(
              texCoords[aStart], texCoords[aStart + 1], texCoords[aStart + 2],
              texCoords[bStart], texCoords[bStart + 1], texCoords[bStart + 2],
              texCoords[cStart], texCoords[cStart + 1], texCoords[cStart + 2],
            );
            combinedIndexes.push(a, b, c);
          }
          if (triangle[0].normal) {
            const a = triangle[0].normal - 1;
            const b = triangle[1].normal - 1;
            const c = triangle[2].normal - 1;
            normalIndexes.push(a, b, c);
            const aStart = a * 3;
            const bStart = b * 3;
            const cStart = c * 3;
            dereferencedNormals.push(
              normals[aStart], normals[aStart + 1], normals[aStart + 2],
              normals[bStart], normals[bStart + 1], normals[bStart + 2],
              normals[cStart], normals[cStart + 1], normals[cStart + 2],
            );
            combinedIndexes.push(a, b, c);
          }
          currentIndex += 3;
          currentGroup.length += 3;
          currentGroup.byteLength += 12;
          indexes.splice(1, 1);
          triangleIndex++;
          currentGroup.triangleCount++;
        }
      }
    }

    return class extends Geometry {
      define() {
        // add some options so we don't return everything all the time.
        this.vertices = vertices;
        this.normals = normals;
        this.texCoords = texCoords;
        // this.indexes = combinedIndexes;
        this.vertexIndexes = vertexIndexes;
        this.normalIndexes = normalIndexes;
        this.textureIndexes = textureIndexes;
        this.dereferencedNormals = dereferencedNormals;
        this.dereferencedTexCoords = dereferencedTexCoords;
        this.dereferencedVertices = dereferencedVertices;
        this.facetGroups = facetGroups;
        this.materials = materials
        this.boundingBox = { min: [xMin, yMin, zMin], max: [xMax, yMax, zMax] };
      }
    }
  }
}

export class Geometry {
  constructor(options) {
    this.skipBVH = options?.skipBVH;
    this.matrix = mat4.create();
    this.transformed = false;
    if (options?.position) {
      mat4.translate(this.matrix, this.matrix, options.position);
      this.transformed = true;
    }
    if (options?.scale) {
      let [x, y, z] = Array.isArray(options.scale) ? options.scale : [options.scale, options.scale, options.scale];
      mat4.scale(this.matrix, this.matrix, [x, y, z]);
      this.transformed = true;
    }
    if (options?.rotateX) {
      mat4.rotateX(this.matrix, this.matrix, options.rotateX);
      this.transformed = true;
    }
    if (options?.rotateY) {
      mat4.rotateY(this.matrix, this.matrix, options.rotateY);
      this.transformed = true;
    }
    if (options?.rotateZ) {
      mat4.rotateZ(this.matrix, this.matrix, options.rotateZ);
      this.transformed = true;
    }
    this.define();
    this.transform();
  }

  transform() {
    if (!this.transformed) {
      return;
    }
    const rotation = mat4.fromQuat(mat4.create(), mat4.getRotation(quat.create(), this.matrix));
    // recalculate bounding boxes as well
    for (let i = 0; i < 3; i++) {
      this.boundingBox.min[i] = Infinity;
      this.boundingBox.max[i] = -Infinity;
      for (const mesh of this.facetGroups) {
        mesh.boundingBox.min[i] = Infinity;
        mesh.boundingBox.max[i] = -Infinity;
      }
    }
    for (let i = 0; i < this.dereferencedVertices.length; i += 3) {
      const mesh = this.getMesh(i / 3);
      const vtx = this.dereferencedVertices.slice(i, i + 3);
      vec3.transformMat4(vtx, vtx, this.matrix);
      this.dereferencedVertices.splice(i, 3, vtx[0], vtx[1], vtx[2]);

      const norm = this.dereferencedNormals.slice(i, i + 3);
      vec3.transformMat4(norm, norm, rotation);
      this.dereferencedNormals.splice(i, 3, norm[0], norm[1], norm[2]);

      if (vtx[0] < this.boundingBox.min[0]) { this.boundingBox.min[0] = vtx[0] };
      if (vtx[1] < this.boundingBox.min[1]) { this.boundingBox.min[1] = vtx[1] };
      if (vtx[2] < this.boundingBox.min[2]) { this.boundingBox.min[2] = vtx[2] };
      if (vtx[0] > this.boundingBox.max[0]) { this.boundingBox.max[0] = vtx[0] };
      if (vtx[1] > this.boundingBox.max[1]) { this.boundingBox.max[1] = vtx[1] };
      if (vtx[2] > this.boundingBox.max[2]) { this.boundingBox.max[2] = vtx[2] };

      if (vtx[0] < mesh.boundingBox.min[0]) { mesh.boundingBox.min[0] = vtx[0] };
      if (vtx[1] < mesh.boundingBox.min[1]) { mesh.boundingBox.min[1] = vtx[1] };
      if (vtx[2] < mesh.boundingBox.min[2]) { mesh.boundingBox.min[2] = vtx[2] };
      if (vtx[0] > mesh.boundingBox.max[0]) { mesh.boundingBox.max[0] = vtx[0] };
      if (vtx[1] > mesh.boundingBox.max[1]) { mesh.boundingBox.max[1] = vtx[1] };
      if (vtx[2] > mesh.boundingBox.max[2]) { mesh.boundingBox.max[2] = vtx[2] };
    }
    for (let i = 0; i < this.vertices.length; i += 3) {
      const vtx = this.vertices.slice(i, i + 3);
      vec3.transformMat4(vtx, vtx, this.matrix);
      this.vertices.splice(i, 3, vtx[0], vtx[1], vtx[2]);
    }
    for (let i = 0; i < this.normals.length; i += 3) {
      const vec = this.normals.slice(i, i + 3);
      vec3.transformMat4(vec, vec, rotation);
      this.normals.splice(i, 3, vec[0], vec[1], vec[2]);
    }
  }

  getMesh(vertexIndex) {
    const triangleIndex = vertexIndex / 3; // in thirds so not really an index but it works
    for (const mesh of this.facetGroups) {
      if (mesh.triangleOffset <= triangleIndex && triangleIndex < (mesh.triangleOffset + mesh.triangleCount)) {
        return mesh;
      }
    }
  }

  define() { }
}

class FacetGroup {
  constructor(/**@type{string}*/name = '', /**@type{Material}*/material, /**@type{number}*/startIndex, triangleOffset) {
    this.name = name;
    this.material = material;
    this.materialName = material?.name;
    this.startIndex = startIndex;
    this.byteOffset = startIndex * 4;
    this.byteLength = 0;
    this.length = 0;
    this.triangleOffset = triangleOffset || 0;
    this.triangleCount = 0;
    this.boundingBox = {min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity]}
  }

  updateBoundingBox(/**@type{[number, number, number]}*/vtx) {
      if (vtx[0] < this.boundingBox.min[0]) { this.boundingBox.min[0] = vtx[0] };
      if (vtx[1] < this.boundingBox.min[1]) { this.boundingBox.min[1] = vtx[1] };
      if (vtx[2] < this.boundingBox.min[2]) { this.boundingBox.min[2] = vtx[2] };
      if (vtx[0] > this.boundingBox.max[0]) { this.boundingBox.max[0] = vtx[0] };
      if (vtx[1] > this.boundingBox.max[1]) { this.boundingBox.max[1] = vtx[1] };
      if (vtx[2] > this.boundingBox.max[2]) { this.boundingBox.max[2] = vtx[2] };
  }
}

/**
 * @typedef {{
 *   scale: number,
 *   rotateX: number,
 *   rotateY: number,
 *   rotateZ: number,
 * }} ModelOptions*/

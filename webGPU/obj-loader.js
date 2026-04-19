import { mat4, vec3 } from 'gl-matrix';
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
          currentGroup = new FacetGroup(currentName, currentMtl, currentMtl.name, currentIndex);
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
          currentGroup = new FacetGroup('no_name', currentMtl, currentMtl.name, currentIndex);
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
            const offset = vertices.length * 3;
            combinedIndexes.push(a + offset, b + offset, c + offset);
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
            const offset = vertices.length * 3 + texCoords.length * 2;
            combinedIndexes.push(a + offset, b + offset, c + offset);
          }
          currentIndex += 3;
          currentGroup.length += 3;
          currentGroup.byteLength += 12;
          indexes.splice(1, 1);
        }
      }
    }

    return class extends Geometry {
      define() {
        // add some options so we don't return everything all the time. I think for the
        // moment i'm only using dereferencedVertices/Normals and facetGroups
        this.vertices = vertices;
        this.normals = normals;
        this.texCoords = texCoords;
        this.indexes = combinedIndexes;
        this.vertexIndexes = vertexIndexes;
        this.normalIndexes = normalIndexes;
        this.textureIndexes = textureIndexes;
        this.dereferencedNormals = dereferencedNormals;
        this.dereferencedTexCoords = dereferencedTexCoords;
        this.dereferencedVertices = dereferencedVertices;
        this.facetGroups = facetGroups;
        this.materials = materials
        this.boundingBox = { xMin, yMin, zMin, xMax, yMax, zMax };
      }
    }
  }
}

export class Geometry {
  constructor(options) {
    this.matrix = mat4.create();
    if (options?.position) {
      mat4.translate(this.matrix, this.matrix, options.position);
    }
    if (options?.scale) {
      mat4.scale(this.matrix, this.matrix, [options.scale, options.scale, options.scale]);
    }
    if (options?.rotateX) {
      mat4.rotateX(this.matrix, this.matrix, options.rotateX);
    }
    if (options?.rotateY) {
      mat4.rotateY(this.matrix, this.matrix, options.rotateY);
    }
    if (options?.rotateZ) {
      mat4.rotateZ(this.matrix, this.matrix, options.rotateZ);
    }
    this.define();
  }

  define() { }
}

class FacetGroup {
  constructor(/**@type{string}*/name = '', /**@type{Material}*/material, /**@type{string}*/materialName, /**@type{number}*/startIndex) {
    this.name = name;
    this.material = material;
    this.materialName = material.name;
    this.startIndex = startIndex;
    this.byteOffset = startIndex * 4;
    this.byteLength = 0;
    this.length = 0;
  }
}

/**
 * @typedef {{
 *   scale: number,
 *   rotateX: number,
 *   rotateY: number,
 *   rotateZ: number,
 * }} ModelOptions*/

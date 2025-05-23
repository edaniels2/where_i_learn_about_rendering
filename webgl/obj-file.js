import { ArrayGeometry, ElementGeometry, FacetGroup } from './geometry.js';
import { MtlFile } from './mtl-file.js';
import './glmatrix.js';
/**
 * @typedef {import('./mtl-file.js').Material} Material
 */

export async function fromObjFile(/**@type{string}*/path, /**@type{ModelOptions}*/options, /**@type{boolean}*/drawElements) {
  const Model = await new ObjFile(path, drawElements).parse();
  return new Model(options);
}

/**@type{Object.<string: MtlFile>}*/let mtlFiles = {};

export class ObjFile {

  constructor(/**@type{string}*/path, /**@type{boolean}*/drawElements) {
    const pathParts = path.split('/');
    this.name = pathParts.pop();
    this.dir = pathParts.join('/');
    this.path = path;
    this.drawElements = drawElements;
  }

  async parse() {
    const content = await (await fetch(this.path)).text();
    /**@type{FacetGroup[]}*/const facetGroups = [];
    /**@type{FacetGroup}*/let currentGroup;
    /**@type{[number, number, number][]}*/let rawVertices = [];
    /**@type{[number, number, number][]}*/let rawNormals = [];
    /**@type{[number, number][]}*/let texCoords = [];
    /**@type{{normSum: [number, number, number], vNum: number}[]}*/let calcNormals = [];
    let /**@type{Object.<string, Material>}*/currentMtlFile;
    let /**@type{Material}*/currentMtl;
    let mtlPath;

    for (const line of content.split(/\n/)) {
      if (line.startsWith('mtllib')) {
        mtlPath = line.split(/\s+/)[1];
        if (!mtlFiles[mtlPath]) {
          mtlFiles[mtlPath] = await new MtlFile(this.dir + '/' + mtlPath).parse();
        }
        currentMtlFile = mtlFiles[mtlPath];
      }
      if (line.startsWith('g')) {
        const name = line.split(/\s+/)[1];
        currentGroup = new FacetGroup(name);
        facetGroups.push(currentGroup);
        // currentMtl = null;
      }
      if (currentMtlFile && line.startsWith('usemtl')) {
        const mtlName = line.split(/\s+/)[1];
        currentMtl = currentMtlFile[mtlName];
        if (currentGroup.vertices.length) {
          // make sure we start a new group on material changes
          currentGroup = new FacetGroup(currentGroup.name);
          facetGroups.push(currentGroup);
        }
      }
      if (!currentMtl && line.startsWith('c')) {
        // my own addition; allow color assignments directly from obj file
        // if there's no mtl file available. only supports one color per group
        if (!currentGroup) {
          currentGroup = new FacetGroup;
          facetGroups.push(currentGroup);
        }
        const rgb = line.split(/\s+/).slice(1).map(Number);
        if (Array.isArray(rgb) && rgb.length == 3) {
          currentGroup.color = glMatrix.vec3.fromValues(...rgb);
        }
      }
      if (line.startsWith('v ')) {
        if (!currentGroup) {
          currentGroup = new FacetGroup;
          facetGroups.push(currentGroup);
        }
        const xyz = line.split(/\s+/).slice(1).map(Number);
        rawVertices.push(xyz);
      }
      if (line.startsWith('vn ')) {
        const xyz = line.split(/\s+/).slice(1).map(Number);
        rawNormals.push(xyz);
      }
      if (line.startsWith('vt ')) {
        const xy = line.split(/\s+/).slice(1).map(Number);
        texCoords.push(xy);
      }
      if (line.startsWith('f ')) {
        if (!currentGroup) {
          currentGroup = new FacetGroup;
          facetGroups.push(currentGroup);
        }
        currentGroup.material = currentMtl;
        const indexes = line.trim().split(/\s+/).slice(1).map(index => {
          const [vertex, texture, normal] = index.split('/');
          return { vertex, texture, normal };
        });
        if (indexes.length == 0) {
          continue;
        }
        const normsProvided = !!indexes[0].normal;
        let sfcNorm;
        if (!normsProvided) {
          // fire an event so the main page can show some notification; this will likely take a while
          // first calculate the surface normal, vertex normal is the average of all adjacent surface norms
          const a = glMatrix.vec3.fromValues(...rawVertices[indexes[0].vertex - 1]);
          const b = glMatrix.vec3.fromValues(...rawVertices[indexes[1].vertex - 1]);
          const c = glMatrix.vec3.fromValues(...rawVertices[indexes[2].vertex - 1]);
          const ac = glMatrix.vec3.sub(glMatrix.vec3.create(), a, c);
          const bc = glMatrix.vec3.sub(glMatrix.vec3.create(), b, c);
          sfcNorm = glMatrix.vec3.cross(glMatrix.vec3.create(), ac, bc);
        }
        // if > 3 vertices it will be dissected into triangles at this stage
        while (indexes.length >= 3) {
          const triangle = indexes.slice(0, 3);
          currentGroup.faceDefs.push(triangle);
          triangle.forEach((parsedIndexes, positionIndex) => { // f indexes start at 1
            currentGroup.vertices.push(...rawVertices[parsedIndexes.vertex - 1]);
            if (normsProvided) {
              currentGroup.normals.push(...rawNormals[parsedIndexes.normal - 1]);
            } else {
              // use the same object among common vertices so that additions propagate to all.
              // find() is the bottleneck, as most of the time it will have to search the whole
              // list (which can easily get into the tens [maybe hundreds] of thousands) and not
              // find a match, but avoiding it seems very much non-trivial. It only has to run
              // once and then we can store the result back in the file
              // const existing = calcNormals.find(o => o.vNum == parsedIndexes.vertex);
              // const calcNormObj = existing || { normSum: [0, 0, 0], vNum: parsedIndexes.vertex };
              // calcNormals.push(calcNormObj);
              // glMatrix.vec3.add(calcNormObj.normSum, calcNormObj.normSum, sfcNorm);
              // currentGroup.faceDefs.at(-1).at(positionIndex).normal = calcNormals.length;
            }
            if (parsedIndexes.texture) {
              currentGroup.texCoords.push(...texCoords[parsedIndexes.texture - 1]);
            } else {
              currentGroup.texCoords.push(0, 0);
            }
          });
          indexes.splice(1, 1);
        }
      }
    }

    if (calcNormals.length) {
      // fire a ready event, allow to create/save a file object with the new data
      const blobParts = [];
      const encoder = new TextEncoder;
      if (currentMtlFile) {
        blobParts.push(encoder.encode(`mtllib ${mtlPath}\n\n`));
      }
      rawVertices.forEach(v => {
        blobParts.push(encoder.encode(`v ${v.join(' ')}\n`));
      });
      texCoords.forEach(vt => {
        blobParts.push(encoder.encode(`vt ${vt.join(' ')}\n`));
      });
      let offset = 0;
      for (let i = 0; i < facetGroups.length; i++) {
        for (let j = 0; j < facetGroups[i].vertices.length; j += 3) {
          const normObj = calcNormals[offset + j / 3];
          if (!normObj.normalized) {
            glMatrix.vec3.normalize(normObj.normSum, normObj.normSum);
            normObj.normalized = true;
          }
          facetGroups[i].normals[j] = normObj.normSum[0];
          facetGroups[i].normals[j + 1] = normObj.normSum[1];
          facetGroups[i].normals[j + 2] = normObj.normSum[2];
          blobParts.push(encoder.encode(`vn ${normObj.normSum.join(' ')}\n`));
        }
        offset += facetGroups[i].vertices.length / 3;
      }
      for (const group of facetGroups) {
        blobParts.push(encoder.encode(`g ${group.name}\n`));
        if (group.color) {
          blobParts.push(encoder.encode(`c ${group.color.join(' ')}\n`));
        }
        if (group.material) {
          blobParts.push(encoder.encode(`usemtl ${group.material.name}\n`));
        }
        for (const f of group.faceDefs) {
          blobParts.push(encoder.encode('f '));
          for (let i = 0; i < f.length; i++) {
            blobParts.push(encoder.encode(f[i].vertex));
            if (f[i].texture || f[i].normal) {
              blobParts.push(encoder.encode(`/${f[i].texture || ''}`));
              if (f[i].normal) {
                blobParts.push(encoder.encode(`/${f[i].normal}`));
              }
            }
            if (i < f.length) {
              blobParts.push(encoder.encode(' '));
            }
          }
          blobParts.push(encoder.encode('\n'));
        }
      }
      const blob = new Blob(blobParts, {type: 'text/plain'});
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = this.name.replace('.obj', '_calc_normals.obj');
      a.click();
      URL.revokeObjectURL(url);
    }

    if (this.drawElements) {
      return class extends ElementGeometry {
        define() {
          this.vertices = rawVertices.flat();
          this.norms = rawNormals.flat();
          let offset = 0;
          this.groups = facetGroups.map(group => {
            const start = offset;
            const length = group.faceDefs.flat().length;
            const material = group.material;
            offset += length;
            return { start, length, material };
          });
          this.vIndexes = facetGroups.flatMap(g => g.faceDefs.flatMap(def => def.map(indexes => parseInt(indexes.vertex, 10) - 1)));
          this.nIndexes = facetGroups.flatMap(g => g.faceDefs.flatMap(def => def.map(indexes => parseInt(indexes.normal, 10))));
          this.tIndexes = facetGroups.flatMap(g => g.faceDefs.flatMap(def => def.map(indexes => parseInt(indexes.texture, 10))));
        }
      }
    }

    return class extends ArrayGeometry {
      define() {
        this.groups = facetGroups.filter(g => g.vertices.length);
      }
    }
  }
}

/**
 * @typedef {{
 *   size: number,
 *   position: [number, number, number],
 *   color: [number, number, number],
 *   rotateX: number,
 *   rotateY: number,
 *   rotateZ: number,
 *   contrast: number,
 *   disableBackfaceCulling: boolean,
 * }} ModelOptions*/

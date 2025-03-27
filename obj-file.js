import { Geometry } from './projection/geometry.js';
import { Vec3 } from './vector.js';

export class ObjFile {

  constructor(/**@type{string}*/path) {
    this.path = path;
  }

  async parse() {
    const content = await (await fetch(this.path)).text();
    /**@type{Vec3[]}*/
    const vertices = [];
    /**@type{Vec3[][]}*/
    const facets = [];
    /**@type{Vec3[]}*/
    const vertexNormals = [];
    /**@type{Vec3[]}*/
    const facetNormals = [];
    /**@type{number[] | null}*/
    let color = null;
    for (const line of content.split(/\n/)) {
      if (line.startsWith('c')) {
        // my own addition; all the obj files i've seen use external .mtl
        // files for color/texture data, which would be nice to be able
        // to read but i haven't gotten there yet
        const rgb = line.split(' ').slice(1).map(Number);
        if (!Array.isArray(rgb)|| rgb.length != 3) {
          color = null;
        } else {
          color = rgb;
        }
      }
      if (line.startsWith('v ')) {
        const [x, y, z] = line.split(' ').slice(1).map(Number);
        vertices.push(new Vec3(x, y, z));
      }
      if (line.startsWith('vn ')) {
        const [x, y, z] = line.split(' ').slice(1).map(Number);
        vertexNormals.push(new Vec3(x, y, z));
      }
      if (line.startsWith('vt ')) {
        // TODO: texture coordinates
      }
      if (line.startsWith('f ')) {
        const indexes = line.split(' ').slice(1).map(index => {
          const [vertex, texture, normal] = index.split('/');
          return { vertex, texture, normal };
        });
        /**@type{Vec3[]}*/const facet = [];
        /**@type{Vec3[]}*/const vNormals = [];
        indexes.forEach(i => { // 1-indexed; is this always the case?
          facet.push(vertices[i.vertex - 1]);
          if (i.normal) {
            vNormals.push(vertexNormals[i.normal - 1].normalize());
          }
          if (i.texture) {
            // 
          }
        });
        if (color) {
          facet.color = new Vec3(...color);
        }
        facets.push(facet);
        if (vNormals.length) {
          facetNormals.push(vNormals);
        }
        // if (vNormals.length) {
        //   const surfaceNorm = vNormals.reduce((sum, n) => sum.add(n.normalize()).normalize(), new Vec3).normalize();
        //   surfaceNormals.push(surfaceNorm);
        // }
        // TODO: capture color & texture data
      }
    }

    return class extends Geometry {
      define() {
        this.facets = facets;
        this.normals = facetNormals.length ? facetNormals : null;
      }
    }
  }
}
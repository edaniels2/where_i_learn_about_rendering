import './glmatrix.js';
/**
 * @typedef {import('./mtl-file.js').Material} Material
 */

export class Geometry {
  constructor(options) {
    this.matrix = glMatrix.mat4.create();
    this.color = options?.color;
    this.define();
    if (this.groups.some(g => !g.normals.length)) {
      this.calculateNormals();
    }
  }

  calculateNormals() {
    // handling this in the file loader, probably won't ever need it here
    this.groups.forEach(g => {
      if (g.normals.length) {
        return;
      }
      for (let i = 0; i < g.vertices.length; i += 9) {
        const a = glMatrix.vec3.fromValues(...g.vertices.slice(i, i + 3));
        const b = glMatrix.vec3.fromValues(...g.vertices.slice(i + 3, i + 6));
        const c = glMatrix.vec3.fromValues(...g.vertices.slice(i + 6, i + 9));
        const ac = glMatrix.vec3.sub(glMatrix.vec3.create(), a, c);
        const bc = glMatrix.vec3.sub(glMatrix.vec3.create(), b, c);
        const sfcNorm = glMatrix.vec3.cross(glMatrix.vec3.create(), ac, bc);
        // push the surface norm 3 times to act as vertex norms,
        // it's not right but it's ok
        g.normals.push(...sfcNorm);
        g.normals.push(...sfcNorm);
        g.normals.push(...sfcNorm);
      }
    });
  }

  define() { }
}

export class FacetGroup {
  constructor(/**@type{string}*/name = '', /**@type{number[]}*/vertices = [], /**@type{number[]}*/normals = [], /**@type{number[]}*/color, /**@type{Material}*/material) { // maybe group attributes into an object?
    this.vertices = vertices;
    this.normals = normals;
    this.color = color;
    this.name = name;
    this.material = material;
    this.texCoords = [];
    /**@type{BufferInfo}*/this.bufferInfo = null;
    /**@type{{vertex: number, texture: number, normal: number}[][]}*/this.faceDefs = [];
  }
}

export class ElementGeometry extends Geometry {
  drawElements = true;
  /**@type{ElementGroup[]}*/groups = this.groups;
  /**@type{number[]}*/vertices = this.vertices;
  /**@type{number[]}*/norms = this.norms;
  /**@type{number[]}*/vIndexes = this.vIndexes;
  /**@type{number[]}*/nIndexes = this.nIndexes;
  /**@type{number[]}*/tIndexes = this.tIndexes;

  constructor(options) {
    super(options);
    if (options?.position) {
      glMatrix.mat4.translate(this.matrix, this.matrix, options.position);
    }
    if (options?.scale) {
      this.vertices = this.vertices.map(v => v * options.scale);
    }
    if (options?.rotateX) {
      for (let i = 0; i < this.vertices.length; i += 3) {
        const v = this.vertices.slice(i, i + 3);
        glMatrix.vec3.rotateX(v, v, [0, 0, 0], options.rotateX);
        this.vertices[i] = v[0];
        this.vertices[i + 1] = v[1];
        this.vertices[i + 2] = v[2];
        const n = this.norms.slice(i, i + 3);
        if (n) {
          glMatrix.vec3.rotateX(n, n, [0, 0, 0], options.rotateX);
          this.norms[i] = n[0];
          this.norms[i + 1] = n[1];
          this.norms[i + 2] = n[2];
        }
      }
    }
    if (options?.rotateY) {
      for (let i = 0; i < this.vertices.length; i += 3) {
        const v = this.vertices.slice(i, i + 3);
        glMatrix.vec3.rotateY(v, v, [0, 0, 0], options.rotateY);
        this.vertices[i] = v[0];
        this.vertices[i + 1] = v[1];
        this.vertices[i + 2] = v[2];
        const n = this.norms.slice(i, i + 3);
        if (n) {
          glMatrix.vec3.rotateY(n, n, [0, 0, 0], options.rotateY);
          this.norms[i] = n[0];
          this.norms[i + 1] = n[1];
          this.norms[i + 2] = n[2];
        }
      }
    }
    if (options?.rotateZ) {
      for (let i = 0; i < this.vertices.length; i += 3) {
        const v = this.vertices.slice(i, i + 3);
        glMatrix.vec3.rotateZ(v, v, [0, 0, 0], options.rotateZ);
        this.vertices[i] = v[0];
        this.vertices[i + 1] = v[1];
        this.vertices[i + 2] = v[2];
        const n = this.norms.slice(i, i + 3);
        if (n) {
          glMatrix.vec3.rotateZ(n, n, [0, 0, 0], options.rotateZ);
          this.norms[i] = n[0];
          this.norms[i + 1] = n[1];
          this.norms[i + 2] = n[2];
        }
      }
    }
    if (options?.contrast) {
      for (let i = 0; i < this.norms.length; i += 3) {
        const n = this.norms.slice(i, i + 3);
        glMatrix.vec3.scale(n, n, options.contrast);
        this.norms[i] = n[0];
        this.norms[i + 1] = n[1];
        this.norms[i + 2] = n[2];
      }
    }
  }
}

export class ArrayGeometry extends Geometry {
  /**@type{FacetGroup[]}*/groups = this.groups;

  constructor(options) {
    super(options);
    if (options?.position) {
      glMatrix.mat4.translate(this.matrix, this.matrix, options.position);
    }
    if (options?.scale) {
      // glMatrix.mat4.scale(this.matrix, this.matrix, [options.scale, options.scale, options.scale]);
      this.groups.forEach(g => {
        g.vertices = g.vertices.map(v => v * options.scale);
      });
    }
    if (options?.rotateX) {
      this.groups.forEach(g => {
        for (let i = 0; i < g.vertices.length; i += 3) {
          const v = g.vertices.slice(i, i + 3);
          glMatrix.vec3.rotateX(v, v, [0, 0, 0], options.rotateX);
          g.vertices[i] = v[0];
          g.vertices[i + 1] = v[1];
          g.vertices[i + 2] = v[2];
          const n = g.normals.slice(i, i + 3);
          if (n) {
            glMatrix.vec3.rotateX(n, n, [0, 0, 0], options.rotateX);
            g.normals[i] = n[0];
            g.normals[i + 1] = n[1];
            g.normals[i + 2] = n[2];
          }
        }
      });
    }
    if (options?.rotateY) {
      this.groups.forEach(g => {
        for (let i = 0; i < g.vertices.length; i += 3) {
          const v = g.vertices.slice(i, i + 3);
          glMatrix.vec3.rotateY(v, v, [0, 0, 0], options.rotateY);
          g.vertices[i] = v[0];
          g.vertices[i + 1] = v[1];
          g.vertices[i + 2] = v[2];
          const n = g.normals.slice(i, i + 3);
          if (n) {
            glMatrix.vec3.rotateY(n, n, [0, 0, 0], options.rotateY);
            g.normals[i] = n[0];
            g.normals[i + 1] = n[1];
            g.normals[i + 2] = n[2];
          }
        }
      });
    }
    if (options?.rotateZ) {
      this.groups.forEach(g => {
        for (let i = 0; i < g.vertices.length; i += 3) {
          const v = g.vertices.slice(i, i + 3);
          glMatrix.vec3.rotateZ(v, v, [0, 0, 0], options.rotateZ);
          g.vertices[i] = v[0];
          g.vertices[i + 1] = v[1];
          g.vertices[i + 2] = v[2];
          const n = g.normals.slice(i, i + 3);
          if (n) {
            glMatrix.vec3.rotateZ(n, n, [0, 0, 0], options.rotateZ);
            g.normals[i] = n[0];
            g.normals[i + 1] = n[1];
            g.normals[i + 2] = n[2];
          }
        }
      });
    }
    if (options?.contrast) {
      this.groups.forEach(g => {
        for (let i = 0; i < g.normals.length; i += 3) {
          const n = g.normals.slice(i, i + 3);
          glMatrix.vec3.scale(n, n, options.contrast);
          g.normals[i] = n[0];
          g.normals[i + 1] = n[1];
          g.normals[i + 2] = n[2];
        }
      })
    }
  }
}

/**
 * @typedef {{
 *  start: number,
 *  length: number,
 *  material: Material,
 * }} ElementGroup
 */

/**
 * @typedef {{
    numElements: number,
    indices: WebGLBuffer,
    attribs: Object.<string, {
      buffer: WebGLBuffer,
      numComponents: number,
    }>
  }} BufferInfo
 */

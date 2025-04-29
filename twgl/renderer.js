import { ArrayGeometry as Geometry } from '../webgl/geometry.js'; // relocate? maybe need a new one with some tweaks
import { DefaultControls } from './default-controls.js';
import * as twgl from './twgl_lib/twgl-full.module.js';

export class Renderer {
  constructor(/**@type{Scene}*/scene) {
    const canvas = document.querySelector('canvas');
    /**@type{WebGL2RenderingContext}*/this.ctx = canvas.getContext('webgl2');
    /**@type{Object.<string, ShaderInfo>}*/this.shaders = {};
    /**@type{ShaderInfo}*/this.currentShader = null;
    /**@type{(Geometry|Promise<Geometry>)[]}*/this.modelSources = scene.models;
    /**@type{Geometry[]}*/this.models = null;
    /**@type{Lighting}*/this.lighting = {
      a: scene.options?.lighting?.a ?? 0.5,
      d: { // refactor the directional light definition a bit
        dir: scene.options?.lighting?.d ? twgl.v3.normalize(scene.options.lighting.d) : [0, -1, 0],
        mag: scene.options?.lighting?.di ?? (scene.options?.lighting?.d ? twgl.v3.length(scene.options.lighting.d) : 1),
      },
      s: scene.options?.lighting?.s,
    };
    this.options = scene.options;
    twgl.resizeCanvasToDisplaySize(canvas);
    this.ctx.viewport(0, 0, canvas.width, canvas.height);
    this.makePerspectiveMatrix();
    this.viewpoint = twgl.m4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
    this.matWorld = twgl.m4.inverse(this.viewpoint);
    this.matRotation = twgl.m4.setTranslation(this.matWorld, [0, 0, 0]);
    this.controls = new DefaultControls(this.viewpoint, scene.options?.unlockHeight, scene.options?.unlockUp);
    this.ctx.enable(this.ctx.DEPTH_TEST);
    // this.ctx.clearColor( // doesn't work, presumably twgl is either overwriting it or not clearing the color buffer?
    //   this.options.bgColor[0] || 1.0,
    //   this.options.bgColor[1] || 1.0,
    //   this.options.bgColor[2] || 1.0,
    //   this.options.bgColor[3] || 1.0,
    // );

    // temp; put some ui controls in at some point
    window.lighting = this.lighting
  }

  async start() {
    await Promise.all([
      this.loadModels(),
      this.useProgram('default'),
    ]);
    requestAnimationFrame(t => this.render(t));
  }

  render(time) {
    if (twgl.resizeCanvasToDisplaySize(this.ctx.canvas)) {
      this.makePerspectiveMatrix();
      this.ctx.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    const changed = this.updateMatrices(time);
    if (!changed) {
      return requestAnimationFrame(t => this.render(t));
    }

    // probably move this to its own function that can accept & set a shader program before drawing
    twgl.setUniforms(this.currentShader, {
      uMatP: this.matP,
      uMatR: this.matRotation,
      uLa: this.lighting.a,
      uLdd: twgl.m4.transformDirection(this.matRotation, this.lighting.d.dir),
      uLdm: this.lighting.d.mag,
      uLp0: twgl.m4.transformPoint(this.matWorld, this.lighting.s[0].slice(0, 3)),
      uLp0b: this.lighting.s[0][3],
      uLp0color: this.getPointLightColor(0),
      uLp1: twgl.m4.transformPoint(this.matWorld, this.lighting.s[1].slice(0, 3)),
      uLp1b: this.lighting.s[1][3],
      uLp1color: this.getPointLightColor(1),
      uPointLightDecay: 1.5708, // pi / 2
    });
    for (const model of this.models) {
      twgl.setUniforms(this.currentShader, {
        uMatMV: twgl.m4.multiply(this.matWorld, model.matrix),
      });
      for (const group of model.groups) {
        const noMtlColor = group.color || model.color || [0.8, 0.8, 0.8];
        twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
        twgl.setUniforms(this.currentShader, {
          uKa: group.material?.Ka || noMtlColor,
          uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
          uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
          uNs: group.material?.Ns || 0,
        });
        // there's probably a twgl function for textures
        this.ctx.activeTexture(this.ctx.TEXTURE0);
        this.ctx.bindTexture(this.ctx.TEXTURE_2D, group.texture || this.whiteTexture);
        twgl.drawBufferInfo(this.ctx, group.bufferInfo);
      }
    }

    requestAnimationFrame(t => this.render(t));
  }

  updateMatrices(t) {
    // t is ms since last frame (roughly 8 as long as nothing crazy is happening)
    let changed = this.controls.updateTime(t);
    if (changed) {
      twgl.m4.copy(this.controls.matrix, this.viewpoint);
      twgl.m4.inverse(this.viewpoint, this.matWorld);
      twgl.m4.copy(this.matWorld, this.matRotation);
      twgl.m4.setTranslation(this.matRotation, [0, 0, 0], this.matRotation)
    }
    changed ||= this.drawNext;
    this.drawNext = false;
    return changed;
  }

  async useProgram(/**@type{string}*/name) {
    if (this.currentShader?.name == name) {
      return Promise.resolve();
    }
    await this.resolveProgram(name);
    this.currentShader = this.shaders[name];
    this.ctx.useProgram(this.currentShader.program);
  }

  async resolveProgram(/**@type{string}*/name) {
    if (this.shaders[name]) {
      return Promise.resolve();
    }
    const vs = await (await fetch(`./shaders/${name}/vs.gl`)).text();
    const fs = await (await fetch(`./shaders/${name}/fs.gl`)).text();
    this.shaders[name] = await twgl.createProgramInfoAsync(this.ctx, [vs, fs]);
    this.shaders[name].name = name;
  }

  async loadModels() {
    if (!this.modelSources) {
      throw new Error('Nothing to render');
    }
    const promises = this.modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
    this.models = await Promise.all(promises);
    for (const model of this.models) {
      for (const group of model.groups) {
        group.bufferInfo = twgl.createBufferInfoFromArrays(this.ctx, {
          aVertex: group.vertices,
          aNormal: group.normals,
          aTexCoord: group.texCoords,
        });
        // maybe handle cases with both map_Ka and map_Kd
        const src = group.material?.map_Kd || group.material?.map_Ka;
        if (src) {
          group.texture = twgl.createTexture(this.ctx, { src },
            () => this.drawNext = true);//this.loadMtlTexture(group.material);
        }
      }
    }
    // create a 1x1 white texture to use when there is no material texture.
    const src = new Uint8Array([255, 255, 255, 255]);
    this.whiteTexture = twgl.createTexture(this.ctx, { src });
  }

  makePerspectiveMatrix() {
    const aspect = this.ctx.canvas.width / this.ctx.canvas.height;
    const fovW = this.options?.fov || Math.PI / 3;
    const fovH = fovW / aspect;
    const near = this.options?.nearClip || 0.1;
    const far = this.options?.farClip || 100;
    this.matP = twgl.m4.perspective(fovH, aspect, near, far, this.matP);
  }

  getPointLightColor(i) {
    const light = this.lighting.s[i];
    return [light[4] || 1, light[5] || 1, light[6] || 1];
  }
}

/**
 * @typedef {{
 *  name: string,
 *  program: WebGLProgram,
 *  attribLocations: {[string]: number},
 *  attribSetters: {[string]: function},
 *  uniformBlockSpec: {
 *    blockSpecs: object,
 *    uniformData: {
 *      name: string,
 *      type: number,
 *      size: number,
 *      blockNdx: number,
 *      offset: number,
 *    }[]
 *  },
 *  uniformLocations: {[string]: WebGLUniformLocation},
 *  uniformSetters: {[string]: function}
 * }} ShaderInfo
 */

/**
 * @typedef {{
 *  a: number,
 *  d: {
 *    dir: [number, number, number],
 *    mag: number,
 *  },
 *  s: number[][],
 * }} Lighting
 */

/**@typedef {import('../webgl/mtl-file.js').Material} Material*/
/**@typedef {import('./scenes.js').Scene} Scene*/

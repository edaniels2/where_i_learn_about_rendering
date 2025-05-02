import { ArrayGeometry as Geometry } from '../webgl/geometry.js'; // relocate? maybe need a new one with some tweaks
import { DefaultControls } from './default-controls.js';
import * as twgl from './twgl_lib/twgl-full.module.js';

export class Renderer {
  /**
   * Initialize parameters to render the given scene
   */
  constructor(/**@type{Scene}*/scene) {
    const canvas = document.querySelector('canvas');
    twgl.resizeCanvasToDisplaySize(canvas);
    const resolution = Math.max(canvas.width, canvas.height);
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
      diffuseAsAmbient: scene.options?.lighting?.diffuseAsAmbient,
      s: scene.options?.lighting?.s || [],
      outsideShadowMapCoef: scene.options?.lighting?.outsideShadowMapCoef ?? 1.0,
      shadowCoef: scene.options?.lighting?.shadowCoef ?? 0.85,
      shadowBias: (scene.options?.lighting?.shadowBias ?? 1.2) / resolution,
    };
    this.options = scene.options;
    this.ctx.viewport(0, 0, canvas.width, canvas.height);
    this.matP = this.#makePerspectiveMatrix();
    this.viewpoint = twgl.m4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
    this.matWorld = twgl.m4.inverse(this.viewpoint);
    this.matRotation = twgl.m4.setTranslation(this.matWorld, [0, 0, 0]);
    this.controls = new DefaultControls(this.viewpoint, scene.options?.unlockHeight, scene.options?.unlockUp);
    this.ctx.enable(this.ctx.DEPTH_TEST);
    this.#initShadowMaps();
    this.ctx.clearColor(
      this.options?.bgColor?.[0] || 1.0,
      this.options?.bgColor?.[1] || 1.0,
      this.options?.bgColor?.[2] || 1.0,
      this.options?.bgColor?.[3] || 1.0,
    );

    // temp; put some ui controls in at some point
    window.lighting = this.lighting
  }

  /**
   * Render the scene
   */
  async start() {
    await Promise.all([
      this.#loadModels(),
      this.#resolveProgram('default'),
      this.#resolveProgram('zmap'),
    ]);
    this.#drawShadowMaps();
    requestAnimationFrame(t => this.#render(t));
  }

  #render(time) {
    if (twgl.resizeCanvasToDisplaySize(this.ctx.canvas)) {
      this.#makePerspectiveMatrix();
      this.ctx.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    const changed = this.#updateMatrices(time);
    if (!changed) {
      return requestAnimationFrame(t => this.#render(t));
    }
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);

    // // probably move this to its own function that can accept & set a shader program before drawing
    this.#useProgram('default');
    const uniforms = {
      uMatP: this.matP,
      uMatR: this.matRotation,
      uLa: this.lighting.a,
      uLdd: twgl.m4.transformDirection(this.matRotation, this.lighting.d.dir),
      uLdm: this.lighting.d.mag,
      uOutsideShadowMapCoef: this.lighting.outsideShadowMapCoef,
      uShadowCoef: this.lighting.shadowCoef,
      uShadowBias: this.lighting.shadowBias,
    };
    if (this.lighting.s[0]) {
      Object.assign(uniforms, {
        uLp0: twgl.m4.transformPoint(this.matWorld, this.lighting.s[0].position),
        uLp0b: this.lighting.s[0].brightness,
        uLp0color: this.lighting.s[0].color ?? [1, 1, 1],
        uMatST0: this.lighting.s[0].matST,
        uPointLightDecay: Math.PI * 4,// probably make it configurable
        uShadowMap0: this.lighting.s[0].shadowBufferInfo.attachments[0],
      });
    }
    if (this.lighting.s[1]) {
      Object.assign(uniforms, {
        uLp1: twgl.m4.transformPoint(this.matWorld, this.lighting.s[1].position),
        uLp1b: this.lighting.s[1].brightness,
        uLp1color: this.lighting.s[1].color ?? [1, 1, 1],
        uMatST1: this.lighting.s[1].matST,
        uShadowMap1: this.lighting.s[1].shadowBufferInfo.attachments[0],
      });
    }
    twgl.setUniformsAndBindTextures(this.currentShader, uniforms);
    for (const model of this.models) {
      twgl.setUniforms(this.currentShader, {
        uMatMV: twgl.m4.multiply(this.matWorld, model.matrix),
      });
      for (const group of model.groups) {
        const noMtlColor = group.color || model.color || [0.8, 0.8, 0.8];
        twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
        twgl.setUniformsAndBindTextures(this.currentShader, {
          uKa: this.#getAmbientColor(group.material) || noMtlColor,
          uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
          uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
          uNs: group.material?.Ns || 0,
          uOpacity: group.material?.d || 1.0,
          uTexture: group.texture || this.whiteTexture,
        });
        twgl.drawBufferInfo(this.ctx, group.bufferInfo);
      }
    }

    requestAnimationFrame(t => this.#render(t));
  }

  #updateMatrices(t) {
    // t is ms since last frame (roughly 8 as long as nothing crazy is happening)
    let changed = this.controls.updateTime(t);
    if (changed) {
      twgl.m4.copy(this.controls.matrix, this.viewpoint);
      twgl.m4.inverse(this.viewpoint, this.matWorld);
      twgl.m4.copy(this.matWorld, this.matRotation);
      twgl.m4.setTranslation(this.matRotation, [0, 0, 0], this.matRotation)

      for (const light of this.lighting.s) {
        twgl.m4.translate(twgl.m4.identity(), [0.5, 0.5, 0.5], light.matST);
        twgl.m4.scale(light.matST, [0.5, 0.5, 0.5], light.matST);
        twgl.m4.multiply(light.matST, light.matP, light.matST);
        twgl.m4.multiply(light.matST, light.matWorld, light.matST);
        twgl.m4.multiply(light.matST, twgl.m4.inverse(this.matWorld), light.matST);
      }
    }
    changed ||= this.drawNext;
    this.drawNext = false;
    return changed;
  }

  #useProgram(/**@type{string}*/name) {
    if (this.currentShader?.name == name) {
      return true;
    }
    if (!this.shaders[name]) {
      throw new Error(`Shader [${name}] is not loaded.`);
    }
    this.currentShader = this.shaders[name];
    this.ctx.useProgram(this.currentShader.program);
  }

  async #resolveProgram(/**@type{string}*/name) {
    if (this.shaders[name]) {
      return Promise.resolve();
    }
    const vs = await (await fetch(`./shaders/${name}/vs.gl`)).text();
    const fs = await (await fetch(`./shaders/${name}/fs.gl`)).text();
    this.shaders[name] = await twgl.createProgramInfoAsync(this.ctx, [vs, fs], {
      attribLocations: {
        aVertex: 0,
        aNormal: 1,
        aTexCoord: 2,
      },
    });
    this.shaders[name].name = name;
  }

  async #loadModels() {
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
          group.texture = twgl.createTexture(this.ctx,
            { src, flipY: true }, () => this.drawNext = true);
        }
      }
    }
    // create a 1x1 white texture to use when there is no material texture.
    const src = new Uint8Array([255, 255, 255, 255]);
    this.whiteTexture = twgl.createTexture(this.ctx, { src });
  }

  #makePerspectiveMatrix() {
    const aspect = this.ctx.canvas.width / this.ctx.canvas.height;
    const fovW = this.options?.fov || Math.PI / 3;
    const fovH = fovW / aspect;
    const near = this.options?.nearClip || 0.1;
    const far = this.options?.farClip || 100;
    return twgl.m4.perspective(fovH, aspect, near, far, this.matP);
  }

  #initShadowMaps() {
    const attachments = [{
      attachmentPoint: this.ctx.DEPTH_ATTACHMENT,
      format: this.ctx.DEPTH_COMPONENT,
      internalFormat: this.ctx.DEPTH_COMPONENT32F,
      minMag: this.ctx.NEAREST,
    }];
    for (const light of this.lighting.s) {
      const resolution = light.resolution ?? 2048; // support different x/y dimensions?
      const fov = light.fov ?? Math.PI / 1.2;
      const clipNear = light.clipNear ?? 0.1;
      const clipFar = light.clipFar ?? 25;
      const lookAt = light.lookAt ?? (p => {p[1] *= -1; return p;})(light.position.slice());
      const upVec = light.upVec ?? [0, 0, 1];
      light.shadowBufferInfo = twgl.createFramebufferInfo(this.ctx, attachments, resolution, resolution);
      light.matP = twgl.m4.perspective(fov, 1, clipNear, clipFar);
      light.matMV = twgl.m4.create();
      light.matWorld = twgl.m4.inverse(twgl.m4.lookAt(light.position, lookAt, upVec));
      light.matST = twgl.m4.identity();
    }
  }

  #drawShadowMaps() {
    this.#useProgram('zmap');
    for (const light of this.lighting.s) {
      twgl.bindFramebufferInfo(this.ctx, light.shadowBufferInfo);
      twgl.setUniforms(this.currentShader, {
        uMatP: light.matP,
      });
      for (const model of this.models) {
        twgl.setUniforms(this.currentShader, {
          uMatMV: twgl.m4.multiply(light.matWorld, model.matrix, light.matMV),
        });
        for (const group of model.groups) {
          twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
          twgl.drawBufferInfo(this.ctx, group.bufferInfo);
        }
      }
    }
    // TODO one for the directional light
    twgl.bindFramebufferInfo(this.ctx, null);
  }

  #getAmbientColor(/**@type{Material}*/material) {
    if (!material) {
      return null;
    }
    if (this.lighting.diffuseAsAmbient) {
      const dRatio = this.lighting.diffuseAsAmbient;
      const aRatio = 1 - dRatio;
      return twgl.v3.add(twgl.v3.mulScalar(material.Ka, aRatio), twgl.v3.mulScalar(material.Kd, dRatio));
    }
    return material.Ka;
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

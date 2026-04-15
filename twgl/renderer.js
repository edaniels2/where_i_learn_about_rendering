import { ArrayGeometry as Geometry } from '../webgl/geometry.js'; // relocate? maybe need a new one with some tweaks
import { DefaultControls } from './default-controls.js';
import { mapLightsToType } from './lights.js';
import * as twgl from './twgl_lib/twgl-full.module.js';

export class RendererBase {
  /**
   * Initialize parameters to render the given scene
   */
  constructor(/**@type{Scene}*/scene) {
    const canvas = document.querySelector('canvas');
    // const ctxAttributes = this.constructor.name === 'RaytraceRenderer' ? {
    //   preserveDrawingBuffer: true,
    // } : undefined;
    twgl.resizeCanvasToDisplaySize(canvas);
    /**@type{WebGL2RenderingContext}*/this.ctx = canvas.getContext('webgl2'/* , ctxAttributes */);
    /**@type{Object.<string, ShaderInfo>}*/this.shaders = {};
    /**@type{ShaderInfo}*/this.currentShader = null;
    /**@type{(Geometry|Promise<Geometry>)[]}*/this.modelSources = scene.models;
    /**@type{Geometry[]}*/this.models = null;
    this.antiWashout = scene.options?.antiWashout || 0.001;
    this.ambient = scene.ambient || 0.01;
    this.options = scene.options;
    this.ctx.viewport(0, 0, canvas.width, canvas.height);
    this.matP = this.makePerspectiveMatrix();
    this.viewpoint = twgl.m4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
    this.matWorld = twgl.m4.inverse(this.viewpoint);
    this.matRotation = twgl.m4.setTranslation(this.matWorld, [0, 0, 0]);
    this.controls = new DefaultControls(this.viewpoint, scene.options?.unlockHeight, scene.options?.unlockUp);
    this.ctx.enable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(
      this.options?.bgColor?.[0] ?? 1.0,
      this.options?.bgColor?.[1] ?? 1.0,
      this.options?.bgColor?.[2] ?? 1.0,
      this.options?.bgColor?.[3] ?? 1.0,
    );
  }

  makePerspectiveMatrix() {
    const aspect = this.ctx.canvas.width / this.ctx.canvas.height;
    const fovW = this.options?.fov || Math.PI / 3;
    const fovH = fovW / aspect;
    const near = this.options?.nearClip || 0.1;
    const far = this.options?.farClip || 100;
    return twgl.m4.perspective(fovH, aspect, near, far, this.matP);
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
          group.texture = twgl.createTexture(this.ctx,
            { src, flipY: true }, () => this.drawNext = true);
        }
      }
    }
    // create a 1x1 white texture to use when there is no material texture.
    const src = new Uint8Array([255, 255, 255, 255]);
    this.whiteTexture = twgl.createTexture(this.ctx, { src });
  }

  async resolveProgram(/**@type{string}*/name) {
    if (this.shaders[name]) {
      return Promise.resolve();
    }
    const vs = await (await fetch(`/twgl/shaders/${name}/vs.gl`)).text();
    const fs = await (await fetch(`/twgl/shaders/${name}/fs.gl`)).text().then(val => {
      // inline replace compile-time constants that depend on js definitions
      return val
        .replace('<% numLights %>', this.areaLights?.length ?? 0)
        .replace('<% numSpheres %>', this.models?.length ?? 0)
        .replace('<% numVertices %>', this.vertices?.length ?? 0);
    });
    this.shaders[name] = await twgl.createProgramInfoAsync(this.ctx, [vs, fs], {
      attribLocations: {
        aVertex: 0,
        aNormal: 1,
        aTexCoord: 2,
      },
    });
    this.shaders[name].name = name;
  }

  useProgram(/**@type{string}*/name) {
    if (this.currentShader?.name == name) {
      return true;
    }
    if (!this.shaders[name]) {
      throw new Error(`Shader [${name}] is not loaded.`);
    }
    this.currentShader = this.shaders[name];
    this.ctx.useProgram(this.currentShader.program);
    const e = this.ctx.getError();
    if (e) {
      throw new Error(e);
    }
  }

  updateMatrices(t) {
    // t is ms since last frame (roughly 8 as long as nothing crazy is happening)
    let changed = this.controls.updateTime(t);
    if (changed) {
      twgl.m4.copy(this.controls.matrix, this.viewpoint);
      twgl.m4.inverse(this.viewpoint, this.matWorld);
      twgl.m4.copy(this.matWorld, this.matRotation);
      twgl.m4.setTranslation(this.matRotation, [0, 0, 0], this.matRotation)

      for (const light of this.lighting.s) {
        for (let i = 0; i < light.shadowBuffers.length; i++) {
          twgl.m4.translate(twgl.m4.identity(), [0.5, 0.5, 0.5], light.translationMatrices[i]);
          twgl.m4.scale(light.translationMatrices[i], [0.5, 0.5, 0.5], light.translationMatrices[i]);
          twgl.m4.multiply(light.translationMatrices[i], light.matP, light.translationMatrices[i]);
          twgl.m4.multiply(light.translationMatrices[i], light.worldMatrices[i], light.translationMatrices[i]);
          twgl.m4.multiply(light.translationMatrices[i], twgl.m4.inverse(this.matWorld), light.translationMatrices[i]);
        }
      }
    }
    changed ||= this.drawNext;
    this.drawNext = false;
    return changed;
  }

  getAmbientColor(/**@type{Material}*/material) {
    if (!material) {
      return null;
    }
    if (this.lighting?.diffuseAsAmbient) {
      const dRatio = this.lighting.diffuseAsAmbient;
      const aRatio = 1 - dRatio;
      return twgl.v3.add(twgl.v3.mulScalar(material.Ka, aRatio), twgl.v3.mulScalar(material.Kd, dRatio));
    }
    return material.Ka;
  }
}

export class ShadowMapRenderer extends RendererBase {
  constructor(/**@type{Scene}*/scene) {
    super(scene);
    /**@type{Lighting}*/this.lighting = {
      a: scene.options?.lighting?.a ?? 0.5,
      d: { // refactor the directional light definition a bit
        dir: scene.options?.lighting?.d ? twgl.v3.normalize(scene.options.lighting.d) : [0, -1, 0],
        mag: scene.options?.lighting?.di ?? (scene.options?.lighting?.d ? twgl.v3.length(scene.options.lighting.d) : 1),
      },
      diffuseAsAmbient: scene.options?.lighting?.diffuseAsAmbient,
      s: scene.options?.lighting?.s || [],
      shadowBias: (scene.options?.lighting?.shadowBias ?? 0.4) / 2048,
      omniDirectional: scene.options?.lighting?.omniDirectional || 0.0,
      antiWashout: scene.options?.lighting?.antiWashout || 1,
    };
    this.#initShadowMaps();
  }

  /**
   * Render the scene
   */
  async start() {
    await Promise.all([
      this.loadModels(),
      this.resolveProgram('zmap'),
      this.resolveProgram('default'),
    ]);
    this.#drawShadowMaps();
    requestAnimationFrame(t => this.#render(t));
  }

  #render(time) {
    if (twgl.resizeCanvasToDisplaySize(this.ctx.canvas)) {
      this.makePerspectiveMatrix();
      this.ctx.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    const changed = this.updateMatrices(time);
    if (!changed) {
      return requestAnimationFrame(t => this.#render(t));
    }
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);

    // // probably move this to its own function that can accept & set a shader program before drawing
    this.useProgram('default');
    const uniforms = {
      uMatP: this.matP,
      uMatR: this.matRotation,
      uAntiWashout: this.antiWashout, // effectively limits min distance to prevent color washout close to bright lights; not physically accurate
      uLdd: twgl.m4.transformDirection(this.matRotation, this.lighting.d.dir),
      uPointLightDecay: 1,// Math.PI * 4, // configurable?
      uAntiWashout: this.lighting.antiWashout, // effectively limits min distance to prevent color washout close to bright lights; not physically accurate
      uShadowBias: this.lighting.shadowBias, // bias decreases z-fighting for shadows at some distance from light source
      uOmniDirectional: this.lighting.omniDirectional, // this probably doesn't make any sense, it's ambient light but using the diffuse mtl color
    };
    twgl.setUniformsAndBindTextures(this.currentShader, uniforms);
    if (this.lighting.s[0]?.on) {
      twgl.setUniforms(this.currentShader, {
        uLp0: twgl.m4.transformPoint(this.matWorld, this.lighting.s[0].position),
        uLp0b: this.lighting.s[0].brightness,// * (model.contrast ?? 1),
        uLp0color: this.lighting.s[0].color ?? [1, 1, 1],
        uMatST0up: this.lighting.s[0].translationMatrices[0],
        uShadowMap0up: this.lighting.s[0].shadowBuffers[0].attachments[0],
        uMatST0dn: this.lighting.s[0].translationMatrices[1],
        uShadowMap0dn: this.lighting.s[0].shadowBuffers[1].attachments[0],
        uMatST0north: this.lighting.s[0].translationMatrices[2],
        uShadowMap0north: this.lighting.s[0].shadowBuffers[2].attachments[0],
        uMatST0south: this.lighting.s[0].translationMatrices[3],
        uShadowMap0south: this.lighting.s[0].shadowBuffers[3].attachments[0],
        uMatST0east: this.lighting.s[0].translationMatrices[4],
        uShadowMap0east: this.lighting.s[0].shadowBuffers[4].attachments[0],
        uMatST0west: this.lighting.s[0].translationMatrices[5],
        uShadowMap0west: this.lighting.s[0].shadowBuffers[5].attachments[0],
      });
    } else {
      twgl.setUniforms(this.currentShader, {
        uLp0b: 0,
        uShadowMap0up: null,
      });
    }
    if (this.lighting.s[1]?.on) {
      twgl.setUniforms(this.currentShader, {
        uLp1: twgl.m4.transformPoint(this.matWorld, this.lighting.s[1].position),
        uLp1b: this.lighting.s[1].brightness,// * (model.contrast ?? 1),
        uLp1color: this.lighting.s[1].color ?? [1, 1, 1],
        uMatST1up: this.lighting.s[1].translationMatrices[0],
        uShadowMap1up: this.lighting.s[1].shadowBuffers[0].attachments[0],
        uMatST1dn: this.lighting.s[1].translationMatrices[1],
        uShadowMap1dn: this.lighting.s[1].shadowBuffers[1].attachments[0],
        uMatST1north: this.lighting.s[1].translationMatrices[2],
        uShadowMap1north: this.lighting.s[1].shadowBuffers[2].attachments[0],
        uMatST1south: this.lighting.s[1].translationMatrices[3],
        uShadowMap1south: this.lighting.s[1].shadowBuffers[3].attachments[0],
        uMatST1east: this.lighting.s[1].translationMatrices[4],
        uShadowMap1east: this.lighting.s[1].shadowBuffers[4].attachments[0],
        uMatST1west: this.lighting.s[1].translationMatrices[5],
        uShadowMap1west: this.lighting.s[1].shadowBuffers[5].attachments[0],
      });
    } else {
      twgl.setUniforms(this.currentShader, {
        uLp1b: 0,
        uShadowMap1: null,
      });
    }
    const deferred = [];
    for (const model of this.models) {
      const uMatMV = twgl.m4.multiply(this.matWorld, model.matrix);
      twgl.setUniforms(this.currentShader, {
        uLa: this.lighting.a,
        uLdm: this.lighting.d.mag,
        uMatMV
      });
      for (const group of model.groups) {
        if (group.material?.d && group.material.d < 1) {
          group.uMatMV = uMatMV;
          deferred.push(group);
          continue;
        }
        const noMtlColor = group.color || model.color || [0.8, 0.8, 0.8];
        twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
        twgl.setUniformsAndBindTextures(this.currentShader, {
          uKa: this.getAmbientColor(group.material) || noMtlColor,
          uKd: group.material?.Kd || noMtlColor,
          uKs: group.material?.Ks || [0, 0, 0],
          // uKa: twgl.v3.divScalar(this.#getAmbientColor(group.material) || noMtlColor, Math.PI),
          // uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
          // uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
          uNs: group.material?.Ns || 0,
          uOpacity: 1.0,
          uTexture: group.texture || this.whiteTexture,
        });
        if (!group.texture) {
          twgl.setUniforms(this.currentShader, {
            noTexture: true,
          });
        }
        twgl.drawBufferInfo(this.ctx, group.bufferInfo);
      }
    }
    // draw non-opaque objects
    this.ctx.blendFunc(this.ctx.ONE, this.ctx.ONE_MINUS_SRC_ALPHA);
    this.ctx.enable(this.ctx.BLEND);
    // this.ctx.disable(this.ctx.DEPTH_TEST);
    for (const group of deferred) {
      // could be cleaner
      const noMtlColor = group.color || [0.8, 0.8, 0.8];
      twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
      twgl.setUniformsAndBindTextures(this.currentShader, {
        uKa: this.getAmbientColor(group.material) || noMtlColor,
        uKd: group.material?.Kd || noMtlColor,
        uKs: group.material?.Ks || [0, 0, 0],
        // uKa: twgl.v3.divScalar(this.#getAmbientColor(group.material) || noMtlColor, Math.PI),
        // uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
        // uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
        uNs: group.material?.Ns || 0,
        uOpacity: group.material.d,
        uTexture: group.texture || this.whiteTexture,
        uMatMV: group.uMatMV,
      });
      twgl.drawBufferInfo(this.ctx, group.bufferInfo);
    }
    this.ctx.disable(this.ctx.BLEND);
    // this.ctx.enable(this.ctx.DEPTH_TEST);

    requestAnimationFrame(t => this.#render(t));
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
      const clipNear = light.clipNear ?? 0.1;
      const clipFar = light.clipFar ?? 25;
      const fov = light.fov ?? fov90;
      light.matP = twgl.m4.perspective(fov, 1, clipNear, clipFar);
      light.shadowBuffers = [];
      light.modelViewMatrices = [];
      light.worldMatrices = [];
      light.translationMatrices = [];
      for (const {lookVec, upVec} of shadowMapVectors) {
        const lookAt = lookVec(light.position.slice());
        light.shadowBuffers.push(twgl.createFramebufferInfo(this.ctx, attachments, resolution, resolution));
        light.modelViewMatrices.push(twgl.m4.create());
        light.worldMatrices.push(twgl.m4.inverse(twgl.m4.lookAt(light.position, lookAt, upVec)));
        light.translationMatrices.push(twgl.m4.identity());
      }
    twgl.bindFramebufferInfo(this.ctx, null);
    }
  }

  #drawShadowMaps() {
    if (!this.shaders['zmap']) {
      console.info('skipping shadow map; missing shader [\'zmap\']');
      return;
    }
    this.useProgram('zmap');
    for (const light of this.lighting.s) {
      for (let i = 0; i < light.shadowBuffers.length; i++) {
        twgl.bindFramebufferInfo(this.ctx, light.shadowBuffers[i]);
        twgl.setUniforms(this.currentShader, {
          uMatP: light.matP,
        });
        for (const model of this.models) {
          twgl.setUniforms(this.currentShader, {
            uMatMV: twgl.m4.multiply(light.worldMatrices[i], model.matrix, light.modelViewMatrices[i]),
          });
          for (const group of model.groups) {
            if (group.material?.d && group.material.d < 1) {
              // not opaque, need to handle differently
              continue;
            }
            twgl.setUniforms(this.currentShader, {
              opacity: group.material?.d ?? 1,
            });
            twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
            twgl.drawBufferInfo(this.ctx, group.bufferInfo);
          }
        }
      }
    }
    // TODO one for the directional light
    twgl.bindFramebufferInfo(this.ctx, null);
  }
}

export class Renderer {
  lightBuffers = new WeakMap();
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
    // /**@type{Lighting}*/this.lighting = {
    //   a: scene.options?.lighting?.a ?? 0.5,
    //   d: { // refactor the directional light definition a bit
    //     dir: scene.options?.lighting?.d ? twgl.v3.normalize(scene.options.lighting.d) : [0, -1, 0],
    //     mag: scene.options?.lighting?.di ?? (scene.options?.lighting?.d ? twgl.v3.length(scene.options.lighting.d) : 1),
    //   },
    //   diffuseAsAmbient: scene.options?.lighting?.diffuseAsAmbient,
    //   s: scene.options?.lighting?.s || [],
    //   shadowBias: (scene.options?.lighting?.shadowBias ?? 0.4) / resolution,
    //   omniDirectional: scene.options?.lighting?.omniDirectional || 0.0,
    //   antiWashout: scene.options?.lighting?.antiWashout || 1,
    // };
    this.antiWashout = scene.options?.antiWashout || 0.001;
    this.ambient = scene.ambient || 0.01;
    this.areaLights = scene.lights.map(mapLightsToType);
    this.options = scene.options;
    this.ctx.viewport(0, 0, canvas.width, canvas.height);
    this.matP = this.#makePerspectiveMatrix();
    this.viewpoint = twgl.m4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
    this.matWorld = twgl.m4.inverse(this.viewpoint);
    this.matRotation = twgl.m4.setTranslation(this.matWorld, [0, 0, 0]);
    this.controls = new DefaultControls(this.viewpoint, scene.options?.unlockHeight, scene.options?.unlockUp);
    this.ctx.enable(this.ctx.DEPTH_TEST);
    // this.ctx.enable(this.ctx.CULL_FACE);
    this.ctx.clearColor(
      this.options?.bgColor?.[0] ?? 1.0,
      this.options?.bgColor?.[1] ?? 1.0,
      this.options?.bgColor?.[2] ?? 1.0,
      this.options?.bgColor?.[3] ?? 1.0,
    );
    this.#initLightBuffers();
  }

  /**
   * Render the scene
   */
  async start() {
    await Promise.all([
      this.#loadModels(),
      // this.#resolveProgram('zmap'),
      // this.#resolveProgram('default'),
      // this.#resolveProgram('simple'),
      this.#resolveProgram('wip'),
      this.#resolveProgram('light'),
    ]);
    // this.#drawShadowMaps();
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
    // this.#useProgram('default');
    // this.#useProgram('simple');
    this.#useProgram('wip');
    const uniforms = {
      uMatP: this.matP,
      uMatR: this.matRotation,
      lights: this.areaLights.map(light => light.getUniforms(this.matWorld, this.matRotation)),
      uAntiWashout: this.antiWashout, // effectively limits min distance to prevent color washout close to bright lights; not physically accurate
      ambient: this.ambient,
      // uLdd: twgl.m4.transformDirection(this.matRotation, this.lighting.d.dir),
      // uPointLightDecay: 1,// Math.PI * 4, // configurable?
      // uAntiWashout: this.lighting.antiWashout, // effectively limits min distance to prevent color washout close to bright lights; not physically accurate
      // uShadowBias: this.lighting.shadowBias, // bias decreases z-fighting for shadows at some distance from light source
      // uOmniDirectional: this.lighting.omniDirectional, // this probably doesn't make any sense, it's ambient light but using the diffuse mtl color
    };
    twgl.setUniformsAndBindTextures(this.currentShader, uniforms);
    // if (this.lighting.s[0]?.on) {
    //   twgl.setUniforms(this.currentShader, {
    //     uLp0: twgl.m4.transformPoint(this.matWorld, this.lighting.s[0].position),
    //     uLp0b: this.lighting.s[0].brightness,// * (model.contrast ?? 1),
    //     uLp0color: this.lighting.s[0].color ?? [1, 1, 1],
    //     uMatST0up: this.lighting.s[0].translationMatrices[0],
    //     uShadowMap0up: this.lighting.s[0].shadowBuffers[0].attachments[0],
    //     uMatST0dn: this.lighting.s[0].translationMatrices[1],
    //     uShadowMap0dn: this.lighting.s[0].shadowBuffers[1].attachments[0],
    //     uMatST0north: this.lighting.s[0].translationMatrices[2],
    //     uShadowMap0north: this.lighting.s[0].shadowBuffers[2].attachments[0],
    //     uMatST0south: this.lighting.s[0].translationMatrices[3],
    //     uShadowMap0south: this.lighting.s[0].shadowBuffers[3].attachments[0],
    //     uMatST0east: this.lighting.s[0].translationMatrices[4],
    //     uShadowMap0east: this.lighting.s[0].shadowBuffers[4].attachments[0],
    //     uMatST0west: this.lighting.s[0].translationMatrices[5],
    //     uShadowMap0west: this.lighting.s[0].shadowBuffers[5].attachments[0],
    //   });
    // } else {
    //   twgl.setUniforms(this.currentShader, {
    //     uLp0b: 0,
    //     uShadowMap0up: null,
    //   });
    // }
    // if (this.lighting.s[1]?.on) {
    //   twgl.setUniforms(this.currentShader, {
    //     uLp1: twgl.m4.transformPoint(this.matWorld, this.lighting.s[1].position),
    //     uLp1b: this.lighting.s[1].brightness,// * (model.contrast ?? 1),
    //     uLp1color: this.lighting.s[1].color ?? [1, 1, 1],
    //     uMatST1up: this.lighting.s[1].translationMatrices[0],
    //     uShadowMap1up: this.lighting.s[1].shadowBuffers[0].attachments[0],
    //     uMatST1dn: this.lighting.s[1].translationMatrices[1],
    //     uShadowMap1dn: this.lighting.s[1].shadowBuffers[1].attachments[0],
    //     uMatST1north: this.lighting.s[1].translationMatrices[2],
    //     uShadowMap1north: this.lighting.s[1].shadowBuffers[2].attachments[0],
    //     uMatST1south: this.lighting.s[1].translationMatrices[3],
    //     uShadowMap1south: this.lighting.s[1].shadowBuffers[3].attachments[0],
    //     uMatST1east: this.lighting.s[1].translationMatrices[4],
    //     uShadowMap1east: this.lighting.s[1].shadowBuffers[4].attachments[0],
    //     uMatST1west: this.lighting.s[1].translationMatrices[5],
    //     uShadowMap1west: this.lighting.s[1].shadowBuffers[5].attachments[0],
    //   });
    // } else {
    //   twgl.setUniforms(this.currentShader, {
    //     uLp1b: 0,
    //     uShadowMap1: null,
    //   });
    // }
    const deferred = [];
    for (const model of this.models) {
      const uMatMV = twgl.m4.multiply(this.matWorld, model.matrix);
      twgl.setUniforms(this.currentShader, {
        // uLa: this.lighting.a * (model.contrast ?? 1),
        // uLdm: this.lighting.d.mag * (model.contrast ?? 1),
        uMatMV
      });
      for (const group of model.groups) {
        if (group.material?.d && group.material.d < 1) {
          group.uMatMV = uMatMV;
          deferred.push(group);
          continue;
        }
        const noMtlColor = group.color || model.color || [0.8, 0.8, 0.8];
        twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
        twgl.setUniformsAndBindTextures(this.currentShader, {
          uKa: this.#getAmbientColor(group.material) || noMtlColor,
          uKd: group.material?.Kd || noMtlColor,
          uKs: group.material?.Ks || [0, 0, 0],
          // uKa: twgl.v3.divScalar(this.#getAmbientColor(group.material) || noMtlColor, Math.PI),
          // uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
          // uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
          uNs: group.material?.Ns || 0,
          uOpacity: 1.0,
          uTexture: group.texture || this.whiteTexture,
        });
        if (!group.texture) {
          twgl.setUniforms(this.currentShader, {
            // noTexture: true,
          });
        }
        twgl.drawBufferInfo(this.ctx, group.bufferInfo);
      }
    }
    // draw non-opaque objects
    this.ctx.blendFunc(this.ctx.ONE, this.ctx.ONE_MINUS_SRC_ALPHA);
    this.ctx.enable(this.ctx.BLEND);
    // this.ctx.disable(this.ctx.DEPTH_TEST);
    for (const group of deferred) {
      // could be cleaner
      const noMtlColor = group.color || model.color || [0.8, 0.8, 0.8];
      twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
      twgl.setUniformsAndBindTextures(this.currentShader, {
        uKa: this.#getAmbientColor(group.material) || noMtlColor,
        uKd: group.material?.Kd || noMtlColor,
        uKs: group.material?.Ks || [0, 0, 0],
        // uKa: twgl.v3.divScalar(this.#getAmbientColor(group.material) || noMtlColor, Math.PI),
        // uKd: twgl.v3.divScalar((group.material?.Kd || noMtlColor), Math.PI),
        // uKs: twgl.v3.divScalar((group.material?.Ks || [0, 0, 0]), Math.PI),
        uNs: group.material?.Ns || 0,
        uOpacity: group.material.d,
        uTexture: group.texture || this.whiteTexture,
        uMatMV: group.uMatMV,
      });
      twgl.drawBufferInfo(this.ctx, group.bufferInfo);
    }
    this.ctx.disable(this.ctx.BLEND);
    // this.ctx.enable(this.ctx.DEPTH_TEST);

    // draw lights
    this.#useProgram('light');
    // separate buffers per light
    for (const light of this.areaLights) {
      if (light.on) {
        const buffer = this.lightBuffers.get(light);
        twgl.setBuffersAndAttributes(this.ctx, this.currentShader, buffer);
        twgl.setUniforms(this.currentShader, {
          color: light.color || [1, 1, 1],
          uMatMV: this.matWorld,
          uMatP: this.matP,
        });
        twgl.drawBufferInfo(this.ctx, buffer);
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

      // for (const light of this.lighting.s) {
      //   for (let i = 0; i < light.shadowBuffers.length; i++) {
      //     twgl.m4.translate(twgl.m4.identity(), [0.5, 0.5, 0.5], light.translationMatrices[i]);
      //     twgl.m4.scale(light.translationMatrices[i], [0.5, 0.5, 0.5], light.translationMatrices[i]);
      //     twgl.m4.multiply(light.translationMatrices[i], light.matP, light.translationMatrices[i]);
      //     twgl.m4.multiply(light.translationMatrices[i], light.worldMatrices[i], light.translationMatrices[i]);
      //     twgl.m4.multiply(light.translationMatrices[i], twgl.m4.inverse(this.matWorld), light.translationMatrices[i]);
      //   }
      // }
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
    const e = this.ctx.getError();
    if (e) {
      console.log(name, this.currentShader)
      throw new Error(e);
    }
  }

  async #resolveProgram(/**@type{string}*/name) {
    if (this.shaders[name]) {
      return Promise.resolve();
    }
    const vs = await (await fetch(`/twgl/shaders/${name}/vs.gl`)).text();
    const fs = await (await fetch(`/twgl/shaders/${name}/fs.gl`)).text().then(val => {
      // inline replace compile-time constants that depend on js definitions
      return val.replace('<% numLights %>', this.areaLights.length);
    });
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
    let totalTris = 0;
    for (const model of this.models) {
      for (const group of model.groups) {
        totalTris += group.vertices.length / 3;
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
    console.log(totalTris);
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

  #initLightBuffers() {
    for (const light of this.areaLights) {
      const aVertex = light.getVertices();
      const bufferInfo = twgl.createBufferInfoFromArrays(this.ctx, {aVertex});
      this.lightBuffers.set(light, bufferInfo);
    }
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
      const clipNear = light.clipNear ?? 0.1;
      const clipFar = light.clipFar ?? 25;
      const fov = light.fov ?? fov90;
      light.matP = twgl.m4.perspective(fov, 1, clipNear, clipFar);
      light.shadowBuffers = [];
      light.modelViewMatrices = [];
      light.worldMatrices = [];
      light.translationMatrices = [];
      for (const {lookVec, upVec} of shadowMapVectors) {
        const lookAt = lookVec(light.position.slice());
        light.shadowBuffers.push(twgl.createFramebufferInfo(this.ctx, attachments, resolution, resolution));
        light.modelViewMatrices.push(twgl.m4.create());
        light.worldMatrices.push(twgl.m4.inverse(twgl.m4.lookAt(light.position, lookAt, upVec)));
        light.translationMatrices.push(twgl.m4.identity());
      }
    twgl.bindFramebufferInfo(this.ctx, null);
    }
  }

  #drawShadowMaps() {
    if (!this.shaders['zmap']) {
      console.info('skipping shadow map; missing shader [\'zmap\']');
      return;
    }
    this.#useProgram('zmap');
    for (const light of this.lighting.s) {
      for (let i = 0; i < light.shadowBuffers.length; i++) {
        twgl.bindFramebufferInfo(this.ctx, light.shadowBuffers[i]);
        twgl.setUniforms(this.currentShader, {
          uMatP: light.matP,
        });
        for (const model of this.models) {
          twgl.setUniforms(this.currentShader, {
            uMatMV: twgl.m4.multiply(light.worldMatrices[i], model.matrix, light.modelViewMatrices[i]),
          });
          for (const group of model.groups) {
            if (group.material?.d && group.material.d < 1) {
              // not opaque, need to handle differently
              continue;
            }
            twgl.setUniforms(this.currentShader, {
              opacity: group.material?.d ?? 1,
            });
            twgl.setBuffersAndAttributes(this.ctx, this.currentShader, group.bufferInfo);
            twgl.drawBufferInfo(this.ctx, group.bufferInfo);
          }
        }
      }
    }
    // TODO one for the directional light
    twgl.bindFramebufferInfo(this.ctx, null);
  }

  async #viewShadowMap(bufferInfo) {
    // i don't even remember how to do this
    await this.#resolveProgram('zmap');
    this.#useProgram('zmap');
    twgl.setBuffersAndAttributes(this.ctx, this.currentShader, bufferInfo);
    twgl.drawBufferInfo(this.ctx, bufferInfo);
  }

  #getAmbientColor(/**@type{Material}*/material) {
    if (!material) {
      return null;
    }
    if (this.lighting?.diffuseAsAmbient) {
      const dRatio = this.lighting.diffuseAsAmbient;
      const aRatio = 1 - dRatio;
      return twgl.v3.add(twgl.v3.mulScalar(material.Ka, aRatio), twgl.v3.mulScalar(material.Kd, dRatio));
    }
    return material.Ka;
  }
}

// TODO: make shadowMapVectors configurable? probably have to refactor how
// maps are passed to the shaders, it's expecting 6 of them
const fov90 = Math.PI / 2;
const shadowMapVectors = [
  { // up
    lookVec: v => {v[1]++; return v},
    upVec: [0, 0, 1],
  },
  { // down
    lookVec: v => {v[1]--; return v},
    upVec: [0, 0, 1],
  },
  { // north
    lookVec: v => {v[2]--; return v},
    upVec: [0, 1, 0],
  },
  { // south
    lookVec: v => {v[2]++; return v},
    upVec: [0, 1, 0],
  },
  { // east
    lookVec: v => {v[0]++; return v},
    upVec: [0, 1, 0],
  },
  { // west
    lookVec: v => {v[0]--; return v},
    upVec: [0, 1, 0],
  },
];

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

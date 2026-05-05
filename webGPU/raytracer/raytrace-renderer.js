import { glMatrix } from 'gl-matrix';
import { RollingAverage } from '../rolling-average.js';
import { createManager } from '../twgpu-lib.js';
import { createTextureFromImage, getSizeAndAlignmentOfUnsizedArrayElement, makeStructuredView } from 'webgpu-utils';
import { Camera } from '../../default-controls.js';
import { BVH } from './structure.js';

export class RaytraceRenderer {
  /**@type{StructuredBuffer}*/ _staticUniforms;
  /**@type{ShaderInfo}*/ _shaderInfo;
  _accumulatedFrameCount = 0;
  _accumulatorBindGroup0;
  _accumulatorShaderInfo;
  _materialIndexes = new Map();
  _textureIndexes = new Map();
  _meshInstanceInfo = [];
  _blendWeight = new Float32Array(1);
  _blendWeightGpuBuffer;
  _staticUniformsGpuBuffer;
  _renderBindGroup0;
  _renderPipeline;
  _accumulatorPipeline;
  _counter = 0;

  constructor(scene) {
    glMatrix.setMatrixArrayType(Array);
    this.modelSources = scene?.models;
    this.frameAccumulator = true;
    this.heatMap = false;
    this.heatMapThreshold = 1000;
    this.pauseRendering = false;
    this.environmentLight = [0.846, 0.933, 0.949];
    this.importancePointX = 0.385;
    this.importancePointY = 0.6;
    this.importancePointZ = -2.12;
    this.importanceFactor = 0;
    this.infoEl = document.querySelector('pre#info');
    this.fps = new RollingAverage();
  }

  async start() {
    // TODO: refactor to give existing arraybuffer views to model loader
    const promises = this.modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
    this.models = await Promise.all(promises);
    console.log(this.models);
    this.manager = await createManager();
    this._shaderInfo = await this.createShader();
    this._accumulatorShaderInfo = (await this.manager.resolveShader('frame_accumulator')).definitions;
    this._renderPipeline = this.manager.createPipeline('raytracer', {
      buffers: [{
        arrayStride: 8,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2'},
        ]
      }],
    });
    this._accumulatorPipeline = this.manager.createPipeline('frame_accumulator', {
      buffers: [{
        arrayStride: 8,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2'},
        ]
      }],
    });

    // order is important, must load textures first, then setup materials before triangles
    await this.loadModelTextures();
    const materialsGpuBuffer = this.setMaterialStorage();
    const bvhGpuBuffer = this.setBVHStorage();
    const trianglesGpuBuffer = this.setTriangleStorage();
    // const meshesGpuBuffer = this.setMeshesStorage();
    this.vertexBuffer = this.setVertexBuffer();

    this._staticUniforms = makeStructuredView(this._shaderInfo.uniforms.staticUniforms);
    // this._staticUniforms.views.bvhEnd.set([this.bvhStructure.triangles.length]);
    this.camera = new Camera({
      cameraToWorld: this._staticUniforms.views.cameraToWorld,
      worldToView: this._staticUniforms.views.worldToView,
      projection: this._staticUniforms.views.projection,
      frustrumParams: this._staticUniforms.views.frustrumParams, // not using yet but will need to make sure this matches up with projection matrix
      ndcParams: this._staticUniforms.views.ndcParams,
    });
    this._staticUniformsGpuBuffer = this.manager.device.createBuffer({
      size: this._staticUniforms.arrayBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._blendWeightGpuBuffer = this.manager.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._renderBindGroup0 = this.manager.device.createBindGroup({
      label: 'static uniforms',
      layout: this._renderPipeline.getBindGroupLayout(0),
      entries: [
        {binding: this._shaderInfo.storages.triangles.binding, resource: trianglesGpuBuffer},
        {binding: this._shaderInfo.storages.materials.binding, resource: materialsGpuBuffer},
        {binding: this._shaderInfo.storages.bvhNodes.binding, resource: bvhGpuBuffer},
        {binding: this._shaderInfo.uniforms.staticUniforms.binding, resource: this._staticUniformsGpuBuffer},
      ]
    });
    this.createRenderTextures();

    requestAnimationFrame(t => this.render(t));
  }

  render(timestamp) {
    this.fps.addSample(1000 / (timestamp - this._previousTimestamp));
    this._previousTimestamp = timestamp;
    this.infoEl.textContent = `fps: ${this.fps}`;
    if (this.pauseRendering) {
      this.camera.pause();
      return requestAnimationFrame(timestamp => this.render(timestamp));
    }
    this.camera.resume();
    if (this.manager.resizeCanvasToDisplaySize()) {
      this.createRenderTextures();
      this.camera.updateViewParams();
      this.camera.changed = true;
    }
    const changed = this.camera.updateTime(timestamp);
    this._staticUniforms.set({
      rngSeed: [this._counter++],
      environmentLight: this.environmentLight,
      heatMap: [Number(this.heatMap)],
      heatMapThreshold: [this.heatMapThreshold],
      importanceFactor: [this.importanceFactor],
      importancePoint: [this.importancePointX, this.importancePointY, this.importancePointZ],
    });
    this.manager.device.queue.writeBuffer(this._staticUniformsGpuBuffer, 0, this._staticUniforms.arrayBuffer);

    if (changed || !this.frameAccumulator) {
      const bindGroups = [this._renderBindGroup0];
      if (this._textureIndexes.size) {
        bindGroups.push(this._renderBindGroup1);
      }
      this._accumulatedFrameCount = 0;
      this.manager.singlePassRender({
        pipeine: this._pipeline,
        bindGroups,
        numVertices: 6,
        vertexBuffer: this.vertexBuffer,
      });
    } else {
      const bindGroups = [this._renderBindGroup0];
      if (this._textureIndexes.size) {
        bindGroups.push(this._renderBindGroup1);
      }
      this._blendWeight.set([1 / (this._accumulatedFrameCount + 1)]);
      this.manager.device.queue.writeBuffer(this._blendWeightGpuBuffer, 0, this._blendWeight);
      this._accumulatedFrameCount++;
      this.manager.multiPassRender([
        {
          pipeline: this._renderPipeline,
          bindGroups,
          vertexBuffer: this.vertexBuffer,
          numVertices: 6,
          target: this.renderTexture,
        },
        {
          pipeline: this._accumulatorPipeline,
          bindGroups: [this._accumulatorBindGroup0],
          vertexBuffer: this.vertexBuffer,
          numVertices: 6,
        }
      ], this.previousFrameTexture);
    }

    requestAnimationFrame(t => this.render(t));
  }

  setTriangleStorage() {
    const numTriangles = this.bvhStructure.triangles.length;
    const { size } = getSizeAndAlignmentOfUnsizedArrayElement(this._shaderInfo.storages.triangles);
    const triangleStorage = makeStructuredView(this._shaderInfo.storages.triangles, new ArrayBuffer(size * numTriangles));
    const vertexTrianglesBuffer = this.manager.createEmptyBuffer(size * numTriangles, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    let triangleIndex = 0;
    for (const tri of this.bvhStructure.triangles) {
      triangleStorage.views[triangleIndex].A.set(tri.A);
      triangleStorage.views[triangleIndex].B.set(tri.B);
      triangleStorage.views[triangleIndex].C.set(tri.C);
      triangleStorage.views[triangleIndex].normA.set(tri.normalA);
      triangleStorage.views[triangleIndex].normB.set(tri.normalB);
      triangleStorage.views[triangleIndex].normC.set(tri.normalC);
      triangleStorage.views[triangleIndex].texCoordAx.set([tri.texCoordsA[0]]);
      triangleStorage.views[triangleIndex].texCoordAy.set([tri.texCoordsA[1]]);
      triangleStorage.views[triangleIndex].texCoordBx.set([tri.texCoordsB[0]]);
      triangleStorage.views[triangleIndex].texCoordBy.set([tri.texCoordsB[1]]);
      triangleStorage.views[triangleIndex].texCoordCx.set([tri.texCoordsC[0]]);
      triangleStorage.views[triangleIndex].texCoordCy.set([tri.texCoordsC[1]]);
      triangleStorage.views[triangleIndex].sfcNormX.set([tri.sfcNormal[0]]);
      triangleStorage.views[triangleIndex].sfcNormY.set([tri.sfcNormal[1]]);
      triangleStorage.views[triangleIndex].sfcNormZ.set([tri.sfcNormal[2]]);
      triangleStorage.views[triangleIndex].materialIndex.set([tri.materialIndex]);
      triangleIndex++;
    }
    this.manager.device.queue.writeBuffer(vertexTrianglesBuffer, 0, triangleStorage.arrayBuffer);
    return vertexTrianglesBuffer;
  }

  setMaterialStorage() {
    const numMaterials = this.models.reduce((sum, model) => {
      sum += Object.values(model.materials).length;
      return sum;
    }, 0);
    const { size } = getSizeAndAlignmentOfUnsizedArrayElement(this._shaderInfo.storages.materials);
    const materialStorage = makeStructuredView(this._shaderInfo.storages.materials, new ArrayBuffer(size * numMaterials));
    const materialGpuBuffer = this.manager.createEmptyBuffer(size * numMaterials, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    let materialIndex = 0;
    for (const model of this.models) {
      for (const material of Object.values(model.materials)) {
        const texturePath = material.map_Ka ?? material.map_Kd;
        material.Kd && materialStorage.views[materialIndex].color.set(material.Kd);
        material.Ke && materialStorage.views[materialIndex].emitColor.set(material.Ke);
        material.i && materialStorage.views[materialIndex].emitIntensity.set([material.i]);
        material.reflection && materialStorage.views[materialIndex].reflection.set([material.reflection]);
        materialStorage.views[materialIndex].textureIndex.set([this._textureIndexes.get(texturePath) ?? -1]);
        this._materialIndexes.set(material.name, materialIndex);
        materialIndex++;
      }
    }
    this.manager.device.queue.writeBuffer(materialGpuBuffer, 0, materialStorage.arrayBuffer);
    return materialGpuBuffer;
  }

  setBVHStorage() {
    const bvh = new BVH();
    for (const model of this.models) {
      for (const group of model.facetGroups) {
        const vertexIndexes = model.vertexIndexes.slice(group.triangleOffset * 3, (group.triangleOffset + group.triangleCount) * 3);
        const normalIndexes = model.normalIndexes.slice(group.triangleOffset * 3, (group.triangleOffset + group.triangleCount) * 3);
        const textureIndexes = model.textureIndexes.slice(group.triangleOffset * 3, (group.triangleOffset + group.triangleCount) * 3);
        bvh.addModel(model.vertices, vertexIndexes, model.normals, normalIndexes, model.texCoords, textureIndexes, this._materialIndexes.get(group.materialName));
      }
    }
    this.bvhStructure = bvh.compute();
    console.log(this.bvhStructure);
    const numNodes = this.bvhStructure.bvhNodes.length;
    const { size } = getSizeAndAlignmentOfUnsizedArrayElement(this._shaderInfo.storages.bvhNodes);
    const bvhView = makeStructuredView(this._shaderInfo.storages.bvhNodes, new ArrayBuffer(size * numNodes));
    const bvhGpuBuffer = this.manager.createEmptyBuffer(size * numNodes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    for (let i = 0; i < numNodes; i++) {
      const node = this.bvhStructure.bvhNodes[i];
      bvhView.views[i].boxMin.set(node.boundingBox.min);
      bvhView.views[i].boxMax.set(node.boundingBox.max);
      bvhView.views[i].index.set([node.index]);
      bvhView.views[i].numTriangles.set([node.triangleCount]);
    }
    this.manager.device.queue.writeBuffer(bvhGpuBuffer, 0, bvhView.arrayBuffer);
    return bvhGpuBuffer;
  }

  setVertexBuffer() {
    const vertexData = new Float32Array([
      -1, -1,
      1, -1,
      1, 1,
      1, 1,
      -1, 1,
      -1, -1,
    ]);
    const vertexBuffer = this.manager.device.createBuffer({
      label: 'vertex buffer vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.manager.device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    return vertexBuffer;
  }

  createRenderTextures() {
    this.previousFrameTexture?.destroy();
    this.renderTexture?.destroy();
    this.previousFrameTexture = this.manager.device.createTexture({
      label: 'previousFrameTexture',
      size: [this.manager.canvas.width, this.manager.canvas.height],
      format: this.manager.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.renderTexture = this.manager.device.createTexture({
      label: 'renderTexture',
      size: [this.manager.canvas.width, this.manager.canvas.height],
      format: this.manager.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this._accumulatorBindGroup0 = this.manager.device.createBindGroup({
      label: 'accumulatorBindGroup',
      layout: this._accumulatorPipeline.getBindGroupLayout(0),
      entries: [
        {binding: this._accumulatorShaderInfo.textures.current.binding, resource: this.renderTexture},
        {binding: this._accumulatorShaderInfo.textures.accumulated.binding, resource: this.previousFrameTexture},
        {binding: this._accumulatorShaderInfo.uniforms.weight.binding, resource: this._blendWeightGpuBuffer},
      ]
    });
  }

  async loadModelTextures() {
    const textureBuffers = [];
    const maxTx = this.manager.device.limits.maxSampledTexturesPerShaderStage;
    for (const model of this.models) {
      for (const material of Object.values(model.materials)) {
        const texturePath = material.map_Kd || material.map_Ka;
        if (texturePath && textureBuffers.length < maxTx) {
          const len = textureBuffers.push(await createTextureFromImage(this.manager.device, texturePath, { flipY: true, mips: true }));
          this._textureIndexes.set(texturePath, len - 1);
        }
      }
    }
    if (!textureBuffers.length) {
      return;
    }
    const sampler = this.manager.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this._renderBindGroup1 = this.manager.device.createBindGroup({
      label: 'textures bind group',
      layout: this._renderPipeline.getBindGroupLayout(1),
      entries: [
        {binding: this._shaderInfo.samplers.texSampler.binding, resource: sampler},
        ...textureBuffers.map((buffer, i) => (
          {binding: this._shaderInfo.textures[`texture${i}`].binding, resource: buffer}
        ))
      ]
    });
  }

  async createShader() {
    const maxTx = this.manager.device.limits.maxSampledTexturesPerShaderStage;
    let txBindings = [];
    let txCases = [];
    for (const model of this.models) {
      for (const material of Object.values(model.materials)) {
        const texturePath = material.map_Kd || material.map_Ka;
        if (texturePath && txBindings.length < maxTx) {
          const i = txBindings.length;
          txBindings.push(
            /*wgsl*/`@group(1) @binding(${i}) var texture${i}: texture_2d<f32>;`
          );
          txCases.push(
            /*wgsl*/`case ${i}: {return textureSample(texture${i}, texSampler, hitInfo.texCoords) * hitInfo.material.color;}`
          );
        }
      }
    }
    if (txBindings.length) {
      const i = txBindings.length;
      txBindings.push(/*wgsl*/`@group(1) @binding(${i}) var texSampler: sampler;`);
    }
    txBindings = txBindings.join('\n');
    txCases = txCases.join('\n');
    return await this.manager.createShader('raytracer', {txBindings, txCases});
  }
}

/**
 * @typedef { Float32Array | Int32Array | Uint32Array } TypedArray
*/
/**
 * @typedef{{
 *  arrayBuffer: ArrayBuffer,
 *  set: (data) => void,
 *  views: {[key: string]: TypedArray}[]
 * }} StructuredBuffer
 */
/**
 * @typedef{{
 *  ​entryPoints: { [key: string]: any }
 *  externalTextures: { [key: string]: any }
 *  immediates: { [key: string]: any }
 *  samplers: { [key: string]: any }
 *  storageTextures: { [key: string]: any }
 *  storages: { [key: string]: any }
 *  structs: { [key: string]: any }
 *  textures: { [key: string]: any }
 *  uniforms: { [key: string]: any }
 * }} ShaderInfo
 */


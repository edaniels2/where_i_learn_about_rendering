import { glMatrix, mat4 } from 'gl-matrix';
import { RollingAverage } from '../rolling-average.js';
import { createManager } from '../twgpu-lib.js';
import { getSizeAndAlignmentOfUnsizedArrayElement, makeStructuredView } from 'webgpu-utils';
import { DefaultControls } from '../../default-controls.js';

export class RaytraceRenderer {
  /**@type{StructuredBuffer}*/ _staticUniforms;
  /**@type{ShaderInfo}*/ _shaderInfo;
  _accumulatedFrameCount = 0;
  _accumulatorBindGroup0;
  _accumulatorShaderInfo;
  _materialIndexes = new Map();
  _meshInstanceInfo = [];
  _blendWeight = new Float32Array(1);
  _blendWeightGpuBuffer;
  _staticUniformsGpuBuffer;
  _renderBindGroup0;
  _renderPipeline;
  _accumulatorPipeline;
  _numVertices;
  _counter = 0;

  constructor(scene) {
    glMatrix.setMatrixArrayType(Array);
    this.modelSources = scene?.models;
    this.frameAccumulator = true;
    this.pauseRendering = false;
    this.infoEl = document.querySelector('pre#info');
    this.fps = new RollingAverage();
  }

  async start() {
    // TODO: refactor to give existing arraybuffer views to model loader
    const promises = this.modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
    this.models = await Promise.all(promises);
    console.log(this.models);
    this.manager = await createManager({canvasTextureUsage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
    this._shaderInfo = (await this.manager.resolveShader('raytracer')).definitions;
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

    const vertexGpuBuffer = this.setVertexStorage();
    const materialsGpuBuffer = this.setMaterialStorage();
    const meshesGpuBuffer = this.setMeshesStorage();
    this.vertexBuffer = this.setVertexBuffer();

    this._staticUniforms = makeStructuredView(this._shaderInfo.uniforms.staticUniforms);
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
        {binding: this._shaderInfo.storages.vertices.binding, resource: vertexGpuBuffer},
        {binding: this._shaderInfo.storages.materials.binding, resource: materialsGpuBuffer},
        {binding: this._shaderInfo.storages.meshes.binding, resource: meshesGpuBuffer},
        {binding: this._shaderInfo.uniforms.staticUniforms.binding, resource: this._staticUniformsGpuBuffer},
      ]
    });
    this.createTextures();

    requestAnimationFrame(t => this.render(t));
  }

  render(timestamp) {
    if (this.pauseRendering) {
      this.camera.pause();
      return requestAnimationFrame(timestamp => this.render(timestamp));
    }
    this.camera.resume();
    const jsStart = performance.now();
    this.fps.addSample(1000 / (timestamp - this._previousTimestamp));
    this._previousTimestamp = timestamp;
    if (this.manager.resizeCanvasToDisplaySize()) {
      this.createTextures();
      this.camera.updateViewParams();
      this.camera.changed = true;
    }
    const changed = this.camera.updateTime(timestamp);
    this._staticUniforms.set({ rngSeed: this._counter++ });
    this.manager.device.queue.writeBuffer(this._staticUniformsGpuBuffer, 0, this._staticUniforms.arrayBuffer);

    if (changed || !this.frameAccumulator) {
      this._accumulatedFrameCount = 0;
      this.manager.singlePassRender({
        pipeine: this._pipeline,
        bindGroups: [this._renderBindGroup0],
        numVertices: 6,
        vertexBuffer: this.vertexBuffer,
      });
    } else {
      this._blendWeight.set([1 / (this._accumulatedFrameCount + 1)]);
      this.manager.device.queue.writeBuffer(this._blendWeightGpuBuffer, 0, this._blendWeight);
      this._accumulatedFrameCount++;
      this.manager.multiPassRender([
        {
          pipeline: this._renderPipeline,
          bindGroups: [this._renderBindGroup0],
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

    const jsDuration = performance.now() - jsStart;
    this.infoEl.textContent = `\
fps: ${this.fps}
js: ${jsDuration.toFixed(1)}ms`;

    requestAnimationFrame(t => this.render(t));
  }

  setVertexStorage() {
    this._numVertices = this.models.reduce((sum, model) => {
      sum += model.dereferencedVertices.length;
      return sum;
    }, 0) / 3;
    const { size } = getSizeAndAlignmentOfUnsizedArrayElement(this._shaderInfo.storages.vertices);
    const vertexStorage = makeStructuredView(this._shaderInfo.storages.vertices, new ArrayBuffer(size * this._numVertices)); // maybe a single buffer for all storages, not sure how much that matters
    const vertexGpuBuffer = this.manager.createEmptyBuffer(size * this._numVertices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    let vIndex = 0;
    for (const model of this.models) {
      for (let i = 0; i < model.dereferencedVertices.length; i += 3) {
        vertexStorage.views[vIndex].position[0] = model.dereferencedVertices[i];
        vertexStorage.views[vIndex].position[0 + 1] = model.dereferencedVertices[i + 1];
        vertexStorage.views[vIndex].position[0 + 2] = model.dereferencedVertices[i + 2];
        vertexStorage.views[vIndex].normal[0] = model.dereferencedNormals[i];
        vertexStorage.views[vIndex].normal[0 + 1] = model.dereferencedNormals[i + 1];
        vertexStorage.views[vIndex].normal[0 + 2] = model.dereferencedNormals[i + 2];
        vIndex++;
      }
    }
    this.manager.device.queue.writeBuffer(vertexGpuBuffer, 0, vertexStorage.arrayBuffer);
    return vertexGpuBuffer;
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
        material.Kd && materialStorage.views[materialIndex].color.set(material.Kd);
        material.Ke && materialStorage.views[materialIndex].emitColor.set(material.Ke);
        material.i && materialStorage.views[materialIndex].emitIntensity.set([material.i]);
        material.reflection && materialStorage.views[materialIndex].reflection.set([material.reflection]);
        this._materialIndexes.set(material.name, materialIndex);
        materialIndex++;
      }
    }
    this.manager.device.queue.writeBuffer(materialGpuBuffer, 0, materialStorage.arrayBuffer);
    return materialGpuBuffer;
  }

  setMeshesStorage() {
    const numMeshes = this.models.reduce((sum, model) => {
      sum += model.facetGroups.length;
      return sum;
    }, 0);
    const { size } = getSizeAndAlignmentOfUnsizedArrayElement(this._shaderInfo.storages.meshes);
    const meshesStorage = makeStructuredView(this._shaderInfo.storages.meshes, new ArrayBuffer(size * numMeshes));
    const meshesGpuBuffer = this.manager.createEmptyBuffer(size * numMeshes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    let modelVertexOffset = 0;
    let modelTriangleOffset = 0;
    let meshIndex = 0;
    for (const model of this.models) {
      let meshTriangles = 0;
      const trianglesInModel = model.vertexIndexes.length / 3;
      for (const mesh of model.facetGroups) {
        const materialIndex = this._materialIndexes.get(mesh.materialName);
        meshesStorage.views[meshIndex].boxMax.set(mesh.boundingBox.max);
        meshesStorage.views[meshIndex].boxMin.set(mesh.boundingBox.min);
        meshesStorage.views[meshIndex].firstTriangle.set([mesh.triangleOffset + modelTriangleOffset]);
        meshesStorage.views[meshIndex].materialIndex.set([materialIndex]);
        meshesStorage.views[meshIndex].nextMeshFirstTriangle.set([mesh.triangleOffset + mesh.triangleCount + modelTriangleOffset]);
        // used to pass the current material index to the vertex shader via instance index
        this._meshInstanceInfo.push({ // NOT USED; abandoned idea
          firstVertex: modelVertexOffset + mesh.startIndex,
          vertexCount: mesh.length,
          materialIndex
        });
        meshTriangles += mesh.triangleCount;
        meshIndex++;
      }
      modelVertexOffset += meshTriangles * 3;
      modelTriangleOffset += trianglesInModel;
    }
    this.manager.device.queue.writeBuffer(meshesGpuBuffer, 0, meshesStorage.arrayBuffer);
    return meshesGpuBuffer;
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

  createTextures() {
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
}

class Camera extends DefaultControls {

  constructor(matrixArrays, options /* unlockHeight = false, unlockUp = false */) {
    const cameraToWorld = matrixArrays.cameraToWorld ?? mat4.create();
    super(cameraToWorld, options);
    mat4.lookAt(this.matrix, [0, 0, 0], [0, 0, -1], [0, 1, 0]);
    this._worldToView = matrixArrays.worldToView;
    this._projection = matrixArrays.projection;
    this.viewParams = matrixArrays.frustrumParams;
    this.ndcParams = matrixArrays.ndcParams;
    this.updateViewParams();
    this.updatePosition();
  }

  updateViewParams(options) {
    const canvas = document.querySelector('canvas');
    const aspect = options?.aspect || canvas.width / canvas.height;
    const fov = options?.fov || Math.PI / 6 / aspect;
    this.distToPlane = options?.distToPlane || 1;
    this.planeHeight = this.distToPlane * Math.tan(fov * 0.5) * 2; // make sure this matches up with projection matrix
    this.planeWidth = this.planeHeight * aspect;
    this.viewParams.set([this.planeWidth, this.planeHeight, this.distToPlane]);
    this.ndcParams.set([1 / canvas.width, 1 / canvas.height]);
    if (this._projection) {
      mat4.perspective(this._projection, fov * aspect, aspect, 0.1, 1000);
    }
  }

  updatePosition() {
    super.updatePosition();
    if (this._worldToView) {
      mat4.invert(this._worldToView, this.matrix);
    }
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


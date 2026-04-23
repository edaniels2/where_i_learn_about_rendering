import { glMatrix, mat4 } from 'gl-matrix';
import { createManager } from '../twgpu-lib.js';
import { DefaultControls } from '../../twgl/default-controls.js';

export class RaytraceRenderer {
  _mtlIndexes = {};
  _previousTimestamp = 0;
  _gpuDuration = 0;
  _noop = () => {};

  constructor(scene) {
    glMatrix.setMatrixArrayType(Array);
    this.modelSources = scene?.models;
    this.frameAccumulator = false;
    this.infoEl = document.querySelector('pre#info');
  }

  async start() {
    const promises = this.modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
    this.models = await Promise.all(promises);
    this.manager = await createManager({computeToCanvas: true});
    await this.manager.resolveShader('raytracer');
    await this.manager.resolveShader('frame_accumulator');
    const materialsBuffer = this.packMaterials(); // materials have to go first, maybe combine to a single fn
    const trianglesBuffer = this.packModels();
    const meshesBuffer = this.packMeshes();
    this.camera = new Camera;
    this.camToWorld = mat4.invert(new Float32Array(16), this.camera.matrix);
    this.manager.createPipeline('raytracer');
    this.ndcParamsBuffer = this.manager.bufferUniform(new Float32Array(this.camera.ndcParams));
    this.viewParamsBuffer = this.manager.bufferUniform(new Float32Array(this.camera.viewParams));
    this.camLocalToWorldBuffer = this.manager.bufferUniform(this.camToWorld);
    this.rngSeedBuffer = this.manager.createEmptyBuffer(Float32Array.BYTES_PER_ELEMENT * 2, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.accumulatorTexture = this.manager.newFrameTexture();
    this.outTexture = this.manager.newFrameTexture();
    this.accumulatedFrameCount = new Float32Array([0]);
    this.accumulatedFrameCountBuffer = this.manager.bufferUniform(this.accumulatedFrameCount);
    this.manager.setPerFrameUniforms({
      ndcParams: { binding: 1, data: this.ndcParamsBuffer, },
      viewParams: { binding: 2, data: this.viewParamsBuffer, },
      camLocalToWorld: { binding: 3, data: this.camLocalToWorldBuffer, },
      materials: { binding: 4, data: materialsBuffer },
      rngSeed: { binding: 6, data: this.rngSeedBuffer, },
      triangles: { binding: 7, data: trianglesBuffer, },
      meshes: { binding: 8, data: meshesBuffer, },
    });
    this.manager.createUniformBindings();

    this.manager.setPerFrameUniforms({
      current: { binding: 1, data: this.manager.renderTexture.createView() },
      accumulated: { binding: 2, data: this.accumulatorTexture },
      accumulatedFrameCount: { binding: 3, data: this.accumulatedFrameCountBuffer },
    });
    this.manager.createPipeline('frame_accumulator');
    this.manager.createUniformBindings(this.outTexture, 'frame_accumulator');

    requestAnimationFrame(t => this.render(t));
  }

  render(timestamp) {
    const jsStart = performance.now();
    const dT = timestamp - this._previousTimestamp;
    this._previousTimestamp = timestamp;
    if (this.manager.resizeCanvasToDisplaySize()) {
      this.camera.updateViewParams();
      this.camera.changed = true;
    }
    const changed = this.camera.updateTime(timestamp);
    if (changed || !this.frameAccumulator) {
      this.accumulatedFrameCount.set([0]);
    }
    mat4.copy(this.camToWorld, this.camera.matrix)
    this.manager.device.queue.writeBuffer(this.camLocalToWorldBuffer, 0, this.camToWorld);
    this.manager.device.queue.writeBuffer(this.rngSeedBuffer, 0, new Float32Array([Math.random() * 100, Math.random() * 100]));

    if (this.frameAccumulator) {
      this.manager.device.queue.writeBuffer(this.accumulatedFrameCountBuffer, 0, this.accumulatedFrameCount);
      this.manager.multiPassRender(['raytracer', 'frame_accumulator'], this.outTexture, encoder => {
        encoder.copyTextureToTexture(
          { texture: this.outTexture },
          { texture: this.accumulatorTexture },
          { width: this.manager.canvas.width, height: this.manager.canvas.height }
        );
      });
      this.accumulatedFrameCount.set([this.accumulatedFrameCount.at(0) + 1]);
    } else {
      this.manager.singlePassRender();
    }

    requestAnimationFrame(timestamp => this.render(timestamp));

    const jsDuration = performance.now() - jsStart;
    this.infoEl.textContent = `\
fps: ${(1000 / dT).toFixed(1)}
js: ${jsDuration.toFixed(1)}ms`;
  }

  packModels() {
    const bufferLength = this.models.reduce((total, model) => {
      total += model.dereferencedVertices.length
      return total;
    }, 0) / 3 * 8;
    const jsBuffer = new Float32Array(bufferLength);
    const triangleCount = this.models.reduce((total, model) => {
      total += model.vertexIndexes.length / 3;
      return total;
    }, 0);
    const materialData = new Uint32Array(triangleCount * 2);
    let offset = 0;
    let triangleIndex = 0;
    this.models.forEach(model => {
      let vertexIndex = 0;
      for (let i = 0; i < model.dereferencedVertices.length; i += 9) {
        jsBuffer.set(model.dereferencedVertices.slice(i, i + 3), offset);
        jsBuffer.set(model.dereferencedVertices.slice(i + 3, i + 6), offset + 4);
        jsBuffer.set(model.dereferencedVertices.slice(i + 6, i + 9), offset + 8);
        jsBuffer.set(model.dereferencedNormals.slice(i, i + 3), offset + 12);
        jsBuffer.set(model.dereferencedNormals.slice(i + 3, i + 6), offset + 16);
        jsBuffer.set(model.dereferencedNormals.slice(i + 6, i + 9), offset + 20);
        offset += 24;
        triangleIndex++;
        vertexIndex += 3;
      }
    });
    const size = jsBuffer.byteLength;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const bufferDescriptor = {size, usage, mappedAtCreation: true};
    const gpuBuffer = this.manager.device.createBuffer(bufferDescriptor);
    const mappedRange = gpuBuffer.getMappedRange();
    const f32WriteArray = new Float32Array(mappedRange);
    const u32WriteArray = new Uint32Array(mappedRange);
    f32WriteArray.set(jsBuffer);
    for (let i = 0; i < materialData.length; i += 2) {
      const offset = materialData.at(i + 1);
      if (offset) {
        const mtlIndex = materialData.at(i);
        u32WriteArray.set([mtlIndex], offset);
      }
    }
    gpuBuffer.unmap();
    return gpuBuffer;
  }

  packMeshes() {
    const size = this.models.reduce((total, model) => {
      total += model.facetGroups.length;
      return total;
    }, 0) * 48;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const gpuBuffer = this.manager.device.createBuffer({size, usage, mappedAtCreation: true});
    const mappedRange = gpuBuffer.getMappedRange();
    const f32WriteArray = new Float32Array(mappedRange);
    const u32WriteArray = new Uint32Array(mappedRange);
    let offset = 0;
    let modelTriangleOffset = 0;
    for (const model of this.models) {
      const trianglesInModel = model.vertexIndexes.length / 3; // add this to obj-loader
      for (const mesh of model.facetGroups) {
        u32WriteArray.set([mesh.triangleOffset + modelTriangleOffset, mesh.triangleCount + mesh.triangleOffset + modelTriangleOffset, this.getMaterialIndex(mesh)], offset);
        f32WriteArray.set(mesh.boundingBox.min, offset + 4);
        f32WriteArray.set(mesh.boundingBox.max, offset + 8);
        offset += 12;
      }
      modelTriangleOffset += trianglesInModel;
    }
    gpuBuffer.unmap();
    return gpuBuffer;
  }

  getMaterialIndex(mesh) {
    return this._mtlIndexes[mesh.materialName];
  }

  packMaterials() {
    const materials = new Map(
      Object.entries(this.models.reduce((mtls, model) => {
        Object.assign(mtls, model.materials);
        return mtls;
      }, {}))
    );
    const orderedNames = materials.keys().toArray();
    const orderedMaterials = materials.values().toArray();
    const jsBuffer = new Float32Array(12 * materials.size);
    let offset = 0;
    for (let i = 0; i < orderedMaterials.length; i++) {
      this._mtlIndexes[orderedNames[i]] = i;
      const mtl = orderedMaterials[i];
      // maybe? mix Kd and Ka or something
      if (mtl.Kd) {
        jsBuffer.set(mtl.Kd, offset);
      }
      if (mtl.Ke) {
        jsBuffer.set(mtl.Ke, offset + 4);
      }
      if (mtl.i) {
        jsBuffer.set([mtl.i], offset + 8);
      }
      offset += 12;
    }
    return this.manager.bufferData(jsBuffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  }
}

class Camera extends DefaultControls {
  constructor(viewMatrix, unlockHeight = false, unlockUp = false) {
    viewMatrix ??= mat4.lookAt(mat4.create(), [0, 0, 0], [0, 0, -1], [0, 1, 0]);
    super(viewMatrix, unlockHeight, unlockUp);
    this.updateViewParams();
    this.updatePosition();
  }

  updateViewParams(options) {
    const canvas = document.querySelector('canvas');
    this.aspect = options?.aspect || canvas.width / canvas.height;
    this.fov = options?.fov || Math.PI / 10;
    this.distToPlane = options?.distToPlane || 1;
    this.planeHeight = this.distToPlane * Math.tan(this.fov * 0.5) * 2;
    this.planeWidth = this.planeHeight * this.aspect;
    this.viewParams = [this.planeWidth, this.planeHeight, this.distToPlane];
    this.ndcParams = [1 / canvas.width, 1 / canvas.height];
  }
}

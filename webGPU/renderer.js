import { glMatrix, mat4, quat } from 'gl-matrix';
import { createManager } from './twgpu-lib.js';
import { DefaultControls } from '../twgl/default-controls.js';

/**
 * Currently broken due to changes in twgpu-lib
 */

export class BasicRenderer {

  constructor(scene) {
    glMatrix.setMatrixArrayType(Array);
    this.modelSources = scene.models;
  }

  async start() {
    this.manager = await createManager();
    await this.manager.resolveShader('basic');
    const promises = this.modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
    this.models = await Promise.all(promises);
    this.model = this.models[0];
    
    // move to manager
    this.textures = new WeakMap();
    await Promise.all(this.model.facetGroups.map(async group => {
      const texturePath = group.material.map_Kd || group.material.map_Ka;
      if (!texturePath) {
        return;
      }
      const imageBmp = await createImageBitmap(await (await fetch(texturePath)).blob());
      const textureDescriptor = {
        size: { width: imageBmp.width, height: imageBmp.height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      };
      const texture = this.manager.device.createTexture(textureDescriptor);
      this.manager.device.queue.copyExternalImageToTexture( // don't forget about this
        { source: imageBmp, flipY: true },
        { texture },
        textureDescriptor.size,
      );
      const view = texture;//.createView();
      this.textures.set(group.material, view);
    }));
    const sampler = this.manager.device.createSampler({ // and this
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });

    this.matView = mat4.lookAt(mat4.create(), [0, 0, 0], [0, 0, -1], [0, 1, 0])
    this.projection = mat4.perspective(mat4.create(), Math.PI / 3 / this.manager.aspect, this.manager.aspect, 0.1, 1000);
    this.projectionBuffer = this.manager.bufferUniform(this.projection);
    this.controls = new DefaultControls(this.matView);
    // this.matRotate = mat4.fromQuat(mat4.create(), mat4.getRotation(quat.create(), this.matView));

    this.matTransformBuffer = this.manager.createEmptyBuffer(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    // this.matRotateBuffer = this.manager.createEmptyBuffer(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.manager.setPerFrameUniforms({
      transform: {
        binding: 0, // maybe can make binding numbers more ergonomic?
        resource: 'buffer',
        visibility: GPUShaderStage.VERTEX,
        data: this.matTransformBuffer,
      },
      // rotate: {
      //   binding: 1,
      //   resource: 'buffer',
      //   visibility: GPUShaderStage.VERTEX,
      //   data: this.matRotateBuffer,
      // },
      projection: {
        binding: 2,
        resource: 'buffer',
        visibility: GPUShaderStage.VERTEX,
        data: this.projectionBuffer
      },
      // sampler: {
      //   binding: 5,
      //   resource: 'sampler',
      //   visibility: GPUShaderStage.FRAGMENT,
      //   data: sampler,
      // }
    })
    this.manager.setPerGroupUniforms({
      material: {
        binding: 3,
        resource: 'buffer',
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        setter: (material, writeBuffer) => {
          material.Ka && writeBuffer.set(material.Ka, 0);
          material.Kd && writeBuffer.set(material.Kd, 4);
          material.Ks && writeBuffer.set(material.Ks, 8);
          material.Ns && writeBuffer.set(material.Ns, 11);
          material.d && writeBuffer.set(material.d ?? 1, 12);
          material.illum && writeBuffer.set(material.illum, 13);
        },
      },
      // texture: {
      //   binding: 4,
      //   resource: 'texture',
      //   visibility: GPUShaderStage.FRAGMENT,
      //   setter: material => this.textures.get(material),
      // }
    }, Object.values(this.model.materials), 'materialName');

    this.manager.createVertexAttributeBuffer(this.model.dereferencedVertices);
    this.manager.createVertexAttributeBuffer(this.model.dereferencedNormals, [{shaderLocation: 1}]);
    if (this.model.dereferencedTexCoords.length) {
      this.manager.createVertexAttributeBuffer(this.model.dereferencedTexCoords, [{shaderLocation: 2}]);
    }

    // still working on drawing indexed
    // this.manager._drawIndexed = true;
    // this.manager.createVertexAttributeBuffer(this.model.vertices.concat(this.model.normals), [
    //   {
    //     size: this.model.vertices.length * 4,
    //     stride: 12,
    //   },
    //   {
    //     shaderLocation: 1,
    //     offset: (this.model.vertices.length + this.model.texCoords.length) * 4,
    //     size: this.model.normals.length * 4,
    //     stride: 12,
    //   },
    //   // {
    //   //   shaderLocation: 2,
    //   //   offset: this.model.vertices.length * 4,
    //   //   size: this.model.texCoords.length * 4,
    //   //   stride: 12
    //   // }
    // ]);
    // this.manager.createIndexBuffer(this.model.indexes);
    
    this.manager.createPipeline('basic', {objectGroups: this.model.facetGroups});
    requestAnimationFrame(t => this.render(t));
  }

  render(timestamp) {
    if (this.manager.resizeCanvasToDisplaySize()) {
      this.projection = mat4.perspective(mat4.create(), Math.PI / 3 / this.manager.aspect, this.manager.aspect, 0.1, 1000);
      this.manager.device.queue.writeBuffer(this.projectionBuffer, 0, new Float32Array(this.projection));
      this.manager.setRenderDescription();
      this.controls.changed = true;
    }
    if (!this.controls.updateTime(timestamp)) {
      return requestAnimationFrame(timestamp => this.render(timestamp));
    }
    mat4.invert(this.matView, this.controls.matrix);
    mat4.mul(this.matView, this.matView, this.model.matrix);
    // mat4.fromQuat(this.matRotate, mat4.getRotation(quat.create(), this.matView));
    this.manager.device.queue.writeBuffer(this.matTransformBuffer, 0, new Float32Array(this.matView));
    // this.manager.device.queue.writeBuffer(this.matRotateBuffer, 0, new Float32Array(this.matRotate));
    this.manager.singlePassRender('basic', this.model.facetGroups);
    requestAnimationFrame(timestamp => this.render(timestamp));
  }
}

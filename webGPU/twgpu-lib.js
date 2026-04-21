/**
 * @typedef { Float32Array | Int8Array | Int16Array | Int32Array } TypedArray
*/

export async function createManager(options) { // typedef the options
  /**@type{HTMLCanvasElement}*/const canvas = options?.canvas || document.querySelector('canvas');
  const adapter = await navigator.gpu.requestAdapter();
  // bgra8unorm as a storage texture is an optional feature so
  // if it's supported then we don't care if presentationFormat is
  // bgra8unorm or rgba8unorm but if the feature does not exist
  // then we must use rgba8unorm
  let presentationFormat = adapter.features.has('bgra8unorm-storage')
      ? navigator.gpu.getPreferredCanvasFormat()
      : 'rgba8unorm';

  const device = await adapter?.requestDevice({
    requiredFeatures: presentationFormat === 'bgra8unorm'
        ? ['bgra8unorm-storage']
        : [],
  });
  const usage = GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
  return new ComputeToCanvasManager({canvas, device, presentationFormat, usage});
  // return new Manager({canvas, device, presentationFormat});
}

export class Manager {
  _attributesInfo = [];
  _drawIndexed = false;
  _indexBuffersInfo = [];
  _multisampleTexture;
  _perGroupUniformDescriptors = new Map();
  _pipelines = new Map();
  _shaderModules = new Map();
  _staticUniformDescriptors = new Map();
  _vertexCount = 0;

  constructor(settings) {
    this.canvas = settings.canvas;
    this.device = settings.device;
    this.presentationFormat = settings.presentationFormat || 'rgba8unorm';
    this.presentationFormat = 'rgba8unorm';
    this.ctx = this.canvas.getContext('webgpu');
    this.ctx.configure({
      device: this.device,
      format: this.presentationFormat,
      usage: settings.usage ?? GPUTextureUsage.RENDER_ATTACHMENT,
      alphaMode: 'opaque',
    });
    this.noTexture = this.device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture(
      { texture: this.noTexture },
      new Uint8Array([
        255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255,
      ]),
      { bytesPerRow: 8 },
      { width: 1, height: 1 }
    );
    this.resizeCanvasToDisplaySize();
    this.handleResize();
  }

  handleResize() {
    // recreate this on resize
    const depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height, 1],
      dimension: '2d',
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: 4
    });
    this.depthTextureView = depthTexture.createView();
    this.renderDescription = {
      colorAttachments: [
        {
          view: null,
          clearValue: { r: 1, g: 1, b: 1, a: 1}, // todo: support passing these values
          loadOp: 'clear',
          storeOp: 'store'
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        stencilClearValue: 0,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
      },
    };
  }

  /**
   * 
   */
  createPipeline(shaderName, options) {
    if (!this._attributesInfo.length) {
      throw new Error('Set up vertex attributes first (createVertexAttributeBuffer)');
    }
    const shaderModule = this.getShader(shaderName);
    const format = options?.outputFormat || this.presentationFormat;
    const topology = options?.topology || 'triangle-list';
    const frontFace = options?.winding || 'ccw';
    const cullMode = options?.cullMode || 'back';
    const buffers = this._attributesInfo.map(info => {
      return info.bufferDescriptor
    });
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        buffers,
      },
      fragment: {
        module: shaderModule,
        targets: [{ format }],
      },
      primitive: { topology, frontFace, cullMode },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
      },
      multisample: { count: 4 },
    });
    const bindGroupLayout = pipeline.getBindGroupLayout(0);
    this.bindGroupLayout = bindGroupLayout;
    this._pipelines.set(options?.name || shaderName, pipeline);
    this.createUniformBindings(options?.objectGroups);
    return pipeline;
  }

  /**
   * Copied from twgl library
   * Resize a canvas to match the size it's displayed.
   * @param {HTMLCanvasElement} canvas The canvas to resize.
   * @param {number} [multiplier] So you can pass in `window.devicePixelRatio` or other scale value if you want to.
   * @return {boolean} true if the canvas was resized.
   * @memberOf module:twgl
   */
  resizeCanvasToDisplaySize(multiplier) {
    multiplier = multiplier || 1;
    multiplier = Math.max(0, multiplier);
    const width  = this.canvas.clientWidth  * multiplier | 0;
    const height = this.canvas.clientHeight * multiplier | 0;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.aspect = width / height;
      return true;
    }
    return false;
  }

  createSampler(options) {
    return this.device.createSampler({
      addressModeU: options?.addressModeU ?? 'repeat',
      addressModeV: options?.addressModeV ?? 'repeat',
      magFilter: options?.magFilter ?? 'linear',
      minFilter: options?.minFilter ?? 'linear',
      mipmapFilter: options?.mipmapFilter ?? 'linear',
    });
  }


 /***************** I'm more or less happy with what's above, but want to give more thought to everything below *******************/


  singlePassRender(pipeline, renderPassGroups) { // maybe move renderPassGroups to a member var
    this.ensureMultisampleTexture();
    const passPipeline = typeof pipeline === 'string' ?
      this._pipelines.get(pipeline) :
      (pipeline ?? this._pipelines.values().next().value);
    const colorTexture = this.ctx.getCurrentTexture();
    this.renderDescription.colorAttachments[0].view = this._multisampleTexture.createView(); // reuse or create each time?
    this.renderDescription.colorAttachments[0].resolveTarget = colorTexture.createView(); // reuse or create each time?
    const command = this.device.createCommandEncoder(); // reuse?
    const pass = command.beginRenderPass(this.renderDescription);
    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    pass.setPipeline(passPipeline);
    for (const info of this._attributesInfo) {
      for (const attribute of info.attributeDescriptors) {
        pass.setVertexBuffer(attribute.shaderLocation, info.buffer, attribute.offset, attribute.size);
      }
    }
    if (this._drawIndexed) {
      for (const info of this._indexBuffersInfo) {
        pass.setIndexBuffer(info.buffer, info.format);
        pass.drawIndexed(info.length);
      }
    } else if (renderPassGroups) {
      for (const group of renderPassGroups) {
        pass.setBindGroup(0, group.bindGroup);
        pass.draw(group.length, 1, group.startIndex);
      }
    } else {
      pass.setBindGroup(0, group.bindGroup);
      pass.draw(this._vertexCount /* , instanceCount, firstVertex, firstInstance */);
    }
    pass.end();
    this.device.queue.submit([command.finish()]);
  }

  setPerFrameUniforms(entries) { // a comprehensive typedef will be especially helpful here
    Object.entries(entries).forEach(([name, entry]) => {
      this._staticUniformDescriptors.set(name, entry);
    });
  }

  setPerGroupUniforms(entries, instances, objGroupAttribute, identifier) {
    identifier ??= instance => instance.name;
    this._uniformGroups = {instances, identifier, objGroupAttribute}
    Object.entries(entries).forEach(([name, entry]) => {
      this._perGroupUniformDescriptors.set(name, entry);
    });
  }

  createUniformBindings(objGroups) {
    const frameEntries = [];
    for (const entry of this._staticUniformDescriptors.values()) {
      frameEntries.push({binding: entry.binding, resource: entry.data});
    }
    if (!objGroups?.length) {
      this._bindGroup = this.device.createBindGroup({
        label: `bind group - no object groups`,
        layout: this.bindGroupLayout,
        entries: frameEntries,
      });
    }
    const bindGroups = new Map();
    for (const instance of this._uniformGroups.instances) {
      const identifier = this._uniformGroups.identifier(instance);
      const groupEntries = [];
      for (const [name, entry] of this._perGroupUniformDescriptors.entries()) {
        if (entry.resource === 'buffer') {
          const gpuBuffer = this.createEmptyBuffer(entry.size || 64, entry.usage || GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
          const jsBuffer = new Float32Array(gpuBuffer.size / 4);
          entry.setter(instance, jsBuffer);
          this.device.queue.writeBuffer(gpuBuffer, 0, jsBuffer);
          groupEntries.push({binding: entry.binding, resource: gpuBuffer});
        } else if (entry.resource === 'texture') {
          const resource = entry.setter(instance) || this.noTexture;
          groupEntries.push({binding: entry.binding, resource});
        }
        // group.bindGroupInfo[name] = { gpuBuffer, jsBuffer };
      }
      bindGroups.set(identifier, this.device.createBindGroup({
        label: `bind group for ${identifier}`,
        layout: this.bindGroupLayout,
        entries: frameEntries.concat(groupEntries),
      }));
    }
    for (const group of objGroups) {
      group.bindGroup = bindGroups.get(group[this._uniformGroups.objGroupAttribute]);
    }
  }

  writeBuffer(gpuBuffer, offset, jsBuffer) {
    this.device.queue.writeBuffer(gpuBuffer, offset, jsBuffer);
  }

  // updateUniform(name, data, offset = 0) {
  //   const info = this._perGroupUniformDescriptors.get(name);
  //   this.device.queue.writeBuffer(info.data, offset, data);
  // }

  createVertexAttributeBuffer(data, descriptors = [], format = 'float32x3') {
    /** @type{number} */let arrayStride = 0;
    const attributeDescriptors = [];
    for (const descriptor of descriptors) {
      arrayStride += descriptor.stride || 12;
      attributeDescriptors.push({
        shaderLocation: descriptor.shaderLocation ?? 0,
        offset: descriptor.offset ?? 0,
        size: descriptor.size ?? data.byteLength ?? data.length * 4,
        format: descriptor.format ?? format,
      });
    }
    if (!attributeDescriptors.length) {
      arrayStride = 12
      attributeDescriptors.push({
        shaderLocation: 0,
        offset: 0,
        size: data.byteLength ?? data.length * 4,
        arrayStride,
        format
      });
    }
    switch (format) { // fix this; format is per attribute
      case 'float32x3':
        this._vertexCount = data.length / 3;
        break;
      case 'float32x4':
        this._vertexCount = data.length / 4;
        break;
      case 'float32x2':
        this._vertexCount = data.length / 2;
        break;
      default:
        throw new Error(`[${format}] needs to be added to createVertexAttributeBuffer function`);
    }
    const bufferDescriptor = {
      attributes: attributeDescriptors,
      arrayStride,
      stepMode: 'vertex'
    };
    const buffer = this.bufferData(data, GPUBufferUsage.VERTEX);
    const info = { buffer, bufferDescriptor, attributeDescriptors };
    this._attributesInfo.push(info);
    return info;
  }

  createIndexBuffer(data, format = 'uint16') {
    const buffer = this.bufferData(data, GPUBufferUsage.INDEX, Uint16Array);
    this._indexBuffersInfo.push({buffer, format, length: data.length});
  }

  createEmptyBuffer(size, usage) {
    return this.device.createBuffer({ size, usage });
  }

  bufferData(data, usage, type = Float32Array) {
    let size = 0;
    if (type === Float32Array) {
      size = data.byteLength ?? data.length * 4;
    } else if (type === Uint16Array) { // or Int16Array i guess?
      size = data.byteLength ?? data.length * 2;
      if (size % 4) {
        // must be a multiple of 4
        size += 2;
      }
    }
    const bufferDescriptor = {
      size,
      usage,
      mappedAtCreation: true,
    };
    const buffer = this.device.createBuffer(bufferDescriptor);
    const writeArray = new type(buffer.getMappedRange());
    writeArray.set(data);
    buffer.unmap();
    return buffer;
  }

  bufferUniform(data) {
    return this.bufferData(data, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  }

  ensureMultisampleTexture() {
    const canvasTexture = this.ctx.getCurrentTexture();
    const create = !this._multisampleTexture ||
      this._multisampleTexture.width !== canvasTexture.width ||
      this._multisampleTexture.height !== canvasTexture.height;
    if (create) {
      this._multisampleTexture?.destroy();
      this._multisampleTexture = this.device.createTexture({
        format: canvasTexture.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        size: [canvasTexture.width, canvasTexture.height],
        sampleCount: 4,
      });
    }
  }

  getShader(/**@type{string}*/name) {
    let module = this._shaderModules.get(name);
    if (!module) {
      throw new Error(`Shader code '${name}' has not been resolved`);
    }
    return module;
  }

  async resolveShader(/**@type{string}*/name) {
    let module = this._shaderModules.get(name);
    if (!module) {
      const code = await (await fetch(`./shaders/${name}.wgsl`)).text();
      module = this.device.createShaderModule({ code });
      this._shaderModules.set(name, module);
    }
    return module;
  }
}

export class ComputeToCanvasManager extends Manager {
  _bindGroups = new Map();

  createPipeline(shaderName, options) {
    const name = options?.name || shaderName;
    const entryPoint = options?.entryPoint || 'main';
    this._pipelines.set(name, this.device.createComputePipeline({
      label: name,
      layout: 'auto',
      compute: { module: this.getShader(shaderName), entryPoint },
    }));
  }

  createUniformBindings(renderTarget, pipelineName, bindGroupName) {
    renderTarget ??= this.renderTexture;
    pipelineName ??= this._pipelines.keys().next().value;
    bindGroupName ??= pipelineName;
    const pipeline = this._pipelines.get(pipelineName);
    const entries = [{ binding: 0, resource: renderTarget.createView() }];
    for (const entry of this._staticUniformDescriptors.values()) {
      entries.push({binding: entry.binding, resource: entry.data});
    }
    this._bindGroups.set(bindGroupName, this.device.createBindGroup({
      label: bindGroupName,
      layout: pipeline.getBindGroupLayout(0),
      entries,
    }));
    this._staticUniformDescriptors.clear();
  }

  singlePassRender(pipelineName, bindGroupName) {
    pipelineName ??= this._pipelines.keys().next().value;
    bindGroupName ??= pipelineName;
    const canvasTexture = this.ctx.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.get(pipelineName));
    pass.setBindGroup(0, this._bindGroups.get(bindGroupName));
    pass.dispatchWorkgroups(canvasTexture.width, canvasTexture.height);
    pass.end();
    encoder.copyTextureToTexture(
      { texture: this.renderTexture },
      { texture: canvasTexture },
      { width: this.canvas.width, height: this.canvas.height }
    );
    this.device.queue.submit([encoder.finish()]);
  }

  multiPassRender(passesInfo, finalTexture, finalize) {
    finalTexture ??= this.renderTexture;
    const canvasTexture = this.ctx.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    for (const info of passesInfo) {
      let pipelineName = typeof info === 'string' ? info : info.pipelineName;
      let bindGroupName = info.bindGroupName ?? pipelineName;
      const pass = encoder.beginComputePass();
      pass.setPipeline(this._pipelines.get(pipelineName));
      pass.setBindGroup(0, this._bindGroups.get(bindGroupName));
      pass.dispatchWorkgroups(canvasTexture.width, canvasTexture.height);
      pass.end();
    }
    encoder.copyTextureToTexture(
      { texture: finalTexture },
      { texture: canvasTexture },
      { width: this.canvas.width, height: this.canvas.height }
    );
    finalize?.(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  handleResize() {
    this.renderTexture = this.newFrameTexture();
  }

  newFrameTexture() {
    return this.device.createTexture({
      size: [this.canvas.width, this.canvas.height, 1],
      dimension: '2d',
      format: this.presentationFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });
  }

  async resolveShader(/**@type{string}*/name) {
    let module = this._shaderModules.get(name);
    if (!module) {
      const code = await (await fetch(`./shaders/${name}.wgsl`)).text().then(val => {
        return val.replace('texture_storage_2d<bgra8unorm', `texture_storage_2d<${this.presentationFormat}`);
      });
      module = this.device.createShaderModule({ code });
      this._shaderModules.set(name, module);
      // pretty sure there's a package that will parse the shader for uniform bindings and struct packing help
    }
    return module;
  }

  setRenderDescription() { }
}

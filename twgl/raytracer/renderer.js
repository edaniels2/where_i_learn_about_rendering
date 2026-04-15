import { DefaultControls } from '../default-controls.js';
import { RendererBase } from '../renderer.js';
import { Misc } from '../scenes.js';
import * as twgl from '../twgl_lib/twgl-full.module.js';

export class RaytraceRenderer extends RendererBase {
  bufferInfo;
  camera;
  frameAccumulator = false;
  accumulatedFrameCount = 0;

  async loadModels() {
    this.models = [
      {
        // primitive: 'sphere',
        position: [-1, 0, -3.5],
        radius: 1,
        color: [1, 0, 0, 1],
        emitColor: [0, 0, 0, 0],
        emitIntensity: 0,
      },
      {
        // primitive: 'sphere',
        position: [1, 0, -4.5],
        radius: 0.9,
        color: [1, 1, 1, 1],
        emitColor: [0, 0, 0, 0],
        emitIntensity: 0,
      },
      {
        // primitive: 'sphere',
        position: [1.5, 0, -5],
        radius: 0.4,
        color: [0.2, .3, 1, 1],
        emitColor: [0, 0, 0, 0],
        emitIntensity: 0,
      },
      {
        // primitive: 'sphere',
        position: [0, -26, 10],
        radius: 26,
        color: [0, 1, 0, 1],
        emitColor: [0, 0, 0, 0],
        emitIntensity: 0,
      },
      {
        // primitive: 'sphere',
        position: [0, 300, -400],
        radius: 200,
        color: [0, 0, 0, 1],
        emitColor: [1, 1, 1, 1],
        emitIntensity: 3,
      }
    ];
    const test = await Misc.rayTest().models[0];
    this.vertices = [];
    this.normals = [];
    console.log(test)
    // for (const model of test.models) {
      for (const group of test.groups) {
        this.vertices = this.vertices.concat(group.vertices);
        this.normals = this.normals.concat(group.normals);
      }
    // }
    console.log(this.vertices)
    this.bufferInfo = twgl.createBufferInfoFromArrays(this.ctx, {
      aVertex: {data: [
        -1, -1, -1,
        1, -1, -1,
        1, 1, -1,
        1, 1, -1,
        -1, 1, -1,
        -1, -1, -1
      ], numComponents: 3},
    })
  }

  /**
   * Render the scene
   */
  async start() {
    await Promise.all([
      this.loadModels(),
      this.resolveProgram('raytrace'),
      this.resolveProgram('frame_accumulator'),
    ]);
    this.camera = new Camera;
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.useProgram('raytrace');
    twgl.setBuffersAndAttributes(this.ctx, this.currentShader, this.bufferInfo);
    this.renderBuffer = twgl.createFramebufferInfo(this.ctx, [
      { format: this.ctx.RGBA, type: this.ctx.UNSIGNED_BYTE, min: this.ctx.LINEAR, wrap: this.ctx.CLAMP_TO_EDGE },
    ]);
    this.accumulatorBuffer = twgl.createFramebufferInfo(this.ctx, [
      { format: this.ctx.RGBA, type: this.ctx.UNSIGNED_BYTE, min: this.ctx.LINEAR, wrap: this.ctx.CLAMP_TO_EDGE },
    ]);
    this.ctx.clearColor(0, 0, 0, 1);
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);
    requestAnimationFrame(t => this.#render(t));
  }

  #render(time) {
    this.models.forEach((sphere, i) => {
      if (i < 3 && !this.frameAccumulator) {
        sphere.position[1] = Math.cos(time / 200 + i)
      }
    });
    if (twgl.resizeCanvasToDisplaySize(this.ctx.canvas)) {
      this.camera.updateViewParams();
      this.ctx.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    let currentBuffer = null;
    if (this.frameAccumulator) {
      currentBuffer = this.renderBuffer;
    }
    const changed = this.camera.updateTime(time);
    if (changed || !this.frameAccumulator) {
      // this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);
      this.accumulatedFrameCount = 0;
    }
    this.useProgram('raytrace');
    twgl.bindFramebufferInfo(this.ctx, currentBuffer);
    twgl.setUniforms(this.currentShader, {
      spheres: this.models,
      vertices: this.vertices,
      normals: this.normals,
      ndcParams: this.camera.ndcParams,
      viewParams: this.camera.viewParams,
      camLocalToWorldMat: this.camera.matrix,
      rngSeed: [Math.random(), Math.random()],
    });
    twgl.drawBufferInfo(this.ctx, this.bufferInfo);

    if (this.frameAccumulator) {
      twgl.bindFramebufferInfo(this.ctx, null);
      this.useProgram('frame_accumulator');
      twgl.setUniforms(this.currentShader, {
        current: currentBuffer.attachments[0],
        previous: this.accumulatorBuffer.attachments[0],
        accumulatedFrameCount: this.accumulatedFrameCount++,
      });
      twgl.drawBufferInfo(this.ctx, this.bufferInfo);
    }
    twgl.setTextureFromElement(this.ctx, this.accumulatorBuffer.attachments[0], this.ctx.canvas, {flipY: true});
    twgl.bindFramebufferInfo(this.ctx, null);
    requestAnimationFrame(t => this.#render(t));
  }
}

class Camera extends DefaultControls {
  constructor(viewMatrix, unlockHeight = false, unlockUp = false) {
    viewMatrix ??= twgl.m4.lookAt([0, 1, 0], [0, 0, -1], [0, 1, 0]);
    super(viewMatrix, unlockHeight, unlockUp);
    this.updateViewParams();
    this.updatePosition();
  }

  // updatePosition() {
  //   super.updatePosition();
  //   this.localToWorldMatrix = twgl.m4.inverse(this.matrix);
  // }

  updateViewParams(options) {
    const canvas = document.querySelector('canvas');
    this.aspect = options?.aspect || canvas.width / canvas.height;
    this.fov = options?.fov || Math.PI / 10;
    this.distToPlane = options?.distToPlane || 1;
    this.planeHeight = this.distToPlane * Math.tan(this.fov * 0.5) * 2;
    this.planeWidth = this.planeHeight * this.aspect;
    this.viewParams = [this.planeWidth, this.planeHeight, this.distToPlane];
    this.ndcParams = [1 / canvas.width, 1 / canvas.height, this.aspect];
  }
}

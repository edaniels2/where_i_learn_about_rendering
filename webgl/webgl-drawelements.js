import './glmatrix.js';
import { fromObjFile } from './obj-file.js';
import { Floor } from './shapes.js';
import { ElementGeometry, Geometry } from './geometry.js';

export const movement = {
  x: 0,
  z: 0,
  rotateX: 0,
  rotateY: 0,
};

export const lighting = {
  origin: [0, 5, 0],
  intensity: 0.2,
  ambient: 0.2,
};

const modelSources = [
  // new Floor({position: [0, -1.35, -12], scale: 100, color: [0.65, 0.72, 0.67]}),
  // fromObjFile('../models/al_calc_normals.obj', {position: [-4, -0.37, -12], scale: 0.3, rotateY: Math.PI / 3, rotateZ: -0.08, contrast: 70,}),
  // fromObjFile('../models/car.obj', {position: [-3, -1.35, -14], color: [0.8, 0.7, 0.12], rotateY: -Math.PI / 2, contrast: 5,}),
  // fromObjFile('../models/cessna_calc_normals.obj', {position: [-10, 12, -50], scale: 0.3, rotateZ: -0.2, rotateX: 0.4, rotateZ: -0.2, contrast: 50,}),
  // fromObjFile('../models/lamp_calc_normals.obj', {position: [2, -0.35, -12], scale: 0.3, contrast: 35,}),
  // fromObjFile('../models/minicooper_no_windows.obj', {position: [0, -1.35, -10], color: [0.2, 0.5, 0.35], scale: 0.03, rotateX: -Math.PI / 2, rotateY: 0.3,}),
  // fromObjFile('../models/power_lines_calc_normals.obj', {position: [4, 4.55, -14], scale: 0.1,}),
  // fromObjFile('../models/shuttle_calc_normals.obj', {position: [10, 10, -50], contrast: 50,}),
  // fromObjFile('../models/violin_case_calc_normals.obj', {position: [-4.08, -0.87, -11.3], scale: 0.5}, true),

  // fromObjFile('../models/desk.obj', {position: [0, -1, -3], contrast: 10, scale: 0.2}),
  // fromObjFile('../models/InteriorTest.obj', {position: [0, -1, 0], contrast: 5}),
  // fromObjFile('../models/breakfast_room/breakfast_room.obj', {position: [0, 0, 0], }, true),

  fromObjFile('../models/cube.obj', {position: [0, -1, -1], }, true),
];

export async function start() {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('webgl2');
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;
  const aspect = width / height;
  const xFov = 60;
  const yFov = xFov / aspect;
  const fovRad = yFov * Math.PI / 180;
  const nearClip = 0.1;
  const farClip = 100;
  const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), fovRad, aspect, nearClip, farClip);
  const viewMatrix = glMatrix.mat4.create();
  const camera = {
    position: glMatrix.mat4.create(),
    rotation: glMatrix.mat4.create(),
    elev: 0,
    decl: 0,
  };

  const shaders = initShaders(ctx);
  const models = await initBuffers(ctx, shaders);
  ctx.clearColor(1, 1, 1, 1);
  ctx.enable(ctx.DEPTH_TEST);

  requestAnimationFrame(() => drawScene(ctx, projectionMatrix, viewMatrix, camera, models, shaders))
}

function initShaders(/**@type{WebGL2RenderingContext}*/ctx) {
  const frag = ctx.createShader(ctx.FRAGMENT_SHADER);
  const vtx = ctx.createShader(ctx.VERTEX_SHADER);
  ctx.shaderSource(frag, `
    precision mediump float;

    varying vec3 vColor;

    void main(void) {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `);
  ctx.shaderSource(vtx, `
    float lightDist;
    float lDiffuse;
    vec3 lightDir;
    vec3 vn;
    vec4 vPosition;

    attribute vec3 aVertexPosition;
    attribute vec3 aVertexNormal;
    // attribute vec3 aVertexColor;

    uniform vec3 uKa;
    uniform vec3 uKd;
    uniform vec3 uKs;
    uniform vec3 uLightPosition;
    uniform float uLightIntensity;
    uniform float uLightAmbient;
    uniform mat4 uMVMatrix;
    uniform mat4 uPMatrix;
    uniform mat4 uRotMatrix;

    varying vec3 vColor;
    varying float vShadeCoef;

    void main(void) {
      vn = vec3(uRotMatrix * vec4(aVertexNormal, 1.0));
      vPosition = uMVMatrix * vec4(aVertexPosition, 1.0);
      lightDir = uLightPosition - vec3(vPosition);
      lightDist = length(lightDir) * 0.4 + 1.0;
      vShadeCoef = dot(vn, normalize(lightDir)) * uLightIntensity / lightDist;
      if (vShadeCoef < 0.0) {
        vShadeCoef = 0.0;
      }
      // lDiffuse = 1.0 - uLightAmbient;
      // vShadeCoef *= lDiffuse;
      vColor = uKa * uLightAmbient + uKd * vShadeCoef;
      // TODO specular light
      gl_Position = uPMatrix * vPosition;
    }
  `);
  ctx.compileShader(frag);
  ctx.compileShader(vtx);
  if (!ctx.getShaderParameter(frag, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(frag));
      return null;
  }
  if (!ctx.getShaderParameter(vtx, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(vtx));
      return null;
  }
  const program = ctx.createProgram();
  ctx.attachShader(program, frag);
  ctx.attachShader(program, vtx);
  ctx.linkProgram(program);
    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
        console.error("Could not initialise shaders");
    }
  ctx.useProgram(program);
  const vertexPositionAttribute = ctx.getAttribLocation(program, 'aVertexPosition');
  const vertexNormalAttribute = ctx.getAttribLocation(program, 'aVertexNormal');
  ctx.enableVertexAttribArray(vertexPositionAttribute);
  // ctx.enableVertexAttribArray(vertexNormalAttribute);
  const pMatrixUniform = ctx.getUniformLocation(program, 'uPMatrix');
  const rMatrixUniform = ctx.getUniformLocation(program, 'uRotMatrix');
  const mvMatrixUniform = ctx.getUniformLocation(program, 'uMVMatrix');
  const ka = ctx.getUniformLocation(program, 'uKa');
  const kd = ctx.getUniformLocation(program, 'uKd');
  const ks = ctx.getUniformLocation(program, 'uKs');
  const lightPosUniform = ctx.getUniformLocation(program, 'uLightPosition');
  const lightIntensityUniform = ctx.getUniformLocation(program, 'uLightIntensity');
  const lightAmbientUniform = ctx.getUniformLocation(program, 'uLightAmbient');
  return {
    program,
    vertexPositionAttribute,
    vertexNormalAttribute,
    ka, kd, ks,
    lightPosUniform,
    lightIntensityUniform,
    lightAmbientUniform,
    pMatrixUniform,
    rMatrixUniform,
    mvMatrixUniform,
  };
}

let vIndexBuffer;
async function initBuffers(/**@type{WebGL2RenderingContext}*/ctx, shaders) {
  const models = await loadModels();
  const vTotal = models.reduce((total, model) => total + model.vertices.length, 0);
  const indexTotal = models.reduce((total, model) => total + model.vIndexes.length, 0);
  const vData = new Float32Array(vTotal);
  const nData = new Float32Array(vTotal);
  const vIndexData = new Uint16Array(indexTotal);
  // const nIndexData = new Uint16Array(indexTotal);
  const vertexBuffer = ctx.createBuffer();
  const normalBuffer = ctx.createBuffer();
  vIndexBuffer = ctx.createBuffer();
  const nIndexBuffer = ctx.createBuffer();
  let vOffset = 0;
  let nOffset = 0;
  let iOffset= 0;
  debugger
  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    vData.set(model.vertices, vOffset);
    nData.set(model.norms, nOffset);
    vIndexData.set(model.vIndexes, iOffset);
    // nIndexData.set(model.nIndexes, iOffset);
    vOffset += model.vertices.length;
    nOffset += model.norms.length;
    iOffset += model.vIndexes.length;
  }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vertexBuffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, vData, ctx.STATIC_DRAW);
  ctx.vertexAttribPointer(shaders.vertexPositionAttribute, 3, ctx.FLOAT, false, 0, 0);
  // ctx.bindBuffer(ctx.ARRAY_BUFFER, normalBuffer);
  // ctx.bufferData(ctx.ARRAY_BUFFER, nData, ctx.STATIC_DRAW);
  // ctx.vertexAttribPointer(shaders.vertexNormalAttribute, 3, ctx.FLOAT, false, 0, 0);
  // ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, nIndexBuffer);
  // ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, nIndexData, ctx.STATIC_DRAW);
  // ctx.vertexAttribPointer(shaders.normalIndexAttribute, 3, ctx.UNSIGNED_SHORT, false, 0, 0);
  ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, vIndexBuffer);
  ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, vIndexData, ctx.STATIC_DRAW);
  // ctx.vertexAttribPointer(shaders.vertexIndexAttribute, 3, ctx.UNSIGNED_SHORT, false, 0, 0);
  return models;
}

function drawScene(/**@type{WebGL2RenderingContext}*/ctx, projectionMatrix, viewMatrix, camera, /**@type{ElementGeometry[]}*/models, shaders) {
  const viewRotation = updateView(viewMatrix, camera);
  const tLightPos = glMatrix.vec3.transformMat4(glMatrix.vec3.create(), lighting.origin, viewMatrix);
  updateModels(models);

  ctx.clear(ctx.DEPTH_BUFFER_BIT | ctx.COLOR_BUFFER_BIT);

  ctx.uniformMatrix4fv(shaders.pMatrixUniform, false, projectionMatrix);
  ctx.uniform3fv(shaders.lightPosUniform, tLightPos);
  ctx.uniform1f(shaders.lightIntensityUniform, lighting.intensity);
  ctx.uniform1f(shaders.lightAmbientUniform, lighting.ambient);

  for (const model of models) {
    const modelColor = model.color || [0.5, 0.5, 0.5];
    const mvm = glMatrix.mat4.mul(glMatrix.mat4.create(), viewMatrix, model.matrix);
    const mvRotation = glMatrix.mat4.getRotation(glMatrix.mat4.create(), model.matrix);
    glMatrix.mat4.fromQuat(mvRotation, mvRotation); // maybe don't have to turn this into a matrix, but i don't really know what a quaternion is
    glMatrix.mat4.mul(mvRotation, mvRotation, viewRotation);
    ctx.uniformMatrix4fv(shaders.rMatrixUniform, false, mvRotation);
    ctx.uniformMatrix4fv(shaders.mvMatrixUniform, false, mvm);
    for (let i = 0; i < model.groups.length; i++) {
      const numTris = model.groups[i].length;
      const color = model.groups[i].color || modelColor;
      ctx.uniform3fv(shaders.ka, model.groups[i].material?.Ka || color);
      ctx.uniform3fv(shaders.kd, model.groups[i].material?.Kd || color);
      ctx.uniform3fv(shaders.ks, model.groups[i].material?.Ks || color);
      // ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, vIndexBuffer);
      ctx.drawElements(ctx.TRIANGLES, numTris, ctx.UNSIGNED_SHORT, model.groups[i].start);
      // ctx.drawArrays(ctx.TRIANGLES, 0, numTris);
    }
  }

  requestAnimationFrame(() => drawScene(ctx, projectionMatrix, viewMatrix, camera, models, shaders))
}

function updateView(viewMatrix, camera) {
  if (movement.rotateY) {
    camera.decl += movement.rotateY;
    movement.rotateY = 0;
    glMatrix.mat4.fromYRotation(camera.rotation, camera.decl);
  }
  if (movement.x || movement.z) {
    const moveScale = 0.04;
    const translation = glMatrix.vec3.fromValues(movement.x, 0, movement.z);
    glMatrix.vec3.scale(translation, translation, moveScale);
    glMatrix.vec3.transformMat4(translation, translation, glMatrix.mat4.invert(glMatrix.mat4.create(), camera.rotation));
    glMatrix.mat4.translate(camera.position, camera.position, translation);
  }
  camera.elev += movement.rotateX;
  movement.rotateX = 0;
  const finalrotation = glMatrix.mat4.mul(glMatrix.mat4.create(), glMatrix.mat4.fromXRotation(glMatrix.mat4.create(), camera.elev), camera.rotation);
  glMatrix.mat4.mul(viewMatrix, finalrotation, camera.position);
  return finalrotation;
}

function updateModels(/**@type{Geometry[]}*/models) {
  //
}

async function loadModels() {
  const promises = modelSources.map(src => src instanceof Promise ? src : Promise.resolve(src));
  return await Promise.all(promises);
}

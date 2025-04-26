import './glmatrix.js';
import { fromObjFile } from './obj-file.js';
import { Floor } from './shapes.js';
import { Geometry } from './geometry.js';
/**@typedef {import('./geometry.js').FacetGroup} FacetGroup*/
/**@typedef {import('./mtl-file.js').Material} Material*/

export const movement = {
  x: 0,
  z: 0,
  rotateX: 0,
  rotateY: 0,
};

export const lighting = {
  origin: [20, 10, 3],
  intensity: 1,
  ambient: 0.3,
};

const modelSources = [
  // new Floor({position: [0, 0.65, -12], scale: 100, color: [3, 3, 3]}),
  // fromObjFile('../models/al_calc_normals.obj', {position: [-4, 1.63, -12], scale: 0.3, rotateY: Math.PI / 3, rotateZ: -0.08, contrast: 4,}),
  // fromObjFile('../models/car.obj', {position: [-3, 0.65, -14], color: [0.8, 0.7, 0.12], rotateY: -Math.PI / 2, contrast: 2,}),
  // fromObjFile('../models/cessna_calc_normals.obj', {position: [-10, 14, -50], scale: 0.3, rotateZ: -0.2, rotateX: 0.4, rotateZ: -0.2, contrast: 4,}),
  // fromObjFile('../models/lamp_calc_normals.obj', {position: [2, 1.65, -12], scale: 0.3, contrast: 10,}),
  // fromObjFile('../models/minicooper_no_windows.obj', {position: [0, 0.65, -10], color: [0.2, 0.5, 0.35], scale: 0.03, rotateX: -Math.PI / 2, rotateY: 0.3,}),
  // fromObjFile('../models/power_lines_calc_normals.obj', {position: [4, 6.55, -14], scale: 0.1,}),
  // fromObjFile('../models/shuttle_calc_normals.obj', {position: [10, 12, -50], contrast: 4,}),
  // fromObjFile('../models/violin_case_calc_normals.obj', {position: [-4.08, 1.13, -11.3], scale: 0.5}),

  // fromObjFile('../models/desk/desk.obj', {position: [-1.4, 0.55, 2.3], contrast: 2, scale: 0.2, rotateY: Math.PI / 2}),
  // fromObjFile('../models/living_room/living_room.obj', {position: [0, 0.5, -4], }),
  // fromObjFile('../models/InteriorTest/InteriorTest.obj', {position: [0, 1, 0]}),
  fromObjFile('../models/breakfast_room/breakfast_room.obj', {position: [0, 0, -5], }),
  // fromObjFile('../models/bmw/bmw.obj', {position: [0, 0, 0], scale: 0.3}),
  // fromObjFile('../models/great_room/model.obj', {position: [0, 0, 0], scale: 0.3}),
];

let canvas;
export async function start() {
  canvas = document.querySelector('canvas');
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

  glMatrix.mat4.translate(camera.position, camera.position, [0, -2, 0]);

  const shaders = initShaders(ctx);
  createShadowProgram(ctx);
  const models = await initBuffers(ctx, shaders);
  initShadowMap(ctx);
  ctx.clearColor(1, 1, 1, 1);
  ctx.enable(ctx.DEPTH_TEST);

  requestAnimationFrame(() => drawScene(ctx, projectionMatrix, viewMatrix, camera, models, shaders))
}

function initShaders(/**@type{WebGL2RenderingContext}*/ctx) {
  const colorFrag = ctx.createShader(ctx.FRAGMENT_SHADER);
  const texFrag = ctx.createShader(ctx.FRAGMENT_SHADER);
  const colorVtx = ctx.createShader(ctx.VERTEX_SHADER);
  const texVtx = ctx.createShader(ctx.VERTEX_SHADER);
  const programs = { color: {}, texture: {} };
  ctx.shaderSource(colorFrag, `
    precision mediump float;

    uniform float uNs;
    uniform vec3 uKs;
    uniform sampler2D uShadowMap;

    varying vec3 vColor;
    varying vec3 vLightRefl;
    varying vec3 vPosition;
    varying float vLightIntensity;
    varying vec4 vProjectedTexCoords;

    void main(void) {
      vec3 uv = vProjectedTexCoords.xyz / vProjectedTexCoords.w;
      float testDepth = uv.z; // bias to prevent shadows showing up on lit surfaces
      bool inside =  uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
      float shadowDepth = texture2D(uShadowMap, uv.xy).r + 0.00005; // 'r' channel has depth values (why r?)
      float shadowCoef = inside ? (shadowDepth <= testDepth ? 0.6 : 1.0) : 0.6;

      float spec = max(0.0, pow(dot(normalize(vLightRefl), normalize(-vPosition)), uNs)) * vLightIntensity;

      gl_FragColor = vec4((vColor + uKs * spec) * shadowCoef, 1.0);
    }
  `);
  ctx.shaderSource(colorVtx, `
    attribute vec3 aVertexPosition;
    attribute vec3 aVertexNormal;

    uniform vec3 uKa;
    uniform vec3 uKd;
    uniform vec3 uLightPosition;
    uniform float uLightIntensity;
    uniform float uLightAmbient;
    uniform mat4 uMVMatrix;
    // uniform mat4 uModelMatrix;
    // uniform mat4 uViewMatrix;
    uniform mat4 uPMatrix;
    uniform mat4 uRotMatrix;
    uniform mat4 shadowTextureMatrix;

    varying vec3 vColor;
    varying vec3 vPosition;
    varying vec3 vLightRefl;
    varying float vLightIntensity;
    varying vec4 vProjectedTexCoords;

    void main(void) {
      vPosition = vec3(uMVMatrix * vec4(aVertexPosition, 1.0));
      vec3 vn = vec3(uRotMatrix * vec4(aVertexNormal, 1.0));
      vec3 lightIncident = vPosition - uLightPosition;
      float lightDist = length(lightIncident) * 0.1 + 1.0;
      float lightDotNorm = dot(vn, lightIncident);
      float normalizedLightDotNorm = dot(vn, normalize(lightIncident));
      vLightRefl = lightIncident - 2.0 * lightDotNorm * vn;
      float vShadeCoef = max(0.0, -normalizedLightDotNorm * uLightIntensity / lightDist) + uLightAmbient * 0.75;

      vProjectedTexCoords = shadowTextureMatrix * vec4(vPosition, 1.0);
      vColor = mix(uKa * uLightAmbient, uKd, vShadeCoef);
      vLightIntensity = uLightIntensity;

      gl_Position = uPMatrix * vec4(vPosition, 1.0);
    }
  `);
  ctx.shaderSource(texFrag, `
    precision mediump float;

    vec4 textureColor;

    uniform sampler2D uSkinTexture;
    uniform sampler2D uShadowTexture;

    varying float vShadeCoef;
    varying vec2 vTexCoords;
    varying vec4 vProjectedTexCoords;

    void main(void) {
      vec3 uv = vProjectedTexCoords.xyz / vProjectedTexCoords.w;
      float testDepth = uv.z - 0.00005;
      bool inside =  uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
      float shadowDepth = texture2D(uShadowTexture, uv.xy).r;
      float shadowCoef = (inside && shadowDepth <= testDepth) ? 1.0 : 2.0;

      textureColor = texture2D(uSkinTexture, vec2(vTexCoords.s, vTexCoords.t));
      // gl_FragColor = vec4(textureColor.rgb * vShadeCoef * 2.0, textureColor.a);
      gl_FragColor = vec4(textureColor.rgb * vShadeCoef * shadowCoef, textureColor.a);
    }
  `);
  ctx.shaderSource(texVtx, `
    float lightDist;
    vec3 lightDir;
    vec3 vn;
    vec4 vPosition;

    attribute vec3 aVertexPosition;
    attribute vec3 aVertexNormal;
    attribute vec2 aTexCoords;

    uniform vec3 uLightPosition;
    uniform float uLightIntensity;
    uniform float uLightAmbient;
    uniform mat4 uMVMatrix;
    uniform mat4 uPMatrix;
    uniform mat4 uRotMatrix;
    uniform mat4 shadowTextureMatrix;

    varying float vShadeCoef;
    varying vec2 vTexCoords;
    varying vec4 vProjectedTexCoords;

    void main(void) {
      vn = vec3(uRotMatrix * vec4(aVertexNormal, 1.0));
      vPosition = uMVMatrix * vec4(aVertexPosition, 1.0);
      lightDir = uLightPosition - vec3(vPosition);
      lightDist = length(lightDir) * 0.1 + 1.0;

      vProjectedTexCoords = shadowTextureMatrix * vPosition;
      // vShadeCoef = max(0.0, dot(vn, normalize(lightDir)) * uLightIntensity / lightDist + uLightAmbient);
      float normalizedLightDotNorm = dot(vn, normalize(lightDir));
      vShadeCoef = max(0.0, -normalizedLightDotNorm * uLightIntensity / lightDist) + uLightAmbient * 0.75;
      vTexCoords = aTexCoords;
      gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
    }
  `);
  ctx.compileShader(colorFrag);
  ctx.compileShader(colorVtx);
  if (!ctx.getShaderParameter(colorFrag, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(colorFrag));
      return null;
  }
  if (!ctx.getShaderParameter(colorVtx, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(colorVtx));
      return null;
  }
  const colorProgram = ctx.createProgram();
  programs.color.program = colorProgram;
  ctx.attachShader(colorProgram, colorFrag);
  ctx.attachShader(colorProgram, colorVtx);
  ctx.bindAttribLocation(colorProgram, 0, 'aVertexPosition');
  ctx.linkProgram(colorProgram);
    if (!ctx.getProgramParameter(colorProgram, ctx.LINK_STATUS)) {
        console.error("Could not initialise shaders");
    }

  ctx.compileShader(texFrag);
  ctx.compileShader(texVtx);
  if (!ctx.getShaderParameter(texFrag, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(texFrag));
      return null;
  }
  if (!ctx.getShaderParameter(texVtx, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(texVtx));
      return null;
  }
  const textureProgram = ctx.createProgram();
  programs.texture.program = textureProgram;
  ctx.attachShader(textureProgram, texFrag);
  ctx.attachShader(textureProgram, texVtx);
  ctx.bindAttribLocation(textureProgram, 0, 'aVertexPosition');
  ctx.linkProgram(textureProgram);
  if (!ctx.getProgramParameter(textureProgram, ctx.LINK_STATUS)) {
      console.error("Could not initialise shaders");
  }

  ctx.useProgram(colorProgram);
  programs.color.vertexPositionAttribute = ctx.getAttribLocation(colorProgram, 'aVertexPosition');
  ctx.enableVertexAttribArray(programs.color.vertexPositionAttribute);
  programs.color.vertexNormalAttribute = ctx.getAttribLocation(colorProgram, 'aVertexNormal');
  ctx.enableVertexAttribArray(programs.color.vertexNormalAttribute);
  programs.color.pMatrixUniform = ctx.getUniformLocation(colorProgram, 'uPMatrix');
  programs.color.rMatrixUniform = ctx.getUniformLocation(colorProgram, 'uRotMatrix');
  programs.color.shadowTextureMatrixUniform = ctx.getUniformLocation(colorProgram, 'shadowTextureMatrix');
  programs.color.mvMatrixUniform = ctx.getUniformLocation(colorProgram, 'uMVMatrix');
  programs.color.ka = ctx.getUniformLocation(colorProgram, 'uKa');
  programs.color.kd = ctx.getUniformLocation(colorProgram, 'uKd');
  programs.color.ks = ctx.getUniformLocation(colorProgram, 'uKs');
  programs.color.ns = ctx.getUniformLocation(colorProgram, 'uNs');
  programs.color.lightPosUniform = ctx.getUniformLocation(colorProgram, 'uLightPosition');
  programs.color.lightIntensityUniform = ctx.getUniformLocation(colorProgram, 'uLightIntensity');
  programs.color.lightAmbientUniform = ctx.getUniformLocation(colorProgram, 'uLightAmbient');

  ctx.useProgram(textureProgram);
  programs.texture.vertexPositionAttribute = ctx.getAttribLocation(textureProgram, 'aVertexPosition');
  ctx.enableVertexAttribArray(programs.texture.vertexPositionAttribute);
  programs.texture.vertexNormalAttribute = ctx.getAttribLocation(textureProgram, 'aVertexNormal');
  programs.texture.texCoordsAttribute = ctx.getAttribLocation(textureProgram, 'aTexCoords');
  ctx.enableVertexAttribArray(programs.texture.texCoordsAttribute);
  programs.texture.pMatrixUniform = ctx.getUniformLocation(textureProgram, 'uPMatrix');
  programs.texture.rMatrixUniform = ctx.getUniformLocation(textureProgram, 'uRotMatrix');
  programs.texture.shadowTextureMatrixUniform = ctx.getUniformLocation(textureProgram, 'shadowTextureMatrix');
  programs.texture.mvMatrixUniform = ctx.getUniformLocation(textureProgram, 'uMVMatrix');
  programs.texture.lightPosUniform = ctx.getUniformLocation(textureProgram, 'uLightPosition');
  programs.texture.lightIntensityUniform = ctx.getUniformLocation(textureProgram, 'uLightIntensity');
  programs.texture.lightAmbientUniform = ctx.getUniformLocation(textureProgram, 'uLightAmbient');
  programs.texture.txSamplerUniform = ctx.getUniformLocation(textureProgram, 'uSkinTexture');
  programs.texture.shadowTextureUniform = ctx.getUniformLocation(textureProgram, 'uShadowTexture');
  ctx.uniform1i(programs.texture.txSamplerUniform, 0);
  ctx.uniform1i(programs.texture.shadowTextureUniform, 1);
  return programs;
}

let texCoordsBuffer, normalBuffer;
async function initBuffers(/**@type{WebGL2RenderingContext}*/ctx, shaders) {
  const models = await loadModels();
  const vTotal = models.reduce((total, model) => total + model.groups.reduce((total, g) => total + g.vertices.length, 0), 0);
  const tcTotal = models.reduce((total, model) => total + model.groups.reduce((total, g) => total + g.texCoords.length, 0), 0);
  const vData = new Float32Array(vTotal);
  const nData = new Float32Array(vTotal);
  const tcData = new Float32Array(tcTotal); // 2d
  const vertexBuffer = ctx.createBuffer();
   normalBuffer = ctx.createBuffer();
   texCoordsBuffer = ctx.createBuffer();
  let vIndex = 0;
  let tcIndex = 0;
  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    // TODO put these in separate buffers & swap them out in the drawing loop
    model.groups.forEach((/**@type{FacetGroup}*/g) => {
      vData.set(g.vertices, vIndex);
      nData.set(g.normals, vIndex);
      tcData.set(g.texCoords, tcIndex);
      vIndex += g.vertices.length;
      tcIndex += g.texCoords.length;
      g.texture = loadTextures(ctx, g.material);
    });
  }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vertexBuffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, vData, ctx.STATIC_DRAW);
  ctx.vertexAttribPointer(shaders.color.vertexPositionAttribute, 3, ctx.FLOAT, false, 0, 0);
  ctx.vertexAttribPointer(shaders.texture.vertexPositionAttribute, 3, ctx.FLOAT, false, 0, 0);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, normalBuffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, nData, ctx.STATIC_DRAW);
  ctx.vertexAttribPointer(shaders.color.vertexNormalAttribute, 3, ctx.FLOAT, false, 0, 0);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordsBuffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, tcData, ctx.STATIC_DRAW);
  ctx.vertexAttribPointer(shaders.texture.texCoordsAttribute, 2, ctx.FLOAT, false, 0, 0);
  return models;
}

function drawScene(/**@type{WebGL2RenderingContext}*/ctx, projectionMatrix, viewMatrix, camera, /**@type{Geometry[]}*/models, shaders) {
  let start = 0;
  const viewRotation = updateView(viewMatrix, camera);
  const tLightPos = glMatrix.vec3.transformMat4(glMatrix.vec3.create(), lighting.origin, viewMatrix);
  updateModels(models);
  renderShadowMap(ctx, models);
  ctx.viewport(0, 0, canvas.width, canvas.height);
  ctx.clear(ctx.DEPTH_BUFFER_BIT | ctx.COLOR_BUFFER_BIT);

  const shadowTextureMatrix = glMatrix.mat4.fromValues(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1);
  glMatrix.mat4.mul(shadowTextureMatrix, shadowTextureMatrix, shadowPerspectiveMat);
  glMatrix.mat4.mul(shadowTextureMatrix, shadowTextureMatrix, shadowWorldMat);
  for (const model of models) {
    const modelColor = model.color || [0.5, 0.5, 0.5];
    const mvm = glMatrix.mat4.mul(glMatrix.mat4.create(), viewMatrix, model.matrix);
    const mvRotation = glMatrix.mat4.getRotation(glMatrix.mat4.create(), model.matrix);
    const invView = glMatrix.mat4.invert(glMatrix.mat4.create(), viewMatrix);
    const svm = glMatrix.mat4.create();
    glMatrix.mat4.mul(svm, shadowTextureMatrix, invView);
    glMatrix.mat4.fromQuat(mvRotation, mvRotation); // maybe don't have to turn this into a matrix, but i don't really know what a quaternion is
    glMatrix.mat4.mul(mvRotation, mvRotation, viewRotation);
    for (let i = 0; i < model.groups.length; i++) {
      const numTris = model.groups[i].vertices.length / 3;
      const color = model.groups[i].color || modelColor;

      if (model.groups[i].texture) {
        ctx.useProgram(shaders.texture.program);
        ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordsBuffer);
        ctx.vertexAttribPointer(shaders.texture.texCoordsAttribute, 2, ctx.FLOAT, false, 0, 0);
        ctx.bindBuffer(ctx.ARRAY_BUFFER, normalBuffer);
        ctx.vertexAttribPointer(shaders.texture.vertexNormalAttribute, 3, ctx.FLOAT, false, 0, 0);
        ctx.activeTexture(ctx.TEXTURE0);
        ctx.bindTexture(ctx.TEXTURE_2D, model.groups[i].texture);
        ctx.activeTexture(ctx.TEXTURE1);
        ctx.bindTexture(ctx.TEXTURE_2D, shadowTexture);
        ctx.uniform3fv(shaders.texture.lightPosUniform, tLightPos);
        ctx.uniform1f(shaders.texture.lightIntensityUniform, lighting.intensity);
        ctx.uniform1f(shaders.texture.lightAmbientUniform, lighting.ambient);
        ctx.uniformMatrix4fv(shaders.texture.rMatrixUniform, false, mvRotation);
        ctx.uniformMatrix4fv(shaders.texture.pMatrixUniform, false, projectionMatrix);
        ctx.uniformMatrix4fv(shaders.texture.mvMatrixUniform, false, mvm);
        ctx.uniformMatrix4fv(shaders.texture.shadowTextureMatrixUniform, false, svm);
      } else {
        ctx.useProgram(shaders.color.program);
        ctx.bindBuffer(ctx.ARRAY_BUFFER, normalBuffer);
        ctx.vertexAttribPointer(shaders.color.vertexNormalAttribute, 3, ctx.FLOAT, false, 0, 0);
        ctx.activeTexture(ctx.TEXTURE0);
        ctx.bindTexture(ctx.TEXTURE_2D, shadowTexture);
        ctx.uniform3fv(shaders.color.lightPosUniform, tLightPos);
        ctx.uniform1f(shaders.color.lightIntensityUniform, lighting.intensity);
        ctx.uniform1f(shaders.color.lightAmbientUniform, lighting.ambient);
        ctx.uniformMatrix4fv(shaders.color.rMatrixUniform, false, mvRotation);
        ctx.uniformMatrix4fv(shaders.color.pMatrixUniform, false, projectionMatrix);
        ctx.uniformMatrix4fv(shaders.color.mvMatrixUniform, false, mvm);
        ctx.uniformMatrix4fv(shaders.color.shadowTextureMatrixUniform, false, svm);
        ctx.uniform3fv(shaders.color.ka, model.groups[i].material?.Ka || color);
        ctx.uniform3fv(shaders.color.kd, model.groups[i].material?.Kd || glMatrix.vec3.scale(glMatrix.vec3.create(), color, 0.1));
        ctx.uniform3fv(shaders.color.ks, model.groups[i].material?.Ks || [0.05, 0.05, 0.05]);
        ctx.uniform1f(shaders.color.ns, model.groups[i].material?.Ns || 30.0);
      }
      ctx.drawArrays(ctx.TRIANGLES, start, numTris);
      start += numTris;
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

function loadTextures(/**@type{WebGL2RenderingContext}*/ctx, /**@type{Material}*/material) {
  for (const path of [material?.map_Ka, material?.map_Kd]) { // possibly need to handle if it has both?
    if (path) {
      const tex = ctx.createTexture();
      const image = new Image;
      tex.image = image;
      image.onload = () => handleLoadedTextureImage(tex, material.texMode);
      image.src = path;
      return tex;
    }
  }

  function handleLoadedTextureImage(texture, texMode = 'clamp') {
    // const mode = texMode == 'repeat' ? ctx.REPEAT : ctx.CLAMP_TO_EDGE;
    ctx.bindTexture(ctx.TEXTURE_2D, texture);
    ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true);
    ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 1);
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, texture.image);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
    ctx.generateMipmap(ctx.TEXTURE_2D);
    ctx.bindTexture(ctx.TEXTURE_2D, null);
  }
}

/**@type{WebGLTexture}*/let shadowTexture;
/**@type{WebGLFramebuffer}*/let shadowFramebuffer;
const shadowTextureSize = 4096; // does this need to match the dimensions we're projecting onto?
const shadowPerspectiveMat = glMatrix.mat4.create();
function initShadowMap(/**@type{WebGL2RenderingContext}*/ctx) {
  shadowTexture = ctx.createTexture();
  ctx.bindTexture(ctx.TEXTURE_2D, shadowTexture);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.DEPTH_COMPONENT32F, shadowTextureSize, shadowTextureSize, 0, ctx.DEPTH_COMPONENT, ctx.FLOAT, null);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);

  shadowFramebuffer = ctx.createFramebuffer();
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, shadowFramebuffer);
  ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.DEPTH_ATTACHMENT, ctx.TEXTURE_2D, shadowTexture, 0);
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
}

glMatrix.mat4.perspective(
  shadowPerspectiveMat,
  Math.PI / 3.5, // FOV; don't really know what value is good - bigger means you can project more shadows but effectively lowers the texture resolution
  1, // aspect ratio
  0.1, // near clip
  100, // far clip
);
const shadowFocal = [0, 0, -6]; // this depends on where you want to cast shadows
const up = [0, 1, 0];
const shadowWorldMat = glMatrix.mat4.create();
let shadowProgram;
function renderShadowMap(/**@type{WebGL2RenderingContext}*/ctx, /**@type{Geometry[]}*/models) {
  let start = 0;
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, shadowFramebuffer);
  ctx.viewport(0, 0, shadowTextureSize, shadowTextureSize);
  ctx.clear(ctx.DEPTH_BUFFER_BIT | ctx.COLOR_BUFFER_BIT);

  glMatrix.mat4.lookAt(shadowWorldMat, lighting.origin, shadowFocal, up);

  for (const model of models) {
    const mvm = glMatrix.mat4.mul(glMatrix.mat4.create(), shadowWorldMat, model.matrix);
    for (let i = 0; i < model.groups.length; i++) {
      const numTris = model.groups[i].vertices.length / 3;
      ctx.useProgram(shadowProgram);
      ctx.uniformMatrix4fv(shadowProgram.pMatrixUniform, false, shadowPerspectiveMat);
      ctx.uniformMatrix4fv(shadowProgram.mvMatrixUniform, false, mvm);
      ctx.drawArrays(ctx.TRIANGLES, start, numTris);
      start += numTris;
    }
  }
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
}

function createShadowProgram(/**@type{WebGL2RenderingContext}*/ctx) {
  const vs = ctx.createShader(ctx.VERTEX_SHADER);
  const fs = ctx.createShader(ctx.FRAGMENT_SHADER);
  ctx.shaderSource(vs, `
    attribute vec3 aVertexPosition;

    uniform mat4 uMVMatrix;
    uniform mat4 uPMatrix;

    varying float z;

    void main() {
      gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
      z = gl_Position.z;
    }
  `);
  ctx.shaderSource(fs, `
    precision mediump float;

    varying float z;

    void main() {
      gl_FragColor = vec4(z * 0.2, z * 0.2, z * 0.2, 1.0);
    }
  `);

  shadowProgram = ctx.createProgram();
  ctx.compileShader(vs);
  ctx.compileShader(fs);
  if (!ctx.getShaderParameter(vs, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(vs));
      return null;
  }
  if (!ctx.getShaderParameter(fs, ctx.COMPILE_STATUS)) {
      console.error(ctx.getShaderInfoLog(fs));
      return null;
  }
  ctx.attachShader(shadowProgram, vs);
  ctx.attachShader(shadowProgram, fs);
  ctx.bindAttribLocation(shadowProgram, 0, 'aVertexPosition');
  ctx.linkProgram(shadowProgram);

  shadowProgram.vertexPositionAttribute = ctx.getAttribLocation(shadowProgram, 'aVertexPosition');
  ctx.enableVertexAttribArray(shadowProgram.vertexPositionAttribute);
  shadowProgram.pMatrixUniform = ctx.getUniformLocation(shadowProgram, 'uPMatrix');
  shadowProgram.mvMatrixUniform = ctx.getUniformLocation(shadowProgram, 'uMVMatrix');
}

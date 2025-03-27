import { Geometry } from '../projection/geometry.js';
import { Rasterizer } from '../rasterizer.js';

const inchToMm = 25.4;
export class PinholeCamera {
  constructor(parameters) {
    this.focalLength = parameters?.focalLength || 35;
    this.filmApertureX = parameters?.filmApertureX || 0.98;
    this.filmApertureY = parameters?.filmApertureY || 0.735;
    this.nearClip = parameters?.nearClip || 0.1;
    this.farClip = parameters?.farClip || 100;
    this.imageWidth = parameters?.imageWidth || 640;
    this.imageHeight = parameters?.imageHeight || 480;
    this.fitResolution = parameters?.fitResolution || 'fill';
    this.fovX = 2 * Math.atan((this.filmApertureX * inchToMm / 2) * 180 / Math.PI);
    this.fovY = 2 * Math.atan((this.filmApertureY * inchToMm / 2) * 180 / Math.PI);
    const filmAspect = this.filmApertureX / this.filmApertureY;
    const deviceAspect = this.imageWidth / this.imageHeight;
    let top = ((this.filmApertureY * inchToMm / 2) / this.focalLength) * this.nearClip;
    let right = top * filmAspect;
    switch (this.fitResolution) {
      case 'overscan':
        if (filmAspect > deviceAspect) {
          top *= filmAspect / deviceAspect;
        } else {
          right *= deviceAspect / filmAspect;
        }
        break;
      case 'fill':
      default:
        if (filmAspect > deviceAspect) {
          right *= deviceAspect / filmAspect;
        } else {
          top *= filmAspect / deviceAspect;
        }
    }
    this.screen = { top, bottom: -top, right, left: -right, near: this.nearClip, far: this.farClip };
    this.rasterizer = new Rasterizer(this.imageWidth, this.imageHeight, this.screen);
  }

  render(/**@type{Geometry[]}*/scene, worldToCamera) {
    for (const item of scene) {
      for (let i = 0; i < item.facets.length; i++) {
        const vertices = item.facets[i].map(pt => pt.transform(worldToCamera));
        const color = item.facets[i].color || item.color;
        this.rasterizer.pushTriangle(vertices, color);
      }
    }
    return this.rasterizer.imageData;
  }

  worldToPixel(/**@type{Vec3}*/point, /**@type{SquareMatrix}*/worldToCamera) {
    const pCamera = point.transform(worldToCamera);
    if (true) {
      return this.rasterizer.worldToRaster(pCamera);
    } else {
      const xScreen = this.nearClip * pCamera.x / -pCamera.z;
      const yScreen = this.nearClip * pCamera.y / -pCamera.z;
      const xNDC = (xScreen + this.screen.right) / (2 * this.screen.right); // 0 <= x <= 1
      const yNDC = (yScreen + this.screen.top) / (2 * this.screen.top);
      const x = Math.floor(xNDC * this.imageWidth);
      const y = Math.floor((1 - yNDC) * this.imageHeight);
      const visible = xScreen >= this.screen.left && xScreen <= this.screen.right
        && yScreen >=this.screen.bottom && yScreen <= this.screen.top;
      return { x, y, visible };
    }
  }
}
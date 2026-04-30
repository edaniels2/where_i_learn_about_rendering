import { mat4, vec3 } from 'gl-matrix';

export class DefaultControls {
  constructor(viewMatrix, options /* unlockHeight = false, unlockUp = false */) {
    this.time = 0;
    this.step = 0;
    this.changed = true;
    this.matrix = options?.matrixCopy ? mat4.clone(viewMatrix) : viewMatrix;
    this.movement = this.initializeKeyboardEvents();
    this.looking = this.initializePointerEvents();
    const dir = vec3.negate(vec3.create(), [this.matrix[8], this.matrix[9], this.matrix[10]]);
    this.elev = Math.atan2(dir[1], -dir[2]); // maybe
    this.az = Math.atan2(dir[0], -dir[2]);
    this.lockHeight = !options?.unlockHeight;
    this.lockUp = !options?.unlockUp;
    this._paused = false;
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  updateTime(tNext) {
    this.step = Math.min(24, tNext - this.time) * 0.125;
    this.time = tNext;
    this.updatePosition();
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  updatePosition() {
    if (this.movement[0] || this.movement[2]) {
      const translation = this.lockHeight
        ? vec3.rotateX(vec3.create(), this.movement, [0, 0, 0], -this.elev)
        : this.movement;
      mat4.translate(this.matrix, this.matrix, vec3.scale(translation, translation, this.step));
      this.changed = true;
    }
  }

  initializeKeyboardEvents() {
    const speed = 0.05;
    document.addEventListener('keydown', startMove);
    document.addEventListener('keyup', stopMove);
    const scaleDn = speed * Math.cos(Math.PI / 4);
    const scaleUp = speed / scaleDn;
    const movement = [0, 0, 0]; // [x, 0, z]
    return movement;

    function startMove(/**@type{KeyboardEvent}*/event) {
      if (this._paused) {
        return;
      }
      switch (event.key) {
        case 'w':
          if (movement[2]) {
            return;
          }
          movement[2] -= movement[0] ? scaleDn : speed;
          break;
        case 's':
          if (movement[2]) {
            return;
          }
          movement[2] += movement[0] ? scaleDn : speed;
          break;
        case 'a':
          if (movement[0]) {
            return;
          }
          movement[0] -= movement[2] ? scaleDn : speed;
          break;
        case 'd':
          if (movement[0]) {
            return;
          }
          movement[0] += movement[2] ? scaleDn : speed;
          break;
      }
    }

    function stopMove(/**@type{KeyboardEvent}*/event) {
      switch (event.key) {
        case 'w':
        case 's':
          movement[2] = 0;
          if (movement[0] && Math.abs(movement[0]) < 0.9 * speed) {
            movement[0] *= scaleUp;
          }
          break;
        case 'a':
        case 'd':
          movement[0] = 0;
          if (movement[2] && Math.abs(movement[2]) < 0.9 * speed) {
            movement[2] *= scaleUp;
          }
          break;
      }
    }
  }

  initializePointerEvents() {
    const mouseDown = (/**@type{PointerEvent}*/event) => {
      prevX = event.pageX;
      prevY = event.pageY;
      document.addEventListener('pointermove', mouseMove);
      document.addEventListener('pointerup', () => document.removeEventListener('pointermove', mouseMove));
    }
    const mouseMove = (/**@type{PointerEvent}*/event) => {
      if (this._paused) {
        return;
      }
      const lookY = (prevX - event.pageX) * movementScale;
      const lookX  = (prevY - event.pageY) * movementScale;
      let rotationX = lookX;
      if (this.lockUp) {
        // in order to maintain 'up' reset the elevation to zero before rotating azimuth
        mat4.rotateX(this.matrix, this.matrix, -this.elev);
        rotationX += this.elev;
      }
      mat4.rotateY(this.matrix, this.matrix, lookY);
      mat4.rotateX(this.matrix, this.matrix, rotationX);
      this.elev += lookX;
      this.az += lookY; // probably don't need this
      prevX = event.pageX;
      prevY = event.pageY;
      this.changed = true;
    }
    let prevX, prevY;
    const canvas = document.querySelector('canvas');
    const movementScale = 1.3 / canvas.getBoundingClientRect().width;
    document.addEventListener('pointerdown', mouseDown);
  }
}


export class Camera extends DefaultControls {

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

import * as twgl from './twgl_lib/twgl-full.module.js';

export class DefaultControls {
  constructor(viewMatrix, unlockHeight = false, unlockUp = false) {
    this.time = 0;
    this.step = 0;
    this.changed = true;
    this.matrix = twgl.m4.copy(viewMatrix);
    this.movement = this.initializeKeyboardEvents();
    this.looking = this.initializePointerEvents();
    const dir = twgl.v3.negate(twgl.m4.getAxis(this.matrix, 2));
    this.elev = Math.atan2(dir[1], -dir[2]); // maybe
    this.az = Math.atan2(dir[0], -dir[2]);
    this.lockHeight = !unlockHeight;
    this.lockUp = !unlockUp;
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
        ? twgl.m4.transformDirection(twgl.m4.rotationX(-this.elev), this.movement)
        : this.movement;
      twgl.m4.translate(this.matrix, twgl.v3.mulScalar(translation, this.step, translation), this.matrix);
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
      const lookY = (prevX - event.pageX) * movementScale;
      const lookX  = (prevY - event.pageY) * movementScale;
      let rotationX = lookX;
      if (this.lockUp) {
        // in order to maintain 'up' reset the elevation to zero before rotating azimuth
        twgl.m4.rotateX(this.matrix, -this.elev, this.matrix);
        rotationX += this.elev;
      }
      twgl.m4.rotateY(this.matrix, lookY, this.matrix);
      twgl.m4.rotateX(this.matrix, rotationX, this.matrix);
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
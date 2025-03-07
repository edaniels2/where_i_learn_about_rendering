export class Matrix extends Array {
  multiply(/** @type {Array} */ m) {
    if (this[0].length != m.length) {
      throw new Error('Matrices incompatible for multiplication');
    }
    const result = [];
    for (let i = 0; i < this.length; i++) {
      result[i] = [];
      for (let j = 0; j < m[0].length; j++) {
        result[i][j] = 0;
        for (let p = 0; p < this[0].length; p++) {
          result[i][j] += this[i][p] * m[p][j];
        }
      }
    }
    return result;
  }

  /**@returns{Matrix}*/
  transpose() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      result[i] = [];
      for (let j = 0; j < this[0].length; j++) {
        result[i][j] = this[j][i];
      }
    }
    Object.setPrototypeOf(result, Object.getPrototypeOf(this));
    return result;
  }
}

export class SquareMatrix extends Matrix {
  constructor(size = 4) {
    super();
    for (let i = 0; i < size; i++) {
      this[i] = Array(size).fill(0);
      this[i][i] = 1;
    }
  }

  set(values) {
    if (this.length != values.length) {
      throw new Error('Incompatible length to populate matrix');
    }
    for (let i = 0; i < this.length; i++) {
      if (this[i].length != values[i].length) {
        throw new Error('Incompatible length to populate matrix');
      }
      for (let j = 0; j < this[i].length; j++) {
        this[i][j] = values[i][j];
      }
    }
  }

  multiply(/** @type {Array} */ m) {
    if (this[0].length != m.length) {
      throw new Error('Matrices incompatible for multiplication');
    }
    const result = new SquareMatrix(this.length);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < m[0].length; j++) {
        let d = 0;
        for (let p = 0; p < this[0].length; p++) {
          d += this[i][p] * m[p][j];
        }
        result[i] ??= [];
        result[i][j] = d;
      }
    }
    return result;
  }

  /**@returns{SquareMatrix}*/
  invert() {
    const minors = new SquareMatrix(this.length);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this.length; j++) {
        const coef = (i + j) % 2 ? -1 : 1; // applies cofactor
        minors[i][j] = coef * this.drop(i, j).determinant();
      }
    }

    const result = minors.transpose();
    const det = this.determinant();
    const coef = 1 / det;
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < this.length; j++) {
        result[i][j] *= coef;
      }
    }
    return result;
  }

  drop(/**@type{number}*/i, /**@type{number}*/j) {
    const remaining = new SquareMatrix(this.length - 1);
    for (let m = 0; m < this.length; m++) {
      for (let n = 0; n < this.length; n++) {
        if (m == i || n == j) {
          continue;
        }
        remaining[m > i ? m - 1 : m][n > j ? n - 1 : n] = this[m][n];
      }
    }
    return remaining;
  }

  determinant() {
    if (this.length  == 2) {
      return this[0][0] * this[1][1] - this[0][1] * this[1][0];
    }
    let result = 0;
    for (let i = 0; i < this.length; i++) {
      const coef = i % 2 ? -1 : 1;
      result += coef * this[0][i] * this.drop(0, i).determinant();
    }
    return result;
  }

  static multiply(m, n) {
    return new SquareMatrix(m.length).set(m).multiply(n);
  }

  static rotationX(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[1][1] = cos;
    result[1][2] = sin;
    result[2][1] = -1 * sin;
    result[2][2] = cos;
    return result;
  }

  static rotationY(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[0][0] = cos;
    result[0][2] = -1 * sin;
    result[2][0] = sin;
    result[2][2] = cos;
    return result;
  }

  static rotationZ(r, size = 4) {
    const result = new SquareMatrix(size);
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    result[0][0] = cos;
    result[0][1] = sin;
    result[1][0] = -1 * sin;
    result[1][1] = cos;
    return result;
  }

  static zUp(size = 4) {
    const result = new SquareMatrix(size);
    result[1][1] = 0;
    result[2][2] = 0;
    result[1][2] = 1;
    result[2][1] = 1;
    return result;
  }

  static translate(x, y, z) {
    const result = new SquareMatrix;
    result[3][0] = x;
    result[3][1] = y;
    result[3][2] = z;
    return result;
  }
}
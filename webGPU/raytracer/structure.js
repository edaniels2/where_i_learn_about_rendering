import { vec3 } from 'gl-matrix';

const Q = false;
const /**@type{Triangle[]}*/ triangleList = [];
const /**@type{Triangle[]}*/ outsideTriangleList = [];
const /**@type{BVHNode[]}*/ BVHNodeList = [];

export class BVH {
  // boundingBox = new BoundingBox();
  root = new BVHNode();
  _triangleIndex = 0;

  addModel(vertices, vertexIndexes, normals = [], normalIndexes = [], materialIndex = 0, skipBVH = false) {
    for (let i = 0; i < vertexIndexes.length; i += 3) {
      let aStart = vertexIndexes[i] * 3;
      let bStart = vertexIndexes[i + 1] * 3;
      let cStart = vertexIndexes[i + 2] * 3;
      const A = [vertices[aStart], vertices[aStart + 1], vertices[aStart + 2]];
      const B = [vertices[bStart], vertices[bStart + 1], vertices[bStart + 2]];
      const C = [vertices[cStart], vertices[cStart + 1], vertices[cStart + 2]];

      aStart = normalIndexes[i] * 3;
      bStart = normalIndexes[i + 1] * 3;
      cStart = normalIndexes[i + 2] * 3;
      const nA = [normals[aStart], normals[aStart + 1], normals[aStart + 2]];
      const nB = [normals[bStart], normals[bStart + 1], normals[bStart + 2]];
      const nC = [normals[cStart], normals[cStart + 1], normals[cStart + 2]];

      const tri = new Triangle(A, B, C, nA, nB, nC, this._triangleIndex, materialIndex);
      if (skipBVH) {
        outsideTriangleList.push(tri);
      } else {
        this.root.boundingBox.addTriangle(tri);
        triangleList.push(tri);
        this._triangleIndex++;
      }
    }
    this.root.triangleCount = this._triangleIndex;
  }

  // addModel(dereferencedVertices, dereferencedNormals, materialIndex) {
  //   for (let i = 0; i < dereferencedVertices.length; i += 9) {
  //     const A = [dereferencedVertices[i + 0], dereferencedVertices[i + 1], dereferencedVertices[i + 2]];
  //     const B = [dereferencedVertices[i + 3], dereferencedVertices[i + 4], dereferencedVertices[i + 5]];
  //     const C = [dereferencedVertices[i + 6], dereferencedVertices[i + 7], dereferencedVertices[i + 8]];

  //     const nA = [dereferencedNormals[i + 0], dereferencedNormals[i + 1], dereferencedNormals[i + 2]];
  //     const nB = [dereferencedNormals[i + 3], dereferencedNormals[i + 4], dereferencedNormals[i + 5]];
  //     const nC = [dereferencedNormals[i + 6], dereferencedNormals[i + 7], dereferencedNormals[i + 8]];


  //     const tri = new Triangle(A, B, C, nA, nB, nC, this._triangleIndex, materialIndex);
  //     this.root.boundingBox.addTriangle(tri);
  //     triangleList.push(tri);
  //     this._triangleIndex++;
  //   }
  //   this.root.triangleCount = this._triangleIndex;
  // }

  compute() {
    BVHNodeList.push(this.root);
    this.root.split();
    return { triangles: triangleList, bvhNodes: BVHNodeList, outsideTriangles: outsideTriangleList };
  }
}

export class BVHNode {
  maxDepth = 10;
  /**@type{BoundingBox}*/ boundingBox;
  /**@typs{number}*/ firstTriangleIndex;
  /**@typs{number}*/ triangleCount;
  childIndexA;
  childIndexB;
  /**@type{BVHNode}*/childA;
  /**@type{BVHNode}*/childB;

  constructor(/* bounds,  */firstTriangleIndex, triangleCount) {
    this.boundingBox = /* bounds ?? */ new BoundingBox();
    this.firstTriangleIndex = firstTriangleIndex ?? 0;
    this.triangleCount = triangleCount ?? 0;
    if (triangleCount) {
      this.updateBoundingBox();
    }
  }

  updateBoundingBox() {
    this.boundingBox.min = [1e10, 1e10, 1e10];
    this.boundingBox.max = [-1e10, -1e10, -1e10];
    for (let i = this.firstTriangleIndex; i < this.firstTriangleIndex + this.triangleCount; i++) {
      this.boundingBox.addTriangle(triangleList[i]);
    }
  }

  split(depth = 0) {
    if (depth == this.maxDepth || this.triangleCount < 3) {
      return;
    }
    const { splitAxis, splitPoint, cost } = this.chooseSplit();
    // const leftBound = new BoundingBox();
    // const rightBound = new BoundingBox();
    let i = this.firstTriangleIndex;
    let j = i + this.triangleCount - 1;
    while (i <= j) {
      if (triangleList[i].center[splitAxis] < splitPoint) {
        // leftBound.addTriangle(triangleList[i]);
        i++;
      } else {
        // rightBound.addTriangle(triangleList[i]);
        const tmp = triangleList[i];
        triangleList[i] = triangleList[j];
        triangleList[j] = tmp;
        j--;
      }
    }
    const leftCount = i - this.firstTriangleIndex;
    if (leftCount == 0 || leftCount == this.triangleCount) {
      return;
    }
    this.childA = new BVHNode(/* leftBound,  */this.firstTriangleIndex, leftCount);
    this.childB = new BVHNode(/* rightBound, */ i, this.triangleCount - leftCount);
    this.childIndexA = BVHNodeList.push(this.childA) - 1;
    this.childIndexB = BVHNodeList.push(this.childB) - 1;
    this.childA.split(depth + 1);
    this.childB.split(depth + 1);
  }

  chooseSplit() {
    const size = vec3.sub(vec3.create(), this.boundingBox.max, this.boundingBox.min);
    let splitAxis = X_AXIS;
    if (size[Y_AXIS] > size[X_AXIS]) {
      splitAxis = Y_AXIS;
    }
    if (size[Z_AXIS] > size[Y_AXIS]) {
      splitAxis = Z_AXIS;
    }
    const splitPoint = this.boundingBox.min[splitAxis] + size[splitAxis] * 0.5;
    const cost = this.evaluateSplit(splitAxis, splitPoint/* , start, count */);
    return { splitAxis, splitPoint, cost };
  }

  evaluateSplit(axis, position/* , start, count */) {
    const end = this.firstTriangleIndex + this.triangleCount;
    let numOnLeft = 0;
    let numOnRight = 0;
    let xMinLeft = Infinity;
    let yMinLeft = Infinity;
    let zMinLeft = Infinity;
    let xMaxLeft = -Infinity;
    let yMaxLeft = -Infinity;
    let zMaxLeft = -Infinity;
    let xMinRight = Infinity;
    let yMinRight = Infinity;
    let zMinRight = Infinity;
    let xMaxRight = -Infinity;
    let yMaxRight = -Infinity;
    let zMaxRight = -Infinity;
    for (let i = this.firstTriangleIndex; i < end; i++) {
      const tri = triangleList[i];
      const c = axis == X_AXIS ? tri.center[0] : axis == Y_AXIS ? tri.center[1] : tri.center[2];
      if (c < position) {
        if (tri.xMin < xMinLeft) xMinLeft = tri.xMin;
        if (tri.yMin < yMinLeft) yMinLeft = tri.yMin;
        if (tri.zMin < zMinLeft) zMinLeft = tri.zMin;
        if (tri.xMax > xMaxLeft) xMaxLeft = tri.xMax;
        if (tri.yMax > yMaxLeft) yMaxLeft = tri.yMax;
        if (tri.zMax > zMaxLeft) zMaxLeft = tri.zMax;
        numOnLeft++;
      } else {
        if (tri.xMin < xMinRight) xMinRight = tri.xMin;
        if (tri.yMin < yMinRight) yMinRight = tri.yMin;
        if (tri.zMin < zMinRight) zMinRight = tri.zMin;
        if (tri.xMax > xMaxRight) xMaxRight = tri.xMax;
        if (tri.yMax > yMaxRight) yMaxRight = tri.yMax;
        if (tri.zMax > zMaxRight) zMaxRight = tri.zMax;
        numOnRight++;
      }
    }
    const costL = this.nodeCost(xMaxLeft - xMinLeft, yMaxLeft - yMinLeft, zMaxLeft - zMinLeft, numOnLeft);
    const costR = this.nodeCost(xMaxRight - xMinRight, yMaxRight - yMinRight, zMaxRight - zMinRight, numOnRight);
    return costL + costR;
  }

  nodeCost(x, y, z, numTris) {
    if (!numTris) {
      return 0;
    }
    const sfcArea = x * y + x * z + y * z;
    return sfcArea * numTris;
  }
}

export class BoundingBox {

  constructor() {
    this.min = [1e10, 1e10, 1e10];
    this.max = [-1e10, -1e10, -1e10];
  }

  get center() {
    const result = vec3.create();
    vec3.add(result, this.min, this.max);
    vec3.scale(result, 0.5);
    return result;
  }

  addPoint(/**@type{vec3}*/p) {
    vec3.min(this.min, this.min, p);
    vec3.max(this.max, this.max, p);
  }

  addTriangle(/**@type{Triangle}*/tri) {
    this.addPoint(tri.A);
    this.addPoint(tri.B);
    this.addPoint(tri.C);
  }
}

export class Triangle {
  /**@type{vec3}*/ A;
  /**@type{vec3}*/ B;
  /**@type{vec3}*/ C;
  /**@type{vec3}*/ normalA;
  /**@type{vec3}*/ normalB;
  /**@type{vec3}*/ normalC;
  /**@type{vec3}*/ sfcNormal;
  /**@type{vec3}*/ center;
  /**@type{number}*/ triangleIndex;
  /**@type{number}*/ materialIndex;

  constructor(A, B, C, normA, normB, normC, index, materialIndex) {
    this.A = A;
    this.B = B;
    this.C = C;
    this.normalA = normA;
    this.normalB = normB;
    this.normalC = normC;
    this.triangleIndex = index;
    this.materialIndex = materialIndex;
    const edge1 = vec3.sub(vec3.create(), B, A);
    const edge2 = vec3.sub(vec3.create(), C, A);
    this.sfcNormal = vec3.cross(vec3.create(), edge1, edge2);
    this.center = [
      (A[0] + B[0] + C[0]) * 0.33333,
      (A[1] + B[1] + C[1]) * 0.33333,
      (A[2] + B[2] + C[2]) * 0.33333,
    ];
    this.xMin = Math.min(A[0], B[0], C[0]);
    this.yMin = Math.min(A[1], B[1], C[1]);
    this.zMin = Math.min(A[2], B[2], C[2]);
    this.xMax = Math.max(A[0], B[0], C[0]);
    this.yMax = Math.max(A[1], B[1], C[1]);
    this.zMax = Math.max(A[2], B[2], C[2]);
  }
}

const X_AXIS = 0;
const Y_AXIS = 1;
const Z_AXIS = 2;

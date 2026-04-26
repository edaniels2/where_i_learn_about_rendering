export class RollingAverage {
  constructor(sampleCount = 60, outFractionDigits = 2) {
    this.sampleCount = sampleCount;
    this._ptr = 0;
    this._count = 0;
    this._samples = [];
    this._outFractionDigits = outFractionDigits;
  }

  addSample(value) {
    const i = this._ptr++ % this.sampleCount;
    this._samples[i] = value;
    this._count = Math.min(this.sampleCount, this._count + 1);
  }

  toString() {
    const avg = this._samples.reduce((sum, value) => {
      sum += isNaN(value) ? 0 : value;
      return sum;
    }, 0) / this._count;
    return avg.toFixed(this._outFractionDigits);
  }
}

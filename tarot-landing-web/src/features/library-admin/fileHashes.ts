const BLOCK_BYTES = 64;
const READ_CHUNK_BYTES = 4 * 1024 * 1024;

const rotateLeft = (value: number, bits: number) =>
  ((value << bits) | (value >>> (32 - bits))) >>> 0;

const rotateRight = (value: number, bits: number) =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_CONSTANTS = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0,
);

/** Small incremental MD5 implementation for Content-MD5 on large browser files. */
class Md5 {
  private a = 0x67452301;
  private b = 0xefcdab89;
  private c = 0x98badcfe;
  private d = 0x10325476;
  private bytesHashed = 0;
  private pendingLength = 0;
  private readonly pending = new Uint8Array(BLOCK_BYTES);
  private readonly words = new Uint32Array(16);

  update(input: Uint8Array) {
    this.bytesHashed += input.byteLength;
    let offset = 0;

    if (this.pendingLength > 0) {
      const take = Math.min(BLOCK_BYTES - this.pendingLength, input.byteLength);
      this.pending.set(input.subarray(0, take), this.pendingLength);
      this.pendingLength += take;
      offset += take;
      if (this.pendingLength === BLOCK_BYTES) {
        this.transform(this.pending, 0);
        this.pendingLength = 0;
      }
    }

    while (offset + BLOCK_BYTES <= input.byteLength) {
      this.transform(input, offset);
      offset += BLOCK_BYTES;
    }

    if (offset < input.byteLength) {
      const remainder = input.subarray(offset);
      this.pending.set(remainder, 0);
      this.pendingLength = remainder.byteLength;
    }
  }

  digest() {
    const finalLength = this.pendingLength < 56 ? 64 : 128;
    const tail = new Uint8Array(finalLength);
    tail.set(this.pending.subarray(0, this.pendingLength));
    tail[this.pendingLength] = 0x80;
    const view = new DataView(tail.buffer);
    const lowBits = (this.bytesHashed * 8) >>> 0;
    const highBits = Math.floor(this.bytesHashed / 0x2000_0000) >>> 0;
    view.setUint32(finalLength - 8, lowBits, true);
    view.setUint32(finalLength - 4, highBits, true);
    this.transform(tail, 0);
    if (finalLength === 128) this.transform(tail, 64);

    const result = new Uint8Array(16);
    const resultView = new DataView(result.buffer);
    resultView.setUint32(0, this.a, true);
    resultView.setUint32(4, this.b, true);
    resultView.setUint32(8, this.c, true);
    resultView.setUint32(12, this.d, true);
    return result;
  }

  private transform(block: Uint8Array, offset: number) {
    const view = new DataView(block.buffer, block.byteOffset + offset, BLOCK_BYTES);
    for (let index = 0; index < 16; index += 1) {
      this.words[index] = view.getUint32(index * 4, true);
    }

    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;

    for (let index = 0; index < 64; index += 1) {
      let mixed: number;
      let wordIndex: number;
      if (index < 16) {
        mixed = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        mixed = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        mixed = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        mixed = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const previousD = d;
      d = c;
      c = b;
      const sum = (a + mixed + MD5_CONSTANTS[index] + this.words[wordIndex]) >>> 0;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      a = previousD;
    }

    this.a = (this.a + a) >>> 0;
    this.b = (this.b + b) >>> 0;
    this.c = (this.c + c) >>> 0;
    this.d = (this.d + d) >>> 0;
  }
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

class Sha256 {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private bytesHashed = 0;
  private pendingLength = 0;
  private readonly pending = new Uint8Array(BLOCK_BYTES);
  private readonly words = new Uint32Array(64);

  update(input: Uint8Array) {
    this.bytesHashed += input.byteLength;
    let offset = 0;

    if (this.pendingLength > 0) {
      const take = Math.min(BLOCK_BYTES - this.pendingLength, input.byteLength);
      this.pending.set(input.subarray(0, take), this.pendingLength);
      this.pendingLength += take;
      offset += take;
      if (this.pendingLength === BLOCK_BYTES) {
        this.transform(this.pending, 0);
        this.pendingLength = 0;
      }
    }

    while (offset + BLOCK_BYTES <= input.byteLength) {
      this.transform(input, offset);
      offset += BLOCK_BYTES;
    }

    if (offset < input.byteLength) {
      const remainder = input.subarray(offset);
      this.pending.set(remainder, 0);
      this.pendingLength = remainder.byteLength;
    }
  }

  digest() {
    const finalLength = this.pendingLength < 56 ? 64 : 128;
    const tail = new Uint8Array(finalLength);
    tail.set(this.pending.subarray(0, this.pendingLength));
    tail[this.pendingLength] = 0x80;
    const view = new DataView(tail.buffer);
    const lowBits = (this.bytesHashed * 8) >>> 0;
    const highBits = Math.floor(this.bytesHashed / 0x2000_0000) >>> 0;
    view.setUint32(finalLength - 8, highBits, false);
    view.setUint32(finalLength - 4, lowBits, false);
    this.transform(tail, 0);
    if (finalLength === 128) this.transform(tail, 64);

    const result = new Uint8Array(32);
    const resultView = new DataView(result.buffer);
    this.state.forEach((value, index) => resultView.setUint32(index * 4, value, false));
    return result;
  }

  private transform(block: Uint8Array, offset: number) {
    const view = new DataView(block.buffer, block.byteOffset + offset, BLOCK_BYTES);
    for (let index = 0; index < 16; index += 1) {
      this.words[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = this.words[index - 15];
      const previous2 = this.words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      this.words[index] = (this.words[index - 16] + sigma0 + this.words[index - 7] + sigma1) >>> 0;
    }

    let a = this.state[0];
    let b = this.state[1];
    let c = this.state[2];
    let d = this.state[3];
    let e = this.state[4];
    let f = this.state[5];
    let g = this.state[6];
    let h = this.state[7];

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + SHA256_CONSTANTS[index] + this.words[index]) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

export interface FileHashes {
  sha256: string;
  contentMd5: string;
}

export async function hashFile(
  file: File,
  onProgress: (completedBytes: number, totalBytes: number) => void,
): Promise<FileHashes> {
  const md5 = new Md5();
  const sha256 = new Sha256();
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + READ_CHUNK_BYTES, file.size);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    md5.update(bytes);
    sha256.update(bytes);
    offset = end;
    onProgress(offset, file.size);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return {
    sha256: toHex(sha256.digest()),
    contentMd5: toBase64(md5.digest()),
  };
}
